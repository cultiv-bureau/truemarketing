import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { Store, tenantContext } from '../dist/packages/core/store.js';
import { id, rolePermissions } from '../dist/packages/core/domain.js';

// One-time, explicitly authorized replacement of the original synthetic workspaces.
if (!process.argv.includes('--remove-demo-data'))
  throw new Error('Pass --remove-demo-data to remove the original sample tenants.');
const credentialPath = resolve('data/account-credentials.json');
if (existsSync(credentialPath))
  throw new Error(
    'Accounts were already provisioned. This command will not overwrite credentials.',
  );
const store = new Store(resolve('data/truemarketing.sqlite'));
const now = new Date().toISOString();
const bureauId = id(),
  mazeedId = id(),
  bureauUserId = id(),
  mazeedUserId = id();
const password = () => randomBytes(21).toString('base64url') + '!';
const bureauPassword = password(),
  mazeedPassword = password();
const bureauHash = await argon2.hash(bureauPassword, { type: argon2.argon2id });
const mazeedHash = await argon2.hash(mazeedPassword, { type: argon2.argon2id });
const credentials = {
  url: 'http://localhost:4310',
  bureau: {
    login: 'bureau@cultiv.llc',
    password: bureauPassword,
    role: 'Super Admin',
    companyId: bureauId,
    twoFactor: 'Required. Enroll your authenticator on first sign-in.',
  },
  mazeed: {
    login: 'mazeed.admin',
    password: mazeedPassword,
    role: 'Owner',
    companyId: mazeedId,
    twoFactor: 'Not required for this company account.',
  },
};
store.transaction(() => {
  const sampleIds = ['company_mazeed', 'company_sandbox'];
  const unknown = store.globalList('company').filter((c) => !sampleIds.includes(c.id));
  if (unknown.length)
    throw new Error(
      'Additional companies exist. Review them before running this one-time migration.',
    );
  store.db.exec('DELETE FROM sessions');
  for (const companyId of sampleIds)
    store.db.prepare('DELETE FROM entities WHERE company_id=?').run(companyId);
  for (const entityId of [...sampleIds, 'user_hossam', 'user_analyst', 'user_platform'])
    store.db.prepare('DELETE FROM global_entities WHERE id=?').run(entityId);
  // The only previous platform audit events concern the synthetic tenants.
  for (const event of store.globalList('platformaudit'))
    if (sampleIds.includes(event.companyId))
      store.db.prepare('DELETE FROM global_entities WHERE id=?').run(event.id);
  for (const plan of [
    {
      id: 'plan_starter',
      name: 'Starter',
      limits: { campaigns: 5, itemsPerDay: 1000, employees: 5, connections: 1, api: false },
    },
    {
      id: 'plan_growth',
      name: 'Growth',
      limits: { campaigns: 25, itemsPerDay: 10000, employees: 25, connections: 3, api: true },
    },
    {
      id: 'plan_enterprise',
      name: 'Enterprise',
      limits: { campaigns: 100, itemsPerDay: 100000, employees: 100, connections: 10, api: true },
    },
  ])
    store.globalPut('plan', plan);
  const bureau = store.globalPut('company', {
    id: bureauId,
    publicId: 'TM-' + randomBytes(3).toString('hex').toUpperCase(),
    name: 'Cultiv Bureau',
    initials: 'B',
    status: 'active',
    planId: 'plan_enterprise',
    timezone: 'Africa/Cairo',
    currency: 'EGP',
    createdAt: now,
    settings: {
      from: '08:00',
      to: '20:00',
      days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'],
      dailyCap: 10000,
      autoJoin: false,
      defaultRole: 'Analyst',
      rate: 2,
      safety: 0.8,
      retries: 3,
      notificationEmail: 'bureau@cultiv.llc',
    },
  });
  const mazeed = store.globalPut('company', {
    id: mazeedId,
    publicId: 'TM-' + randomBytes(3).toString('hex').toUpperCase(),
    name: 'Mazeed',
    initials: 'M',
    status: 'active',
    planId: 'plan_growth',
    timezone: 'Asia/Dubai',
    currency: 'AED',
    createdAt: now,
    settings: {
      from: '08:00',
      to: '20:00',
      days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'],
      dailyCap: 5000,
      autoJoin: false,
      defaultRole: 'Analyst',
      rate: 2,
      safety: 0.8,
      retries: 3,
      notificationEmail: '',
    },
  });
  store.globalPut('user', {
    id: bureauUserId,
    name: 'Bureau Administrator',
    email: 'bureau@cultiv.llc',
    username: 'bureau.admin',
    passwordHash: bureauHash,
    platformRole: 'Super Admin',
    status: 'active',
    createdAt: now,
  });
  store.globalPut('user', {
    id: mazeedUserId,
    name: 'Mazeed Administrator',
    username: 'mazeed.admin',
    email: null,
    passwordHash: mazeedHash,
    status: 'active',
    createdAt: now,
  });
  for (const [company, userId, email] of [
    [bureau, bureauUserId, 'bureau@cultiv.llc'],
    [mazeed, mazeedUserId, null],
  ]) {
    tenantContext.run(
      {
        companyId: company.id,
        userId: bureauUserId,
        membershipId: 'provision',
        permissions: rolePermissions.Owner,
      },
      () => {
        let ownerRole;
        for (const [name, permissions] of Object.entries(rolePermissions)) {
          const role = store.put('role', { name, permissions, system: true, ownOnly: false });
          if (name === 'Owner') ownerRole = role;
        }
        store.put('member', {
          userId,
          name: company.name === 'Mazeed' ? 'Mazeed Administrator' : 'Bureau Administrator',
          email,
          username: company.name === 'Mazeed' ? 'mazeed.admin' : 'bureau.admin',
          roleId: ownerRole.id,
          role: 'Owner',
          status: 'active',
          lastActiveAt: null,
          createdAt: now,
        });
        store.audit('company.provisioned', company.id, { emptyWorkspace: true });
      },
    );
  }
  store.globalPut('platformaudit', {
    actorUserId: bureauUserId,
    action: 'platform.accounts_provisioned',
    at: now,
    data: { companies: [bureauId, mazeedId], sampleDataRemoved: true },
  });
  credentials.bureau.publicId = bureau.publicId;
  credentials.mazeed.publicId = mazeed.publicId;
  mkdirSync(resolve('data'), { recursive: true });
  writeFileSync(credentialPath, JSON.stringify(credentials, null, 2), { flag: 'wx', mode: 0o600 });
});
const counts = store.db.prepare('SELECT kind,COUNT(*) AS count FROM entities GROUP BY kind').all();
store.close();
console.log(
  JSON.stringify({
    companies: ['Cultiv Bureau', 'Mazeed'],
    accounts: ['bureau@cultiv.llc', 'mazeed.admin'],
    counts,
    credentialsFile: 'data/account-credentials.json',
  }),
);
