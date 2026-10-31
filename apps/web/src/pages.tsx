import { useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Filter,
  FlaskConical,
  Layers3,
  Mail,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  Target,
  TrendingUp,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import {
  api,
  Badge,
  Button,
  Card,
  CheckItem,
  date,
  datetime,
  Empty,
  ErrorBox,
  ExportButton,
  go,
  LinkButton,
  Loading,
  money,
  Modal,
  number,
  PageHead,
  percent,
  Progress,
  Stat,
  useData,
  type Row,
} from './lib';
import type { AppProps } from './main';
function Channel({ value }: { value: string }) {
  return (
    <span className={'channel ' + value.toLowerCase()}>
      {value === 'WhatsApp' ? <MessageCircle size={14} /> : <Mail size={14} />} {value}
    </span>
  );
}
export function Overview({ me }: AppProps) {
  const { data, error, loading } = useData('/api/overview');
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  const can = (p: string) => me.permissions.includes(p);
  const m = data.metrics;
  return (
    <>
      <PageHead
        eyebrow="THE BIG PICTURE"
        title="A little clarity. A lot of possibility."
        description="Your audiences, campaigns, and conversations. All moving in the right direction."
        actions={
          <>
            {can('segments.manage') && (
              <Button variant="secondary" icon={Layers3} onClick={() => go('/segments/new')}>
                Build a segment
              </Button>
            )}
            {can('campaigns.manage') && (
              <Button icon={Plus} onClick={() => go('/campaigns/new')}>
                Create campaign
              </Button>
            )}
          </>
        }
      />
      <div className="overview-banner">
        <div className="banner-icon">
          <Workflow size={25} />
        </div>
        <div>
          <strong>Your CRM. Your workflows. One orchestrated journey.</strong>
          <p>
            TrueMarketing brings the right audience to your Bitrix24 workflows, one opportunity at a
            time.
          </p>
        </div>
        <a href="#/guide">
          Explore the workflow <ArrowUpRight size={16} />
        </a>
      </div>
      <div className="stats-grid">
        <Stat
          label="Campaigns"
          value={number(data.campaigns.length)}
          detail={`${data.campaigns.filter((c: Row) => ['running', 'scheduled'].includes(c.status)).length} active · ${data.campaigns.filter((c: Row) => c.status === 'draft').length} ready to shape`}
          icon={Megaphone}
        />
        <Stat
          label="Campaign attempts"
          value={number(m.attempts)}
          detail="CRM items created"
          icon={Send}
        />
        <Stat
          label="Conversations started"
          value={number(m.replies)}
          detail={`${percent(m.answerRate)} answer rate`}
          icon={MessageCircle}
        />
        <Stat
          label="Campaign revenue"
          value={money(m.revenue, me.company.currency)}
          detail="From won opportunities"
          icon={TrendingUp}
        />
      </div>
      <div className="dashboard-grid">
        <Card className="performance">
          <div className="card-head">
            <div>
              <h2>Every conversation counts</h2>
              <p>Campaign activity over the last 14 days</p>
            </div>
            <span className="subtle-pill">
              <CalendarDays size={13} /> Last 14 days
            </span>
          </div>
          {data.campaigns.length ? (
            <ActivityChart timeline={data.timeline} />
          ) : (
            <Empty
              title="Your campaign activity will appear here"
              description="Connect Bitrix24 and start a campaign to see real results."
            />
          )}
          <div className="chart-legend">
            <span>
              <i /> Attempts
            </span>
            <span>
              <i className="light" /> Replies
            </span>
            <span className="sample-label">Campaign activity</span>
          </div>
        </Card>
        <Card className="next-step">
          <div className="card-head">
            <div className="eyebrow">YOUR NEXT MOVE</div>
            <span className="step-orbit">↗</span>
          </div>
          <h2>
            Good campaigns
            <br />
            start with the right people.
          </h2>
          <p>
            Build a focused audience from your CRM. Then let your workflows take the conversation
            forward.
          </p>
          <div className="checklist">
            <CheckItem done>Company workspace created</CheckItem>
            <CheckItem done>{data.segments.length} saved audiences</CheckItem>
            <CheckItem done={false}>Connect your live Bitrix24 portal</CheckItem>
          </div>
          {can('bitrix.manage') && (
            <Button variant="secondary" icon={ArrowRight} onClick={() => go('/install')}>
              Connect Bitrix24
            </Button>
          )}
        </Card>
      </div>
      <div className="card section-card">
        <div className="card-head">
          <div>
            <h2>Campaigns in focus</h2>
            <p>A clear view of what’s happening, and what’s next.</p>
          </div>
          <LinkButton to="/campaigns">View all campaigns</LinkButton>
        </div>
        <CampaignTable campaigns={data.campaigns} compact canReport={can('reports.view')} />
      </div>
      <div className="dashboard-bottom">
        <Card>
          <div className="card-head">
            <h2>Your audiences</h2>
            {can('segments.view') && <LinkButton to="/segments">All segments</LinkButton>}
          </div>
          {data.segments.map((s: Row, i: number) => (
            <button key={s.id} className="audience-row" onClick={() => go('/segments')}>
              <span className={'audience-icon color-' + i}>
                <Users size={18} />
              </span>
              <div>
                <strong>{s.name}</strong>
                <small>{s.mode === 'snapshot' ? 'Frozen audience' : 'Re-checked each run'}</small>
              </div>
              <b>{number(s.lastCount)}</b>
              <ChevronRight size={16} />
            </button>
          ))}
        </Card>
        <Card>
          <div className="card-head">
            <h2>A healthy foundation</h2>
            <Badge status="sample">Setup in progress</Badge>
          </div>
          <div className="health-list">
            <div>
              <span>Workspace</span>
              <strong>
                {me.company.name}
                <Check size={14} />
              </strong>
            </div>
            <div>
              <span>Plan</span>
              <strong>{data.plan}</strong>
            </div>
            <div>
              <span>Daily item allowance</span>
              <strong>{number(data.limits.itemsPerDay)}</strong>
            </div>
            <div>
              <span>CRM connection</span>
              <strong className="muted-text">Not connected</strong>
            </div>
          </div>
        </Card>
      </div>
      <p className="data-caption">
        <FlaskConical size={14} /> Connect Bitrix24 before running live campaigns.
      </p>
    </>
  );
}
function ActivityChart({ timeline }: { timeline: Row[] }) {
  const values = timeline.map((d) => d.attempts),
    replies = timeline.map((d) => d.replies),
    max = Math.max(4, ...values);
  const point = (list: number[]) =>
    list.map((v, i) => `${48 + i * 44},${190 - (v / max) * 150}`).join(' ');
  return (
    <div className="chart-wrap">
      <svg viewBox="0 0 660 240" role="img" aria-label="Campaign attempts and replies over 14 days">
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6a9d8e" stopOpacity=".2" />
            <stop offset="100%" stopColor="#6a9d8e" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="45"
              y1={40 + i * 50}
              x2="630"
              y2={40 + i * 50}
              stroke="currentColor"
              strokeOpacity=".08"
              strokeDasharray="3 5"
            />
            <text x="17" y={44 + i * 50} fill="currentColor" opacity=".45" fontSize="10">
              {Math.round(max * (1 - i / 3))}
            </text>
          </g>
        ))}
        <polygon points={`48,190 ${point(values)} 620,190`} fill="url(#area)" />
        <polyline
          points={point(values)}
          fill="none"
          stroke="#335f52"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />
        <polyline
          points={point(replies)}
          fill="none"
          stroke="#83b4a2"
          strokeWidth="2.3"
          strokeLinejoin="round"
        />
        {values.map((v, i) =>
          v > 0 ? (
            <circle key={i} cx={48 + i * 44} cy={190 - (v / max) * 150} r="3" fill="#335f52" />
          ) : null,
        )}
        {[0, 3, 6, 9, 13].map((i) => (
          <text
            key={i}
            x={48 + i * 44}
            y="220"
            textAnchor="middle"
            fill="currentColor"
            opacity=".5"
            fontSize="10"
          >
            {new Date(Date.now() - (13 - i) * 86400000).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            })}
          </text>
        ))}
      </svg>
    </div>
  );
}
function CampaignTable({
  campaigns,
  compact = false,
  canReport = true,
  onAction,
}: {
  campaigns: Row[];
  compact?: boolean;
  canReport?: boolean;
  onAction?: (c: Row, action: string) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Status</th>
            <th>Channel</th>
            {!compact && <th>Audience</th>}
            <th>Attempts</th>
            <th>Replies</th>
            <th>{compact ? 'Last updated' : 'Created'}</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id}>
              <td>
                <button
                  className="campaign-name"
                  onClick={() => canReport && go('/reports/' + c.id)}
                >
                  <span className={'campaign-icon ' + c.channel.toLowerCase()}>
                    {c.channel === 'WhatsApp' ? <MessageCircle size={19} /> : <Mail size={19} />}
                  </span>
                  <span>
                    <strong>{c.name}</strong>
                    <small>{c.code}</small>
                  </span>
                </button>
              </td>
              <td>
                <Badge status={c.status} />
              </td>
              <td>
                <Channel value={c.channel} />
              </td>
              {!compact && <td>{number(c.audience)}</td>}
              <td>{number(c.metrics?.attempts ?? 0)}</td>
              <td>{number(c.metrics?.replies ?? 0)}</td>
              <td className="muted-text">{date(c.createdAt)}</td>
              <td>
                {onAction ? (
                  <div className="row-actions">
                    {c.status === 'draft' && (
                      <button
                        className="icon-button"
                        title="Edit campaign"
                        onClick={() => onAction(c, 'edit')}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    )}
                    {['running', 'scheduled', 'paused'].includes(c.status) && (
                      <button
                        className="icon-button"
                        title={c.status === 'paused' ? 'Resume' : 'Pause'}
                        onClick={() => onAction(c, c.status === 'paused' ? 'resume' : 'pause')}
                      >
                        {c.status === 'paused' ? <Play size={16} /> : <Pause size={16} />}
                      </button>
                    )}
                    {canReport && (
                      <button
                        className="icon-button"
                        title="View report"
                        onClick={() => go('/reports/' + c.id)}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    )}
                  </div>
                ) : canReport ? (
                  <button
                    className="icon-button"
                    aria-label={'View ' + c.name + ' report'}
                    onClick={() => go('/reports/' + c.id)}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Campaigns({ me, notify }: AppProps) {
  const [refresh, setRefresh] = useState(0),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('all');
  const { data, error, loading } = useData<Row[]>('/api/campaigns', refresh, 5000);
  const can = (p: string) => me.permissions.includes(p);
  async function action(c: Row, op: string) {
    if (op === 'edit') {
      go('/campaigns/edit/' + c.id);
      return;
    }
    try {
      await api(`/api/campaigns/${c.id}/${op}`, 'POST', {});
      notify('Campaign ' + (op === 'pause' ? 'paused' : 'resumed') + '.');
      setRefresh((r) => r + 1);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="MAKE EVERY TOUCHPOINT MATTER"
        title="Campaigns"
        description="Thoughtful outreach. Clear next steps. Everything in one place."
        actions={
          can('campaigns.manage') && (
            <Button icon={Plus} onClick={() => go('/campaigns/new')}>
              Create campaign
            </Button>
          )
        }
      />
      <div className="mini-stats">
        <div>
          <strong>{data?.length ?? '—'}</strong>
          <span>Total campaigns</span>
        </div>
        <div>
          <strong>
            {data?.filter((c) => ['running', 'scheduled'].includes(c.status)).length ?? '—'}
          </strong>
          <span>Active now</span>
        </div>
        <div>
          <strong>{data?.filter((c) => c.status === 'draft').length ?? '—'}</strong>
          <span>In the making</span>
        </div>
        <div>
          <strong>{data?.filter((c) => c.status === 'completed').length ?? '—'}</strong>
          <span>Completed</span>
        </div>
      </div>
      <Card className="list-card">
        <div className="list-toolbar">
          <div className="tabs">
            {['all', 'draft', 'scheduled', 'running', 'completed'].map((s) => (
              <button
                key={s}
                className={status === s ? 'selected' : ''}
                onClick={() => setStatus(s)}
              >
                {s === 'all' ? 'All campaigns' : s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="search">
            <Search size={16} />
            <input
              aria-label="Search campaigns"
              placeholder="Find a campaign…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <ErrorBox message={error} />
        {loading ? (
          <Loading />
        ) : data?.length ? (
          <CampaignTable
            campaigns={data.filter(
              (c) =>
                (status === 'all' || c.status === status) &&
                (c.name + ' ' + c.code).toLowerCase().includes(search.toLowerCase()),
            )}
            canReport={can('reports.view')}
            onAction={can('campaigns.manage') || can('campaigns.run') ? action : undefined}
          />
        ) : (
          <Empty
            title="Your next conversation starts here"
            description="Create a campaign to connect an audience with your CRM workflows."
            action={
              can('campaigns.manage') && (
                <Button icon={Plus} onClick={() => go('/campaigns/new')}>
                  Create campaign
                </Button>
              )
            }
          />
        )}
      </Card>
      <div className="subtle-callout">
        <Workflow size={20} />
        <div>
          <strong>Your workflows do the talking.</strong>
          <p>
            TrueMarketing creates campaign items and starts your Bitrix24 workflows. Direct sending
            is coming soon.
          </p>
        </div>
        <a href="#/guide">
          Read the guide <ArrowUpRight size={15} />
        </a>
      </div>
    </>
  );
}
export function Reports({ me, campaignId }: AppProps & { campaignId?: string }) {
  const { data, error, loading } = useData<any>(
    campaignId ? '/api/campaigns/' + campaignId + '/report' : '/api/reports',
    0,
    5000,
  );
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!campaignId)
    return (
      <>
        <PageHead
          eyebrow="UNDERSTAND THE IMPACT"
          title="Reports"
          description="From first touch to won opportunity. See what your campaigns make possible."
        />
        <div className="report-cards">
          {data.map((r: Row) => (
            <Card key={r.campaign.id}>
              <div className="report-card-top">
                <Channel value={r.campaign.channel} />
                <Badge status={r.campaign.status} />
              </div>
              <h2>{r.campaign.name}</h2>
              <p>{r.campaign.code}</p>
              <div className="report-card-stats">
                <div>
                  <strong>{number(r.metrics.attempts)}</strong>
                  <small>Attempts</small>
                </div>
                <div>
                  <strong>{number(r.metrics.replies)}</strong>
                  <small>Replies</small>
                </div>
                <div>
                  <strong>{number(r.metrics.won)}</strong>
                  <small>Won</small>
                </div>
              </div>
              <Progress value={(r.metrics.conversionRate ?? 0) * 100} />
              <div className="report-card-bottom">
                <span>{money(r.metrics.revenue, me.company.currency)} revenue</span>
                <Button
                  variant="ghost"
                  icon={ArrowUpRight}
                  onClick={() => go('/reports/' + r.campaign.id)}
                >
                  View report
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </>
    );
  const r = data,
    m = r.metrics;
  return (
    <>
      <button className="back-link" onClick={() => go('/reports')}>
        ← All reports
      </button>
      <PageHead
        eyebrow={r.campaign.code}
        title={r.campaign.name}
        description="Results grouped by campaign code."
        actions={
          <ExportButton
            rows={[{ campaign: r.campaign.name, ...m }]}
            name={r.campaign.code + '-report.csv'}
          />
        }
      />
      <div className="report-summary">
        <Badge status={r.campaign.status} />
        <Channel value={r.campaign.channel} />
        <span>
          <Users size={15} />
          {number(r.segment.lastCount)} in audience
        </span>
        <span>
          <CalendarDays size={15} />
          {date(r.campaign.createdAt)}
        </span>
        <span className="sample-label">CRM not connected</span>
      </div>
      <div className="stats-grid">
        <Stat
          label="Attempts"
          value={number(m.attempts)}
          detail="Items created for this campaign"
          icon={Send}
        />
        <Stat
          label="Replies"
          value={number(m.replies)}
          detail={percent(m.answerRate) + ' answer rate'}
          icon={MessageCircle}
        />
        <Stat
          label="Won opportunities"
          value={number(m.won)}
          detail={percent(m.conversionRate) + ' conversion rate'}
          icon={Target}
        />
        <Stat
          label="Revenue"
          value={money(m.revenue, me.company.currency)}
          detail="Revenue from won items"
          icon={TrendingUp}
        />
      </div>
      <div className="metrics-strip">
        <div title="Successful attempts ÷ all attempts">
          <span>Success rate</span>
          <strong>{percent(m.successRate)}</strong>
        </div>
        <div title="Cost per message × successful attempts">
          <span>Total spend</span>
          <strong>{money(m.spend, me.company.currency)}</strong>
        </div>
        <div title="Total spend ÷ won opportunities">
          <span>Cost per acquisition</span>
          <strong>{money(m.cpa, me.company.currency)}</strong>
        </div>
        <div title="Won revenue ÷ total spend">
          <span>Return on ad spend</span>
          <strong>{m.roas ? m.roas.toFixed(1) + '×' : '—'}</strong>
        </div>
        <div title="Mean time between item creation and reply">
          <span>Average reply time</span>
          <strong>{m.averageReplyHours ? m.averageReplyHours.toFixed(1) + 'h' : '—'}</strong>
        </div>
      </div>
      <Card>
        <div className="card-head">
          <div>
            <h2>The conversation funnel</h2>
            <p>Follow the audience from creation to conversion.</p>
          </div>
          <span className="subtle-pill">All runs</span>
        </div>
        <div className="funnel">
          {[
            ['Attempts', m.attempts],
            ['Successful', m.successful],
            ['Replied', m.replies],
            ['Won', m.won],
          ].map(([name, v], i) => (
            <div key={name} className="funnel-step">
              <span>{name}</span>
              <div
                className="funnel-bar"
                style={{
                  height: Math.max(16, (Number(v) / (m.attempts || 1)) * 130) + 'px',
                  opacity: 1 - i * 0.16,
                }}
              />
              <strong>{number(v)}</strong>
            </div>
          ))}
        </div>
      </Card>
      <Card className="section-card">
        <div className="card-head">
          <div>
            <h2>Run breakdown</h2>
            <p>Each occurrence, with its own results.</p>
          </div>
          <LinkButton to="/runs">View logs</LinkButton>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Replies</th>
                <th>Won</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {r.runs.map((run: Row) => (
                <tr key={run.id}>
                  <td>
                    {datetime(run.startedAt)}{' '}
                    {run.isTest && <span className="sample-label">Test</span>}
                  </td>
                  <td>
                    <Badge status={run.status} />
                  </td>
                  <td>{run.metrics.attempts}</td>
                  <td>{run.metrics.replies}</td>
                  <td>{run.metrics.won}</td>
                  <td>{money(run.metrics.revenue, me.company.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!r.runs.length && (
            <Empty
              title="No runs yet"
              description="Test this campaign on five sample deals to see the flow."
            />
          )}
        </div>
      </Card>
    </>
  );
}
export function Runs({ me, notify }: AppProps) {
  const [refresh, setRefresh] = useState(0),
    [selected, setSelected] = useState<Row | null>(null),
    [filter, setFilter] = useState('all');
  const { data, error, loading } = useData<Row[]>('/api/runs', refresh, 2000);
  const logs = useData<Row[]>(
    selected ? '/api/runs/' + selected.id + '/log' : '/api/runs',
    refresh,
    selected ? 2000 : 0,
  );
  const can = (p: string) => me.permissions.includes(p);
  return (
    <>
      <PageHead
        eyebrow="EVERY STEP, ACCOUNTED FOR"
        title="Runs & logs"
        description="Know what happened. Pick up where you left off. Keep every campaign moving."
        actions={
          can('runs.export') && <ExportButton rows={data ?? []} name="truemarketing-runs.csv" />
        }
      />
      <Card className="list-card">
        <div className="list-toolbar">
          <div className="tabs">
            {['all', 'running', 'queued', 'completed', 'paused', 'failed'].map((f) => (
              <button
                key={f}
                className={filter === f ? 'selected' : ''}
                onClick={() => setFilter(f)}
              >
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <span className="live-caption">
            <span className="live-dot" /> Refreshes every 2 seconds
          </span>
        </div>
        <ErrorBox message={error} />
        {loading ? (
          <Loading />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Campaign / run</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Created</th>
                  <th>Skipped</th>
                  <th>Failed</th>
                  <th>Started</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data
                  ?.filter((r) => filter === 'all' || r.status === filter)
                  .map((r) => (
                    <tr key={r.id}>
                      <td>
                        <button className="plain-link" onClick={() => setSelected(r)}>
                          <strong>{r.name}</strong>
                        </button>
                        <small className="cell-sub">
                          {r.isTest ? '5-deal test' : 'Campaign run'}
                        </small>
                      </td>
                      <td>
                        <Badge status={r.status} />
                      </td>
                      <td>
                        <div className="run-progress">
                          <Progress value={r.total ? (r.cursor / r.total) * 100 : 100} />
                          <small>
                            {r.cursor} / {r.total}
                          </small>
                        </div>
                      </td>
                      <td>{r.created}</td>
                      <td>{r.skipped}</td>
                      <td>{r.failed}</td>
                      <td>{datetime(r.startedAt)}</td>
                      <td>
                        <Button variant="ghost" onClick={() => setSelected(r)}>
                          View log <ChevronRight size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!data?.length && (
              <Empty
                title="A clean slate"
                description="Your campaign runs will appear here after your CRM is connected and a campaign starts."
              />
            )}
          </div>
        )}
      </Card>
      <p className="data-caption">
        <FlaskConical size={14} /> Sample runs create local records only. No live workflows or
        messages are triggered.
      </p>
      {selected && (
        <Modal wide title={selected.name + ' · Run log'} onClose={() => setSelected(null)}>
          <div className="modal-body">
            <div className="modal-toolbar">
              <Badge status={data?.find((r) => r.id === selected.id)?.status ?? selected.status} />
              {can('runs.export') && (
                <ExportButton rows={logs.data ?? []} name="truemarketing-run-log.csv" />
              )}
              {can('campaigns.run') && selected.failed > 0 && (
                <Button
                  onClick={async () => {
                    try {
                      await api('/api/runs/' + selected.id + '/retry-failed', 'POST', {});
                      setRefresh((r) => r + 1);
                      notify('Failed targets queued for retry.');
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  Retry failed
                </Button>
              )}
            </div>
            <ErrorBox message={logs.error} />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Deal</th>
                    <th>Status</th>
                    <th>Local item</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.data?.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.dealTitle ?? l.dealId}
                        {l.reason && <small className="cell-sub">{l.reason}</small>}
                      </td>
                      <td>
                        <Badge status={l.status} />
                      </td>
                      <td>
                        <code>{l.spaItemId ?? '—'}</code>
                      </td>
                      <td>{datetime(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
