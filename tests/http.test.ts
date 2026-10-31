import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const port = 14318,
  base = `http://127.0.0.1:${port}`;
let child: ReturnType<typeof spawn>, directory: string;
type Session = { cookie: string; csrf: string; me: any };
async function request(path: string, method = 'GET', body?: any, session?: Session) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}),
    },
    ...(body === undefined || method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
async function login(persona = 'owner'): Promise<Session> {
  const response = await request('/api/auth/demo', 'POST', { persona });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')!.split(';')[0],
    me = await request('/api/auth/me', 'GET', undefined, {
      cookie,
      csrf: response.data.csrf,
      me: null,
    });
  return { cookie, csrf: response.data.csrf, me: me.data };
}
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'truemarketing-test-'));
  child = spawn(process.execPath, ['dist/apps/api/main.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_FILE: join(directory, 'test.sqlite'),
      EMBEDDED_WORKER: 'false',
      APP_MODE: 'test',
      SEED_DEMO: 'true',
    },
    stdio: 'pipe',
    windowsHide: true,
  });
  let log = '';
  child.stdout?.on('data', (d) => (log += d));
  child.stderr?.on('data', (d) => (log += d));
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(base + '/health')).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Test server did not start: ' + log);
});
after(async () => {
  child?.kill();
  if (child)
    await new Promise<void>((resolve) => {
      if (child.exitCode != null) resolve();
      else child.once('exit', () => resolve());
    });
  if (directory) await rm(directory, { recursive: true, force: true });
});
test('HTTP tenant isolation, permissions, API key lifecycle and support boundaries', async (t) => {
  const owner = await login(),
    analyst = await login('analyst'),
    platform = await login('platform');
  await t.test('unauthenticated and missing-CSRF requests fail', async () => {
    assert.equal((await request('/api/campaigns')).status, 401);
    const bad = { ...owner, csrf: '' };
    assert.equal((await request('/api/campaigns', 'POST', {}, bad)).status, 403);
  });
  await t.test('all implemented collection endpoints return scoped data', async () => {
    for (const path of [
      '/api/overview',
      '/api/segments',
      '/api/campaigns',
      '/api/reports',
      '/api/runs',
      '/api/team',
      '/api/roles',
      '/api/settings',
      '/api/integrations/bitrix',
      '/api/api-keys',
      '/api/audit',
    ]) {
      const response = await request(path, 'GET', undefined, owner);
      assert.equal(response.status, 200, path);
      assert(
        !JSON.stringify(response.data).includes('campaign_0_company_sandbox'),
        path + ' leaked another company',
      );
    }
  });
  await t.test(
    'another tenant’s resources are 404 across read and mutation endpoints',
    async () => {
      const routes = [
        ['/api/campaigns/campaign_0_company_sandbox', 'GET'],
        ['/api/campaigns/campaign_0_company_sandbox/report', 'GET'],
        ['/api/campaigns/campaign_0_company_sandbox/runs', 'GET'],
        ['/api/campaigns/campaign_0_company_sandbox/test', 'POST'],
        ['/api/campaigns/campaign_0_company_sandbox', 'DELETE'],
        ['/api/segments/segment_all_company_sandbox', 'GET'],
        ['/api/segments/segment_all_company_sandbox/count', 'POST'],
        ['/api/runs/run_seed_company_sandbox/log', 'GET'],
        ['/api/team/member_analyst_company_sandbox', 'PUT'],
        ['/api/roles/role_Admin_company_sandbox', 'PUT'],
        ['/api/integrations/bitrix/connection_company_sandbox/setup-check', 'POST'],
        ['/api/api-keys/nonexistent', 'DELETE'],
      ];
      for (const [path, method] of routes)
        assert.equal((await request(path, method, {}, owner)).status, 404, path);
    },
  );
  await t.test('Analyst cannot create, edit, schedule, run, or delete', async () => {
    for (const [path, method] of [
      ['/api/campaigns', 'POST'],
      ['/api/campaigns/campaign_1_company_mazeed', 'PUT'],
      ['/api/campaigns/campaign_1_company_mazeed/schedule', 'POST'],
      ['/api/campaigns/campaign_1_company_mazeed/test', 'POST'],
      ['/api/campaigns/campaign_1_company_mazeed', 'DELETE'],
      ['/api/segments', 'POST'],
      ['/api/settings', 'PUT'],
    ])
      assert.equal((await request(path, method, {}, analyst)).status, 403, path);
    assert.equal(
      (await request('/api/campaigns/campaign_0_company_mazeed/report', 'GET', undefined, analyst))
        .status,
      200,
    );
  });
  await t.test('the last Owner cannot be removed', async () => {
    assert.equal(
      (
        await request(
          '/api/team/' + owner.me.membership.id,
          'PUT',
          { roleId: 'role_Analyst_company_mazeed', status: 'active' },
          owner,
        )
      ).status,
      400,
    );
  });
  await t.test('settings validate time zones and quotas', async () => {
    const s = await request('/api/settings', 'GET', undefined, owner);
    assert.equal(
      (await request('/api/settings', 'PUT', { ...s.data, timezone: 'Not/AZone' }, owner)).status,
      400,
    );
    assert.equal(
      (await request('/api/settings', 'PUT', { ...s.data, dailyCap: 10001 }, owner)).status,
      400,
    );
  });
  await t.test('role changes immediately update API permissions', async () => {
    const role = await request(
      '/api/roles',
      'POST',
      { name: 'Reports only', permissions: ['reports.view'], ownOnly: false },
      owner,
    );
    assert.equal(role.status, 200);
    assert.equal(
      (
        await request(
          '/api/team/member_analyst_company_mazeed',
          'PUT',
          { roleId: role.data.id, status: 'active' },
          owner,
        )
      ).status,
      200,
    );
    assert.equal((await request('/api/campaigns', 'GET', undefined, analyst)).status, 403);
    assert.equal((await request('/api/reports', 'GET', undefined, analyst)).status, 200);
  });
  await t.test(
    'API keys enforce scopes and revoke immediately without exposing hashes',
    async () => {
      const created = await request(
        '/api/api-keys',
        'POST',
        { name: 'Test report key', scopes: ['reports.view'] },
        owner,
      );
      assert.equal(created.status, 200);
      const key = created.data.key;
      const res = await fetch(base + '/v1/campaigns/campaign_0_company_mazeed/report', {
        headers: { Authorization: 'Bearer ' + key },
      });
      assert.equal(res.status, 200);
      const forbidden = await fetch(base + '/v1/campaigns/campaign_1_company_mazeed/runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(forbidden.status, 403);
      const listed = await request('/api/api-keys', 'GET', undefined, owner);
      assert(!JSON.stringify(listed.data).includes(key));
      assert(!JSON.stringify(listed.data).includes('argon2'));
      assert.equal(
        (await request('/api/api-keys/' + created.data.id, 'DELETE', {}, owner)).status,
        200,
      );
      assert.equal(
        (
          await fetch(base + '/v1/campaigns/campaign_0_company_mazeed/report', {
            headers: { Authorization: 'Bearer ' + key },
          })
        ).status,
        401,
      );
    },
  );
  await t.test('support impersonation is read-only and audited in both views', async () => {
    assert.equal(
      (
        await request(
          '/api/console/companies/company_mazeed/impersonate',
          'POST',
          { reason: 'Verify tenant support', allowWrite: false },
          platform,
        )
      ).status,
      200,
    );
    assert.equal((await request('/api/settings', 'PUT', {}, platform)).status, 403);
    assert.equal((await request('/api/reports', 'GET', undefined, platform)).status, 200);
    const log = await request('/api/audit', 'GET', undefined, platform);
    assert(log.data.some((e: any) => e.action === 'impersonation.started'));
    assert.equal(
      (await request('/api/console/stop-impersonation', 'POST', {}, platform)).status,
      200,
    );
    const global = await request('/api/console/audit', 'GET', undefined, platform);
    assert(global.data.some((e: any) => e.action === 'impersonation.started'));
    assert(global.data.some((e: any) => e.action === 'impersonation.stopped'));
  });
  await t.test('suspension blocks tenant access and preserves records', async () => {
    assert.equal(
      (await request('/api/console/companies/company_mazeed/suspend', 'POST', {}, platform)).status,
      200,
    );
    assert.equal((await request('/api/campaigns', 'GET', undefined, owner)).status, 423);
    assert.equal(
      (await request('/api/console/companies/company_mazeed/reactivate', 'POST', {}, platform))
        .status,
      200,
    );
    const response = await request('/api/campaigns', 'GET', undefined, owner);
    assert.equal(response.status, 200);
    assert.equal(response.data.length, 3);
  });
});
