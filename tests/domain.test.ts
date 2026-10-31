import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Store, tenantContext } from '../dist/packages/core/store.js';
import {
  filterDeals,
  duplicateKeys,
  reportMetrics,
  rolePermissions,
  resolveTemplate,
  withinWindow,
} from '../dist/packages/core/domain.js';
import { seed } from '../dist/packages/core/seed.js';
import { enqueueRun, tick } from '../dist/packages/core/runner.js';
const ctx = (companyId = 'company_mazeed') => ({
  companyId,
  userId: 'test',
  membershipId: 'member_hossam_' + companyId,
  permissions: rolePermissions.Owner,
});
test('tenant repositories fail closed without context and hide another company’s IDs', () => {
  const store = new Store(':memory:');
  assert.throws(() => store.list('campaign'), /Tenant context/);
  seed(store);
  tenantContext.run(ctx(), () => {
    assert.throws(() => store.get('campaign', 'campaign_0_company_sandbox'), /not found/);
    assert.throws(
      () => store.put('campaign', { id: 'campaign_0_company_sandbox', code: 'STEAL' }),
      /not found/,
    );
    assert(store.list('campaign').every((c) => c.companyId === 'company_mazeed'));
  });
  store.close();
});
test('include AND/OR and exclude compose correctly across contact and deal fields', () => {
  const deals = [
    { id: 1, stage: 'Qualified', email: 'a@example.test', country: 'UAE' },
    { id: 2, stage: 'Proposal', email: 'b@example.test', country: 'Egypt' },
    { id: 3, stage: 'Won', email: 'c@example.test', country: 'UAE' },
    { id: 4, stage: 'Proposal', email: '', country: 'UAE' },
  ];
  const result = filterDeals(deals, {
    include: {
      logic: 'AND',
      groups: [
        {
          logic: 'OR',
          rules: [
            { field: 'stage', operator: 'is', value: 'Qualified' },
            { field: 'stage', operator: 'is', value: 'Proposal' },
          ],
        },
        { logic: 'AND', rules: [{ field: 'email', operator: 'not_empty', value: '' }] },
      ],
    },
    exclude: {
      logic: 'OR',
      groups: [{ logic: 'AND', rules: [{ field: 'country', operator: 'is', value: 'Egypt' }] }],
    },
  });
  assert.deepEqual(
    result.map((x) => x.id),
    [1],
  );
});
test('duplicate keys normalize email and ignore empty identities', () => {
  assert.deepEqual(
    duplicateKeys({ email: ' A@Example.Test ', phone: '' }, ['email', 'phone']),
    duplicateKeys({ email: 'a@example.test' }, ['email']),
  );
  assert.equal(duplicateKeys({}, ['email', 'phone']).length, 0);
});
test('sample runner persists progress, completes a five-target test and skips re-enrollment', () => {
  const store = new Store(':memory:');
  seed(store);
  tenantContext.run(ctx(), () => {
    const campaign = store.get('campaign', 'campaign_1_company_mazeed');
    const run = enqueueRun(
      store,
      { ...campaign, schedule: { ...campaign.schedule, pace: 120 } },
      true,
    );
    for (let i = 0; i < 5; i++) {
      const current = store.get('run', run.id);
      store.put('run', { ...current, lastStepAt: null });
      tick(store);
    }
    const completed = store.get('run', run.id);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.created, 5);
    assert.equal(store.list('item').filter((i) => i.runId === run.id).length, 5);
    const next = enqueueRun(store, campaign, true);
    for (let i = 0; i < 5; i++) {
      store.put('run', { ...store.get('run', next.id), lastStepAt: null });
      tick(store);
    }
    assert.equal(store.get('run', next.id).skipped, 5);
    assert.equal(
      store.list('item').filter((i) => i.campaignId === campaign.id && i.status !== 'skipped')
        .length,
      5,
    );
  });
  store.close();
});
test('suspension stops the worker before the next target', () => {
  const store = new Store(':memory:');
  seed(store);
  let runId = '';
  tenantContext.run(ctx(), () => {
    runId = enqueueRun(store, store.get('campaign', 'campaign_1_company_mazeed'), true).id;
  });
  const company = store.globalGet('company', 'company_mazeed');
  store.globalPut('company', { ...company, status: 'suspended' });
  tick(store);
  tenantContext.run(ctx(), () => assert.equal(store.get('run', runId).cursor, 0));
  store.close();
});
test('a new database connection resumes a persisted run without recreating the first target', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tm-restart-'));
  assert(resolve(directory).startsWith(resolve(tmpdir()) + sep));
  const file = join(directory, 'restart.sqlite');
  let store = new Store(file);
  seed(store);
  let runId = '';
  tenantContext.run(ctx(), () => {
    runId = enqueueRun(store, store.get('campaign', 'campaign_1_company_mazeed'), true).id;
    tick(store);
    assert.equal(store.get('run', runId).cursor, 1);
  });
  store.close();
  store = new Store(file);
  tenantContext.run(ctx(), () => {
    for (let i = 0; i < 4; i++) {
      store.put('run', { ...store.get('run', runId), lastStepAt: null });
      tick(store);
    }
    assert.equal(store.get('run', runId).status, 'completed');
    const items = store.list('item').filter((i) => i.runId === runId);
    assert.equal(items.length, 5);
    assert.equal(new Set(items.map((i) => i.dealId)).size, 5);
  });
  store.close();
  rmSync(directory, { recursive: true });
});
test('reports use explicit failed and won stages; zero denominators remain null', () => {
  const result = reportMetrics(
    [
      {
        stage: 'WON',
        revenue: 300,
        createdAt: '2026-10-01T10:00:00Z',
        replyDate: '2026-10-01T12:00:00Z',
      },
      { stage: 'FAILED', revenue: 0 },
      { stage: 'NEW', revenue: 0 },
    ],
    { failedStages: ['FAILED'], wonStages: ['WON'], costPerMessage: 2 },
  );
  assert.equal(result.successful, 2);
  assert.equal(result.spend, 4);
  assert.equal(result.cpa, 4);
  assert.equal(result.roas, 75);
  assert.equal(result.averageReplyHours, 2);
  const empty = reportMetrics([], { failedStages: [], wonStages: ['WON'] });
  assert.equal(empty.successful, null);
  assert.equal(empty.conversionRate, null);
  assert.equal(empty.roas, null);
});
test('working windows use company timezone and an exclusive closing time', () => {
  const schedule = { days: ['Sat'], from: '09:00', to: '18:00' };
  assert.equal(withinWindow(schedule, 'Asia/Dubai', new Date('2026-10-31T05:00:00Z')), true);
  assert.equal(withinWindow(schedule, 'Asia/Dubai', new Date('2026-10-31T14:00:00Z')), false);
});
test('placeholders resolve known fields and do not execute expressions', () => {
  assert.equal(
    resolveTemplate(
      '{Campaign.code} · {Deal.TITLE} · {Contact.EMAIL}',
      { title: 'Opportunity', email: 'a@example.test' },
      { code: 'TEST' },
      {},
    ),
    'TEST · Opportunity · a@example.test',
  );
  assert.equal(resolveTemplate('{Deal.constructor}', {}, {}, {}), '');
});
