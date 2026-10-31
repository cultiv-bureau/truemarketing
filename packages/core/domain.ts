import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export type RecordData = { id: string; companyId: string; [key: string]: any };
export const permissions = [
  'segments.view',
  'segments.manage',
  'campaigns.view',
  'campaigns.manage',
  'campaigns.run',
  'reports.view',
  'runs.view',
  'runs.export',
  'settings.manage',
  'bitrix.manage',
  'users.manage',
  'roles.manage',
  'apikeys.manage',
  'audit.view',
];
export const rolePermissions: Record<string, string[]> = {
  Owner: permissions,
  Admin: permissions,
  Marketer: permissions.filter((p) => /^(segments|campaigns|reports|runs)\./.test(p)),
  Analyst: ['segments.view', 'campaigns.view', 'reports.view', 'runs.view', 'runs.export'],
};
export const id = (prefix = 'c') => prefix + randomBytes(12).toString('hex');
export const sha = (value: string) => createHash('sha256').update(value).digest('hex');
export const safeEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assert(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new DomainError(status, message);
}
export function text(value: unknown, name: string, max = 200): string {
  assert(
    typeof value === 'string' && value.trim().length > 0 && value.length <= max,
    `${name} is required and must be under ${max} characters.`,
  );
  return value.trim();
}
export function integer(value: unknown, name: string, min = 1, max = 1000000) {
  const n = Number(value);
  assert(Number.isInteger(n) && n >= min && n <= max, `${name} must be between ${min} and ${max}.`);
  return n;
}
export type Rule = { entity?: string; field: string; operator: string; value: any };
export type Group = { logic: 'AND' | 'OR'; rules: Rule[] };
export type FilterTree = {
  include: { logic: 'AND' | 'OR'; groups: Group[] };
  exclude?: { logic: 'AND' | 'OR'; groups: Group[] };
};
export function validateTree(tree: any): asserts tree is FilterTree {
  assert(
    tree && tree.include && ['AND', 'OR'].includes(tree.include.logic),
    'An include block with AND or OR logic is required.',
  );
  for (const block of [tree.include, tree.exclude].filter(Boolean)) {
    assert(
      ['AND', 'OR'].includes(block.logic) &&
        Array.isArray(block.groups) &&
        block.groups.length <= 12,
      'Use up to 12 valid filter groups.',
    );
    for (const group of block.groups) {
      assert(
        ['AND', 'OR'].includes(group.logic) &&
          Array.isArray(group.rules) &&
          group.rules.length <= 20,
        'Use up to 20 rules per group.',
      );
      for (const rule of group.rules)
        assert(
          [
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
          ].includes(rule.field) &&
            [
              'is',
              'is_not',
              'contains',
              'not_contains',
              'empty',
              'not_empty',
              'gte',
              'lte',
              'between',
              'older',
              'within',
              'any',
              'none',
            ].includes(rule.operator),
          'Choose a supported field and operator.',
        );
    }
  }
}
export function matchesRule(deal: any, rule: Rule, now = Date.now()): boolean {
  const actual = deal[rule.field],
    value = rule.value;
  const normalized = String(actual ?? '').toLowerCase();
  switch (rule.operator) {
    case 'is':
      return normalized === String(value ?? '').toLowerCase();
    case 'is_not':
      return normalized !== String(value ?? '').toLowerCase();
    case 'contains':
      return normalized.includes(String(value ?? '').toLowerCase());
    case 'not_contains':
      return !normalized.includes(String(value ?? '').toLowerCase());
    case 'empty':
      return actual == null || actual === '';
    case 'not_empty':
      return actual != null && actual !== '';
    case 'gte':
      return Number(actual) >= Number(value);
    case 'lte':
      return Number(actual) <= Number(value);
    case 'between': {
      const range = Array.isArray(value) ? value : String(value).split(',');
      return Number(actual) >= Number(range[0]) && Number(actual) <= Number(range[1]);
    }
    case 'older':
      return (
        Number.isFinite(Date.parse(actual)) && (now - Date.parse(actual)) / 86400000 > Number(value)
      );
    case 'within':
      return (
        Number.isFinite(Date.parse(actual)) &&
        (now - Date.parse(actual)) / 86400000 <= Number(value)
      );
    case 'any':
      return (Array.isArray(value) ? value : String(value).split(','))
        .map((x: any) => String(x).trim().toLowerCase())
        .includes(normalized);
    case 'none':
      return !(Array.isArray(value) ? value : String(value).split(','))
        .map((x: any) => String(x).trim().toLowerCase())
        .includes(normalized);
    default:
      return false;
  }
}
function matchesBlock(deal: any, block: FilterTree['include'] | undefined, empty: boolean) {
  if (!block?.groups.length) return empty;
  const groups = block.groups.map((group) => {
    const results = group.rules.map((r) => matchesRule(deal, r));
    return group.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
  });
  return block.logic === 'AND' ? groups.every(Boolean) : groups.some(Boolean);
}
export function filterDeals(deals: any[], tree: FilterTree) {
  return deals.filter(
    (d) => matchesBlock(d, tree.include, true) && !matchesBlock(d, tree.exclude, false),
  );
}
export function resolveTemplate(template: string, deal: any, campaign: any, run: any) {
  const fields: Record<string, any> = {
    Deal: { ...deal, ID: deal.bitrixId, TITLE: deal.title, OPPORTUNITY: deal.value },
    Contact: { NAME: deal.contactName, EMAIL: deal.email, PHONE: deal.phone },
    Company: { TITLE: deal.companyName },
    Campaign: { code: campaign.code, name: campaign.name },
    Run: { id: run.id },
  };
  return template.replace(/\{(Deal|Contact|Company|Campaign|Run)\.([\w]+)\}/g, (_, entity, field) =>
    String(Object.hasOwn(fields[entity], field) ? (fields[entity][field] ?? '') : ''),
  );
}
export function duplicateKeys(deal: any, fields: string[]) {
  return fields
    .map((field) => {
      const value =
        field === 'dealId'
          ? deal.id
          : field === 'contactId'
            ? deal.contactId
            : field === 'companyId'
              ? deal.sourceCompanyId
              : deal[field];
      return value ? sha(`${field}:${String(value).trim().toLowerCase()}`) : null;
    })
    .filter(Boolean) as string[];
}
export function reportMetrics(items: any[], campaign: any) {
  const attempts = items.length,
    tracked = Boolean(campaign.failedStages?.length),
    successful = tracked
      ? items.filter((i) => !campaign.failedStages.includes(i.stage)).length
      : null;
  const replies = items.filter((i) => i.replyDate),
    won = items.filter((i) => campaign.wonStages?.includes(i.stage));
  const revenue = won.reduce((n, i) => n + Number(i.revenue || 0), 0),
    spend =
      campaign.costPerMessage != null && successful != null
        ? campaign.costPerMessage * successful
        : null;
  const ratio = (a: number, b: number | null) => (b ? a / b : null);
  return {
    attempts,
    successful,
    replies: replies.length,
    won: won.length,
    revenue,
    spend,
    successRate: ratio(successful ?? 0, attempts),
    answerRate: ratio(replies.length, successful),
    conversionRate: ratio(won.length, successful),
    cpa: spend != null ? ratio(spend, won.length) : null,
    roas: spend ? revenue / spend : null,
    averageReplyHours: replies.length
      ? replies.reduce(
          (n, i) => n + (Date.parse(i.replyDate) - Date.parse(i.createdAt)) / 3600000,
          0,
        ) / replies.length
      : null,
  };
}
export function localDay(timezone: string, date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
export function withinWindow(schedule: any, timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = get('weekday'),
    time = get('hour') + ':' + get('minute');
  return (
    (schedule.days ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']).includes(day) &&
    time >= (schedule.from ?? '09:00') &&
    time < (schedule.to ?? '18:00')
  );
}
