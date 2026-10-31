import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Download,
  LoaderCircle,
  X,
  type LucideIcon,
} from 'lucide-react';
export type Row = Record<string, any>;
let csrf = '';
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T = any>(path: string, method = 'GET', body?: any): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).catch(() => { throw new Error(`Cannot reach TrueMarketing at ${location.host}. Keep the server laptop running. From another laptop, use the server's private-network address instead of localhost.`); });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.');
  return data;
}
export function useData<T = any>(path: string, refresh = 0, poll = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const load = () =>
      api<T>(path)
        .then((d) => {
          if (active) {
            setData(d);
            setLoading(false);
            setError('');
          }
        })
        .catch((e) => {
          if (active) {
            setError(e.message);
            setLoading(false);
          }
        });
    load();
    const timer = poll ? setInterval(load, poll) : null;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [path, refresh, poll]);
  return { data, error, loading };
}
export const go = (path: string) => {
  location.hash = path;
};
export const number = (n: number | undefined | null) =>
  n == null ? '—' : new Intl.NumberFormat('en-US').format(n);
export const money = (n: number | null | undefined, currency = 'AED') =>
  n == null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(n);
export const percent = (n: number | null | undefined) =>
  n == null ? 'Not tracked' : (n * 100).toFixed(1) + '%';
export const date = (value: string | undefined) =>
  value
    ? new Date(value).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';
export const datetime = (value: string | undefined) =>
  value
    ? new Date(value).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
export function csvDownload(name: string, rows: Row[]) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]).filter((k) => !['targets', 'hash', 'tokenHash'].includes(k));
  const cell = (v: any) => {
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
    return '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : '') + s.replaceAll('"', '""') + '"';
  };
  const blob = new Blob(
    [
      '\uFEFF' +
        [
          columns.map(cell).join(','),
          ...rows.map((r) => columns.map((c) => cell(r[c])).join(',')),
        ].join('\r\n'),
    ],
    { type: 'text/csv;charset=utf-8' },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
export function Button({
  children,
  onClick,
  variant = 'primary',
  icon: Icon,
  disabled = false,
  type = 'button',
  title,
  className = '',
}: {
  children?: ReactNode;
  onClick?: () => void;
  variant?: string;
  icon?: LucideIcon;
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
  className?: string;
}) {
  return (
    <button
      type={type}
      className={`button ${variant} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {Icon && <Icon size={16} />} {children}
    </button>
  );
}
export function Badge({ status, children }: { status?: string; children?: ReactNode }) {
  return (
    <span className={`badge ${status ?? ''}`}>
      <span className="badge-dot" />
      {children ?? status?.replaceAll('_', ' ')}
    </span>
  );
}
export function PageHead({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">{actions}</div>
    </header>
  );
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={'card ' + className}>{children}</section>;
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const generated = useId();
  const simple =
    isValidElement(children) &&
    typeof children.type === 'string' &&
    ['input', 'select', 'textarea'].includes(children.type);
  const fieldId = simple ? ((children.props as any).id ?? generated) : generated;
  return (
    <div className="field">
      <label htmlFor={simple ? fieldId : undefined}>{label}</label>
      {simple ? (
        cloneElement(children as React.ReactElement<any>, {
          id: fieldId,
          'aria-describedby': hint ? fieldId + '-hint' : undefined,
        })
      ) : (
        <div role="group" aria-label={label}>
          {children}
        </div>
      )}
      {hint && <small id={fieldId + '-hint'}>{hint}</small>}
    </div>
  );
}
export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: string }) {
  return <div className={'notice ' + tone}>{children}</div>;
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="notice error" role="alert">
      {message}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={24} />
      <span>Loading your workspace…</span>
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-symbol">✦</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab') {
        const elements = dialog.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
        );
        if (!elements?.length) return;
        const first = elements[0],
          last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = previous;
      previousFocus?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={'modal ' + (wide ? 'wide' : '')}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog" autoFocus>
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function Stat({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span>{label}</span>
        {Icon && <Icon size={18} />}
      </div>
      <strong>{value}</strong>
      <small>{detail ?? 'Across your sample campaigns'}</small>
    </div>
  );
}
export function Progress({ value }: { value: number }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: Math.max(0, Math.min(value, 100)) + '%' }} />
    </div>
  );
}
export function ExportButton({
  rows,
  name = 'truemarketing-export.csv',
}: {
  rows: Row[];
  name?: string;
}) {
  return (
    <Button
      variant="secondary"
      icon={Download}
      disabled={!rows.length}
      onClick={() => csvDownload(name, rows)}
    >
      Export CSV
    </Button>
  );
}
export function LinkButton({ children, to }: { children: ReactNode; to: string }) {
  return (
    <button className="text-button" onClick={() => go(to)}>
      {children}
      <ChevronRight size={15} />
    </button>
  );
}
export function CheckItem({ children, done }: { children: ReactNode; done: boolean }) {
  return (
    <div className="check-item">
      <span className={done ? 'done' : ''}>
        {done ? <Check size={13} /> : <ArrowUpRight size={13} />}
      </span>
      {children}
    </div>
  );
}
