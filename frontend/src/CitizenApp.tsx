import { Bell, CircleHelp, FolderOpen, House, Map, MessageSquarePlus, ShieldAlert, ShieldCheck, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Category, type Health, type Meta } from './api'
import { CitizenHome } from './components/CitizenHome'
import { CitizenMap } from './components/CitizenMap'
import { CitizenNotifications } from './components/CitizenNotifications'
import { HelpView } from './components/HelpView'
import { ToastProvider, useToast } from './components/Kit'
import { MyComplaints } from './components/MyComplaints'
import { ReportWizard } from './components/ReportWizard'
import { SafetyView } from './components/SafetyView'
import { BottomNav, BrandBlock, LangSwitch, TopTabs, type NavItem } from './components/Shell'
import { TrackView } from './components/TrackView'
import { useLang } from './i18n'
import { flushQueue } from './offlineQueue'
import { noticesFrom, useMyComplaints } from './useMyComplaints'

type Tab = 'home' | 'report' | 'mine' | 'map' | 'safety' | 'alerts' | 'track' | 'help'

function parseHash(): { tab: Tab; arg?: string } {
  const [h, arg] = window.location.hash.replace('#', '').split('/')
  const tab = (['report', 'mine', 'map', 'safety', 'alerts', 'track', 'help'] as const).find((t) => t === h) ?? 'home'
  return { tab, arg }
}

/** Sends complaints saved while offline and tells the citizen when the connection is gone. */
function OfflineSync({ onSent }: { onSent: () => void }) {
  const toast = useToast()
  const { l } = useLang()
  const text = useRef(l)
  text.current = l
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    async function sync() {
      try {
        const codes = await flushQueue()
        if (!codes.length) return
        onSent()
        window.dispatchEvent(new Event('gg-queue'))
        toast(text.current(`Your saved complaint was sent. Tracking code: ${codes.join(', ')}`, `आपकी सहेजी गई शिकायत भेज दी गई। ट्रैकिंग कोड: ${codes.join(', ')}`))
      } catch {
        /* storage blocked or a brief failure: the next run tries again */
      }
    }
    const up = () => {
      setOnline(true)
      sync()
    }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    sync()
    const timer = window.setInterval(sync, 60_000) // "online" can fire before the network really works
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
      window.clearInterval(timer)
    }
  }, [onSent, toast])

  if (online) return null
  return (
    <div className="bg-navy-900 px-4 py-2 text-center text-sm font-bold text-white" role="status">
      <WifiOff className="mr-1.5 inline h-4 w-4" aria-hidden />
      {l('No internet. You can still report: we will send it when you are back online.', 'इंटरनेट नहीं है। आप फिर भी शिकायत लिख सकते हैं: इंटरनेट आने पर हम भेज देंगे।')}
    </div>
  )
}

export default function CitizenApp() {
  const { l } = useLang()
  const [{ tab, arg }, setRoute] = useState(parseHash)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const { items, refresh } = useMyComplaints()
  const [unread, setUnread] = useState(0)
  const main = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

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

  const nav: NavItem<Tab>[] = [
    { id: 'home', label: l('Home', 'होम'), icon: House },
    { id: 'report', label: l('Report', 'शिकायत'), icon: MessageSquarePlus },
    { id: 'safety', label: l('Danger', 'ख़तरा'), icon: ShieldAlert },
    { id: 'map', label: l('Map', 'नक्शा'), icon: Map },
    { id: 'mine', label: l('My cases', 'मेरे मामले'), icon: FolderOpen },
  ]
  const navActive: Tab = tab === 'track' ? 'mine' : tab === 'help' || tab === 'alerts' ? 'home' : tab

  // A screen reader user hears the new page instead of staying on the button they pressed.
  const pageName = tab === 'help' ? l('Help', 'सहायता') : tab === 'alerts' ? l('Updates', 'सूचनाएँ') : tab === 'track' ? l('Track', 'स्थिति') : nav.find((n) => n.id === tab)?.label
  useEffect(() => {
    document.title = `${pageName} · GalliGraph`
    if (firstRender.current) firstRender.current = false
    else main.current?.focus({ preventScroll: true })
  }, [tab, pageName])

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col pb-20 lg:pb-0">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[2000] focus:rounded focus:bg-white focus:px-3 focus:py-2">
          {l('Skip to content', 'मुख्य सामग्री पर जाएँ')}
        </a>
        <header className="sticky top-0 z-[800] border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2">
            <BrandBlock />
            <TopTabs items={nav} active={navActive} onChange={(t) => go(t)} />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => go('alerts')}
                className="relative flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
                aria-label={unread ? l(`Updates, ${unread} new`, `सूचनाएँ, ${unread} नई`) : l('Updates', 'सूचनाएँ')}
              >
                <Bell className="h-6 w-6" aria-hidden />
                {unread > 0 && <span className="absolute right-0.5 top-0.5 min-w-5 rounded-full bg-red-700 px-1 text-center text-xs font-bold leading-5 text-white">{unread > 9 ? '9+' : unread}</span>}
              </button>
              <button type="button" onClick={() => go('help')} className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100" aria-label={l('Help and settings', 'सहायता और सेटिंग')}>
                <CircleHelp className="h-6 w-6" aria-hidden />
              </button>
              <LangSwitch />
            </div>
          </div>
        </header>
        <OfflineSync onSent={refresh} />

        {health?.demo_data && (
          <p className="bg-saffron-50 px-4 py-1.5 text-center text-sm text-amber-900">
            {l('Demo: the map and numbers show sample complaints.', 'डेमो: नक्शे और आँकड़ों में नमूना शिकायतें हैं।')}
          </p>
        )}

        <main id="main" ref={main} tabIndex={-1} key={tab} className="animate-rise mx-auto w-full max-w-6xl flex-1 px-4 py-5">
          {tab === 'home' && <CitizenHome meta={meta} onReport={(c?: Category) => go('report', c)} onTrack={(code) => go('track', code)} onSafety={() => go('safety')} />}
          {tab === 'report' && <ReportWizard key={arg ?? 'none'} meta={meta} categoryHint={arg as Category | undefined} onTrack={(code) => go('track', code)} onMine={() => go('mine')} />}
          {tab === 'mine' && <MyComplaints onOpen={(code) => go('track', code)} onReport={() => go('report')} />}
          {tab === 'map' && <CitizenMap meta={meta} onReport={(c) => go('report', c)} />}
          {tab === 'safety' && <SafetyView meta={meta} onReport={() => go('report')} />}
          {tab === 'alerts' && <CitizenNotifications onOpen={(code) => go('track', code)} onSeen={() => setUnread(0)} />}
          {tab === 'track' && <TrackView key={arg ?? 'none'} initialCode={arg} />}
          {tab === 'help' && <HelpView meta={meta} />}
        </main>

        <footer className="hidden border-t border-slate-200 bg-white lg:block">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" aria-hidden /> {l('Your words and photos are seen only by municipal officials.', 'आपके शब्द और फ़ोटो केवल नगर अधिकारी देखते हैं।')}
            </span>
            <a href="/official" className="font-bold text-brand-700 underline">
              {l('Officials login', 'अधिकारी लॉगिन')}
            </a>
          </div>
        </footer>

        <BottomNav items={nav} active={navActive} onChange={(t) => go(t)} />
      </div>
    </ToastProvider>
  )
}
