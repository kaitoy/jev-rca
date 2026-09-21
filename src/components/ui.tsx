import { Link, useRouter } from '@tanstack/react-router'
import { Activity, Boxes, Layers, Menu, Moon, Search, Sun, Upload, X, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50'

/** Calls a server function, then invalidates the router. Tracks pending/error for the button. */
export function useAction<A extends unknown[], R>(fn: (...a: A) => Promise<R>, onDone?: (r: R) => void) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (...a: A) => {
    setPending(true)
    setError(null)
    try {
      const r = await fn(...a)
      await router.invalidate()
      onDone?.(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }
  return { run, pending, error }
}

export const formData = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault()
  return Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
}

// ---------- Buttons ----------
type ButtonProps = ComponentProps<'button'> & { variant?: 'primary' | 'secondary' | 'ghost'; pending?: boolean; pendingLabel?: string; live?: boolean }
const buttonVariants = {
  primary: 'bg-linear-to-r from-accent to-secondary text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_20px_-8px_var(--c-accent)] hover:shadow-glow',
  secondary: 'glass-panel text-on-surface hover:text-accent hover:shadow-glow',
  ghost: 'text-on-surface-variant hover:bg-glass hover:text-on-surface',
}
export function Button({ variant = 'primary', pending, pendingLabel, live, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 pointer-coarse:min-h-11',
        focus, buttonVariants[variant], live && 'live-edge', className,
      )}
      {...rest}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  )
}

// ---------- Form controls ----------
const field = cx('w-full rounded-xl glass-panel px-3 py-2 text-sm text-on-surface max-sm:text-base', focus)
export const Input = (p: ComponentProps<'input'>) => <input {...p} className={cx(field, p.className)} />
export const Select = (p: ComponentProps<'select'>) => <select {...p} className={cx(field, 'appearance-none', p.className)} />
export const Textarea = (p: ComponentProps<'textarea'>) => <textarea {...p} className={cx(field, 'font-mono text-xs leading-[18px]', p.className)} />
export function Field({ label, htmlFor, children, className }: { label: string; htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-label-caps">{label}</label>
      {children}
    </div>
  )
}
export const ErrorText = ({ children }: { children: ReactNode }) =>
  children ? <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm text-error animate-message-in">{children}</p> : null

// ---------- Badges ----------
export type Tone = 'error' | 'error-soft' | 'alert' | 'slate' | 'accent' | 'success'
const tones: Record<Tone, string> = {
  error: 'bg-error text-white border-error',
  'error-soft': 'bg-error/12 text-error border-error/30',
  alert: 'bg-alert/14 text-alert border-alert/32',
  slate: 'bg-on-surface-variant/12 text-on-surface-variant border-on-surface-variant/30',
  accent: 'bg-accent/14 text-accent border-accent/32',
  success: 'bg-success/14 text-success border-success/32',
}
export const severityTone: Record<string, Tone> = { critical: 'error', error: 'error-soft', warning: 'alert', info: 'slate' }
export const verdictTone: Record<string, Tone> = { root_cause: 'accent', co_symptom: 'alert', unrelated: 'slate' }
export const verdictLabel: Record<string, string> = { root_cause: 'Root cause', co_symptom: 'Co-symptom', unrelated: 'Unrelated' }
export function Badge({ tone = 'slate', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return <span title={title} className={cx('inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold leading-3 whitespace-nowrap', tones[tone], className)}>{children}</span>
}

// ---------- Layout pieces ----------
function IconTile({ icon: Icon, size = 'md' }: { icon: LucideIcon; size?: 'md' | 'lg' }) {
  return (
    <span className={cx('grid shrink-0 place-items-center rounded-xl glass-panel-strong text-accent shadow-glow', size === 'md' ? 'h-9 w-9' : 'h-12 w-12 rounded-2xl')}>
      <Icon strokeWidth={1.8} aria-hidden className={size === 'md' ? 'h-[18px] w-[18px]' : 'h-6 w-6 motion-safe:animate-bob'} />
    </span>
  )
}
export function PageHeader({ icon, title, eyebrow, actions }: { icon: LucideIcon; title: ReactNode; eyebrow?: string; actions?: ReactNode }) {
  return (
    <header className="flex items-center gap-3">
      <IconTile icon={icon} />
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="text-label-caps">{eyebrow}</p>}
        <h1 className="truncate font-display text-[30px] font-semibold leading-[38px] tracking-tight">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
export function SectionCard({ icon, title, children, className }: { icon: LucideIcon; title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('flex flex-col gap-5 rounded-2xl glass-panel-strong p-6 max-sm:p-4', className)}>
      <div className="flex items-center gap-3">
        <IconTile icon={icon} />
        <h2 className="font-display text-lg font-semibold leading-7 tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  )
}
export const DetailList = ({ children }: { children: ReactNode }) => <dl className="grid gap-4 sm:grid-cols-2">{children}</dl>
export function DetailItem({ label, children, mono, wide }: { label: string; children?: ReactNode; mono?: boolean; wide?: boolean }) {
  return (
    <div className={cx('flex flex-col gap-1.5', wide && 'sm:col-span-2')}>
      <dt className="text-label-caps">{label}</dt>
      <dd className={cx('min-h-9 rounded-xl border border-outline-variant bg-surface-dim/40 px-3 py-2 text-sm shadow-(--inner-track-shadow) break-words', mono && 'font-mono text-xs leading-[18px]')}>
        {children ?? '—'}
      </dd>
    </div>
  )
}
export function EmptyState({ icon, title, description }: { icon: LucideIcon; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <IconTile icon={icon} size="lg" />
      <p className="font-display text-lg font-semibold">{title}</p>
      {description && <p className="text-sm text-on-surface-variant">{description}</p>}
    </div>
  )
}

// ---------- Table ----------
export type Column<T> = { key: string; header: ReactNode; cell: (row: T) => ReactNode; className?: string }
export function DataTable<T>({ rows, columns, rowKey, rowClass, empty }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string | number; rowClass?: (r: T) => string | undefined; empty: ReactNode
}) {
  return (
    <div className="overflow-x-auto rounded-2xl glass-panel">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-glass-strong/70">
          <tr className="border-b border-divider">
            {columns.map((c) => <th key={c.key} scope="col" className={cx('px-4 py-3 text-left text-label-caps whitespace-nowrap', c.className)}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length}>{empty}</td></tr>}
          {rows.map((r) => (
            <tr key={rowKey(r)} className={cx('border-b border-divider/60 even:bg-glass-strong/15 hover:bg-accent-soft transition-colors last:border-0', rowClass?.(r))}>
              {columns.map((c) => <td key={c.key} className={cx('px-4 py-2.5 align-middle', c.className)}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- Shell ----------
const NAV = [
  { to: '/events', label: 'Events', icon: Activity },
  { to: '/cis', label: 'CIs', icon: Boxes },
  { to: '/services', label: 'Services', icon: Layers },
  { to: '/analyses', label: 'Analyses', icon: Search },
  { to: '/import', label: 'Import', icon: Upload },
] as const

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  useEffect(() => { setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light') }, [])
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('jev-rca.theme', next) } catch { /* private mode */ }
    setTheme(next)
  }
  const Icon = theme === 'dark' ? Sun : Moon
  return (
    <button type="button" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className={cx('grid h-9 w-9 place-items-center rounded-full glass-panel text-on-surface transition motion-safe:hover:scale-105 hover:shadow-glow hover:text-accent', focus)}>
      <Icon strokeWidth={1.8} aria-hidden className="h-[18px] w-[18px]" />
    </button>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link to="/events" className={cx('flex items-center gap-2 rounded-xl px-2 py-1', focus)} onClick={onNavigate}>
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-linear-to-br from-accent to-secondary text-white shadow-glow"><Search strokeWidth={2} aria-hidden className="h-4 w-4" /></span>
        <span className="font-display text-lg font-semibold tracking-tight">jev-rca</span>
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} onClick={onNavigate}
            className={cx('relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-on-surface-variant transition hover:bg-glass hover:text-on-surface', focus)}
            activeProps={{ className: 'text-on-surface bg-glass-strong before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-accent before:shadow-glow' }}>
            <Icon strokeWidth={1.8} aria-hidden className="h-[18px] w-[18px]" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex items-center justify-between px-2">
        <span className="font-mono text-[11px] text-on-surface-variant">TypeSafe · Jev</span>
        <ThemeToggle />
      </div>
    </div>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 h-dvh w-64 shrink-0 glass-chrome border-r border-glass-border max-md:hidden"><Sidebar /></aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 glass-panel-strong animate-message-in">
            <button type="button" autoFocus aria-label="Close" onClick={() => setOpen(false)} className={cx('absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-on-surface-variant hover:bg-glass', focus)}>
              <X strokeWidth={1.8} aria-hidden className="h-[18px] w-[18px]" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 glass-chrome border-b border-glass-border px-4 py-2 md:hidden">
          <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className={cx('grid h-10 w-10 place-items-center rounded-xl text-on-surface hover:bg-glass', focus)}>
            <Menu strokeWidth={1.8} aria-hidden />
          </button>
          <span className="font-display text-lg font-semibold tracking-tight">jev-rca</span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-8 max-sm:p-4">{children}</main>
      </div>
    </div>
  )
}

// ---------- Formatting ----------
export const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'UTC', hour12: false }) + ' UTC'
export function fmtDelta(sec: number) {
  if (sec === 0) return 'same time'
  const a = Math.abs(sec)
  const m = Math.floor(a / 60), s = a % 60
  const dur = `${m ? `${m}m` : ''}${s ? `${s}s` : ''}`
  return sec < 0 ? `${dur} before` : `${dur} after`
}
export const pct = (p: number) => `${(p * 100).toFixed(1)}%`
