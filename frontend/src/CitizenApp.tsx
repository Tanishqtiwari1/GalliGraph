import { Bell, CircleHelp, FolderOpen, House, Map, MessageSquarePlus, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api, type Category, type Health, type Meta } from './api'
import { CitizenHome } from './components/CitizenHome'
import { CitizenMap } from './components/CitizenMap'
import { CitizenNotifications } from './components/CitizenNotifications'
import { HelpView } from './components/HelpView'
import { ToastProvider } from './components/Kit'
import { MyComplaints } from './components/MyComplaints'
import { ReportWizard } from './components/ReportWizard'
import { BottomNav, BrandBlock, LangToggle, PortalSwitcher, TopTabs, type NavItem } from './components/Shell'
import { TrackView } from './components/TrackView'
import { useLang } from './i18n'
import { noticesFrom, useMyComplaints } from './useMyComplaints'

type Tab = 'home' | 'report' | 'mine' | 'map' | 'alerts' | 'track' | 'help'

function parseHash(): { tab: Tab; arg?: string } {
  const [h, arg] = window.location.hash.replace('#', '').split('/')
  const tab = (['report', 'mine', 'map', 'alerts', 'track', 'help'] as const).find((t) => t === h) ?? 'home'
  return { tab, arg }
}

export default function CitizenApp() {
  const { bi, t } = useLang()
  const [{ tab, arg }, setRoute] = useState(parseHash)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const { items, refresh } = useMyComplaints()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    api.meta().then(setMeta).catch(() => {})
    api.health().then(setHealth).catch(() => {})
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (items) setUnread(noticesFrom(items).filter((n) => n.unread).length)
  }, [items])

  // Re-check my complaints whenever the citizen changes section, so badges stay fresh.
  useEffect(() => {
    refresh()
  }, [tab, refresh])

  const go = useCallback((t: Tab, a?: string) => {
    window.location.hash = a ? `${t}/${a}` : t
    setRoute({ tab: t, arg: a })
    window.scrollTo({ top: 0 })
  }, [])

  const items5: NavItem<Tab>[] = [
    { id: 'home', label: bi('home'), icon: House },
    { id: 'report', label: bi('report'), icon: MessageSquarePlus },
    { id: 'mine', label: t('mine'), icon: FolderOpen },
    { id: 'map', label: bi('map'), icon: Map },
    { id: 'alerts', label: bi('alerts'), icon: Bell, badge: unread },
  ]
  const navActive: Tab = tab === 'track' ? 'mine' : tab === 'help' ? 'home' : tab

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col pb-16 lg:pb-0">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[2000] focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <header className="sticky top-0 z-[800] border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
            <BrandBlock />
            <TopTabs items={items5} active={navActive} onChange={(t) => go(t)} />
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => go('help')} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Help and settings" title="Help & settings">
                <CircleHelp className="h-5 w-5" />
              </button>
              <LangToggle />
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-6xl px-4 pt-3">
          <PortalSwitcher active="citizen" />
        </div>

        {health?.demo_data && (
          <div className="mx-auto mt-2 w-full max-w-6xl px-4">
            <div className="rounded-lg bg-saffron-50 px-3 py-1.5 text-center text-xs text-amber-900 ring-1 ring-amber-200">
              Prototype · map and statistics show simulated Jaipur complaints for demonstration
            </div>
          </div>
        )}

        <main id="main" key={tab} className="animate-rise mx-auto w-full max-w-6xl flex-1 px-4 py-4">
          {tab === 'home' && (
            <CitizenHome meta={meta} onReport={(c?: Category) => go('report', c)} onTrack={(code) => go('track', code)} onMap={() => go('map')} />
          )}
          {tab === 'report' && <ReportWizard key={arg ?? 'none'} meta={meta} categoryHint={arg as Category | undefined} onTrack={(code) => go('track', code)} />}
          {tab === 'mine' && <MyComplaints onOpen={(code) => go('track', code)} onReport={() => go('report')} />}
          {tab === 'map' && <CitizenMap meta={meta} onReport={(c) => go('report', c)} />}
          {tab === 'alerts' && <CitizenNotifications onOpen={(code) => go('track', code)} onSeen={() => setUnread(0)} />}
          {tab === 'track' && <TrackView key={arg ?? 'none'} initialCode={arg} />}
          {tab === 'help' && <HelpView meta={meta} />}
        </main>

        <footer className="hidden border-t border-slate-200 bg-white lg:block">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Your complaint text and photos are visible only to municipal officials.
            </span>
            <span className="flex gap-4">
              <button type="button" onClick={() => go('help')} className="font-semibold text-slate-600 hover:underline">
                Help &amp; FAQ
              </button>
              <a href="/official" className="font-semibold text-brand-700 hover:underline">
                Officials login →
              </a>
            </span>
          </div>
        </footer>

        <BottomNav items={items5} active={navActive} onChange={(t) => go(t)} />
      </div>
    </ToastProvider>
  )
}
