import { Injectable, Optional } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import QRCode from 'qrcode';
import { AuthVault, newTotpSecret, verifyTotp } from '../../packages/core/totp.js';
import * as argon2 from 'argon2';
import type { Request, Response } from 'express';
import { Store, tenantContext, type TenantContext } from '../../packages/core/store.js';
import { seed } from '../../packages/core/seed.js';
import {
  assert,
  DomainError,
  filterDeals,
  id,
  integer,
  permissions,
  reportMetrics,
  rolePermissions,
  sha,
  text,
  validateTree,
  withinWindow,
} from '../../packages/core/domain.js';
import { enqueueRun, tick } from '../../packages/core/runner.js';

@Injectable()
export class AppService {
  store = new Store(process.env.NODE_ENV === 'production' ? ':memory:' : (process.env.DATABASE_FILE ?? resolve('data/truemarketing.sqlite')));
  limiter = new Map<string, { count: number; reset: number }>();
  workerTimer: ReturnType<typeof setInterval> | undefined;
  demoMode = process.env.APP_MODE === 'test' && process.env.SEED_DEMO === 'true';
  vault = new AuthVault(
    resolve(
      dirname(process.env.DATABASE_FILE ?? resolve('data/truemarketing.sqlite')),
      'auth-key.bin',
    ),
  );
  challenges = new Map<
    string,
    { userId: string; secret: string; expires: number; attempts: number; enrollment: boolean }
  >();
  constructor(@Optional() hostedStore?: Store) {
    if (hostedStore) {
      this.store.close();
      this.store = hostedStore;
    }
    assert(
      process.env.NODE_ENV !== 'production' || (!!hostedStore && !!process.env.TOKEN_ENCRYPTION_KEY),
      'The SQLite development adapter is local-only. Provision PostgreSQL and the production adapter before deployment.',
      500,
    );
    if (this.demoMode) seed(this.store);
    if (!hostedStore && process.env.EMBEDDED_WORKER !== 'false')
      this.workerTimer = setInterval(() => {
        try {
          tick(this.store);
        } catch (e) {
          console.error(
            JSON.stringify({
              level: 'error',
              message: 'Worker tick failed',
              error: e instanceof Error ? e.message : 'Unknown error',
            }),
          );
        }
      }, 1000);
  }
  onModuleDestroy() {
    if (this.workerTimer) clearInterval(this.workerTimer);
    this.store.close();
  }
  limit(key: string, max: number, seconds: number) {
    let item = this.limiter.get(key);
    if (!item || item.reset < Date.now()) {
      item = { count: 0, reset: Date.now() + seconds * 1000 };
      this.limiter.set(key, item);
    }
    assert(++item.count <= max, 'Too many attempts. Please try again later.', 429);
    if (this.limiter.size > 10000)
      for (const [k, v] of this.limiter) if (v.reset < Date.now()) this.limiter.delete(k);
  }
  local(req: Request) {
    return (
      ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') &&
      process.env.NODE_ENV !== 'production'
    );
  }
  session(req: Request) {
    const token = req.headers.cookie
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('tm_session='))
      ?.slice(11);
    if (!token) throw new DomainError(401, 'Sign in to continue.');
    const session = this.store.db
      .prepare('SELECT * FROM sessions WHERE hash=? AND expires_at>?')
      .get(sha(token), Date.now()) as any;
    assert(session, 'Your session has expired. Sign in again.', 401);
    return session;
  }
  createSession(res: Response, user: any, companyId: string | null) {
    const token = randomBytes(32).toString('base64url'),
      csrf = randomBytes(24).toString('base64url');
    this.store.db
      .prepare('INSERT INTO sessions(hash,user_id,company_id,csrf,expires_at) VALUES(?,?,?,?,?)')
      .run(sha(token), user.id, companyId, csrf, Date.now() + 8 * 3600000);
    res.setHeader(
      'Set-Cookie',
      `tm_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    );
    return { csrf };
  }
  signIn(res: Response, user: any) {
    const company = this.store
      .globalList('company')
      .find((c) =>
        this.store
          .rawList('member', c.id)
          .some((m) => m.userId === user.id && m.status === 'active'),
      );
    this.store.globalPut('user', { ...user, lastLoginAt: new Date().toISOString() });
    if (user.platformRole)
      this.store.globalPut('platformaudit', {
        actorUserId: user.id,
        action: 'auth.signed_in',
        at: new Date().toISOString(),
      });
    else if (company)
      tenantContext.run(
        { companyId: company.id, userId: user.id, membershipId: 'auth', permissions: [] },
        () => this.store.audit('auth.signed_in', user.id),
      );
    return this.createSession(res, user, company?.id ?? null);
  }
  safeUser(user: any) {
    const { passwordHash, totpSecret, totpSecretEnc, lastTotpStep, ...safe } = user;
    return safe;
  }
  me(session: any) {
    const user = this.store.globalGet('user', session.user_id);
    assert(user.status === 'active', 'This account is inactive. Contact your administrator.', 403);
    const companies = this.store
      .globalList('company')
      .filter((c) =>
        this.store
          .rawList('member', c.id)
          .some((m) => m.userId === user.id && m.status === 'active'),
      );
    let company = session.company_id ? this.store.globalGet('company', session.company_id) : null;
    let membership = company
      ? this.store
          .rawList('member', company.id)
          .find((m) => m.userId === user.id && m.status === 'active')
      : null;
    const impersonation = session.impersonation ? JSON.parse(session.impersonation) : null;
    if (impersonation) {
      assert(
        Date.parse(impersonation.expiresAt) > Date.now(),
        'This support session has expired. Return to the console.',
        401,
      );
      company = this.store.globalGet('company', impersonation.companyId);
      membership = null;
    }
    let perms: string[] = [];
    if (membership)
      perms =
        this.store.rawList('role', company.id).find((r) => r.id === membership!.roleId)
          ?.permissions ?? [];
    if (impersonation)
      perms = impersonation.allowWrite
        ? permissions
        : permissions.filter((p) => p.endsWith('.view') || p.endsWith('.export'));
    return {
      user: this.safeUser(user),
      companies,
      company,
      membership,
      permissions: perms,
      csrf: session.csrf,
      localDemo: this.demoMode,
      liveReady: Boolean(
        company &&
        this.store
          .rawList('connection', company.id)
          .some((c) => c.mode === 'live' && c.status === 'active'),
      ),
      impersonation,
    };
  }
  context(session: any): TenantContext {
    const me = this.me(session);
    assert(me.company, 'Select a company to continue.', 403);
    assert(
      me.company.status === 'active' || me.impersonation,
      'Company suspended. Contact TrueMarketing.',
      423,
    );
    assert(me.membership || me.impersonation, 'You do not have access to this company.', 403);
    const role = me.membership
      ? this.store.rawList('role', me.company.id).find((r) => r.id === me.membership!.roleId)
      : null;
    return {
      companyId: me.company.id,
      userId: session.user_id,
      membershipId: me.membership?.id ?? 'support',
      permissions: me.permissions,
      ownOnly: role?.ownOnly,
      impersonation: me.impersonation?.id,
      readOnly:
        (me.impersonation && !me.impersonation.allowWrite) || me.company.status === 'archived',
    };
  }
  require(permission: string) {
    assert(
      tenantContext.getStore()?.permissions.includes(permission),
      `This action requires ${permission}.`,
      403,
    );
  }
  own(campaign: any) {
    const ctx = this.store.context();
    if (ctx.ownOnly && campaign.ownerMembershipId !== ctx.membershipId)
      throw new DomainError(404, 'This campaign was not found.');
    return campaign;
  }
  campaign(entityId: string) {
    return this.own(this.store.get('campaign', entityId));
  }
  async handle(req: Request, res: Response) {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const url = new URL(req.originalUrl, 'http://localhost'),
        path = url.pathname.replace(/\/$/, '') || '/',
        method = req.method,
        body = req.body ?? {};
      if (path === '/health') {
        return res.json({
          status: 'ok',
          app: 'TrueMarketing',
          storage: process.env.NODE_ENV === 'production' ? 'postgresql-encrypted-state' : 'sqlite-development',
          mode: this.demoMode ? 'sample' : 'setup',
          liveReady: false,
          worker: this.workerTimer ? 'running' : 'external',
          uptime: process.uptime(),
        });
      }
      if (!['GET', 'HEAD'].includes(method)) {
        const origin = req.headers.origin;
        if (origin)
          assert(
            new URL(origin).host === req.headers.host,
            'This request comes from a different origin.',
            403,
          );
        assert(
          req.headers['content-type']?.includes('application/json'),
          'Use application/json for this request.',
          415,
        );
      }
      if (path === '/api/auth/demo' && method === 'POST') {
        assert(this.demoMode, 'This endpoint was not found.', 404);
        assert(this.local(req), 'Demo access is available only on this computer.', 403);
        this.limit('demo:' + req.ip, 30, 60);
        const persona = body.persona ?? 'owner';
        assert(['owner', 'analyst', 'platform'].includes(persona), 'Choose a demo role.');
        const user = this.store.globalGet(
          'user',
          persona === 'platform'
            ? 'user_platform'
            : persona === 'analyst'
              ? 'user_analyst'
              : 'user_hossam',
        );
        return res.json(
          this.createSession(res, user, persona === 'platform' ? null : 'company_mazeed'),
        );
      }
      if (path === '/api/auth/login' && method === 'POST') {
        this.limit('login:' + req.ip, 10, 900);
        const login = text(body.email ?? body.username, 'Email or username').toLowerCase();
        const user = this.store
          .globalList('user')
          .find((u) => u.email?.toLowerCase() === login || u.username?.toLowerCase() === login);
        assert(
          user?.status === 'active' &&
            user.passwordHash &&
            (await argon2.verify(user.passwordHash, String(body.password ?? ''))),
          'Email, username or password is incorrect.',
          401,
        );
        if (user.platformRole || user.totpSecretEnc) {
          for (const [key, value] of this.challenges)
            if (value.expires < Date.now()) this.challenges.delete(key);
          const enrollment = !user.totpSecretEnc;
          const secret = enrollment ? newTotpSecret() : this.vault.decrypt(user.totpSecretEnc);
          const challenge = randomBytes(32).toString('base64url');
          this.challenges.set(sha(challenge), {
            userId: user.id,
            secret,
            expires: Date.now() + 5 * 60000,
            attempts: 0,
            enrollment,
          });
          const uri =
            'otpauth://totp/' +
            encodeURIComponent('TrueMarketing:' + (user.email || user.username)) +
            '?secret=' +
            secret +
            '&issuer=TrueMarketing&algorithm=SHA1&digits=6&period=30';
          return res.json({
            requiresTwoFactor: true,
            challenge,
            enrollment,
            ...(enrollment
              ? {
                  setupSecret: secret,
                  qrDataUrl: await QRCode.toDataURL(uri, { width: 220, margin: 1 }),
                  notice: 'Add this account to your authenticator, then enter its six-digit code.',
                }
              : {}),
          });
        }
        return res.json(this.signIn(res, user));
      }
      if (path === '/api/auth/2fa/verify' && method === 'POST') {
        this.limit('2fa:' + req.ip, 20, 900);
        const challengeHash = sha(String(body.challenge ?? '')),
          challenge = this.challenges.get(challengeHash);
        assert(
          challenge && challenge.expires > Date.now(),
          'Sign-in verification expired. Sign in again.',
          401,
        );
        challenge.attempts++;
        if (challenge.attempts > 5) {
          this.challenges.delete(challengeHash);
          throw new DomainError(429, 'Too many verification attempts. Sign in again.');
        }
        const user = this.store.globalGet('user', challenge.userId);
        assert(user.status === 'active', 'This account is inactive.', 403);
        const step = verifyTotp(challenge.secret, String(body.code ?? ''), user.lastTotpStep ?? -1);
        assert(step !== null, 'The authenticator code is incorrect or has already been used.', 401);
        if (challenge.enrollment && user.totpSecretEnc) {
          this.challenges.delete(challengeHash);
          throw new DomainError(
            409,
            'Two-factor authentication was already configured. Sign in again.',
          );
        }
        const updated = this.store.globalPut('user', {
          ...user,
          totpSecretEnc: this.vault.encrypt(challenge.secret),
          lastTotpStep: step,
        });
        this.challenges.delete(challengeHash);
        return res.json(this.signIn(res, updated));
      }
      if (path === '/api/public/status')
        return res.json({
          localDemo: this.demoMode,
          version: '0.2.0',
          mode: 'setup',
          liveReady: false,
        });
      let session: any, apiKey: any;
      if (path.startsWith('/v1/') && path !== '/v1/openapi.json') {
        const token = req.headers.authorization?.replace(/^Bearer /, '');
        assert(token, 'An API key is required.', 401);
        apiKey = this.store
          .globalList('company')
          .flatMap((c) => this.store.rawList('apikey', c.id))
          .find((k) => k.prefix === token.split('_')[2]);
        assert(
          apiKey &&
            !apiKey.revokedAt &&
            (!apiKey.expiresAt || Date.parse(apiKey.expiresAt) > Date.now()) &&
            (await argon2.verify(apiKey.hash, token)),
          'The API key is invalid or revoked.',
          401,
        );
        this.limit('key:' + apiKey.id, 60, 60);
        const company = this.store.globalGet('company', apiKey.companyId);
        assert(company.status === 'active', 'Company suspended.', 423);
        const plan = this.store.globalGet('plan', company.planId);
        assert(
          { ...plan.limits, ...company.limitOverrides }.api,
          'API access is not enabled for this plan.',
          403,
        );
        return await tenantContext.run(
          {
            companyId: apiKey.companyId,
            userId: 'api:' + apiKey.id,
            membershipId: apiKey.createdBy,
            permissions: apiKey.scopes,
          },
          async () => {
            this.store.put('apikey', {
              ...apiKey,
              lastUsedAt: new Date().toISOString(),
              lastIp: req.ip,
            });
            return res.json(await this.tenant(path.replace('/v1', '/api'), method, body, url));
          },
        );
      }
      if (path === '/v1/openapi.json') return res.json(this.openapi());
      session = this.session(req);
      if (!['GET', 'HEAD'].includes(method))
        assert(
          req.headers['x-csrf-token'] === session.csrf,
          'Refresh the page and try again.',
          403,
        );
      if (path === '/api/auth/me') return res.json(this.me(session));
      if (path === '/api/auth/logout' && method === 'POST') {
        this.store.db.prepare('DELETE FROM sessions WHERE hash=?').run(session.hash);
        res.setHeader('Set-Cookie', 'tm_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
        return res.json({ ok: true });
      }
      if (path === '/api/auth/switch-company' && method === 'POST') {
        const me = this.me(session);
        assert(
          me.companies.some((c) => c.id === body.companyId),
          'This company was not found.',
          404,
        );
        this.store.db
          .prepare('UPDATE sessions SET company_id=?,impersonation=NULL WHERE hash=?')
          .run(body.companyId, session.hash);
        return res.json({ ok: true });
      }
      if (path === '/api/auth/password' && method === 'POST') {
        const password = text(body.password, 'Password', 200);
        assert(password.length >= 12, 'Use a password with at least 12 characters.');
        const user = this.store.globalGet('user', session.user_id);
        assert(
          user.passwordHash &&
            (await argon2.verify(user.passwordHash, String(body.currentPassword ?? ''))),
          'Your current password is incorrect.',
          401,
        );
        this.store.globalPut('user', {
          ...user,
          passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        });
        this.store.db
          .prepare('DELETE FROM sessions WHERE user_id=? AND hash<>?')
          .run(user.id, session.hash);
        return res.json({ ok: true });
      }
      if (path.startsWith('/api/console'))
        return res.json(await this.console(path, method, body, session));
      return await tenantContext.run(this.context(session), async () => {
        if (!['GET', 'HEAD'].includes(method))
          assert(!this.store.context().readOnly, 'This support session is read-only.', 403);
        return res.json(await this.tenant(path, method, body, url));
      });
    } catch (error) {
      const status = error instanceof DomainError ? error.status : 400;
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      if (!res.headersSent)
        res.status(status).json({
          error: message.includes('UNIQUE constraint')
            ? 'This value already exists. Choose a unique campaign code or try again.'
            : message,
        });
    }
  }

  async tenant(path: string, method: string, body: any, url: URL): Promise<any> {
    const store = this.store,
      ctx = store.context(),
      company = store.globalGet('company', ctx.companyId),
      plan = store.globalGet('plan', company.planId),
      limits = { ...plan.limits, ...company.limitOverrides };
    if (
      !this.demoMode &&
      ['segments', 'campaigns', 'meta', 'deals'].includes(path.split('/')[2]) &&
      (method !== 'GET' || path.includes('/meta/'))
    ) {
      const connections = store
        .list('connection')
        .filter((c) => c.status === 'active' && c.mode === 'live');
      assert(
        connections.length > 0,
        'Connect and verify Bitrix24 before creating audiences or running campaigns. No live CRM connection is configured.',
        409,
      );
    }
    const parts = path.split('/').filter(Boolean),
      resource = parts[1],
      entityId = parts[2],
      action = parts[3];
    if (resource === 'overview') {
      this.require('campaigns.view');
      const campaigns = store
          .list('campaign')
          .filter((c) => !ctx.ownOnly || c.ownerMembershipId === ctx.membershipId),
        items = store.list('item').filter((i) => i.status !== 'skipped'),
        runs = store.list('run');
      return {
        campaigns: campaigns.map((c) => ({
          ...c,
          metrics: reportMetrics(
            items.filter((i) => i.campaignId === c.id),
            c,
          ),
        })),
        timeline: Array.from({ length: 14 }, (_, i) => {
          const day = new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10);
          const matched = items.filter((item) => item.createdAt.startsWith(day));
          return {
            day,
            attempts: matched.length,
            replies: matched.filter((item) => item.replyDate).length,
          };
        }),
        segments: ctx.permissions.includes('segments.view')
          ? store.list('segment').map((s) => this.segmentSummary(s))
          : [],
        runs: ctx.permissions.includes('runs.view') ? runs.slice(0, 8) : [],
        metrics: reportMetrics(items, {
          failedStages: ['FAILED'],
          wonStages: ['WON'],
          costPerMessage: 0.35,
        }),
        connections: ctx.permissions.includes('bitrix.manage') ? store.list('connection') : [],
        activity: ctx.permissions.includes('audit.view') ? store.list('audit').slice(0, 6) : [],
        limits,
        plan: plan.name,
        sample: this.demoMode,
      };
    }
    if (resource === 'segments') {
      this.require(method === 'GET' ? 'segments.view' : 'segments.manage');
      if (method === 'GET')
        return entityId
          ? store.get('segment', entityId)
          : store.list('segment').map((s) => this.segmentSummary(s));
      if (action === 'count' || entityId === 'count') {
        const segment = entityId === 'count' ? null : store.get('segment', entityId),
          tree = body.tree ?? segment?.tree;
        validateTree(tree);
        const all = store.list('deal'),
          deals = filterDeals(all, tree);
        const result = {
          count: deals.length,
          withEmail: deals.filter((d) => d.email).length,
          withPhone: deals.filter((d) => d.phone).length,
          excluded: filterDeals(all, { include: tree.include }).length - deals.length,
          sample: deals.slice(0, 8),
          source: 'Sample CRM',
        };
        if (segment)
          store.put('segment', {
            ...segment,
            lastCount: result.count,
            lastCountedAt: new Date().toISOString(),
          });
        return result;
      }
      if (method === 'DELETE') {
        assert(
          !store.list('campaign').some((c) => c.segmentId === entityId),
          'This segment is used by a campaign. Change the campaign audience first.',
        );
        store.remove('segment', entityId);
        store.audit('segment.deleted', entityId);
        return { ok: true };
      }
      assert(['POST', 'PUT'].includes(method), 'Method not allowed.', 405);
      validateTree(body.tree);
      const connection = store.get('connection', text(body.connectionId, 'Connection'));
      const previous: any = entityId ? store.get('segment', entityId) : {};
      assert(['dynamic', 'snapshot'].includes(body.mode), 'Choose a segment mode.');
      const data = store.put('segment', {
        ...previous,
        id: entityId,
        name: text(body.name, 'Segment name'),
        description: String(body.description ?? '').slice(0, 500),
        tree: body.tree,
        connectionId: connection.id,
        mode: body.mode,
        ownerMembershipId: previous.ownerMembershipId ?? ctx.membershipId,
        createdAt: previous.createdAt ?? new Date().toISOString(),
        ...(body.mode === 'snapshot'
          ? { snapshotIds: filterDeals(store.list('deal'), body.tree).map((d) => d.id) }
          : { snapshotIds: null }),
      });
      store.audit(entityId ? 'segment.updated' : 'segment.created', data.id);
      return this.segmentSummary(data);
    }
    if (resource === 'campaigns') {
      if (action === 'report') {
        this.require('reports.view');
        const campaign = this.campaign(entityId);
        return this.report(campaign);
      }
      if (action === 'runs' && method === 'GET') {
        this.require('runs.view');
        this.campaign(entityId);
        return store
          .list('run')
          .filter((r) => r.campaignId === entityId)
          .map((r) => {
            const { targets, ...safe } = r;
            return safe;
          });
      }
      if (['test', 'runs', 'schedule', 'pause', 'resume', 'cancel'].includes(action)) {
        this.require('campaigns.run');
        assert(method === 'POST', 'Use POST for campaign actions.', 405);
        const campaign = this.campaign(entityId);
        store.get('segment', campaign.segmentId);
        const connection = store.get('connection', campaign.connectionId);
        assert(
          connection.mode === 'sample',
          'Live execution is not enabled. Finish OAuth and live integration validation first.',
          409,
        );
        if (['test', 'runs', 'schedule'].includes(action)) this.validateReady(campaign);
        if (action === 'test' || action === 'runs')
          return enqueueRun(store, campaign, action === 'test' || Boolean(body.isTest));
        if (action === 'schedule') {
          assert(
            store
              .list('campaign')
              .filter((c) => ['running', 'scheduled'].includes(c.status) && c.id !== campaign.id)
              .length < limits.campaigns,
            'Your active campaign limit has been reached.',
          );
          assert(
            Date.parse(campaign.schedule.startAt) > Date.now(),
            'Choose a future start date before scheduling.',
          );
          assert(
            campaign.schedule.from >= company.settings.from &&
              campaign.schedule.to <= company.settings.to &&
              campaign.schedule.days.every((d: string) => company.settings.days.includes(d)),
            'Campaign hours and days must fit inside company working hours.',
          );
          store.put('campaign', {
            ...campaign,
            status: 'scheduled',
            nextRunAt: campaign.schedule.startAt,
          });
        } else {
          const status =
            action === 'pause' ? 'paused' : action === 'cancel' ? 'cancelled' : 'running';
          if (
            action === 'resume' &&
            !store.list('run').some((r) => r.campaignId === campaign.id && r.status === 'paused')
          ) {
            assert(
              campaign.status === 'paused' && campaign.nextRunAt,
              'There is no paused run to resume.',
            );
            store.put('campaign', { ...campaign, status: 'scheduled' });
            store.audit('campaign.resume', entityId);
            return this.campaign(entityId);
          }
          for (const run of store
            .list('run')
            .filter(
              (r) =>
                r.campaignId === campaign.id && ['running', 'queued', 'paused'].includes(r.status),
            ))
            store.put('run', {
              ...run,
              status,
              finishedAt: status === 'cancelled' ? new Date().toISOString() : null,
            });
          store.put('campaign', { ...campaign, status });
        }
        store.audit('campaign.' + action, entityId);
        return this.campaign(entityId);
      }
      if (action === 'preview') {
        this.require('campaigns.view');
        const c = this.campaign(entityId),
          s = store.get('segment', c.segmentId);
        return { campaign: c, deal: filterDeals(store.list('deal'), s.tree)[0] ?? null };
      }
      this.require(method === 'GET' ? 'campaigns.view' : 'campaigns.manage');
      if (method === 'GET')
        return entityId
          ? this.campaign(entityId)
          : store
              .list('campaign')
              .filter((c) => !ctx.ownOnly || c.ownerMembershipId === ctx.membershipId)
              .map((c) => ({
                ...c,
                audience: this.segmentSummary(store.get('segment', c.segmentId)).lastCount,
                metrics: reportMetrics(
                  store.list('item').filter((i) => i.campaignId === c.id && i.status !== 'skipped'),
                  c,
                ),
              }));
      if (method === 'DELETE') {
        const c = this.campaign(entityId);
        assert(
          !['running', 'scheduled', 'paused'].includes(c.status),
          'Cancel the active campaign before deleting it.',
        );
        assert(
          !store.list('run').some((r) => r.campaignId === c.id),
          'Campaigns with run history are retained for reporting. Cancel this campaign instead.',
        );
        store.remove('campaign', entityId);
        store.audit('campaign.deleted', entityId);
        return { ok: true };
      }
      assert(['POST', 'PUT'].includes(method), 'Method not allowed.', 405);
      const existing = entityId ? this.campaign(entityId) : {};
      assert(
        !['running', 'scheduled', 'paused'].includes(existing.status),
        'Cancel execution before editing the campaign.',
      );
      const code = text(body.code, 'Campaign code', 60).toUpperCase();
      assert(
        /^[A-Z0-9_-]+$/.test(code),
        'Use letters, numbers, hyphens or underscores for the campaign code.',
      );
      const segment = store.get('segment', text(body.segmentId, 'Audience'));
      store.get('connection', text(body.connectionId, 'Connection'));
      assert(
        segment.connectionId === body.connectionId,
        'The segment must belong to this Bitrix connection.',
      );
      assert(['Email', 'WhatsApp', 'SMS', 'Call'].includes(body.channel), 'Choose a channel.');
      const schedule = {
        ...body.schedule,
        dailyCap: integer(body.schedule?.dailyCap, 'Daily cap', 1, limits.itemsPerDay),
        pace: integer(body.schedule?.pace, 'Pace', 1, 120),
        everyDays: integer(body.schedule?.everyDays ?? 1, 'Recurrence interval', 1, 365),
      };
      assert(
        ['once', 'daily', 'weekly', 'monthly', 'custom'].includes(schedule.recurrence),
        'Choose a recurrence.',
      );
      assert(
        /^\d{2}:\d{2}$/.test(schedule.from) &&
          /^\d{2}:\d{2}$/.test(schedule.to) &&
          schedule.from < schedule.to,
        'Choose valid working hours.',
      );
      assert(
        Array.isArray(schedule.days) &&
          schedule.days.length > 0 &&
          schedule.days.every((d: string) =>
            ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].includes(d),
          ),
        'Choose at least one sending day.',
      );
      assert(Number.isFinite(Date.parse(schedule.startAt)), 'Choose a valid start date.');
      const uniqueKeys = body.uniqueKeys ?? ['email'];
      assert(
        Array.isArray(uniqueKeys) &&
          uniqueKeys.every((k: string) =>
            ['email', 'phone', 'contactId', 'dealId', 'companyId'].includes(k),
          ),
        'Choose supported duplicate keys.',
      );
      assert(body.allowDuplicates || uniqueKeys.length, 'Select at least one duplicate key.');
      assert(
        body.costPerMessage == null ||
          (Number.isFinite(Number(body.costPerMessage)) && Number(body.costPerMessage) >= 0),
        'Cost must be zero or greater.',
      );
      const data = store.put('campaign', {
        ...existing,
        id: entityId,
        name: text(body.name, 'Campaign name'),
        code,
        channel: body.channel,
        segmentId: segment.id,
        connectionId: body.connectionId,
        spaEntityTypeId: integer(body.spaEntityTypeId ?? 1036, 'SPA'),
        spaCategoryId: integer(body.spaCategoryId ?? 0, 'Pipeline', 0),
        spaStageId: text(body.spaStageId ?? 'NEW', 'Start stage'),
        campaignIdField: text(body.campaignIdField ?? 'ufCrmCampaignCode', 'Campaign field'),
        titleTemplate: text(
          body.titleTemplate ?? '{Campaign.code} � {Deal.TITLE}',
          'Title template',
          500,
        ),
        fieldMap: (body.fieldMap ?? []).slice(0, 30),
        workflows: (body.workflows ?? []).slice(0, 10),
        allowDuplicates: Boolean(body.allowDuplicates),
        uniqueKeys,
        dupScope: body.dupScope === 'spa' ? 'spa' : 'campaign',
        duplicateDays: integer(body.duplicateDays ?? 30, 'Duplicate window', 1, 365),
        replyField: body.replyField ?? 'replyDate',
        wonStages: body.wonStages ?? ['WON'],
        failedStages: body.failedStages ?? ['FAILED'],
        revenueField: 'opportunity',
        costPerMessage: body.costPerMessage == null ? null : Number(body.costPerMessage),
        schedule,
        status: 'draft',
        sample: true,
        ownerMembershipId: existing.ownerMembershipId ?? ctx.membershipId,
        createdAt: existing.createdAt ?? new Date().toISOString(),
      });
      store.audit(entityId ? 'campaign.updated' : 'campaign.created', data.id);
      return data;
    }
    if (resource === 'reports') {
      this.require('reports.view');
      return store
        .list('campaign')
        .filter((c) => !ctx.ownOnly || c.ownerMembershipId === ctx.membershipId)
        .map((c) => this.report(c));
    }
    if (resource === 'runs') {
      this.require('runs.view');
      if (action === 'log') {
        const run = store.get('run', entityId);
        this.campaign(run.campaignId);
        return store
          .list('item')
          .filter((i) => i.runId === entityId)
          .reverse();
      }
      if (action === 'retry-failed') {
        this.require('campaigns.run');
        const run = store.get('run', entityId),
          c = this.campaign(run.campaignId);
        assert(method === 'POST', 'Use POST for retry.', 405);
        const failed = store
          .list('item')
          .filter((i) => i.runId === entityId && i.status === 'failed');
        assert(failed.length, 'This run has no failed targets to retry.');
        assert(
          !store
            .list('run')
            .some(
              (r) => r.campaignId === c.id && ['queued', 'running', 'paused'].includes(r.status),
            ),
          'Cancel or finish the current run first.',
        );
        for (const item of failed) store.remove('item', item.id);
        store.put('run', {
          ...run,
          targets: failed.map((i) => i.dealId),
          cursor: 0,
          status: 'queued',
          failed: 0,
        });
        store.put('campaign', { ...c, status: 'running' });
        store.audit('run.retry', entityId);
        return { ok: true };
      }
      return store
        .list('run')
        .filter((r) => {
          try {
            this.campaign(r.campaignId);
            return true;
          } catch {
            return false;
          }
        })
        .map((r) => {
          const { targets, ...safe } = r;
          return safe;
        });
    }
    if (resource === 'settings') {
      this.require('settings.manage');
      if (method === 'GET')
        return {
          ...company.settings,
          timezone: company.timezone,
          currency: company.currency,
          companyName: company.name,
          publicId: company.publicId,
          limits,
          plan: plan.name,
        };
      assert(method === 'PUT', 'Use PUT to update settings.', 405);
      const timezone = text(body.timezone, 'Time zone');
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone });
      } catch {
        throw new DomainError(400, 'Choose a valid IANA time zone.');
      }
      assert(/^[A-Z]{3}$/.test(body.currency), 'Use a three-letter currency code.');
      assert(
        /^\d{2}:\d{2}$/.test(body.from) && /^\d{2}:\d{2}$/.test(body.to) && body.from < body.to,
        'Choose valid working hours.',
      );
      assert(
        Array.isArray(body.days) &&
          body.days.length &&
          body.days.every((d: string) =>
            ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].includes(d),
          ),
        'Choose valid working days.',
      );
      const settings = {
        ...company.settings,
        from: body.from,
        to: body.to,
        days: body.days,
        dailyCap: integer(body.dailyCap, 'Daily cap', 1, limits.itemsPerDay),
        autoJoin: Boolean(body.autoJoin),
        defaultRole: ['Analyst', 'Marketer'].includes(body.defaultRole)
          ? body.defaultRole
          : 'Analyst',
        notificationEmail: String(body.notificationEmail ?? '').slice(0, 200),
      };
      store.globalPut('company', {
        ...company,
        name: text(body.companyName, 'Company name'),
        timezone,
        currency: body.currency,
        settings,
      });
      store.audit('settings.updated', company.id);
      return { ok: true };
    }
    if (resource === 'team') {
      this.require('users.manage');
      if (method === 'GET') return store.list('member');
      assert(method === 'PUT', 'Use PUT to update a membership.', 405);
      const member = store.get('member', entityId),
        role = store.get('role', body.roleId ?? member.roleId);
      assert(
        member.role !== 'Owner' ||
          store
            .list('member')
            .some((m) => m.id !== member.id && m.role === 'Owner' && m.status === 'active') ||
          (role.name === 'Owner' && body.status !== 'inactive'),
        'The last active Owner cannot be removed.',
      );
      if (member.role === 'Owner')
        assert(
          store.get('member', ctx.membershipId).role === 'Owner',
          'Only an Owner can change another Owner.',
          403,
        );
      const updated = store.put('member', {
        ...member,
        roleId: role.id,
        role: role.name,
        status: body.status === 'inactive' ? 'inactive' : 'active',
      });
      store.audit('member.updated', member.id);
      return updated;
    }
    if (resource === 'invites') {
      this.require('users.manage');
      if (method === 'GET') return store.list('invite').map(({ tokenHash, ...safe }) => safe);
      assert(method === 'POST', 'Use POST to invite an employee.', 405);
      assert(
        store.list('member').length +
          store.list('invite').filter((i) => !i.acceptedAt && Date.parse(i.expiresAt) > Date.now())
            .length <
          limits.employees,
        'Your employee limit has been reached.',
      );
      const email = text(body.email, 'Email').toLowerCase();
      assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Enter a valid email address.');
      const role = store.get('role', text(body.roleId, 'Role'));
      assert(
        role.name !== 'Owner' || store.get('member', ctx.membershipId).role === 'Owner',
        'Only Owners can invite another Owner.',
        403,
      );
      const token = randomBytes(32).toString('base64url');
      const invite = store.put('invite', {
        email,
        roleId: role.id,
        role: role.name,
        tokenHash: sha(token),
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        delivery: 'not_sent',
      });
      store.audit('invite.created', invite.id, { email, delivery: 'local_preview' });
      const { tokenHash, ...safe } = invite;
      return {
        ...safe,
        previewUrl: `/invite?token=${token}`,
        notice: 'Invite prepared locally. Email delivery is not configured; no email was sent.',
      };
    }
    if (resource === 'roles') {
      this.require(method === 'GET' ? 'users.manage' : 'roles.manage');
      if (method === 'GET') return store.list('role');
      assert(['POST', 'PUT'].includes(method), 'Method not allowed.', 405);
      const previous: any = entityId ? store.get('role', entityId) : {};
      assert(previous.name !== 'Owner', 'The Owner role cannot be edited.');
      assert(
        Array.isArray(body.permissions) &&
          body.permissions.every((p: string) => permissions.includes(p)),
        'Choose valid permissions.',
      );
      assert(
        body.permissions.every((p: string) => ctx.permissions.includes(p)),
        'You cannot grant permissions you do not have.',
        403,
      );
      const name = text(body.name, 'Role name', 50);
      assert(name !== 'Owner', 'Owner is a protected role.');
      const role = store.put('role', {
        ...previous,
        id: entityId,
        name,
        permissions: body.permissions,
        ownOnly: Boolean(body.ownOnly),
        system: previous.system ?? false,
      });
      store.audit('role.saved', role.id);
      return role;
    }
    if (resource === 'permissions') {
      this.require('users.manage');
      return permissions;
    }
    if (resource === 'integrations' && entityId === 'bitrix') {
      this.require('bitrix.manage');
      if (method === 'GET') return store.list('connection');
      const connectionId = parts[3],
        op = parts[4];
      if (connectionId === 'connect-code') {
        assert(method === 'POST', 'Use POST to generate a code.', 405);
        const code = randomBytes(6).toString('base64url').toUpperCase();
        store.put('connectcode', {
          codeHash: sha(code),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          usedAt: null,
        });
        store.audit('connection.code_generated', company.id);
        return {
          code,
          companyId: company.publicId,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          localOnly: true,
        };
      }
      if (op === 'setup-check') {
        const conn = store.get('connection', connectionId);
        return {
          mode: conn.mode,
          checks: [
            { name: 'Company mapping', status: 'passed', detail: company.publicId },
            {
              name: 'Bitrix OAuth',
              status: 'pending',
              detail: 'A public HTTPS address and local app credentials are required.',
            },
            {
              name: 'Administrator and scopes',
              status: 'pending',
              detail: 'Verified after connecting the local application.',
            },
            {
              name: 'Marketing SPA fields',
              status: 'sample',
              detail: 'Sample campaign code and reply-date fields available.',
            },
            {
              name: 'Workflow templates',
              status: 'sample',
              detail: 'Sample follow-up workflow available.',
            },
            {
              name: 'Worker',
              status: 'passed',
              detail: 'Local worker is processing sample campaigns.',
            },
          ],
        };
      }
      throw new DomainError(
        409,
        'Live Bitrix connection setup requires a public HTTPS address. Local sample mode does not store or use real credentials.',
      );
    }
    if (resource === 'meta') {
      this.require('segments.view');
      if (entityId === 'spas')
        return [
          {
            id: 1036,
            name: 'Marketing',
            pipelines: [
              {
                id: 0,
                name: 'Campaign recipients',
                stages: [
                  { id: 'NEW', name: 'New' },
                  { id: 'REPLIED', name: 'Replied' },
                  { id: 'WON', name: 'Won' },
                  { id: 'FAILED', name: 'Failed' },
                ],
              },
            ],
            sample: true,
          },
        ];
      if (entityId === 'workflows')
        return [
          {
            id: 'sample_followup',
            name: 'Customer follow-up',
            parameters: [],
            autoExecute: false,
            sample: true,
          },
          {
            id: 'sample_notify',
            name: 'Notify account owner',
            parameters: [],
            autoExecute: false,
            sample: true,
          },
        ];
      return [
        'title',
        'stage',
        'pipeline',
        'email',
        'phone',
        'country',
        'owner',
        'value',
        'createdAt',
        'lastActivity',
        'industry',
      ].map((name) => ({
        id: name,
        name,
        type: ['value'].includes(name)
          ? 'number'
          : ['createdAt', 'lastActivity'].includes(name)
            ? 'date'
            : 'string',
      }));
    }
    if (resource === 'api-keys') {
      this.require('apikeys.manage');
      if (method === 'GET') return store.list('apikey').map(({ hash, ...safe }) => safe);
      assert(limits.api, 'API access is not included in this plan.', 403);
      if (method === 'DELETE') {
        const key = store.get('apikey', entityId);
        store.put('apikey', { ...key, revokedAt: new Date().toISOString() });
        store.audit('apikey.revoked', key.id);
        return { ok: true };
      }
      assert(method === 'POST', 'Use POST to create an API key.', 405);
      assert(
        Array.isArray(body.scopes) &&
          body.scopes.length &&
          body.scopes.every((p: string) => ctx.permissions.includes(p)),
        'Choose scopes you are allowed to grant.',
      );
      const prefix = randomBytes(6).toString('hex'),
        key = `tm_live_${prefix}_${randomBytes(32).toString('base64url')}`;
      const record = store.put('apikey', {
        name: text(body.name, 'API key name'),
        prefix,
        hash: await argon2.hash(key, { type: argon2.argon2id }),
        scopes: body.scopes,
        createdBy: ctx.membershipId,
        createdAt: new Date().toISOString(),
        expiresAt: body.expiresAt ?? null,
        lastUsedAt: null,
        revokedAt: null,
      });
      store.audit('apikey.created', record.id);
      return { id: record.id, key };
    }
    if (resource === 'audit') {
      this.require('audit.view');
      return store.list('audit').slice(0, 500);
    }
    if (resource === 'deals') {
      this.require('segments.view');
      return store.list('deal').slice(0, 50);
    }
    throw new DomainError(404, 'This endpoint was not found.');
  }
  segmentSummary(segment: any) {
    const deals =
      segment.mode === 'snapshot' && segment.snapshotIds
        ? this.store.list('deal').filter((d) => segment.snapshotIds.includes(d.id))
        : filterDeals(this.store.list('deal'), segment.tree);
    return {
      ...segment,
      lastCount: deals.length,
      withEmail: deals.filter((d) => d.email).length,
      withPhone: deals.filter((d) => d.phone).length,
    };
  }
  report(campaign: any) {
    const items = this.store
        .list('item')
        .filter((i) => i.campaignId === campaign.id && i.status !== 'skipped'),
      runs = this.store.list('run').filter((r) => r.campaignId === campaign.id);
    return {
      campaign,
      metrics: reportMetrics(items, campaign),
      segment: this.segmentSummary(this.store.get('segment', campaign.segmentId)),
      runs: runs.map((r) => ({
        ...r,
        targets: undefined,
        metrics: reportMetrics(
          items.filter((i) => i.runId === r.id),
          campaign,
        ),
      })),
      timeline: Array.from({ length: 14 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - 13 + i);
        const day = date.toISOString().slice(0, 10),
          matched = items.filter((item) => item.createdAt.startsWith(day));
        return {
          day,
          attempts: matched.length,
          replies: matched.filter((i) => i.replyDate).length,
          won: matched.filter((i) => campaign.wonStages.includes(i.stage)).length,
        };
      }),
      sample: true,
    };
  }
  validateReady(c: any) {
    assert(c.workflows?.length, 'Choose at least one workflow before running.');
    assert(
      c.workflows.every((w: any) => ['sample_followup', 'sample_notify'].includes(w.id)),
      'Choose a valid workflow.',
    );
    assert(c.campaignIdField && c.titleTemplate, 'Configure a campaign-code field and item title.');
  }
  async console(path: string, method: string, body: any, session: any) {
    const user = this.store.globalGet('user', session.user_id);
    assert(user.platformRole, 'Platform access is required.', 403);
    const parts = path.split('/'),
      resource = parts[3],
      entityId = parts[4],
      action = parts[5];
    const writable = user.platformRole === 'Super Admin';
    if (method !== 'GET')
      assert(
        writable ||
          (action === 'impersonate' && user.platformRole === 'Support') ||
          resource === 'stop-impersonation',
        'Your platform role is read-only.',
        403,
      );
    if (resource === 'stop-impersonation') {
      assert(method === 'POST', 'Use POST to end a support session.', 405);
      const imp = session.impersonation ? JSON.parse(session.impersonation) : null;
      if (imp) {
        tenantContext.run(
          { companyId: imp.companyId, userId: user.id, membershipId: 'support', permissions },
          () => this.store.audit('impersonation.stopped', imp.id),
        );
        this.store.globalPut('platformaudit', {
          actorUserId: user.id,
          action: 'impersonation.stopped',
          companyId: imp.companyId,
          at: new Date().toISOString(),
        });
      }
      this.store.db
        .prepare('UPDATE sessions SET impersonation=NULL WHERE hash=?')
        .run(session.hash);
      return { ok: true };
    }
    if (resource === 'companies') {
      if (method === 'GET')
        return this.store.globalList('company').map((c) => ({
          ...c,
          plan: this.store.globalGet('plan', c.planId).name,
          members: this.store.rawList('member', c.id).length,
          connections: this.store.rawList('connection', c.id).length,
          campaigns: this.store.rawList('campaign', c.id).length,
          runs: this.store.rawList('run', c.id).length,
        }));
      if (action) {
        const company = this.store.globalGet('company', entityId);
        if (action === 'impersonate') {
          const reason = text(body.reason, 'Reason', 500);
          const imp = {
            id: id(),
            companyId: company.id,
            reason,
            allowWrite: writable && Boolean(body.allowWrite),
            startedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          };
          this.store.db
            .prepare('UPDATE sessions SET impersonation=? WHERE hash=?')
            .run(JSON.stringify(imp), session.hash);
          this.store.globalPut('platformaudit', {
            actorUserId: user.id,
            action: 'impersonation.started',
            companyId: company.id,
            data: imp,
            at: new Date().toISOString(),
          });
          tenantContext.run(
            { companyId: company.id, userId: user.id, membershipId: 'support', permissions },
            () => this.store.audit('impersonation.started', imp.id, imp),
          );
          return imp;
        }
        assert(['suspend', 'reactivate', 'archive'].includes(action), 'Unknown company action.');
        this.store.globalPut('company', {
          ...company,
          status: action === 'suspend' ? 'suspended' : action === 'archive' ? 'archived' : 'active',
        });
        this.store.globalPut('platformaudit', {
          actorUserId: user.id,
          action: 'company.' + action,
          companyId: company.id,
          at: new Date().toISOString(),
        });
        return { ok: true };
      }
      if (method === 'PUT') {
        const company = this.store.globalGet('company', entityId);
        const plan = this.store.globalGet('plan', body.planId ?? company.planId);
        const overrides: any = {};
        for (const key of ['campaigns', 'itemsPerDay', 'employees', 'connections'])
          if (body.limitOverrides?.[key] != null)
            overrides[key] = integer(body.limitOverrides[key], key, 1, 1000000);
        this.store.globalPut('company', {
          ...company,
          name: text(body.name ?? company.name, 'Company name'),
          planId: plan.id,
          limitOverrides: overrides,
        });
        return { ok: true };
      }
      assert(method === 'POST', 'Use POST to create a company.', 405);
      const plan = this.store.globalGet('plan', body.planId ?? 'plan_starter');
      const company = this.store.globalPut('company', {
        name: text(body.name, 'Company name'),
        publicId: 'TM-' + randomBytes(4).toString('hex').slice(0, 6).toUpperCase(),
        planId: plan.id,
        timezone: 'Asia/Dubai',
        currency: 'AED',
        status: 'active',
        createdAt: new Date().toISOString(),
        settings: {
          from: '08:00',
          to: '20:00',
          days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'],
          dailyCap: 1000,
          autoJoin: false,
          defaultRole: 'Analyst',
        },
      });
      tenantContext.run(
        { companyId: company.id, userId: user.id, membershipId: 'platform', permissions },
        () => {
          for (const [name, p] of Object.entries(rolePermissions))
            this.store.put('role', { name, permissions: p, system: true });
          this.store.audit('company.created', company.id);
        },
      );
      this.store.globalPut('platformaudit', {
        actorUserId: user.id,
        action: 'company.created',
        companyId: company.id,
        at: new Date().toISOString(),
      });
      return company;
    }
    if (resource === 'plans') return this.store.globalList('plan');
    if (resource === 'platform-users')
      return this.store
        .globalList('user')
        .filter((u) => u.platformRole)
        .map((u) => this.safeUser(u));
    if (resource === 'audit') return this.store.globalList('platformaudit').reverse();
    if (resource === 'system')
      return {
        worker: this.workerTimer ? 'running' : 'external',
        storage: 'SQLite � local development',
        mode: this.demoMode ? 'sample' : 'setup',
        liveReady: false,
        queued: this.store
          .globalList('company')
          .reduce(
            (n, c) =>
              n +
              this.store
                .rawList('run', c.id)
                .filter((r) => ['queued', 'running'].includes(r.status)).length,
            0,
          ),
        uptime: process.uptime(),
        companies: this.store.globalList('company').length,
      };
    throw new DomainError(404, 'Console endpoint not found.');
  }
  openapi() {
    return {
      openapi: '3.0.3',
      info: {
        title: 'TrueMarketing API',
        version: '0.1.0',
        description: 'Company API. Live Bitrix execution is not enabled.',
      },
      servers: [{ url: 'http://127.0.0.1:4310' }],
      components: { securitySchemes: { ApiKey: { type: 'http', scheme: 'bearer' } } },
      security: [{ ApiKey: [] }],
      paths: Object.fromEntries(
        ['/v1/campaigns', '/v1/campaigns/{id}/report', '/v1/segments'].map((p) => [
          p,
          {
            get: {
              responses: {
                200: { description: 'Tenant-scoped result' },
                401: { description: 'Invalid API key' },
                403: { description: 'Missing permission' },
              },
            },
          },
        ]),
      ),
    };
  }
}
