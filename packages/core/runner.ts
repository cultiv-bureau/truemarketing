import { Store, tenantContext } from './store.js';
import {
  duplicateKeys,
  filterDeals,
  id,
  localDay,
  rolePermissions,
  withinWindow,
  resolveTemplate,
} from './domain.js';
export function enqueueRun(store: Store, campaign: any, isTest: boolean) {
  const active = store
    .list('run')
    .find(
      (r) => r.campaignId === campaign.id && ['queued', 'running', 'paused'].includes(r.status),
    );
  if (active)
    throw new Error('This campaign already has an active run. Resume or cancel it first.');
  const segment = store.get('segment', campaign.segmentId);
  let deals =
    segment.mode === 'snapshot' && segment.snapshotIds
      ? store.list('deal').filter((d) => segment.snapshotIds.includes(d.id))
      : filterDeals(store.list('deal'), segment.tree);
  if (isTest) deals = deals.slice(0, 5);
  const now = new Date().toISOString();
  const run = store.put('run', {
    campaignId: campaign.id,
    name: campaign.name,
    status: deals.length ? 'queued' : 'completed',
    targets: deals.map((d) => d.id),
    total: deals.length,
    cursor: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    isTest,
    sample: true,
    occurrenceAt: now,
    startedAt: now,
    finishedAt: deals.length ? null : now,
  });
  store.put('campaign', { ...campaign, status: deals.length ? 'running' : 'completed' });
  store.audit(isTest ? 'campaign.test_started' : 'campaign.run_started', campaign.id, {
    runId: run.id,
    targets: deals.length,
    mode: 'sample',
  });
  return run;
}
export function tick(store: Store) {
  const now = new Date();
  for (const company of store.globalList('company').filter((c) => c.status === 'active')) {
    tenantContext.run(
      {
        companyId: company.id,
        userId: 'worker',
        membershipId: 'worker',
        permissions: rolePermissions.Owner,
      },
      () => {
        store.transaction(() => {
          const settings = company.settings;
          for (const campaign of store.list('campaign').filter((c) => c.status === 'scheduled')) {
            if (Date.parse(campaign.nextRunAt ?? campaign.schedule.startAt) > now.getTime())
              continue;
            if (
              !withinWindow(settings, company.timezone, now) ||
              !withinWindow(campaign.schedule, company.timezone, now)
            )
              continue;
            if (
              store
                .list('run')
                .some(
                  (r) =>
                    r.campaignId === campaign.id &&
                    ['running', 'queued', 'paused'].includes(r.status),
                )
            )
              continue;
            enqueueRun(store, campaign, false);
          }
          const runs = store
            .list('run')
            .filter((r) => ['running', 'queued'].includes(r.status))
            .reverse();
          const seen = new Set<string>();
          for (const run of runs) {
            const campaign = store.get('campaign', run.campaignId);
            if (seen.has(campaign.connectionId)) continue;
            seen.add(campaign.connectionId);
            if (campaign.status === 'paused' || campaign.status === 'cancelled') continue;
            const connection = store.get('connection', campaign.connectionId);
            if (connection.mode !== 'sample') continue;
            if (
              !run.isTest &&
              (!withinWindow(settings, company.timezone, now) ||
                !withinWindow(campaign.schedule, company.timezone, now))
            )
              continue;
            const day = localDay(company.timezone, now),
              items = store.list('item').filter((item) => item.status !== 'skipped');
            const today = items.filter(
              (i) => localDay(company.timezone, new Date(i.createdAt)) === day,
            );
            const plan = store.globalGet('plan', company.planId),
              limits = { ...plan.limits, ...company.limitOverrides };
            if (
              today.length >= Math.min(settings.dailyCap, limits.itemsPerDay) ||
              today.filter((i) => i.campaignId === campaign.id).length >= campaign.schedule.dailyCap
            )
              continue;
            if (
              run.lastStepAt &&
              now.getTime() - Date.parse(run.lastStepAt) < 60000 / campaign.schedule.pace
            )
              continue;
            if (run.cursor >= run.targets.length) {
              finish(store, run, campaign);
              continue;
            }
            const deal = store.get('deal', run.targets[run.cursor]);
            const keys = campaign.allowDuplicates ? [] : duplicateKeys(deal, campaign.uniqueKeys);
            const enrollments = store.list('enrollment');
            const duplicate = keys.some((key) =>
              enrollments.some(
                (e) =>
                  e.keyHash === key &&
                  (e.campaignId === campaign.id ||
                    (campaign.dupScope === 'spa' &&
                      e.spaEntityTypeId === campaign.spaEntityTypeId &&
                      Date.parse(e.createdAt) >
                        now.getTime() - Number(campaign.duplicateDays ?? 30) * 86400000)),
              ),
            );
            if (duplicate) {
              store.put('item', {
                runId: run.id,
                campaignId: campaign.id,
                dealId: deal.id,
                dealTitle: deal.title,
                status: 'skipped',
                reason: 'Duplicate audience key',
                createdAt: now.toISOString(),
                sample: true,
              });
              run.skipped++;
            } else {
              const mapped = Object.fromEntries(
                (campaign.fieldMap ?? [])
                  .filter((m: any) => m.target)
                  .map((m: any) => [
                    m.target,
                    resolveTemplate(String(m.source ?? ''), deal, campaign, run),
                  ]),
              );
              const item = store.put('item', {
                runId: run.id,
                campaignId: campaign.id,
                dealId: deal.id,
                dealTitle: deal.title,
                title: resolveTemplate(campaign.titleTemplate, deal, campaign, run),
                fields: {
                  ...mapped,
                  parentId2: deal.bitrixId,
                  contactId: deal.contactId,
                  companyId: deal.sourceCompanyId,
                  [campaign.campaignIdField]: campaign.code,
                },
                spaItemId: 'LOCAL-' + id().slice(-7),
                status: 'workflow_started',
                stage: campaign.spaStageId,
                createdAt: now.toISOString(),
                workflowIds: campaign.workflows.map((w: any) => 'LOCAL-' + w.id),
                sample: true,
              });
              for (const key of keys)
                store.put('enrollment', {
                  campaignId: campaign.id,
                  keyHash: key,
                  dealId: deal.id,
                  itemId: item.id,
                  spaEntityTypeId: campaign.spaEntityTypeId,
                  createdAt: now.toISOString(),
                });
              run.created++;
            }
            run.cursor++;
            run.status = 'running';
            run.lastStepAt = now.toISOString();
            store.put('run', run);
            if (run.cursor >= run.targets.length) finish(store, run, campaign);
          }
        });
      },
    );
  }
}
function finish(store: Store, run: any, campaign: any) {
  store.put('run', { ...run, status: 'completed', finishedAt: new Date().toISOString() });
  if (!run.isTest && campaign.schedule.recurrence !== 'once') {
    const next = new Date(campaign.nextRunAt ?? campaign.schedule.startAt);
    const recurrence = campaign.schedule.recurrence;
    if (recurrence === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
    else
      next.setUTCDate(
        next.getUTCDate() +
          (recurrence === 'weekly'
            ? 7
            : recurrence === 'custom'
              ? Number(campaign.schedule.everyDays ?? 1)
              : 1),
      );
    if (campaign.schedule.endAt && next > new Date(campaign.schedule.endAt))
      store.put('campaign', { ...campaign, status: 'completed' });
    else store.put('campaign', { ...campaign, status: 'scheduled', nextRunAt: next.toISOString() });
  } else store.put('campaign', { ...campaign, status: run.isTest ? 'draft' : 'completed' });
  store.audit('run.completed', run.id, {
    created: run.created,
    skipped: run.skipped,
    mode: 'sample',
  });
}
