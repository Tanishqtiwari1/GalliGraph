import { Activity, BarChart3, LayoutDashboard, MessageSquarePlus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type Meta } from './api'
import { EXTRACTOR_LABEL } from './ui'
import { Dashboard } from './components/Dashboard'
import { IssueDrawer } from './components/IssueDrawer'
import { PerformanceView } from './components/PerformanceView'
import { ReportForm } from './components/ReportForm'
import { TrackView } from './components/TrackView'

type Tab = 'dashboard' | 'performance' | 'report' | 'track'

const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Command centre', icon: LayoutDashboard },
  { id: 'performance', label: 'Accountability', icon: BarChart3 },
  { id: 'report', label: 'Report a problem', icon: MessageSquarePlus },
  { id: 'track', label: 'Track complaint', icon: Search },
]

function tabFromHash(): Tab {
  const h = window.location.hash.replace('#', '')
  return h === 'report' || h === 'track' || h === 'performance' ? h : 'dashboard'
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [mode, setMode] = useState<string>('')
  const [selected, setSelected] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [lastTracking, setLastTracking] = useState<number | undefined>()

  useEffect(() => {
    api.meta().then(setMeta).catch(() => {})
    api
      .health()
      .then((h) => setMode(h.extractor === 'rules' && h.trained_model ? 'trained' : h.extractor))
      .catch(() => setMode('rules'))
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (t: Tab) => {
    window.location.hash = t
    setTab(t)
  }

  return (
    <div className="min-h-full">
      <header className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="rounded-lg bg-brand-600 p-1.5">
              <Activity className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <div className="text-lg font-semibold leading-tight">CivicPulse</div>
              <div className="text-xs text-brand-100">AI complaint triage · Jaipur</div>
            </div>
          </div>
          <nav className="flex gap-1" aria-label="Main">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                  tab === id ? 'bg-white text-brand-900' : 'text-brand-100 hover:bg-white/10'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </nav>
          {mode && (
            <span className="hidden rounded-full bg-white/10 px-2.5 py-1 text-xs text-brand-100 md:inline">
              {EXTRACTOR_LABEL[mode] ?? mode}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-5">
        {tab === 'dashboard' && (
          <Dashboard meta={meta} refreshKey={refreshKey} selectedId={selected} onSelect={setSelected} />
        )}
        {tab === 'performance' && <PerformanceView refreshKey={refreshKey} onSelect={setSelected} />}
        {tab === 'report' && (
          <ReportForm
            onSubmitted={(r) => {
              setRefreshKey((k) => k + 1)
              setLastTracking(r.complaint.id)
            }}
            onOpenIssue={(id) => {
              go('dashboard')
              setSelected(id)
            }}
          />
        )}
        {tab === 'track' && <TrackView key={lastTracking} initialId={lastTracking} />}
      </main>

      {selected !== null && (
        <IssueDrawer issueId={selected} onClose={() => setSelected(null)} onChanged={() => setRefreshKey((k) => k + 1)} />
      )}
    </div>
  )
}
