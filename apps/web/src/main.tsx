import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard,
  Layers3,
  Megaphone,
  ChartNoAxesCombined,
  ListChecks,
  Settings2,
  BookOpen,
  CircleHelp,
  ChevronDown,
  Plus,
  ArrowUpRight,
  Moon,
  Sun,
  LogOut,
  ShieldCheck,
  Menu,
  X,
  Command,
  ArrowRight,
  FlaskConical,
} from 'lucide-react';
import { api, setCsrf, go, Button, Loading, ErrorBox, type Row } from './lib';
import { Overview, Campaigns, Reports, Runs } from './pages';
import { SegmentList, SegmentEditor, CampaignWizard } from './builders';
import { Settings, Console, Guide, Install } from './settings';
import './styles.css';
export type AppProps = {
  me: Row;
  notify: (message: string) => void;
  refreshMe: () => Promise<void>;
};
const nav = [
  { key: '/overview', name: 'Overview', icon: LayoutDashboard, permission: 'campaigns.view' },
  { key: '/segments', name: 'Segments', icon: Layers3, permission: 'segments.view' },
  { key: '/campaigns', name: 'Campaigns', icon: Megaphone, permission: 'campaigns.view' },
  { key: '/reports', name: 'Reports', icon: ChartNoAxesCombined, permission: 'reports.view' },
  { key: '/runs', name: 'Runs & logs', icon: ListChecks, permission: 'runs.view' },
];
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div className="fatal">
        <h1>Something needs attention.</h1>
        <p>{this.state.error}</p>
        <Button onClick={() => location.reload()}>Reload workspace</Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [verification, setVerification] = useState<Row | null>(null),
    [code, setCode] = useState('');
  return (
    <div className="login">
      <div className="login-story">
        <img src="/brand/mark.png" alt="TrueMarketing" />
        <div>
          <div className="eyebrow">CONNECTED BY DESIGN</div>
          <h1>
            Every audience.
            <br />
            One clear direction.
          </h1>
          <p>
            Turn your Bitrix24 opportunities into thoughtful campaigns. Plan, orchestrate, and
            understand every conversation.
          </p>
        </div>
        <span>TrueMarketing · Part of the TrueStack family</span>
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
      </div>
      <div className="login-form">
        <img className="login-logo" src="/brand/logo.png" alt="TrueMarketing" />
        <div className="eyebrow">YOUR CAMPAIGN WORKSPACE</div>
        <h2>
          {verification
            ? verification.enrollment
              ? 'Secure your account.'
              : 'One more step.'
            : 'Welcome back.'}
        </h2>
        <p>
          {verification
            ? 'Use your authenticator to complete sign-in.'
            : 'Sign in with your company account.'}
        </p>
        <ErrorBox message={error} />
        {!verification ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                const result = await api('/api/auth/login', 'POST', { email, password });
                if (result.requiresTwoFactor) {
                  setVerification(result);
                  setPassword('');
                } else await onLogin();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              <span>Email or username</span>
              <input
                type="text"
                autoComplete="username"
                placeholder="Your email or username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
              />
            </label>
            <Button type="submit" disabled={busy} icon={ArrowRight}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await api('/api/auth/2fa/verify', 'POST', {
                  challenge: verification.challenge,
                  code,
                });
                setVerification(null);
                setCode('');
                await onLogin();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {verification.enrollment && (
              <div className="totp-setup">
                <p>
                  Scan this QR code in your authenticator app. Two-factor authentication is required
                  for platform administrators.
                </p>
                <img src={verification.qrDataUrl} alt="Authenticator enrollment QR code" />
                <label className="field">
                  <span>Manual setup key</span>
                  <input readOnly value={verification.setupSecret} />
                </label>
                <small>Keep your authenticator backup in a secure place.</small>
              </div>
            )}
            <label className="field">
              <span>Authenticator code</span>
              <input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit code"
              />
            </label>
            <Button type="submit" disabled={busy || code.length !== 6} icon={ShieldCheck}>
              {busy ? 'Verifying…' : 'Verify and sign in'}
            </Button>
            <button
              type="button"
              className="text-button"
              style={{ marginTop: 18 }}
              onClick={() => {
                setVerification(null);
                setCode('');
                setError('');
              }}
            >
              Back to sign in
            </button>
          </form>
        )}
        <div className="login-note">
          <ShieldCheck size={17} />
          <span>
            Company accounts only. Platform administrators must verify with an authenticator.
          </span>
        </div>
      </div>
    </div>
  );
}
function App() {
  const [me, setMe] = useState<Row | null>(null),
    [loading, setLoading] = useState(true),
    [route, setRoute] = useState(location.hash.slice(1) || '/overview'),
    [toast, setToast] = useState(''),
    [mobile, setMobile] = useState(false),
    [dark, setDark] = useState(() => localStorage.getItem('tm.theme') === 'dark');
  async function refreshMe() {
    try {
      const m = await api('/api/auth/me');
      setCsrf(m.csrf);
      setMe(m);
      if (m.user.platformRole && !m.impersonation && !location.hash.startsWith('#/console'))
        go('/console');
      else if (!m.user.platformRole && location.hash.startsWith('#/console')) go('/overview');
      else if (
        !m.permissions.includes('campaigns.view') &&
        (!location.hash || location.hash === '#/overview')
      ) {
        const allowed = nav.find((n) => m.permissions.includes(n.permission));
        if (allowed) go(allowed.key);
      }
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refreshMe();
    const listener = () => {
      setRoute(location.hash.slice(1) || '/overview');
      setMobile(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('tm.theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  if (loading) return <Loading />;
  if (!me) return <Login onLogin={refreshMe} />;
  const notify = (message: string) => setToast(message),
    props = { me, notify, refreshMe },
    isConsole = Boolean(me.user.platformRole) && route.startsWith('/console') && !me.impersonation;
  const pageTitle = isConsole
    ? 'Platform console'
    : route.startsWith('/campaigns/new')
      ? 'New campaign'
      : route.startsWith('/segments/new')
        ? 'Segment builder'
        : (nav.find((n) => route.startsWith(n.key))?.name ??
          (route.startsWith('/settings')
            ? 'Settings'
            : route.startsWith('/guide')
              ? 'Workflow guide'
              : route.startsWith('/install')
                ? 'Connect Bitrix24'
                : 'Help center'));
  const can = (p: string) => me.permissions.includes(p),
    selectedCompany = me.company?.name ?? 'TrueMarketing';
  let content: React.ReactNode;
  if (me.company?.status === 'suspended' && !me.impersonation)
    content = (
      <div className="empty">
        <h1>Company suspended</h1>
        <p>Contact TrueMarketing to restore access. Your data is retained.</p>
      </div>
    );
  else if (isConsole) content = <Console {...props} />;
  else if (
    !me.liveReady &&
    (route === '/segments/new' ||
      route.startsWith('/segments/edit/') ||
      route === '/campaigns/new' ||
      route.startsWith('/campaigns/edit/'))
  )
    content = (
      <div className="empty">
        <h1>Connect your CRM first.</h1>
        <p>
          Live Bitrix24 integration must be verified before creating audiences or campaigns. No
          simulated records are available.
        </p>
        <Button onClick={() => go('/install')}>Connection setup</Button>
      </div>
    );
  else if (route === '/segments/new' || route.startsWith('/segments/edit/'))
    content = <SegmentEditor {...props} segmentId={route.split('/')[3]} />;
  else if (route === '/campaigns/new' || route.startsWith('/campaigns/edit/'))
    content = <CampaignWizard {...props} campaignId={route.split('/')[3]} />;
  else if (route.startsWith('/segments')) content = <SegmentList {...props} />;
  else if (route.startsWith('/campaigns')) content = <Campaigns {...props} />;
  else if (route.startsWith('/reports'))
    content = <Reports {...props} campaignId={route.split('/')[2]} />;
  else if (route.startsWith('/runs')) content = <Runs {...props} />;
  else if (route.startsWith('/settings')) content = <Settings {...props} />;
  else if (route.startsWith('/install') || route.startsWith('/bitrix'))
    content = <Install {...props} />;
  else if (route.startsWith('/guide') || route.startsWith('/help'))
    content = <Guide help={route.startsWith('/help')} />;
  else content = <Overview {...props} />;
  return (
    <div className={'app ' + (mobile ? 'menu-open' : '')}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="#/overview">
          <img src="/brand/logo.png" alt="TrueMarketing" />
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">{isConsole ? 'T' : selectedCompany.slice(0, 1)}</span>
          <div>
            <strong>{isConsole ? 'TrueMarketing' : selectedCompany}</strong>
            <small>{isConsole ? 'Platform administration' : 'Company workspace'}</small>
          </div>
          {me.companies.length > 1 ? (
            <select
              aria-label="Switch company"
              value={me.company?.id ?? ''}
              onChange={async (e) => {
                try {
                  await api('/api/auth/switch-company', 'POST', { companyId: e.target.value });
                  await refreshMe();
                  go('/overview');
                } catch (err) {
                  notify((err as Error).message);
                }
              }}
            >
              {me.companies.map((c: Row) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <ChevronDown size={15} />
          )}
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {isConsole ? (
            <button className="nav-item active">
              <ShieldCheck size={19} /> Platform console
            </button>
          ) : (
            nav
              .filter((n) => can(n.permission))
              .map((n) => (
                <a
                  key={n.key}
                  href={'#' + n.key}
                  className={'nav-item ' + (route.startsWith(n.key) ? 'active' : '')}
                  aria-current={route.startsWith(n.key) ? 'page' : undefined}
                >
                  <n.icon size={19} />
                  {n.name}
                </a>
              ))
          )}
          {!isConsole &&
            [
              'settings.manage',
              'users.manage',
              'roles.manage',
              'bitrix.manage',
              'apikeys.manage',
              'audit.view',
            ].some(can) && (
              <a
                href="#/settings"
                className={'nav-item ' + (route.startsWith('/settings') ? 'active' : '')}
              >
                <Settings2 size={19} />
                Settings
              </a>
            )}
        </nav>
        <div className="nav-label resources">RESOURCES</div>
        <nav aria-label="Resources">
          <a href="#/guide" className={'nav-item ' + (route === '/guide' ? 'active' : '')}>
            <BookOpen size={18} />
            Workflow guide
          </a>
          <a href="#/help" className={'nav-item ' + (route === '/help' ? 'active' : '')}>
            <CircleHelp size={18} />
            Help center
            <ArrowUpRight className="nav-external" size={13} />
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-tip">
            <div className="tip-title">
              <span className="live-dot" /> Built around Bitrix24
            </div>
            <p>
              Your CRM does the sending.
              <br />
              You stay in control.
            </p>
            <button onClick={() => go('/guide')}>
              See how it works <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="user-row">
            <div className="avatar">
              {me.user.name
                .split(' ')
                .map((s: string) => s[0])
                .slice(0, 2)
                .join('')}
            </div>
            <div>
              <strong>{me.user.name}</strong>
              <small>
                {isConsole
                  ? me.user.platformRole
                  : (me.membership?.role ?? me.user.platformRole ?? 'Support session')}
              </small>
            </div>
            <button
              className="icon-button"
              title="Sign out"
              aria-label="Sign out"
              onClick={async () => {
                await api('/api/auth/logout', 'POST', {});
                setMe(null);
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-toggle"
              aria-label="Toggle navigation"
              onClick={() => setMobile(!mobile)}
            >
              {mobile ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span>{isConsole ? 'TrueMarketing' : selectedCompany}</span>
            <span className="crumb-slash">/</span>
            <strong>{pageTitle}</strong>
          </div>
          <div className="topbar-right">
            <span className="local-tag">
              <ShieldCheck size={13} /> Setup in progress
            </span>
            <button
              className="icon-button"
              aria-label={dark ? 'Use light theme' : 'Use dark theme'}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <a className="help-icon" href="#/help" aria-label="Help">
              <CircleHelp size={18} />
            </a>
            <span className="top-avatar">{me.user.name[0]}</span>
          </div>
        </header>
        {me.impersonation && (
          <div className="impersonation">
            Viewing as {selectedCompany} — TrueMarketing support ·{' '}
            {me.impersonation.allowWrite ? 'Changes enabled' : 'Read-only'}
            <button
              onClick={async () => {
                await api('/api/console/stop-impersonation', 'POST', {});
                await refreshMe();
                go('/console');
              }}
            >
              End session
            </button>
          </div>
        )}
        <main id="main" className="content" key={route + '-' + (me.company?.id ?? 'platform')}>
          {content}
        </main>
        <footer className="footer">
          <span>Thoughtfully orchestrated with TrueMarketing.</span>
          <span>
            <span className="live-dot" />
            CRM not connected · v0.2
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <ShieldCheck size={19} />
          {toast}
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
