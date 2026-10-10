import {
  CircleHelp,
  Construction,
  Dog,
  Droplets,
  Lightbulb,
  MapPin,
  Moon,
  Sun,
  TrafficCone,
  Trash2,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { Category, Tier } from '../api'
import { useState } from 'react'
import { useLang } from '../i18n'

export const BRAND = 'GalliGraph'
export const CITY = 'Jaipur'
export const CITY_HI = 'जयपुर'

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  road_damage: Construction,
  water_supply: Droplets,
  drainage: Waves,
  garbage: Trash2,
  streetlight: Lightbulb,
  stray_animals: Dog,
  traffic: TrafficCone,
  electricity: Zap,
  other: CircleHelp,
}

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="8" fill="#0f172a" />
      <circle cx="16" cy="9" r="3" fill="#14b8a6" />
      <circle cx="8" cy="22" r="3" fill="#14b8a6" />
      <circle cx="24" cy="22" r="3" fill="#14b8a6" />
      <path d="M16 12v5m0 0-6 4m6-4 6 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

/** Light / dark theme. The choice is remembered; the first visit follows the device setting (see index.html). */
export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('gg-theme', next ? 'dark' : 'light')
    } catch {
      /* storage blocked: the theme still applies for this visit */
    }
    setDark(next)
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}

export function LangToggle({ dark = false }: { dark?: boolean }) {
  const { lang, setLang } = useLang()
  return (
    <div
      className={`flex overflow-hidden rounded-full text-xs font-semibold ring-1 ${dark ? 'ring-white/20' : 'ring-slate-300'}`}
      role="group"
      aria-label="Language"
    >
      {(['en', 'hi'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`px-2.5 py-1 ${
            lang === l ? (dark ? 'bg-white text-navy-900' : 'bg-navy-900 text-white') : dark ? 'text-slate-300' : 'text-slate-600'
          }`}
        >
          {l === 'en' ? 'ENG' : 'हिं'}
        </button>
      ))}
    </div>
  )
}

export function BrandBlock({ subtitle }: { subtitle?: string }) {
  return (
    <a href="/" className="flex min-w-0 items-center gap-2.5">
      <Logo />
      <div className="leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="font-display text-xl font-extrabold text-brand-700">{BRAND}</span>
          <span className="hidden rounded-md bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap text-white min-[400px]:inline">
            AI Gov
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs font-medium text-slate-600">
          <MapPin className="h-3 w-3" aria-hidden /> {subtitle ?? `${CITY} · ${CITY_HI}`}
        </div>
      </div>
    </a>
  )
}

/** Citizen Portal | Officer Triage | Admin Intel switcher from the design. */
export function PortalSwitcher({ active }: { active: 'citizen' | 'triage' | 'intel' }) {
  const { t } = useLang()
  const items = [
    { id: 'citizen', label: t('citizenPortal'), href: '/' },
    { id: 'triage', label: t('officerTriage'), href: '/official#triage' },
    { id: 'intel', label: t('adminIntel'), href: '/official#ops' },
  ] as const
  return (
    <nav className="grid grid-cols-3 gap-1 rounded-xl bg-surface-low p-1 text-xs font-semibold sm:text-sm" aria-label="Portals">
      {items.map((i) => (
        <a
          key={i.id}
          href={i.href}
          aria-current={active === i.id ? 'page' : undefined}
          className={`truncate rounded-lg px-1.5 py-1.5 text-center sm:px-3 ${
            active === i.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-navy-900'
          }`}
        >
          {i.label}
        </a>
      ))}
    </nav>
  )
}

export interface NavItem<T extends string> {
  id: T
  label: string
  icon: LucideIcon
  badge?: number
}

function Badge({ n }: { n?: number }) {
  if (!n) return null
  return (
    <span className="absolute -right-1.5 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
      {n > 9 ? '9+' : n}
    </span>
  )
}

/** Mobile bottom navigation with bilingual labels; hidden on large screens. */
export function BottomNav<T extends string>({ items, active, onChange }: { items: NavItem<T>[]; active: T; onChange: (id: T) => void }) {
  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-[900] border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden"
      aria-label="Sections"
    >
      <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={active === id ? 'page' : undefined}
            className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-center text-[10.5px] font-semibold leading-tight ${
              active === id ? 'text-brand-700' : 'text-slate-500'
            }`}
          >
            {active === id && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand-600" />}
            <span className="relative">
              <Icon className="h-5 w-5" aria-hidden />
              <Badge n={badge} />
            </span>
            {label}
          </button>
        ))}
      </div>
    </nav>
  )
}

/** Desktop tab row (same items as the bottom nav). */
export function TopTabs<T extends string>({ items, active, onChange }: { items: NavItem<T>[]; active: T; onChange: (id: T) => void }) {
  return (
    <nav className="hidden gap-1 lg:flex" aria-label="Sections">
      {items.map(({ id, label, icon: Icon, badge }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-current={active === id ? 'page' : undefined}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${
            active === id ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span className="relative">
            <Icon className="h-4 w-4" aria-hidden />
            <Badge n={badge} />
          </span>
          {label}
        </button>
      ))}
    </nav>
  )
}

export const TIER_PILL: Record<Tier, { cls: string; label: string }> = {
  critical: { cls: 'pill-crit', label: 'P0 Critical' },
  high: { cls: 'pill-warn', label: 'High' },
  medium: { cls: 'pill-zone', label: 'Medium' },
  low: { cls: 'pill-zone', label: 'Low' },
}

export function SectionHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1 basis-56">
        <h2 className="section-label">{title}</h2>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  onClick,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  icon?: LucideIcon
  tone?: 'default' | 'primary' | 'critical' | 'warn'
  onClick?: () => void
}) {
  const valueCls = { default: 'text-navy-900', primary: 'text-brand-700', critical: 'text-red-700', warn: 'text-saffron-700' }[tone]
  const bg = tone === 'critical' ? 'bg-red-50 border-red-200' : ''
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
        <span>{label}</span>
        {Icon && <Icon className={`h-4 w-4 ${tone === 'critical' ? 'text-red-600' : 'text-brand-600'}`} aria-hidden />}
      </div>
      <div className={`mt-1 font-display text-2xl font-bold tnum sm:text-3xl ${valueCls}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </>
  )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={`card lift flex flex-col justify-between p-3 text-left sm:p-4 ${bg}`}>
        {body}
      </button>
    )
  return <div className={`card flex flex-col justify-between p-3 sm:p-4 ${bg}`}>{body}</div>
}

export function displayId(issueId: number, firstReported?: string) {
  return `#JPR-${(firstReported ?? new Date().toISOString()).slice(0, 4)}-${String(issueId).padStart(4, '0')}`
}

export function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="card flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-navy-900">{title}</h2>
        {right}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}
