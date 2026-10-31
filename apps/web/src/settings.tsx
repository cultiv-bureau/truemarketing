import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  Check,
  CheckCheck,
  ChevronRight,
  Clipboard,
  Clock3,
  Code2,
  Copy,
  Eye,
  FlaskConical,
  Globe,
  KeyRound,
  Link2,
  Mail,
  Plus,
  Search,
  Settings2,
  Shield,
  ShieldCheck,
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
  CheckItem,
  date,
  datetime,
  Empty,
  ErrorBox,
  ExportButton,
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
const settingsTabs = [
  ['general', 'General', Settings2],
  ['hours', 'Working hours & limits', Clock3],
  ['team', 'Team', Users],
  ['roles', 'Roles', Shield],
  ['integrations', 'Integrations', Link2],
  ['keys', 'API keys', KeyRound],
  ['audit', 'Audit log', Activity],
] as const;
export function Settings(props: AppProps) {
  const [tab, setTab] = useState('general');
  const can = (p: string) => props.me.permissions.includes(p);
  const allowed = settingsTabs.filter(([key]) =>
    can(
      key === 'team'
        ? 'users.manage'
        : key === 'roles'
          ? 'roles.manage'
          : key === 'integrations'
            ? 'bitrix.manage'
            : key === 'keys'
              ? 'apikeys.manage'
              : key === 'audit'
                ? 'audit.view'
                : 'settings.manage',
    ),
  );
  const activeTab = allowed.some(([key]) => key === tab) ? tab : (allowed[0]?.[0] ?? 'none');
  return (
    <>
      <PageHead
        eyebrow="A WORKSPACE THAT WORKS FOR YOU"
        title="Settings"
        description="Your people, connections, and preferences. Built around the way you work."
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings">
          {allowed.map(([key, label, Icon]) => (
            <button
              key={key}
              className={activeTab === key ? 'selected' : ''}
              onClick={() => setTab(key)}
            >
              <Icon size={17} />
              {label}
              <ChevronRight size={13} />
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {activeTab === 'general' || activeTab === 'hours' ? (
            <GeneralSettings {...props} hours={activeTab === 'hours'} />
          ) : activeTab === 'team' ? (
            <TeamSettings {...props} />
          ) : activeTab === 'roles' ? (
            <RolesSettings {...props} />
          ) : activeTab === 'integrations' ? (
            <IntegrationSettings {...props} />
          ) : activeTab === 'keys' ? (
            <KeysSettings {...props} />
          ) : activeTab === 'audit' ? (
            <AuditSettings />
          ) : (
            <Notice>No settings permissions are assigned to this role.</Notice>
          )}
        </div>
      </div>
    </>
  );
}
function GeneralSettings({ me, notify, refreshMe, hours }: AppProps & { hours: boolean }) {
  const { data, error, loading } = useData('/api/settings'),
    [form, setForm] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [password, setPassword] = useState(''), [currentPassword,setCurrentPassword]=useState('');
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  if (loading || !form) return <Loading />;
  const update = (key: string, value: any) => setForm({ ...form, [key]: value });
  async function save() {
    setBusy(true);
    try {
      await api('/api/settings', 'PUT', form);
      await refreshMe();
      notify('Workspace settings saved.');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ErrorBox message={error} />
      <Card>
        <div className="card-head">
          <div>
            <h2>{hours ? 'Respect the right hours.' : 'Make this workspace yours.'}</h2>
            <p>
              {hours
                ? 'Set the boundaries that keep campaigns considerate.'
                : 'The essentials for your company and team.'}
            </p>
          </div>
        </div>
        <div className="form-body">
          {hours ? (
            <>
              <Field label="System working days">
                <div className="day-picker">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <button
                      key={day}
                      className={form.days.includes(day) ? 'selected' : ''}
                      onClick={() =>
                        update(
                          'days',
                          form.days.includes(day)
                            ? form.days.filter((d: string) => d !== day)
                            : [...form.days, day],
                        )
                      }
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="form-grid">
                <Field label="From">
                  <input
                    type="time"
                    value={form.from}
                    onChange={(e) => update('from', e.target.value)}
                  />
                </Field>
                <Field label="To">
                  <input
                    type="time"
                    value={form.to}
                    onChange={(e) => update('to', e.target.value)}
                  />
                </Field>
              </div>
              <Field
                label="Company daily cap"
                hint={`Plan allowance: ${number(form.limits.itemsPerDay)} items per day.`}
              >
                <input
                  type="number"
                  min={1}
                  max={form.limits.itemsPerDay}
                  value={form.dailyCap}
                  onChange={(e) => update('dailyCap', Number(e.target.value))}
                />
              </Field>
              <Notice>
                Campaign windows must fit inside these hours. Scheduled campaigns pause
                automatically outside the open window.
              </Notice>
              <div className="limits-grid">
                {[
                  ['Active campaigns', form.limits.campaigns],
                  ['Employees', form.limits.employees],
                  ['Connections', form.limits.connections],
                  ['API access', form.limits.api ? 'Included' : 'Not included'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <Field label="Company name">
                <input
                  value={form.companyName}
                  onChange={(e) => update('companyName', e.target.value)}
                />
              </Field>
              <Field
                label="Company ID"
                hint="Use this ID when connecting your Bitrix24 local application."
              >
                <input readOnly value={form.publicId} />
              </Field>
              <div className="form-grid">
                <Field label="Time zone">
                  <select
                    value={form.timezone}
                    onChange={(e) => update('timezone', e.target.value)}
                  >
                    {[
                      'Asia/Dubai',
                      'Africa/Cairo',
                      'Asia/Riyadh',
                      'Europe/London',
                      'America/New_York',
                      'UTC',
                    ].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Default currency">
                  <select
                    value={form.currency}
                    onChange={(e) => update('currency', e.target.value)}
                  >
                    {['AED', 'EGP', 'SAR', 'USD', 'EUR', 'GBP'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field
                label="Notification email"
                hint="Saved for later use. Transactional email delivery is not configured locally."
              >
                <input
                  type="email"
                  placeholder="team@company.com"
                  value={form.notificationEmail}
                  onChange={(e) => update('notificationEmail', e.target.value)}
                />
              </Field>
              <label className="toggle-row">
                <div>
                  <strong>Auto-join Bitrix24 users</strong>
                  <small>Applied after the live SSO integration is connected.</small>
                </div>
                <input
                  type="checkbox"
                  className="switch"
                  checked={form.autoJoin}
                  onChange={(e) => update('autoJoin', e.target.checked)}
                />
              </label>
              {form.autoJoin && (
                <Field label="Default role for new Bitrix users">
                  <select
                    value={form.defaultRole}
                    onChange={(e) => update('defaultRole', e.target.value)}
                  >
                    <option>Analyst</option>
                    <option>Marketer</option>
                  </select>
                </Field>
              )}
            </>
          )}
          <div className="form-actions">
            <Button icon={Check} disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </Card>
      {!hours && (
        <Card className="section-card">
          <div className="card-head">
            <div>
              <h2>Your local sign-in</h2>
              <p>Set a password for {me.user.email || me.user.username}.</p>
            </div>
            <KeyRound size={20} />
          </div>
          <div className="form-body">
            <Field label="Current password"><input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></Field>
            <Field
              label="New password"
              hint="Use at least 12 characters. Passwords are hashed with Argon2id."
            >
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 12 characters"
              />
            </Field>
            <Button
              variant="secondary"
              disabled={password.length < 12}
              onClick={async () => {
                try {
                  await api('/api/auth/password', 'POST', { password, currentPassword });
                  setPassword('');
                  notify('Your password has been set.');
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              Set password
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
function TeamSettings({ notify, me }: AppProps) {
  const [refresh, setRefresh] = useState(0),
    [invite, setInvite] = useState(false),
    [email, setEmail] = useState(''),
    [roleId, setRoleId] = useState(''),
    [result, setResult] = useState<Row | null>(null);
  const { data, error, loading } = useData<Row[]>('/api/team', refresh),
    roles = useData<Row[]>('/api/roles');
  return (
    <>
      <Card>
        <div className="card-head">
          <div>
            <h2>The people behind the campaigns.</h2>
            <p>Give everyone the right access to do their best work.</p>
          </div>
          <Button
            icon={Plus}
            onClick={() => {
              setResult(null);
              setInvite(true);
            }}
          >
            Invite employee
          </Button>
        </div>
        <ErrorBox message={error} />
        {loading ? (
          <Loading />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last active</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="person-cell">
                        <span className="avatar">{m.name[0]}</span>
                        <span>
                          <strong>{m.name}</strong>
                          <small>{m.email}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <select
                        aria-label={'Role for ' + m.name}
                        value={m.roleId}
                        onChange={async (e) => {
                          try {
                            await api('/api/team/' + m.id, 'PUT', {
                              roleId: e.target.value,
                              status: m.status,
                            });
                            setRefresh((r) => r + 1);
                            notify('Employee role updated.');
                          } catch (e) {
                            notify((e as Error).message);
                          }
                        }}
                      >
                        {roles.data?.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <Badge status={m.status} />
                    </td>
                    <td>{date(m.lastActiveAt)}</td>
                    <td>
                      {m.userId !== me.user.id && (
                        <button
                          className="text-button"
                          onClick={async () => {
                            try {
                              await api('/api/team/' + m.id, 'PUT', {
                                status: m.status === 'active' ? 'inactive' : 'active',
                              });
                              setRefresh((r) => r + 1);
                            } catch (e) {
                              notify((e as Error).message);
                            }
                          }}
                        >
                          {m.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {invite && (
        <Modal title="Invite someone to the team" onClose={() => setInvite(false)}>
          <div className="modal-body">
            {result ? (
              <>
                <Notice tone="success">{result.notice}</Notice>
                <Field label="Local invitation preview link">
                  <input readOnly value={location.origin + result.previewUrl} />
                </Field>
                <p className="muted-text">
                  Invitation acceptance and email delivery are not implemented in this milestone.
                  The invitation record is saved with a seven-day expiry.
                </p>
                <Button onClick={() => setInvite(false)}>Done</Button>
              </>
            ) : (
              <>
                <Field label="Email address">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="colleague@company.com"
                  />
                </Field>
                <Field label="Role">
                  <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                    <option value="">Choose a role</option>
                    {roles.data?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Notice>
                  No email is sent from this local build. An invitation record is prepared for
                  review.
                </Notice>
                <Button
                  icon={Plus}
                  onClick={async () => {
                    try {
                      setResult(await api('/api/invites', 'POST', { email, roleId }));
                      notify('Invitation prepared locally.');
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  Prepare invitation
                </Button>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
function RolesSettings({ notify }: AppProps) {
  const [refresh, setRefresh] = useState(0),
    [editing, setEditing] = useState<Row | null>(null);
  const { data, error, loading } = useData<Row[]>('/api/roles', refresh),
    catalog = useData<string[]>('/api/permissions');
  return (
    <>
      <Card>
        <div className="card-head">
          <div>
            <h2>The right permissions. Clearly defined.</h2>
            <p>Start with a seeded role or create one that fits your team.</p>
          </div>
          <Button
            icon={Plus}
            onClick={() => setEditing({ name: '', permissions: [], ownOnly: false })}
          >
            Create role
          </Button>
        </div>
        <ErrorBox message={error} />
        {loading ? (
          <Loading />
        ) : (
          <div className="role-list">
            {data?.map((r) => (
              <div key={r.id} className="role-row">
                <span className="audience-icon">
                  <Shield size={19} />
                </span>
                <div>
                  <strong>{r.name}</strong>
                  <small>
                    {r.permissions.length} permissions ·{' '}
                    {r.name === 'Owner'
                      ? 'Protected role'
                      : r.system
                        ? 'Seeded role'
                        : 'Custom role'}
                    {r.ownOnly ? ' · Own campaigns only' : ''}
                  </small>
                </div>
                {r.name !== 'Owner' && (
                  <Button variant="secondary" onClick={() => setEditing(structuredClone(r))}>
                    Edit permissions
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      {editing && (
        <Modal
          wide
          title={editing.id ? 'Edit role permissions' : 'Create a custom role'}
          onClose={() => setEditing(null)}
        >
          <div className="modal-body">
            <Field label="Role name">
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <label className="toggle-row">
              <div>
                <strong>Own campaigns only</strong>
                <small>Restrict campaign access to campaigns this employee owns.</small>
              </div>
              <input
                className="switch"
                type="checkbox"
                checked={editing.ownOnly}
                onChange={(e) => setEditing({ ...editing, ownOnly: e.target.checked })}
              />
            </label>
            <div className="permission-grid">
              {catalog.data?.map((p) => (
                <label key={p}>
                  <input
                    type="checkbox"
                    checked={editing.permissions.includes(p)}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        permissions: e.target.checked
                          ? [...editing.permissions, p]
                          : editing.permissions.filter((v: string) => v !== p),
                      })
                    }
                  />
                  <span>{p}</span>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  try {
                    await api(
                      '/api/roles' + (editing.id ? '/' + editing.id : ''),
                      editing.id ? 'PUT' : 'POST',
                      editing,
                    );
                    setEditing(null);
                    setRefresh((r) => r + 1);
                    notify('Role saved. Changes apply on the next request.');
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                Save role
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
function IntegrationSettings(props: AppProps) {
  const { data, error, loading } = useData<Row[]>('/api/integrations/bitrix'),
    [checks, setChecks] = useState<Row | null>(null);
  return (
    <>
      <Card>
        <div className="card-head">
          <div>
            <h2>Your CRM, connected.</h2>
            <p>One workspace for your Bitrix24 connections.</p>
          </div>
          <Button icon={Plus} onClick={() => go('/install')}>
            Add connection
          </Button>
        </div>
        <ErrorBox message={error} />
        {loading ? (
          <Loading />
        ) : (
          <div className="integration-list">
            {data?.map((c) => (
              <div key={c.id} className="integration-card">
                <div className="integration-logo">b24</div>
                <div>
                  <h3>{c.domain}</h3>
                  <p>
                    {c.mode === 'sample'
                      ? 'Local sample workspace · no live connection'
                      : 'Bitrix24 local application'}
                  </p>
                  <Badge status={c.status} />
                </div>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      setChecks(
                        await api('/api/integrations/bitrix/' + c.id + '/setup-check', 'POST', {}),
                      );
                    } catch (e) {
                      props.notify((e as Error).message);
                    }
                  }}
                >
                  Run setup check
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
      {checks && (
        <Card className="section-card">
          <div className="card-head">
            <h2>Connection readiness</h2>
          </div>
          <div className="setup-checks">
            {checks.checks.map((c: Row) => (
              <div key={c.name}>
                <span className={'check-circle ' + c.status}>
                  {c.status === 'passed' ? (
                    <Check size={16} />
                  ) : c.status === 'sample' ? (
                    <FlaskConical size={16} />
                  ) : (
                    <Clock3 size={16} />
                  )}
                </span>
                <div>
                  <strong>{c.name}</strong>
                  <p>{c.detail}</p>
                </div>
                <Badge status={c.status} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
function KeysSettings({ notify, me }: AppProps) {
  const [refresh, setRefresh] = useState(0),
    [create, setCreate] = useState(false),
    [name, setName] = useState(''),
    [scopes, setScopes] = useState<string[]>(['reports.view']),
    [secret, setSecret] = useState(''),
    [revoking, setRevoking] = useState<Row | null>(null);
  const { data, error, loading } = useData<Row[]>('/api/api-keys', refresh);
  return (
    <>
      <Card>
        <div className="card-head">
          <div>
            <h2>Connect your own tools.</h2>
            <p>Scoped API keys keep integrations focused and accountable.</p>
          </div>
          <Button
            icon={Plus}
            onClick={() => {
              setCreate(true);
              setSecret('');
            }}
          >
            Create API key
          </Button>
        </div>
        <ErrorBox message={error} />
        {loading ? (
          <Loading />
        ) : data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key prefix</th>
                  <th>Scopes</th>
                  <th>Last used</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((k) => (
                  <tr key={k.id}>
                    <td>{k.name}</td>
                    <td>
                      <code>{k.prefix}…</code>
                    </td>
                    <td>{k.scopes.join(', ')}</td>
                    <td>{datetime(k.lastUsedAt)}</td>
                    <td>
                      <Badge status={k.revokedAt ? 'inactive' : 'active'} />
                    </td>
                    <td>
                      {!k.revokedAt && (
                        <button className="text-button danger-text" onClick={() => setRevoking(k)}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Your integrations start here"
            description="Create a scoped key to access campaigns and reports through the API."
          />
        )}
        <div className="api-doc-link">
          <Code2 size={18} />
          <div>
            <strong>Public REST API v1</strong>
            <p>Bearer authentication · 60 requests per minute per key.</p>
          </div>
          <a href="/v1/openapi.json" target="_blank" rel="noreferrer">
            OpenAPI spec <ArrowUpRight size={15} />
          </a>
        </div>
      </Card>
      {create && (
        <Modal
          title={secret ? 'Save your API key' : 'Create a scoped API key'}
          onClose={() => {
            setCreate(false);
            setSecret('');
          }}
        >
          <div className="modal-body">
            {secret ? (
              <>
                <Notice tone="warning">Copy this key now. It will not be shown again.</Notice>
                <div className="secret-value">
                  <code>{secret}</code>
                </div>
                <Button
                  icon={Copy}
                  onClick={() =>
                    navigator.clipboard
                      .writeText(secret)
                      .then(() => notify('API key copied.'))
                      .catch(() => notify('Select the key and copy it manually.'))
                  }
                >
                  Copy key
                </Button>
              </>
            ) : (
              <>
                <Field label="Key name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Reporting dashboard"
                  />
                </Field>
                <Field label="Allowed scopes">
                  <div className="permission-grid">
                    {me.permissions
                      .filter((p: string) => /^(reports|campaigns|segments)\./.test(p))
                      .map((p: string) => (
                        <label key={p}>
                          <input
                            type="checkbox"
                            checked={scopes.includes(p)}
                            onChange={(e) =>
                              setScopes(
                                e.target.checked ? [...scopes, p] : scopes.filter((v) => v !== p),
                              )
                            }
                          />
                          {p}
                        </label>
                      ))}
                  </div>
                </Field>
                <Button
                  onClick={async () => {
                    try {
                      const k = await api('/api/api-keys', 'POST', { name, scopes });
                      setSecret(k.key);
                      setRefresh((r) => r + 1);
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  Create key
                </Button>
              </>
            )}
          </div>
        </Modal>
      )}
      {revoking && (
        <Modal title="Revoke this API key?" onClose={() => setRevoking(null)}>
          <div className="modal-body">
            <p>Integrations using “{revoking.name}” will lose access immediately.</p>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setRevoking(null)}>
                Keep key
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await api('/api/api-keys/' + revoking.id, 'DELETE', {});
                    setRefresh((r) => r + 1);
                    setRevoking(null);
                    notify('API key revoked.');
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                Revoke key
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
function AuditSettings() {
  const { data, error, loading } = useData<Row[]>('/api/audit'),
    [search, setSearch] = useState('');
  return (
    <Card>
      <div className="card-head">
        <div>
          <h2>A clear record of every change.</h2>
          <p>Who did what, and when. Retained for accountability.</p>
        </div>
        <ExportButton rows={data ?? []} name="truemarketing-audit.csv" />
      </div>
      <div className="list-toolbar">
        <div className="search">
          <Search size={15} />
          <input
            aria-label="Search audit log"
            placeholder="Filter by action or user…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <ErrorBox message={error} />
      {loading ? (
        <Loading />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Actor</th>
                <th>Target</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data
                ?.filter((a) => (a.action + ' ' + a.actorUserId).includes(search))
                .map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="audit-action">{a.action}</span>
                    </td>
                    <td>{a.actorUserId}</td>
                    <td>
                      <code>{a.target?.slice(0, 20) ?? '—'}</code>
                    </td>
                    <td>{datetime(a.at)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
export function Install({ me, notify }: AppProps) {
  const [code, setCode] = useState<Row | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <>
      <PageHead
        eyebrow="BRING YOUR CRM INTO THE PICTURE"
        title="Connect Bitrix24"
        description="One local application. Your company’s own secure connection."
      />
      <div className="install-layout">
        <Card>
          <div className="card-head">
            <div>
              <h2>A few steps to a connected workspace.</h2>
              <p>Complete these steps with a Bitrix24 portal administrator.</p>
            </div>
            <span className="integration-logo">b24</span>
          </div>
          <div className="form-body">
            <Notice tone="warning">
              Live OAuth installation is not enabled in this local milestone. The public HTTPS
              endpoint, secure token storage, and SSO verification must be completed before
              connecting a real portal.
            </Notice>
            <div className="install-step">
              <span>01</span>
              <div>
                <h3>Identify your company</h3>
                <p>This ensures the portal is linked to the right tenant.</p>
                <Field label="Company ID">
                  <input readOnly value={me.company.publicId} />
                </Field>
                {code ? (
                  <div className="connect-code">
                    <code>{code.code}</code>
                    <div>
                      <strong>Local Connect Code</strong>
                      <small>
                        Expires {datetime(code.expiresAt)} · single use when the install flow is
                        implemented.
                      </small>
                    </div>
                    <Button
                      variant="ghost"
                      icon={Copy}
                      onClick={() =>
                        navigator.clipboard
                          .writeText(code.code)
                          .then(() => notify('Connect Code copied.'))
                          .catch(() => notify('Select the code to copy it.'))
                      }
                    />
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    icon={KeyRound}
                    disabled={busy || !me.permissions.includes('bitrix.manage')}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        setCode(await api('/api/integrations/bitrix/connect-code', 'POST', {}));
                      } catch (e) {
                        notify((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Generate local Connect Code
                  </Button>
                )}
              </div>
            </div>
            <div className="install-step">
              <span>02</span>
              <div>
                <h3>Publish your app over HTTPS</h3>
                <p>
                  Bitrix24 cannot load this localhost address as a hosted server application.
                  Configure DigitalOcean App Platform and a production domain first.
                </p>
                <div className="endpoint-list">
                  <div>
                    <span>Handler path</span>
                    <code>https://YOUR_APP_HOST/bitrix/app</code>
                  </div>
                  <div>
                    <span>Installation path</span>
                    <code>https://YOUR_APP_HOST/bitrix/install</code>
                  </div>
                  <div>
                    <span>Menu name</span>
                    <code>TrueMarketing</code>
                  </div>
                </div>
              </div>
            </div>
            <div className="install-step">
              <span>03</span>
              <div>
                <h3>Create a server local application</h3>
                <p>
                  In Bitrix24: Developer resources → Other → Local application → Server app. Use the
                  published URLs above and select the required scopes.
                </p>
                <div className="scope-tags">
                  {['crm', 'bizproc', 'user', 'user_brief', 'department', 'placement', 'im'].map(
                    (s) => (
                      <code key={s}>{s}</code>
                    ),
                  )}
                </div>
              </div>
            </div>
            <div className="install-step">
              <span>04</span>
              <div>
                <h3>Validate, then connect</h3>
                <p>
                  The production install flow will verify your Company ID, Connect Code,
                  administrator access, OAuth credentials, and scopes before binding the portal.
                </p>
                <Button variant="secondary" icon={BookOpen} onClick={() => go('/guide')}>
                  Prepare your CRM workflows
                </Button>
              </div>
            </div>
          </div>
        </Card>
        <aside className="wizard-sidebar">
          <div className="eyebrow">DESIGNED TO STAY IN CONTROL</div>
          <h3>Your portal belongs to your company.</h3>
          <CheckItem done>Tenant-scoped local data</CheckItem>
          <CheckItem done>Permission checks on API actions</CheckItem>
          <CheckItem done>Hashed local Connect Codes</CheckItem>
          <CheckItem done={false}>Production OAuth & SSO</CheckItem>
          <CheckItem done={false}>Live Bitrix acceptance tests</CheckItem>
          <p className="muted-text">No Bitrix24 password is ever requested.</p>
        </aside>
      </div>
    </>
  );
}
export function Console({ me, notify, refreshMe }: AppProps) {
  const [tab, setTab] = useState('companies'),
    [refresh, setRefresh] = useState(0),
    [search, setSearch] = useState(''),
    [create, setCreate] = useState(false),
    [form, setForm] = useState<Row>({ name: '', planId: 'plan_starter' }),
    [impersonate, setImpersonate] = useState<Row | null>(null),
    [reason, setReason] = useState(''),
    [allowWrite, setAllowWrite] = useState(false),
    [confirm, setConfirm] = useState<Row | null>(null);
  const companies = useData<Row[]>('/api/console/companies', refresh),
    plans = useData<Row[]>('/api/console/plans', refresh),
    system = useData('/api/console/system', refresh, 5000),
    audit = useData<Row[]>('/api/console/audit', refresh),
    users = useData<Row[]>('/api/console/platform-users', refresh);
  return (
    <>
      <PageHead
        eyebrow="TRUEMARKETING PLATFORM"
        title="A clear view across every company."
        description="Manage workspaces, understand usage, and support your customers."
        actions={
          <Button
            icon={Plus}
            onClick={() => {
              setForm({ name: '', planId: 'plan_starter' });
              setCreate(true);
            }}
          >
            Create company
          </Button>
        }
      />
      <div className="stats-grid">
        <div className="stat">
          <div className="stat-top">
            <span>Companies</span>
            <Building2 size={18} />
          </div>
          <strong>{companies.data?.length ?? '—'}</strong>
          <small>
            {companies.data?.filter((c) => c.status === 'active').length ?? 0} active workspaces
          </small>
        </div>
        <div className="stat">
          <div className="stat-top">
            <span>Employees</span>
            <Users size={18} />
          </div>
          <strong>{companies.data?.reduce((n, c) => n + c.members, 0) ?? '—'}</strong>
          <small>Across all companies</small>
        </div>
        <div className="stat">
          <div className="stat-top">
            <span>Worker</span>
            <Activity size={18} />
          </div>
          <strong className="status-word">{system.data?.worker ?? 'Checking'}</strong>
          <small>Worker · CRM not connected</small>
        </div>
        <div className="stat">
          <div className="stat-top">
            <span>Queue depth</span>
            <Workflow size={18} />
          </div>
          <strong>{system.data?.queued ?? '—'}</strong>
          <small>Active runs</small>
        </div>
      </div>
      <Card>
        <div className="list-toolbar">
          <div className="tabs">
            {['companies', 'plans', 'platform-users', 'system', 'audit'].map((t) => (
              <button key={t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>
                {t === 'platform-users' ? 'Platform users' : t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          {tab === 'companies' && (
            <div className="search">
              <Search size={15} />
              <input
                placeholder="Find a company…"
                aria-label="Search companies"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
        </div>
        <ErrorBox message={companies.error || system.error} />
        {tab === 'companies' &&
          (companies.loading ? (
            <Loading />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Team</th>
                    <th>Campaigns</th>
                    <th>Connections</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.data
                    ?.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
                    .map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div className="person-cell">
                            <span className="workspace-avatar">{c.name[0]}</span>
                            <span>
                              <strong>{c.name}</strong>
                              <small>{c.publicId}</small>
                            </span>
                          </div>
                        </td>
                        <td>{c.plan}</td>
                        <td>
                          <Badge status={c.status} />
                        </td>
                        <td>{c.members}</td>
                        <td>{c.campaigns}</td>
                        <td>{c.connections}</td>
                        <td>
                          <div className="row-actions">
                            <Button
                              variant="ghost"
                              icon={Eye}
                              onClick={() => {
                                setImpersonate(c);
                                setReason('');
                                setAllowWrite(false);
                              }}
                            >
                              View as
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() =>
                                setConfirm({
                                  ...c,
                                  action: c.status === 'active' ? 'suspend' : 'reactivate',
                                })
                              }
                            >
                              {c.status === 'active' ? 'Suspend' : 'Reactivate'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        {tab === 'plans' && (
          <div className="plan-grid">
            {plans.data?.map((p) => (
              <div className="plan-card" key={p.id}>
                <h2>{p.name}</h2>
                <p>Managed subscription plan</p>
                {Object.entries(p.limits).map(([k, v]) => (
                  <div key={k}>
                    <span>{k.replace('itemsPerDay', 'Items / day')}</span>
                    <strong>
                      {typeof v === 'boolean'
                        ? v
                          ? 'Included'
                          : 'Not included'
                        : number(v as number)}
                    </strong>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {tab === 'platform-users' && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Authentication</th>
                </tr>
              </thead>
              <tbody>
                {users.data?.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.platformRole}</td>
                    <td>
                      <Badge status="active">Two-factor required</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Notice tone="warning">
              Platform administrators must complete authenticator verification. Public production
              hosting is not yet enabled.
            </Notice>
          </div>
        )}
        {tab === 'system' && (
          <div className="form-body">
            <div className="health-list">
              {system.data &&
                Object.entries(system.data).map(([k, v]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <strong>{typeof v === 'number' ? Math.round(v) : String(v)}</strong>
                  </div>
                ))}
            </div>
            <Notice>
              Production startup is intentionally blocked until the PostgreSQL/RLS adapter and
              production authentication are implemented.
            </Notice>
          </div>
        )}
        {tab === 'audit' && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Company</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {audit.data?.map((a) => (
                  <tr key={a.id}>
                    <td>{a.action}</td>
                    <td>{a.actorUserId}</td>
                    <td>
                      {companies.data?.find((c) => c.id === a.companyId)?.name ?? a.companyId}
                    </td>
                    <td>{datetime(a.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!audit.data?.length && (
              <Empty
                title="Every platform action, recorded"
                description="Create a company or start a support session to see the audit trail."
              />
            )}
          </div>
        )}
      </Card>
      {create && (
        <Modal title="Create a company workspace" onClose={() => setCreate(false)}>
          <div className="modal-body">
            <Field label="Company name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Plan">
              <select
                value={form.planId}
                onChange={(e) => setForm({ ...form, planId: e.target.value })}
              >
                {plans.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Notice>
              The workspace starts empty. Owner onboarding and email delivery will be added with the
              production invitation flow.
            </Notice>
            <Button
              onClick={async () => {
                try {
                  await api('/api/console/companies', 'POST', form);
                  setCreate(false);
                  setRefresh((r) => r + 1);
                  notify('Company workspace created.');
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              Create workspace
            </Button>
          </div>
        </Modal>
      )}
      {impersonate && (
        <Modal title={'View as ' + impersonate.name} onClose={() => setImpersonate(null)}>
          <div className="modal-body">
            <Notice>
              Support sessions last up to 60 minutes and are recorded in both audit logs.
            </Notice>
            <Field label="Reason for access">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What are you helping this company with?"
              />
            </Field>
            {me.user.platformRole === 'Super Admin' && (
              <label className="toggle-row">
                <div>
                  <strong>Allow changes</strong>
                  <small>Leave off for a read-only support session.</small>
                </div>
                <input
                  type="checkbox"
                  className="switch"
                  checked={allowWrite}
                  onChange={(e) => setAllowWrite(e.target.checked)}
                />
              </label>
            )}
            <Button
              disabled={!reason.trim()}
              icon={Eye}
              onClick={async () => {
                try {
                  await api('/api/console/companies/' + impersonate.id + '/impersonate', 'POST', {
                    reason,
                    allowWrite,
                  });
                  await refreshMe();
                  go('/overview');
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              Start support session
            </Button>
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={
            confirm.action === 'suspend' ? 'Suspend this company?' : 'Reactivate this company?'
          }
          onClose={() => setConfirm(null)}
        >
          <div className="modal-body">
            <p>
              {confirm.action === 'suspend'
                ? 'Access and active sample runs will stop. All data will be retained.'
                : 'Company access and eligible sample runs can continue.'}
            </p>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  try {
                    await api(
                      '/api/console/companies/' + confirm.id + '/' + confirm.action,
                      'POST',
                      {},
                    );
                    setConfirm(null);
                    setRefresh((r) => r + 1);
                    notify('Company status updated.');
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Guide({ help = false }: { help?: boolean }) {
  const [open, setOpen] = useState<number | null>(0);
  const questions = [
    [
      'How do company accounts work?',
      'Bureau manages the platform through its Super Admin account. Each company has its own administrator, roles, settings, and isolated data. Platform administrator sign-in requires an authenticator code.',
    ],
    [
      'Why is my workspace empty?',
      'All demonstration records have been removed. Campaigns, audiences, reports, and run history remain empty until your real Bitrix24 integration is connected and verified.',
    ],
    [
      'Can I run a live campaign now?',
      'Not yet. OAuth installation, live CRM queries, and live workflow execution are still being implemented. The app blocks campaign creation and execution while no verified CRM connection exists.',
    ],
    [
      'How do I connect Bitrix24?',
      'Use Integrations and the connection setup guide. A public HTTPS host, Bitrix24 portal administrator, Marketing SPA, and workflow templates are required. The current local build is not a deployed production service.',
    ],
    [
      'Does TrueMarketing send messages directly?',
      'No. The planned live runner creates a Marketing SPA item per target deal and starts your selected Bitrix24 business processes. Those processes send the messages. Direct email and WhatsApp sending are out of scope for this version.',
    ],
    [
      'What remains before production?',
      'PostgreSQL with verified tenant RLS, durable job orchestration, Bitrix OAuth and SSO, live metadata and workflow execution, transactional email and account recovery, deployment over HTTPS, and final live acceptance testing.',
    ],
  ];
  return (
    <>
      <PageHead
        eyebrow={help ? 'CLEAR ANSWERS' : 'PREPARE YOUR WORKFLOWS'}
        title={help ? 'Here to help you move forward.' : 'A connected journey, step by step.'}
        description={
          help
            ? 'Understand your company workspace and integration readiness.'
            : 'Prepare your real Bitrix24 Marketing SPA before connecting the app.'
        }
      />
      {help ? (
        <div className="faq-list">
          {questions.map(([question, answer], i) => (
            <Card key={question}>
              <button aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                <h3>{question}</h3>
                <Plus size={18} />
              </button>
              {open === i && <p>{answer}</p>}
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="guide-hero">
            <span className="guide-icon">
              <Workflow size={40} />
            </span>
            <div>
              <div className="eyebrow">YOUR CRM. YOUR WORKFLOWS.</div>
              <h2>Prepare the right next step.</h2>
              <p>
                TrueMarketing orchestrates campaigns. Your Bitrix24 workflows send messages and
                record outcomes.
              </p>
            </div>
          </div>
          <div className="guide-steps">
            {[
              [
                'Create your Marketing SPA',
                'Configure a dedicated Smart Process with Campaign code (string), Reply date (datetime), and New, Replied, Won, and Failed stages.',
              ],
              [
                'Prepare the workflow templates',
                'Build business processes on that SPA. Turn off automatic start when TrueMarketing will start the workflow, and define the required parameters.',
              ],
              [
                'Record actual replies',
                'Use Track customer reply and Modify item robots to stamp the Reply date field and move the item into the appropriate stage.',
              ],
              [
                'Validate the live connection',
                'Once the live integration is implemented, verify company mapping, scopes, administrator access, real metadata, and a controlled campaign before opening access to your team.',
              ],
            ].map(([title, description], i) => (
              <Card key={title}>
                <span className="guide-number">0{i + 1}</span>
                <div>
                  <h2>{title}</h2>
                  <p>{description}</p>
                </div>
              </Card>
            ))}
          </div>
          <Notice tone="warning">
            The current workspace is clean, but live CRM integration and production hosting are not
            complete. No simulated executions are available.
          </Notice>
        </>
      )}
    </>
  );
}
