import { Store, tenantContext } from './store.js';
import { rolePermissions, id } from './domain.js';
export function seed(store: Store) {
  if (store.globalList('company').length) return;
  const now = new Date();
  const plans = [
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
  ];
  plans.forEach((p) => store.globalPut('plan', p));
  store.globalPut('user', {
    id: 'user_hossam',
    name: 'Hossam Abdallah',
    email: 'hossam.abdallah@cultiv.llc',
    status: 'active',
  });
  store.globalPut('user', {
    id: 'user_analyst',
    name: 'Sara Ahmed',
    email: 'analyst@example.test',
    status: 'active',
  });
  store.globalPut('user', {
    id: 'user_platform',
    name: 'TrueMarketing Admin',
    email: 'platform@example.test',
    status: 'active',
    platformRole: 'Super Admin',
  });
  const companies = [
    {
      id: 'company_mazeed',
      publicId: 'TM-7K3Q9P',
      name: 'Mazeed',
      initials: 'M',
      planId: 'plan_growth',
      timezone: 'Asia/Dubai',
      currency: 'AED',
    },
    {
      id: 'company_sandbox',
      publicId: 'TM-8X4R2N',
      name: 'Bureau Sandbox',
      initials: 'B',
      planId: 'plan_starter',
      timezone: 'Africa/Cairo',
      currency: 'EGP',
    },
  ];
  for (const company of companies) {
    store.globalPut('company', {
      ...company,
      status: 'active',
      createdAt: now.toISOString(),
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
        theme: 'light',
      },
    });
    tenantContext.run(
      {
        companyId: company.id,
        userId: 'user_hossam',
        membershipId: 'member_hossam_' + company.id,
        permissions: rolePermissions.Owner,
      },
      () => {
        for (const [name, perms] of Object.entries(rolePermissions))
          store.put('role', {
            id: 'role_' + name + '_' + company.id,
            name,
            permissions: perms,
            system: true,
            ownOnly: false,
          });
        store.put('member', {
          id: 'member_hossam_' + company.id,
          userId: 'user_hossam',
          name: 'Hossam Abdallah',
          email: 'hossam.abdallah@cultiv.llc',
          roleId: 'role_Owner_' + company.id,
          role: 'Owner',
          status: 'active',
          lastActiveAt: now.toISOString(),
        });
        store.put('member', {
          id: 'member_analyst_' + company.id,
          userId: 'user_analyst',
          name: 'Sara Ahmed',
          email: 'analyst@example.test',
          roleId: 'role_Analyst_' + company.id,
          role: 'Analyst',
          status: 'active',
          lastActiveAt: now.toISOString(),
        });
        store.put('connection', {
          id: 'connection_' + company.id,
          domain: company.id === 'company_mazeed' ? 'mazeed.bitrix24.ae' : 'sandbox.example.test',
          status: 'sample',
          name: 'Sample CRM workspace',
          mode: 'sample',
          planRate: 2,
          lastHealthAt: null,
        });
        const names = [
          'Atlas Consulting',
          'Nile Ventures',
          'Horizon Foods',
          'Vertex Technologies',
          'Palm Hospitality',
          'Cedar Trading',
          'Apex Logistics',
          'Bright Academy',
          'Oasis Healthcare',
          'Northstar Group',
          'Summit Partners',
          'Nova Retail',
        ];
        const count = company.id === 'company_mazeed' ? 240 : 40;
        for (let i = 0; i < count; i++)
          store.put('deal', {
            id: `deal_${company.id}_${i + 1}`,
            bitrixId: 10000 + i,
            title: `${names[i % names.length]} — ${['SaaS subscription', 'Accounting services', 'E-invoicing setup', 'Renewal'][i % 4]}`,
            contactName: [
              'Ahmed Hassan',
              'Mariam Ali',
              'Omar Khaled',
              'Nour Mohamed',
              'Kareem Adel',
              'Dina Samir',
            ][i % 6],
            email: i % 9 ? `contact${i % 220}@example.test` : '',
            phone: i % 7 ? `+9715000${String(i).padStart(5, '0')}` : '',
            contactId: 2000 + (i % 220),
            sourceCompanyId: 300 + (i % 60),
            companyName: names[i % names.length],
            country: ['UAE', 'Saudi Arabia', 'Egypt'][i % 3],
            industry: ['Technology', 'Retail', 'Professional services', 'Hospitality'][i % 4],
            pipeline: ['Mazeed One', 'Mazeed Ops'][i % 2],
            stage: ['New', 'Qualified', 'Proposal', 'Won', 'Lost', 'Unreachable'][i % 6],
            owner: ['Ahmed', 'Mariam', 'Omar'][i % 3],
            value: 1200 + (i % 20) * 350,
            createdAt: new Date(now.getTime() - (i % 90) * 86400000).toISOString(),
            lastActivity: new Date(now.getTime() - (i % 45) * 86400000).toISOString(),
          });
        const segments = [
          {
            id: 'segment_warm_' + company.id,
            name: 'Warm opportunities',
            description: 'Qualified deals and proposals, with an email address.',
            tree: {
              include: {
                logic: 'AND',
                groups: [
                  {
                    logic: 'AND',
                    rules: [
                      { field: 'stage', operator: 'any', value: ['Qualified', 'Proposal'] },
                      { field: 'email', operator: 'not_empty', value: '' },
                    ],
                  },
                ],
              },
              exclude: { logic: 'OR', groups: [] },
            },
          },
          {
            id: 'segment_reengage_' + company.id,
            name: 'Re-engagement audience',
            description: 'Open conversations that have been quiet for over two weeks.',
            tree: {
              include: {
                logic: 'AND',
                groups: [
                  {
                    logic: 'AND',
                    rules: [
                      { field: 'lastActivity', operator: 'older', value: 14 },
                      { field: 'stage', operator: 'none', value: ['Won', 'Lost'] },
                    ],
                  },
                ],
              },
              exclude: { logic: 'OR', groups: [] },
            },
          },
          {
            id: 'segment_all_' + company.id,
            name: 'All contactable deals',
            description: 'Every deal with an email address in the sample CRM.',
            tree: {
              include: {
                logic: 'AND',
                groups: [
                  { logic: 'AND', rules: [{ field: 'email', operator: 'not_empty', value: '' }] },
                ],
              },
              exclude: { logic: 'OR', groups: [] },
            },
          },
        ];
        segments.forEach((s) =>
          store.put('segment', {
            ...s,
            connectionId: 'connection_' + company.id,
            mode: 'dynamic',
            ownerMembershipId: 'member_hossam_' + company.id,
            createdAt: now.toISOString(),
          }),
        );
        const campaigns = [
          ['Renew your momentum', 'Q4-RENEWAL', 'Email', segments[0].id, 'completed'],
          ['A fresh conversation', 'RE-ENGAGE', 'WhatsApp', segments[1].id, 'draft'],
          ['Your next chapter', 'NOV-ONBOARD', 'Email', segments[2].id, 'draft'],
        ];
        campaigns.forEach(([name, code, channel, segmentId, status], index) => {
          const c = store.put('campaign', {
            id: 'campaign_' + index + '_' + company.id,
            name,
            code,
            channel,
            segmentId,
            status,
            connectionId: 'connection_' + company.id,
            spaEntityTypeId: 1036,
            spaCategoryId: 0,
            spaStageId: 'NEW',
            campaignIdField: 'ufCrmCampaignCode',
            titleTemplate: '{Campaign.code} · {Deal.TITLE}',
            fieldMap: [{ target: 'title', source: '{Campaign.code} · {Deal.TITLE}' }],
            workflows: [
              { id: 'sample_followup', name: 'Customer follow-up', delay: 0, parameters: {} },
            ],
            allowDuplicates: false,
            uniqueKeys: ['email', 'contactId'],
            dupScope: 'campaign',
            wonStages: ['WON'],
            failedStages: ['FAILED'],
            replyField: 'replyDate',
            costPerMessage: 0.35,
            revenueField: 'opportunity',
            schedule: {
              startAt: new Date(now.getTime() + 86400000).toISOString(),
              recurrence: 'once',
              from: '09:00',
              to: '18:00',
              days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'],
              dailyCap: 200,
              pace: 20,
            },
            ownerMembershipId: 'member_hossam_' + company.id,
            createdAt: now.toISOString(),
            sample: true,
          });
          if (index === 0) {
            const run = store.put('run', {
              id: 'run_seed_' + company.id,
              campaignId: c.id,
              name: c.name,
              status: 'completed',
              total: 48,
              created: 44,
              skipped: 4,
              failed: 0,
              cursor: 48,
              isTest: false,
              sample: true,
              occurrenceAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
              startedAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
              finishedAt: new Date(now.getTime() - 2 * 86400000 + 40 * 60000).toISOString(),
              targets: [],
            });
            for (let j = 0; j < 44; j++) {
              const createdAt = new Date(
                now.getTime() - (2 + (j % 5)) * 86400000 + j * 60000,
              ).toISOString();
              store.put('item', {
                id: id(),
                runId: run.id,
                campaignId: c.id,
                dealId: `seed_${j}`,
                dealTitle: names[j % names.length],
                spaItemId: 80000 + j,
                status: 'workflow_started',
                stage: j < 8 ? 'WON' : j < 11 ? 'FAILED' : j < 22 ? 'REPLIED' : 'NEW',
                replyDate:
                  j < 22 ? new Date(Date.parse(createdAt) + (j + 1) * 3600000).toISOString() : null,
                revenue: j < 8 ? 2400 + j * 100 : 0,
                createdAt,
                workflowIds: ['sample_' + j],
                sample: true,
              });
            }
          }
        });
        store.audit('workspace.created', company.id, { mode: 'sample' });
      },
    );
  }
}
