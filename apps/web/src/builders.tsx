import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  Filter,
  FlaskConical,
  Layers3,
  Mail,
  MessageCircle,
  Plus,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import {
  api,
  Badge,
  Button,
  Card,
  date,
  Empty,
  ErrorBox,
  Field,
  go,
  Loading,
  Modal,
  Notice,
  number,
  PageHead,
  type Row,
  useData,
} from './lib';
import type { AppProps } from './main';
const fieldNames: Record<string, string> = {
  title: 'Deal title',
  stage: 'Deal stage',
  pipeline: 'Pipeline',
  email: 'Contact email',
  phone: 'Contact phone',
  country: 'Country',
  owner: 'Responsible person',
  value: 'Deal value',
  createdAt: 'Created date',
  lastActivity: 'Last activity',
  industry: 'Industry',
};
const operators: Record<string, string> = {
  is: 'is',
  is_not: 'is not',
  contains: 'contains',
  not_contains: 'does not contain',
  empty: 'is empty',
  not_empty: 'is not empty',
  gte: 'is at least',
  lte: 'is at most',
  between: 'is between',
  older: 'older than (days)',
  within: 'within last (days)',
  any: 'is any of',
  none: 'is none of',
};
const defaultTree = () => ({
  include: {
    logic: 'AND',
    groups: [{ logic: 'AND', rules: [{ field: 'email', operator: 'not_empty', value: '' }] }],
  },
  exclude: { logic: 'OR', groups: [] },
});
export function SegmentList({ me, notify }: AppProps) {
  const [refresh, setRefresh] = useState(0),
    [search, setSearch] = useState(''),
    [remove, setRemove] = useState<Row | null>(null);
  const { data, error, loading } = useData<Row[]>('/api/segments', refresh);
  const can = me.permissions.includes('segments.manage');
  return (
    <>
      <PageHead
        eyebrow="THE RIGHT PEOPLE, FIRST"
        title="Segments"
        description="Build focused audiences from the opportunities already in your CRM."
        actions={
          can && (
            <Button icon={Plus} onClick={() => go('/segments/new')}>
              Build a segment
            </Button>
          )
        }
      />
      <div className="segment-intro">
        <span className="audience-icon">
          <Layers3 size={24} />
        </span>
        <div>
          <h2>A better conversation starts with a better audience.</h2>
          <p>
            Combine deal and contact rules. Include the people who matter. Exclude the ones who
            don’t.
          </p>
        </div>
        <span className="subtle-pill">{data?.length ?? 0} saved segments</span>
      </div>
      <div className="list-toolbar standalone">
        <div className="search">
          <Search size={16} />
          <input
            placeholder="Find a segment…"
            aria-label="Search segments"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="muted-text">CRM not connected · {me.company.name}</span>
      </div>
      <ErrorBox message={error} />
      {loading ? (
        <Loading />
      ) : (
        <div className="segment-grid">
          {data
            ?.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
            .map((s, i) => (
              <Card key={s.id} className="segment-card">
                <div className="segment-card-top">
                  <span className={'audience-icon color-' + i}>
                    <Users size={21} />
                  </span>
                  <Badge status={s.mode === 'snapshot' ? 'paused' : 'active'}>
                    {s.mode === 'snapshot' ? 'Frozen list' : 'Dynamic audience'}
                  </Badge>
                </div>
                <h2>{s.name}</h2>
                <p>{s.description || 'A focused audience from your CRM.'}</p>
                <div className="segment-count">
                  <strong>{number(s.lastCount)}</strong>
                  <span>matching deals</span>
                </div>
                <div className="segment-reach">
                  <span>
                    <Mail size={14} />
                    {number(s.withEmail)} with email
                  </span>
                  <span>
                    <MessageCircle size={14} />
                    {number(s.withPhone)} with phone
                  </span>
                </div>
                <div className="segment-rule-summary">
                  {s.tree.include.groups.reduce((n: number, g: Row) => n + g.rules.length, 0)}{' '}
                  include rules ·{' '}
                  {s.tree.exclude?.groups.reduce((n: number, g: Row) => n + g.rules.length, 0) ?? 0}{' '}
                  exclude rules
                </div>
                <div className="segment-card-bottom">
                  <span>CRM not connected</span>
                  {can ? (
                    <>
                      <button
                        className="icon-button"
                        aria-label={'Delete ' + s.name}
                        onClick={() => setRemove(s)}
                      >
                        <Trash2 size={15} />
                      </button>
                      <Button variant="ghost" onClick={() => go('/segments/edit/' + s.id)}>
                        Edit segment <ArrowRight size={15} />
                      </Button>
                    </>
                  ) : (
                    <span className="muted-text">Read only</span>
                  )}
                </div>
              </Card>
            ))}
          {!data?.length && (
            <Empty
              title="Who would you like to reach?"
              description="Save a segment to bring your CRM audience into focus."
              action={can && <Button onClick={() => go('/segments/new')}>Build a segment</Button>}
            />
          )}
        </div>
      )}
      {remove && (
        <Modal title="Delete this segment?" onClose={() => setRemove(null)}>
          <div className="modal-body">
            <p>“{remove.name}” will be removed. Segments used by a campaign cannot be deleted.</p>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setRemove(null)}>
                Keep segment
              </Button>
              <Button
                variant="danger"
                icon={Trash2}
                onClick={async () => {
                  try {
                    await api('/api/segments/' + remove.id, 'DELETE', {});
                    setRemove(null);
                    setRefresh((r) => r + 1);
                    notify('Segment deleted.');
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                Delete segment
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
export function SegmentEditor({ me, notify, segmentId }: AppProps & { segmentId?: string }) {
  const [data, setData] = useState<Row>({
      name: '',
      description: '',
      mode: 'dynamic',
      tree: defaultTree(),
      connectionId: 'connection_' + me.company.id,
    }),
    [preview, setPreview] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(Boolean(segmentId));
  useEffect(() => {
    if (segmentId)
      api('/api/segments/' + segmentId)
        .then(setData)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
  }, [segmentId]);
  function updateTree(fn: (tree: Row) => void) {
    setData((d) => {
      const next = structuredClone(d);
      fn(next.tree);
      return next;
    });
    setPreview(null);
  }
  async function count() {
    setBusy(true);
    setError('');
    try {
      setPreview(await api('/api/segments/count', 'POST', { tree: data.tree }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      await api(
        '/api/segments' + (segmentId ? '/' + segmentId : ''),
        segmentId ? 'PUT' : 'POST',
        data,
      );
      notify('Audience saved. You can now use it in a campaign.');
      go('/segments');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  return (
    <>
      <button className="back-link" onClick={() => go('/segments')}>
        ← All segments
      </button>
      <PageHead
        eyebrow="BRING YOUR AUDIENCE INTO FOCUS"
        title={segmentId ? 'Refine your segment' : 'Build a segment'}
        description="Simple rules. A precise audience. More meaningful conversations."
        actions={
          <>
            <Button variant="secondary" onClick={() => go('/segments')}>
              Cancel
            </Button>
            <Button icon={Save} onClick={save} disabled={busy}>
              Save segment
            </Button>
          </>
        }
      />
      <ErrorBox message={error} />
      <div className="builder-layout">
        <div>
          <Card>
            <div className="card-head">
              <h2>The essentials</h2>
              <span className="step-label">01</span>
            </div>
            <div className="form-body">
              <div className="form-grid">
                <Field label="Segment name">
                  <input
                    value={data.name}
                    onChange={(e) => setData({ ...data, name: e.target.value })}
                    placeholder="e.g. High-intent opportunities"
                  />
                </Field>
                <Field label="Audience mode">
                  <select
                    value={data.mode}
                    onChange={(e) => setData({ ...data, mode: e.target.value })}
                  >
                    <option value="dynamic">Re-check each run</option>
                    <option value="snapshot">Freeze list at save</option>
                  </select>
                </Field>
              </div>
              <Field label="Description" hint="A short reminder of who this audience is for.">
                <input
                  value={data.description}
                  onChange={(e) => setData({ ...data, description: e.target.value })}
                  placeholder="What makes these people the right audience?"
                />
              </Field>
            </div>
          </Card>
          {(['include', 'exclude'] as const).map((block, i) => (
            <Card key={block} className="filter-block">
              <div className="card-head">
                <div>
                  <div className={'filter-label ' + block}>
                    {block === 'include' ? <Plus size={14} /> : <X size={14} />}{' '}
                    {block === 'include' ? 'INCLUDE' : 'EXCLUDE'}
                  </div>
                  <h2>
                    {block === 'include'
                      ? 'Find the right opportunities'
                      : 'Leave out the exceptions'}
                  </h2>
                  <p>
                    {block === 'include'
                      ? 'Deals must match these rules.'
                      : 'Any matching deal is removed from the audience.'}
                  </p>
                </div>
                <select
                  aria-label={block + ' block logic'}
                  className="small-select"
                  value={data.tree[block].logic}
                  onChange={(e) => updateTree((t) => (t[block].logic = e.target.value))}
                >
                  <option value="AND">Match ALL groups</option>
                  <option value="OR">Match ANY group</option>
                </select>
              </div>
              <div className="filter-groups">
                {data.tree[block].groups.map((g: Row, gi: number) => (
                  <div key={gi} className="filter-group">
                    {gi > 0 && <span className="logic-connector">{data.tree[block].logic}</span>}
                    <div className="group-header">
                      <strong>Rule group {gi + 1}</strong>
                      <div>
                        <select
                          aria-label={`${block} group ${gi + 1} logic`}
                          value={g.logic}
                          onChange={(e) =>
                            updateTree((t) => (t[block].groups[gi].logic = e.target.value))
                          }
                        >
                          <option value="AND">All rules (AND)</option>
                          <option value="OR">Any rule (OR)</option>
                        </select>
                        <button
                          className="icon-button"
                          aria-label="Remove group"
                          onClick={() => updateTree((t) => t[block].groups.splice(gi, 1))}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    {g.rules.map((rule: Row, ri: number) => (
                      <div className="rule-row" key={ri}>
                        <select
                          aria-label="Filter field"
                          value={rule.field}
                          onChange={(e) =>
                            updateTree(
                              (t) => (t[block].groups[gi].rules[ri].field = e.target.value),
                            )
                          }
                        >
                          {Object.entries(fieldNames).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Filter operator"
                          value={rule.operator}
                          onChange={(e) =>
                            updateTree(
                              (t) => (t[block].groups[gi].rules[ri].operator = e.target.value),
                            )
                          }
                        >
                          {Object.entries(operators).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {!['empty', 'not_empty'].includes(rule.operator) ? (
                          <input
                            aria-label="Filter value"
                            value={Array.isArray(rule.value) ? rule.value.join(', ') : rule.value}
                            placeholder={
                              ['any', 'none', 'between'].includes(rule.operator)
                                ? 'Values, separated by commas'
                                : 'Enter a value'
                            }
                            onChange={(e) =>
                              updateTree(
                                (t) => (t[block].groups[gi].rules[ri].value = e.target.value),
                              )
                            }
                          />
                        ) : (
                          <span className="no-value">No value needed</span>
                        )}
                        <button
                          className="icon-button"
                          aria-label="Remove rule"
                          onClick={() => updateTree((t) => t[block].groups[gi].rules.splice(ri, 1))}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                    <button
                      className="text-button"
                      onClick={() =>
                        updateTree((t) =>
                          t[block].groups[gi].rules.push({
                            field: 'stage',
                            operator: 'is',
                            value: '',
                          }),
                        )
                      }
                    >
                      <Plus size={14} />
                      Add rule
                    </button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  icon={Plus}
                  onClick={() =>
                    updateTree((t) =>
                      t[block].groups.push({
                        logic: 'AND',
                        rules: [{ field: 'stage', operator: 'is', value: '' }],
                      }),
                    )
                  }
                >
                  Add {data.tree[block].groups.length ? 'another ' : ''}group
                </Button>
              </div>
            </Card>
          ))}
        </div>
        <aside className="audience-preview">
          <Card>
            <div className="eyebrow">AUDIENCE PREVIEW</div>
            <div className="preview-symbol">
              <Users size={30} />
            </div>
            <h2>{preview ? number(preview.count) : 'Let’s find your people.'}</h2>
            <p>
              {preview
                ? 'deals match your segment'
                : 'Check your rules against the sample CRM to see who belongs.'}
            </p>
            <Button icon={Filter} onClick={count} disabled={busy}>
              {busy ? 'Counting…' : 'Count matching deals'}
            </Button>
            {preview && (
              <>
                <div className="preview-breakdown">
                  <div>
                    <Mail size={15} />
                    <span>With email</span>
                    <strong>{preview.withEmail}</strong>
                  </div>
                  <div>
                    <MessageCircle size={15} />
                    <span>With phone</span>
                    <strong>{preview.withPhone}</strong>
                  </div>
                  <div>
                    <X size={15} />
                    <span>Excluded</span>
                    <strong>{preview.excluded}</strong>
                  </div>
                </div>
                <div className="preview-deals">
                  <h4>A few matching opportunities</h4>
                  {preview.sample.slice(0, 4).map((d: Row) => (
                    <div key={d.id}>
                      <strong>{d.companyName}</strong>
                      <span>
                        {d.stage} · {d.country}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <small>
              <FlaskConical size={13} /> CRM not connected data only
            </small>
          </Card>
          <div className="builder-tip">
            <Sparkles size={18} />
            <p>Start focused. A smaller, relevant audience often creates a better conversation.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
const stepNames = [
  'Basics',
  'Audience',
  'Item fields',
  'Workflows',
  'Tracking',
  'Schedule',
  'Review',
];
function defaultCampaign(companyId: string): Row {
  const next = new Date(Date.now() + 86400000);
  next.setHours(10, 0, 0, 0);
  return {
    name: '',
    code: '',
    channel: 'Email',
    segmentId: '',
    connectionId: 'connection_' + companyId,
    spaEntityTypeId: 1036,
    spaCategoryId: 0,
    spaStageId: 'NEW',
    campaignIdField: 'ufCrmCampaignCode',
    titleTemplate: '{Campaign.code} · {Deal.TITLE}',
    fieldMap: [{ target: 'title', source: '{Campaign.code} · {Deal.TITLE}' }],
    workflows: [{ id: 'sample_followup', name: 'Customer follow-up', delay: 0, parameters: {} }],
    allowDuplicates: false,
    uniqueKeys: ['email', 'contactId'],
    dupScope: 'campaign',
    duplicateDays: 30,
    replyField: 'replyDate',
    wonStages: ['WON'],
    failedStages: ['FAILED'],
    costPerMessage: 0.35,
    schedule: {
      startAt: next.toISOString(),
      recurrence: 'once',
      everyDays: 1,
      from: '09:00',
      to: '18:00',
      days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'],
      dailyCap: 200,
      pace: 20,
    },
  };
}
export function CampaignWizard({ me, notify, campaignId }: AppProps & { campaignId?: string }) {
  const [step, setStep] = useState(0),
    [data, setData] = useState<Row>(() => defaultCampaign(me.company.id)),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(Boolean(campaignId)),
    [savedId, setSavedId] = useState(campaignId ?? '');
  const segments = useData<Row[]>('/api/segments'),
    workflows = useData<Row[]>('/api/meta/workflows');
  useEffect(() => {
    if (campaignId)
      api('/api/campaigns/' + campaignId)
        .then(setData)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
  }, [campaignId]);
  const update = (key: string, value: any) => setData((d) => ({ ...d, [key]: value }));
  const schedule = (key: string, value: any) =>
    setData((d) => ({ ...d, schedule: { ...d.schedule, [key]: value } }));
  const segment = segments.data?.find((s) => s.id === data.segmentId);
  async function save(action = 'draft') {
    setBusy(true);
    setError('');
    try {
      const saved = await api(
        '/api/campaigns' + (savedId ? '/' + savedId : ''),
        savedId ? 'PUT' : 'POST',
        data,
      );
      setSavedId(saved.id);
      if (action !== 'draft') await api('/api/campaigns/' + saved.id + '/' + action, 'POST', {});
      notify(
        action === 'test'
          ? 'Sample test started on up to five deals. Follow it in Runs & logs.'
          : action === 'schedule'
            ? 'Sample campaign scheduled.'
            : 'Campaign saved as draft.',
      );
      go(action === 'test' ? '/runs' : '/campaigns');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function next() {
    setError('');
    if (step === 0 && (!data.name.trim() || !data.code.trim())) {
      setError('Give your campaign a name and a unique code.');
      return;
    }
    if (step === 1 && !data.segmentId) {
      setError('Choose an audience before continuing.');
      return;
    }
    if (step === 3 && !data.workflows.length) {
      setError('Choose at least one workflow.');
      return;
    }
    setStep((s) => Math.min(6, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (loading) return <Loading />;
  return (
    <>
      <button className="back-link" onClick={() => go('/campaigns')}>
        ← All campaigns
      </button>
      <PageHead
        eyebrow="FROM INTENTION TO IMPACT"
        title={campaignId ? 'Shape your campaign' : 'Let’s create a campaign.'}
        description="A few thoughtful steps. One well-orchestrated conversation."
        actions={<Badge status="draft">Draft campaign</Badge>}
      />
      <div className="wizard-steps">
        {stepNames.map((name, i) => (
          <button
            key={name}
            className={step === i ? 'current ' : i < step ? 'complete ' : ''}
            onClick={() => {
              if (i < step) setStep(i);
            }}
            disabled={i > step}
          >
            <span>{i < step ? <Check size={14} /> : String(i + 1).padStart(2, '0')}</span>
            <strong>{name}</strong>
            {i < 6 && <ChevronRight size={14} />}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      <div className="wizard-layout">
        <Card className="wizard-card">
          <div className="card-head">
            <div>
              <div className="eyebrow">STEP {String(step + 1).padStart(2, '0')} OF 07</div>
              <h2>
                {
                  [
                    'Give your campaign a clear identity.',
                    'Who’s this conversation for?',
                    'Make every CRM item meaningful.',
                    'Let your workflows take it from here.',
                    'Define what success looks like.',
                    'Find the right moment.',
                    'A final look before you begin.',
                  ][step]
                }
              </h2>
              <p>
                {
                  [
                    'The essentials that keep your campaign organized.',
                    'Choose a focused audience and keep duplicates out.',
                    'Map deal details into your Marketing SPA.',
                    'Choose the business processes to start on each item.',
                    'Connect replies, conversions, and cost.',
                    'Set a schedule that respects your team’s working hours.',
                    'Everything connected, all in one view.',
                  ][step]
                }
              </p>
            </div>
          </div>
          <div className="form-body">
            {step === 0 && (
              <>
                <Field label="Campaign name">
                  <input
                    autoFocus
                    placeholder="e.g. A fresh conversation"
                    value={data.name}
                    onChange={(e) => {
                      update('name', e.target.value);
                      if (!campaignId && !savedId)
                        update(
                          'code',
                          e.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]+/g, '-')
                            .slice(0, 40),
                        );
                    }}
                  />
                </Field>
                <div className="form-grid">
                  <Field
                    label="Campaign code"
                    hint="Written to every CRM item. Must be unique in your company."
                  >
                    <input
                      value={data.code}
                      onChange={(e) => update('code', e.target.value.toUpperCase())}
                      placeholder="Q4-RE-ENGAGE"
                    />
                  </Field>
                  <Field
                    label="Channel tag"
                    hint="For reporting only; your workflows send messages."
                  >
                    <select
                      value={data.channel}
                      onChange={(e) => update('channel', e.target.value)}
                    >
                      {['Email', 'WhatsApp', 'SMS', 'Call'].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="form-divider" />
                <div className="form-grid">
                  <Field label="Marketing Smart Process">
                    <select
                      value={data.spaEntityTypeId}
                      onChange={(e) => update('spaEntityTypeId', Number(e.target.value))}
                    >
                      <option value={1036}>Marketing (sample)</option>
                    </select>
                  </Field>
                  <Field label="Pipeline">
                    <select
                      value={data.spaCategoryId}
                      onChange={(e) => update('spaCategoryId', Number(e.target.value))}
                    >
                      <option value={0}>Campaign recipients</option>
                    </select>
                  </Field>
                </div>
                <div className="form-grid">
                  <Field label="Start stage">
                    <select
                      value={data.spaStageId}
                      onChange={(e) => update('spaStageId', e.target.value)}
                    >
                      <option value="NEW">New</option>
                      <option value="REPLIED">Replied</option>
                    </select>
                  </Field>
                  <Field label="Campaign code field">
                    <select
                      value={data.campaignIdField}
                      onChange={(e) => update('campaignIdField', e.target.value)}
                    >
                      <option value="ufCrmCampaignCode">Campaign code · string</option>
                    </select>
                  </Field>
                </div>
                <Notice>
                  <ShieldCheck size={17} /> This build uses a local sample Marketing SPA. Live
                  fields become available after connecting Bitrix24.
                </Notice>
              </>
            )}
            {step === 1 && (
              <>
                <Field label="Saved segment">
                  <select
                    autoFocus
                    value={data.segmentId}
                    onChange={(e) => update('segmentId', e.target.value)}
                  >
                    <option value="">Choose your audience</option>
                    {segments.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.lastCount} deals
                      </option>
                    ))}
                  </select>
                </Field>
                {segment && (
                  <div className="selected-audience">
                    <span className="audience-icon">
                      <Users size={23} />
                    </span>
                    <div>
                      <strong>{segment.name}</strong>
                      <p>{segment.description}</p>
                    </div>
                    <b>{number(segment.lastCount)}</b>
                  </div>
                )}
                <div className="form-divider" />
                <label className="toggle-row">
                  <div>
                    <strong>Prevent duplicate conversations</strong>
                    <small>Skip deals sharing an audience key already enrolled.</small>
                  </div>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={!data.allowDuplicates}
                    onChange={(e) => update('allowDuplicates', !e.target.checked)}
                  />
                </label>
                {!data.allowDuplicates && (
                  <>
                    <Field label="Treat deals as duplicates when they share">
                      <div className="checkbox-options">
                        {[
                          ['email', 'Contact email'],
                          ['phone', 'Contact phone'],
                          ['contactId', 'Contact ID'],
                          ['dealId', 'Deal ID'],
                          ['companyId', 'Company ID'],
                        ].map(([key, label]) => (
                          <label key={key}>
                            <input
                              type="checkbox"
                              checked={data.uniqueKeys.includes(key)}
                              onChange={(e) =>
                                update(
                                  'uniqueKeys',
                                  e.target.checked
                                    ? [...data.uniqueKeys, key]
                                    : data.uniqueKeys.filter((k: string) => k !== key),
                                )
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </Field>
                    <Field label="Duplicate scope">
                      <select
                        value={data.dupScope}
                        onChange={(e) => update('dupScope', e.target.value)}
                      >
                        <option value="campaign">Within this campaign</option>
                        <option value="spa">Across campaigns in the same SPA</option>
                      </select>
                    </Field>
                    {data.dupScope === 'spa' && (
                      <Field label="Look back (days)">
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={data.duplicateDays}
                          onChange={(e) => update('duplicateDays', Number(e.target.value))}
                        />
                      </Field>
                    )}
                    <Notice>
                      Any matching key makes a deal a duplicate. Empty keys are ignored.
                    </Notice>
                  </>
                )}
              </>
            )}
            {step === 2 && (
              <>
                <Field
                  label="Item title template"
                  hint="Use placeholders to personalize each CRM item."
                >
                  <input
                    autoFocus
                    value={data.titleTemplate}
                    onChange={(e) => update('titleTemplate', e.target.value)}
                  />
                </Field>
                <div className="placeholder-tokens">
                  {['{Deal.TITLE}', '{Contact.NAME}', '{Campaign.code}'].map((token) => (
                    <button
                      key={token}
                      onClick={() => update('titleTemplate', data.titleTemplate + ' ' + token)}
                    >
                      <Plus size={11} />
                      {token}
                    </button>
                  ))}
                </div>
                <div className="mapping-heading">
                  <span>SPA FIELD</span>
                  <span>VALUE OR PLACEHOLDER</span>
                </div>
                {data.fieldMap.map((m: Row, i: number) => (
                  <div className="mapping-row" key={i}>
                    <select
                      aria-label="Target SPA field"
                      value={m.target}
                      onChange={(e) =>
                        update(
                          'fieldMap',
                          data.fieldMap.map((r: Row, j: number) =>
                            j === i ? { ...r, target: e.target.value } : r,
                          ),
                        )
                      }
                    >
                      <option value="title">Title</option>
                      <option value="contactName">Contact name</option>
                      <option value="email">Email</option>
                      <option value="phone">Phone</option>
                      <option value="note">Internal note</option>
                    </select>
                    <span>←</span>
                    <input
                      aria-label="Mapped value"
                      value={m.source}
                      onChange={(e) =>
                        update(
                          'fieldMap',
                          data.fieldMap.map((r: Row, j: number) =>
                            j === i ? { ...r, source: e.target.value } : r,
                          ),
                        )
                      }
                    />
                    <button
                      className="icon-button"
                      aria-label="Remove field mapping"
                      onClick={() =>
                        update(
                          'fieldMap',
                          data.fieldMap.filter((_: Row, j: number) => j !== i),
                        )
                      }
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  icon={Plus}
                  onClick={() =>
                    update('fieldMap', [...data.fieldMap, { target: 'note', source: '' }])
                  }
                >
                  Add field mapping
                </Button>
                <Notice>
                  <Check size={16} /> The linked deal, contact, company, and campaign code are
                  filled automatically.
                </Notice>
              </>
            )}
            {step === 3 && (
              <>
                <div className="action-option selected">
                  <span className="audience-icon">
                    <Workflow size={22} />
                  </span>
                  <div>
                    <strong>Run Bitrix24 workflows</strong>
                    <p>Create a Marketing SPA item, then start the selected workflows.</p>
                  </div>
                  <Check size={20} />
                </div>
                <Field label="Choose workflows">
                  <div className="workflow-choices">
                    {workflows.data?.map((w) => (
                      <label key={w.id} className="workflow-choice">
                        <input
                          type="checkbox"
                          checked={data.workflows.some((v: Row) => v.id === w.id)}
                          onChange={(e) =>
                            update(
                              'workflows',
                              e.target.checked
                                ? [
                                    ...data.workflows,
                                    { id: w.id, name: w.name, delay: 0, parameters: {} },
                                  ]
                                : data.workflows.filter((v: Row) => v.id !== w.id),
                            )
                          }
                        />
                        <Workflow size={18} />
                        <span>
                          <strong>{w.name}</strong>
                          <small>Sample workflow · no required parameters</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </Field>
                <div className="action-option disabled">
                  <span className="audience-icon">
                    <Mail size={22} />
                  </span>
                  <div>
                    <strong>Send directly</strong>
                    <p>Email and WhatsApp from TrueMarketing.</p>
                  </div>
                  <Badge status="draft">Coming soon</Badge>
                </div>
                <Notice>
                  <FlaskConical size={17} /> Sample tests simulate workflow starts locally. They
                  never send messages.
                </Notice>
              </>
            )}
            {step === 4 && (
              <>
                <Field
                  label="Reply date field"
                  hint="A Bitrix robot should stamp this field when a reply is received."
                >
                  <select
                    value={data.replyField}
                    onChange={(e) => update('replyField', e.target.value)}
                  >
                    <option value="replyDate">Reply date · datetime</option>
                    <option value="">Not tracked</option>
                  </select>
                </Field>
                <div className="form-grid">
                  <Field label="Won stages">
                    <select
                      value={data.wonStages[0] ?? ''}
                      onChange={(e) => update('wonStages', [e.target.value])}
                    >
                      <option value="WON">Won</option>
                    </select>
                  </Field>
                  <Field label="Failed / not sent stages">
                    <select
                      value={data.failedStages[0] ?? ''}
                      onChange={(e) =>
                        update('failedStages', e.target.value ? [e.target.value] : [])
                      }
                    >
                      <option value="FAILED">Failed</option>
                      <option value="">Not tracked</option>
                    </select>
                  </Field>
                </div>
                <div className="form-grid">
                  <Field label="Cost per message" hint="Leave empty if you aren’t tracking spend.">
                    <div className="input-suffix">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="0.35"
                        value={data.costPerMessage ?? ''}
                        onChange={(e) =>
                          update(
                            'costPerMessage',
                            e.target.value === '' ? null : Number(e.target.value),
                          )
                        }
                      />
                      <span>{me.company.currency}</span>
                    </div>
                  </Field>
                  <Field label="Revenue field">
                    <select>
                      <option>Opportunity amount</option>
                    </select>
                  </Field>
                </div>
                <Notice>
                  Successful attempts depend on your workflows moving failed sends to a Failed
                  stage. No delivery status is inferred.
                </Notice>
              </>
            )}
            {step === 5 && (
              <>
                <div className="form-grid">
                  <Field
                    label={`Start date and time (${me.company.timezone})`}
                    hint="Time is entered in your browser’s local time and stored as an exact instant."
                  >
                    <input
                      type="datetime-local"
                      value={new Date(
                        new Date(data.schedule.startAt).getTime() -
                          new Date().getTimezoneOffset() * 60000,
                      )
                        .toISOString()
                        .slice(0, 16)}
                      onChange={(e) => {
                        if (e.target.value)
                          schedule('startAt', new Date(e.target.value).toISOString());
                      }}
                    />
                  </Field>
                  <Field label="Repeat">
                    <select
                      value={data.schedule.recurrence}
                      onChange={(e) => schedule('recurrence', e.target.value)}
                    >
                      {[
                        ['once', 'One time'],
                        ['daily', 'Daily'],
                        ['weekly', 'Weekly'],
                        ['monthly', 'Monthly'],
                        ['custom', 'Every N days'],
                      ].map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                {data.schedule.recurrence === 'custom' && (
                  <Field label="Every N days">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={data.schedule.everyDays}
                      onChange={(e) => schedule('everyDays', Number(e.target.value))}
                    />
                  </Field>
                )}
                <Field label="Sending days">
                  <div className="day-picker">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                      <button
                        key={day}
                        aria-pressed={data.schedule.days.includes(day)}
                        className={data.schedule.days.includes(day) ? 'selected' : ''}
                        onClick={() =>
                          schedule(
                            'days',
                            data.schedule.days.includes(day)
                              ? data.schedule.days.filter((d: string) => d !== day)
                              : [...data.schedule.days, day],
                          )
                        }
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="form-grid">
                  <Field label="Working hours from">
                    <input
                      type="time"
                      value={data.schedule.from}
                      onChange={(e) => schedule('from', e.target.value)}
                    />
                  </Field>
                  <Field label="Working hours to">
                    <input
                      type="time"
                      value={data.schedule.to}
                      onChange={(e) => schedule('to', e.target.value)}
                    />
                  </Field>
                </div>
                <div className="form-grid">
                  <Field label="Daily cap" hint="Maximum local items created per day.">
                    <input
                      type="number"
                      min={1}
                      value={data.schedule.dailyCap}
                      onChange={(e) => schedule('dailyCap', Number(e.target.value))}
                    />
                  </Field>
                  <Field
                    label="Pace (items / minute)"
                    hint="The local runner pauses between items."
                  >
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={data.schedule.pace}
                      onChange={(e) => schedule('pace', Number(e.target.value))}
                    />
                  </Field>
                </div>
                <Notice>
                  <Clock3 size={17} /> Campaigns pause outside working hours and resume in the next
                  open window. Five-deal sample tests bypass the working-hours window.
                </Notice>
              </>
            )}
            {step === 6 && (
              <>
                <div className="review-intro">
                  <span className="review-check">
                    <Check size={26} />
                  </span>
                  <div>
                    <h3>{data.name}</h3>
                    <p>
                      {data.code} · {data.channel}
                    </p>
                  </div>
                  <Badge status="sample">Sample campaign</Badge>
                </div>
                <div className="review-list">
                  {[
                    ['Audience', segment?.name ?? 'Not selected'],
                    [
                      'Duplicate protection',
                      data.allowDuplicates ? 'Allow duplicates' : data.uniqueKeys.join(' + '),
                    ],
                    ['Marketing SPA', 'Marketing → Campaign recipients'],
                    ['Item title', data.titleTemplate],
                    ['Workflows', data.workflows.map((w: Row) => w.name).join(', ')],
                    ['Starts', new Date(data.schedule.startAt).toLocaleString()],
                    [
                      'Working hours',
                      data.schedule.days.join(', ') +
                        ' · ' +
                        data.schedule.from +
                        '–' +
                        data.schedule.to,
                    ],
                    [
                      'Pace & cap',
                      data.schedule.pace + ' / minute · ' + data.schedule.dailyCap + ' / day',
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <Notice>
                  <FlaskConical size={18} /> Start with a five-deal sample test. It creates local
                  records so you can inspect mapping, duplicates, and run progress without touching
                  Bitrix24.
                </Notice>
                <div className="review-actions">
                  {me.permissions.includes('campaigns.run') && (
                    <Button
                      variant="secondary"
                      icon={FlaskConical}
                      disabled={busy}
                      onClick={() => save('test')}
                    >
                      Run on 5 sample deals
                    </Button>
                  )}
                  <Button variant="secondary" icon={Save} disabled={busy} onClick={() => save()}>
                    Save as draft
                  </Button>
                </div>
              </>
            )}
          </div>
          <div className="wizard-footer">
            <Button
              variant="ghost"
              icon={ArrowLeft}
              disabled={step === 0 || busy}
              onClick={() => {
                setStep((s) => s - 1);
                setError('');
              }}
            >
              Back
            </Button>
            <span>
              {stepNames[step]} · {step + 1} / 7
            </span>
            {step < 6 ? (
              <Button icon={ArrowRight} onClick={next}>
                Continue
              </Button>
            ) : me.permissions.includes('campaigns.run') ? (
              <Button icon={Clock3} disabled={busy} onClick={() => save('schedule')}>
                {busy ? 'Saving…' : 'Schedule sample campaign'}
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => save()}>
                Save draft
              </Button>
            )}
          </div>
        </Card>
        <aside className="wizard-sidebar">
          <div className="eyebrow">CAMPAIGN AT A GLANCE</div>
          <h3>{data.name || 'Your next great campaign'}</h3>
          <code>{data.code || 'CAMPAIGN-CODE'}</code>
          <div className="wizard-summary-item">
            <Mail size={17} />
            <div>
              <small>Channel</small>
              <strong>{data.channel}</strong>
            </div>
          </div>
          <div className="wizard-summary-item">
            <Users size={17} />
            <div>
              <small>Audience</small>
              <strong>{segment?.name ?? 'Not selected yet'}</strong>
              {segment && <span>{number(segment.lastCount)} matching deals</span>}
            </div>
          </div>
          <div className="wizard-summary-item">
            <Workflow size={17} />
            <div>
              <small>Action</small>
              <strong>
                {data.workflows.length} workflow{data.workflows.length !== 1 ? 's' : ''}
              </strong>
            </div>
          </div>
          <div className="wizard-summary-item">
            <Clock3 size={17} />
            <div>
              <small>Sending window</small>
              <strong>
                {data.schedule.from}–{data.schedule.to}
              </strong>
              <span>{me.company.timezone}</span>
            </div>
          </div>
          <div className="builder-tip">
            <ShieldCheck size={19} />
            <p>Your campaign is a draft until you choose to test or schedule it.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
