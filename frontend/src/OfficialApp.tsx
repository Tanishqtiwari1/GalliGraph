import {
  BarChart3,
  Bell,
  ClipboardList,
  Hourglass,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogOut,
  Map,
  MoreHorizontal,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api, setUnauthorizedHandler, type Activity, type Meta, type Stats, type User } from './api'
import { ComplaintsView } from './components/ComplaintsView'
import { IssueDetail } from './components/IssueDetail'
import { Modal, SlideOver, ToastProvider } from './components/Kit'
import { LoginPage } from './components/LoginPage'
import { OfficialMap } from './components/OfficialMap'
import { OverviewView, type ComplaintFilter } from './components/OverviewView'
import { PerformanceView } from './components/PerformanceView'
import { BottomNav, BrandBlock, CITY, LangToggle, ThemeToggle, Logo, BRAND, type NavItem } from './components/Shell'
import { SlaCenter } from './components/SlaCenter'
import { StaffView } from './components/StaffView'
import { TriageView } from './components/TriageView'
import { WorkOrdersView } from './components/WorkOrdersView'
import { useLang } from './i18n'
import { EXTRACTOR_LABEL, timeAgo } from './ui'

type Tab = 'overview' | 'triage' | 'complaints' | 'map' | 'work' | 'sla' | 'analytics' | 'staff'
const TABS: Tab[] = ['overview', 'triage', 'complaints', 'map', 'work', 'sla', 'analytics', 'staff']
const tabFromHash = (): Tab => {
  const h = window.location.hash.replace('#', '')
  if (h === 'ops') return 'analytics'
  return (TABS as string[]).includes(h) ? (h as Tab) : 'overview'
}
const SEEN = 'gg_off_seen'
const readSeen = () => {
  try {
    return localStorage.getItem(SEEN) ?? ''
  } catch {
    return ''
  }
}

function initials(name: string) {
  return name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

export default function OfficialApp() {
  return (
    <ToastProvider>
      <OfficialInner />
    </ToastProvider>
  )
}

function OfficialInner() {
  const { t } = useLang()
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [tab, setTab] = useState<Tab>(tabFromHash)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [mode, setMode] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [focus, setFocus] = useState<number | null>(null)
  const [drawer, setDrawer] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [complaintFilter, setComplaintFilter] = useState<ComplaintFilter | undefined>()
  const [activity, setActivity] = useState<Activity[]>([])
  const [bellOpen, setBellOpen] = useState(false)
  const [seen, setSeen] = useState(readSeen)
  const [more, setMore] = useState(false)

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    api.me().then(setUser).catch(() => setUser(null))
    api.meta().then(setMeta).catch(() => {})
    api.health().then((h) => setMode(h.extractor === 'rules' && h.trained_model ? 'trained' : h.extractor)).catch(() => {})
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => {
      setUnauthorizedHandler(null)
      window.removeEventListener('hashchange', onHash)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    api.stats().then(setStats).catch(() => {})
    api.activity(30).then(setActivity).catch(() => {})
    const id = setInterval(() => {
      api.activity(30).then(setActivity).catch(() => {})
      api.stats().then(setStats).catch(() => {})
    }, 30000)
    return () => clearInterval(id)
  }, [user, refreshKey])

  const changed = useCallback(() => setRefreshKey((k) => k + 1), [])
  const onFocus = useCallback((id: number | null) => {
    setFocus(id)
    if (id !== null && !window.matchMedia('(min-width: 1024px)').matches) window.scrollTo({ top: 0 })
  }, [])

  if (user === undefined)
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  if (user === null) return <LoginPage onLogin={setUser} />

  const go = (to: Tab) => {
    window.location.hash = to
    setTab(to)
    setMore(false)
    window.scrollTo({ top: 0 })
  }
  const openIssue = (id: number) => setDrawer(id)
  const supervisor = user.role === 'supervisor'
  const unread = activity.filter((a) => a.at > seen).length

  const nav: NavItem<Tab>[] = [
    { id: 'overview', label: t('overview'), icon: LayoutDashboard },
    { id: 'triage', label: 'AI Triage', icon: Sparkles, badge: stats?.untriaged },
    { id: 'complaints', label: t('complaints'), icon: ListChecks },
    { id: 'map', label: 'Issue map', icon: Map },
    { id: 'work', label: t('workOrders'), icon: ClipboardList },
    { id: 'sla', label: t('slaAlerts'), icon: Hourglass, badge: stats?.overdue_issues },
    { id: 'analytics', label: t('analytics'), icon: BarChart3 },
    ...(supervisor ? [{ id: 'staff' as Tab, label: t('staff'), icon: UsersRound }] : []),
  ]
  const mobileNav: NavItem<Tab | 'more'>[] = [
    nav[0],
    nav[1],
    nav[2],
    nav[3],
    { id: 'more', label: 'More', icon: MoreHorizontal, badge: stats?.overdue_issues },
  ] as NavItem<Tab | 'more'>[]

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-[850] hidden w-64 flex-col bg-navy-900 text-slate-300 lg:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <Logo size={36} />
          <div className="leading-tight">
            <div className="font-display text-lg font-extrabold text-white">{BRAND}</div>
            <div className="text-[11px] text-slate-400">Operations · {CITY} / JMC</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-2" aria-label="Sections">
          {nav.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                tab === id ? 'bg-brand-600 text-white shadow' : 'hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1 text-left">{label}</span>
              {!!badge && <span className={`rounded-full px-1.5 text-[11px] font-bold ${tab === id ? 'bg-white/20' : 'bg-red-600 text-white'}`}>{badge}</span>}
            </button>
          ))}
        </nav>
        <div className="m-2 rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{initials(user.display_name) || 'O'}</span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold text-white">{user.display_name}</div>
              <div className="truncate text-[11px] capitalize text-slate-400">{user.role}{user.department ? ` · ${user.department}` : ''}</div>
            </div>
            <button type="button" onClick={async () => { await api.logout().catch(() => {}); setUser(null) }} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Log out" title="Log out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <a href="/" className="mt-2 block text-center text-[11px] font-semibold text-brand-200 hover:underline">
            Open citizen portal ↗
          </a>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-[800] border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="lg:hidden">
            <BrandBlock subtitle={`${CITY} / JMC`} />
          </div>
          <div className="hidden items-center gap-2 text-sm text-slate-500 lg:flex">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Live · auto-refresh every 30 s
            {mode && <span className="pill pill-info ml-2">{EXTRACTOR_LABEL[mode] ?? mode}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
              <LangToggle />
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setBellOpen((v) => !v)
                  if (!bellOpen) {
                    const now = new Date().toISOString().slice(0, 19)
                    try {
                      localStorage.setItem(SEEN, now)
                    } catch {
                      /* ignore */
                    }
                    setTimeout(() => setSeen(now), 1200)
                  }
                }}
                className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                aria-label={`Notifications${unread ? `, ${unread} new` : ''}`}
                aria-expanded={bellOpen}
              >
                <Bell className="h-5 w-5" />
                {unread > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
              </button>
              {bellOpen && (
                <div className="card-raised animate-rise absolute right-0 top-11 z-[900] w-[min(22rem,90vw)] overflow-hidden">
                  <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-bold">Notifications</div>
                  <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
                    {activity.map((a, i) => (
                      <li key={i}>
                        <button type="button" onClick={() => { setBellOpen(false); openIssue(a.issue_id) }} className={`w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 ${a.at > seen ? 'bg-brand-50/50' : ''}`}>
                          <div className="line-clamp-2 font-medium">{a.message}</div>
                          <div className="truncate text-xs text-slate-500">{a.summary} · {timeAgo(a.at)}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <button type="button" onClick={async () => { await api.logout().catch(() => {}); setUser(null) }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main key={tab} className="animate-rise mx-auto max-w-[1400px] px-4 py-5 pb-24 lg:pb-8">
        {tab === 'overview' && (
          <OverviewView
            user={user}
            refreshKey={refreshKey}
            goComplaints={(f) => {
              setComplaintFilter({ ...f })
              go('complaints')
            }}
            goTriage={() => go('triage')}
            goSla={() => go('sla')}
            openIssue={openIssue}
          />
        )}
        {tab === 'triage' && <TriageView meta={meta} refreshKey={refreshKey} canSupervise={supervisor} onChanged={changed} focusId={focus} onFocus={onFocus} />}
        {tab === 'complaints' && <ComplaintsView meta={meta} refreshKey={refreshKey} initial={complaintFilter} openIssue={openIssue} />}
        {tab === 'map' && <OfficialMap meta={meta} refreshKey={refreshKey} onTriage={openIssue} />}
        {tab === 'work' && <WorkOrdersView refreshKey={refreshKey} openIssue={openIssue} />}
        {tab === 'sla' && <SlaCenter refreshKey={refreshKey} openIssue={openIssue} canConfigure={supervisor} goSettings={() => go('staff')} />}
        {tab === 'analytics' && <PerformanceView refreshKey={refreshKey} onSelect={openIssue} />}
        {tab === 'staff' && supervisor && <StaffView meta={meta} me={user.username} />}
      </main>

      {drawer !== null && (
        <SlideOver label="Issue details" onClose={() => setDrawer(null)}>
          <IssueDetail issueId={drawer} canSupervise={supervisor} meta={meta} onChanged={changed} />
        </SlideOver>
      )}

      {more && (
        <Modal title="More" onClose={() => setMore(false)}>
          <div className="grid grid-cols-2 gap-2">
            {nav.slice(4).map(({ id, label, icon: Icon, badge }) => (
              <button key={id} type="button" onClick={() => go(id)} className="card lift flex items-center gap-2 p-3 text-left text-sm font-semibold">
                <Icon className="h-5 w-5 text-brand-700" /> {label}
                {!!badge && <span className="ml-auto rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">{badge}</span>}
              </button>
            ))}
          </div>
        </Modal>
      )}

      <BottomNav items={mobileNav} active={(['overview', 'triage', 'complaints', 'map'] as Tab[]).includes(tab) ? tab : 'more'} onChange={(id) => (id === 'more' ? setMore(true) : go(id as Tab))} />
    </div>
  )
}
