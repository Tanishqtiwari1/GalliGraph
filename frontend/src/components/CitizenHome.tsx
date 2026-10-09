import {
  Ambulance,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  Info,
  ListChecks,
  MapPin,
  MessageSquareText,
  Phone,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  ThumbsUp,
  Timer,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import { api, type Category, type MapPoint, type Meta, type PublicSummary, type TrackResult } from '../api'
import { CATEGORY_HI, useLang } from '../i18n'
import { confirmedIssues, myCodes, rememberConfirmed } from '../myComplaints'
import { CATEGORY_META, fmtDate, timeAgo } from '../ui'
import { HeatLayer } from './HeatLayer'
import { CountUp } from './Kit'
import { BRAND, CATEGORY_ICON, CITY, Kpi, SectionHeader } from './Shell'

const JAIPUR: [number, number] = [26.885, 75.795]
const GRID_CATEGORIES: Category[] = ['road_damage', 'garbage', 'water_supply', 'drainage', 'streetlight', 'traffic', 'stray_animals', 'electricity']

interface Props {
  meta: Meta | null
  onReport: (category?: Category) => void
  onTrack: (code?: string) => void
  onMap: () => void
}

export function CitizenHome({ meta, onReport, onTrack, onMap }: Props) {
  const { t, lang } = useLang()
  const [summary, setSummary] = useState<PublicSummary | null>(null)
  const [points, setPoints] = useState<MapPoint[]>([])
  const [area, setArea] = useState('')
  const [trackInput, setTrackInput] = useState('')
  const [showTrack, setShowTrack] = useState(false)
  const [mine, setMine] = useState<TrackResult | null>(null)
  const [confirmed, setConfirmed] = useState<number[]>(confirmedIssues)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    api.publicSummary().then(setSummary).catch(() => {})
    api.publicMap().then(setPoints).catch(() => {})
    const code = myCodes()[0]
    if (code) api.track(code).then(setMine).catch(() => {})
  }, [])

  const openCounts = summary?.by_category
  const heat = useMemo<[number, number, number][]>(
    () => points.filter((p) => p.status !== 'resolved').map((p) => [p.lat, p.lng, Math.min(1, 0.35 + p.reports * 0.12)]),
    [points],
  )
  const areaName = meta?.localities.find((l) => l.id === area)?.name
  const nearby = points
    .filter((p) => p.status !== 'resolved' && (!areaName || p.locality === areaName))
    .sort((a, b) => b.reports + b.confirmations - (a.reports + a.confirmations))
    .slice(0, 5)

  async function plusOne(p: MapPoint) {
    try {
      const r = await api.confirm(p.id)
      rememberConfirmed(p.id)
      setConfirmed(confirmedIssues())
      setPoints((ps) => ps.map((x) => (x.id === p.id ? { ...x, confirmations: r.confirmations } : x)))
      setToast(r.already ? 'You already confirmed this one.' : 'Thanks. Your +1 raises its priority.')
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Could not record your +1')
    }
    setTimeout(() => setToast(null), 3000)
  }

  const s = summary
  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-xl bg-surface-low p-5 sm:p-7">
        <div className="pointer-events-none absolute -bottom-10 -right-10 h-48 w-48 rounded-full bg-brand-600/5" />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="pill border-transparent bg-white text-brand-700 shadow-sm">
            <MapPin className="h-3.5 w-3.5" /> JMC · {CITY}
          </span>
          <span className="pill border-transparent bg-surface-high text-slate-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-600" /> Live sync
          </span>
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">
          {t('heroTitle')}
          <br />
          <span className="text-brand-700">Your {BRAND}.</span>
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-variant sm:text-base">{t('heroSub')}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => onReport()} className="btn btn-primary h-12 px-6 shadow-sm">
            <MessageSquareText className="h-5 w-5" /> + {t('reportIssue')}
          </button>
          <button type="button" onClick={() => setShowTrack((v) => !v)} className="btn h-12 bg-white px-6 text-navy-900 shadow-sm hover:bg-slate-50">
            <ScanSearch className="h-5 w-5 text-slate-500" /> {t('trackComplaint')} #
          </button>
        </div>
        {showTrack && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              onTrack(trackInput)
            }}
            className="mt-3 flex max-w-md items-center gap-1 rounded-xl bg-white p-1 shadow-sm"
          >
            <ScanSearch className="ml-2 h-4 w-4 text-slate-400" aria-hidden />
            <input
              value={trackInput}
              onChange={(e) => setTrackInput(e.target.value.toUpperCase())}
              placeholder="Tracking code, e.g. JA-7KQ2-9XPM"
              aria-label="Tracking code"
              maxLength={12}
              className="w-full bg-transparent px-2 py-2 font-mono text-sm outline-none"
            />
            <button type="submit" className="btn btn-primary min-h-0 px-3 py-1.5 text-xs">
              Check
            </button>
          </form>
        )}
      </section>

      {/* Live ticker of recently fixed problems */}
      {points.some((p) => p.status === 'resolved') && (
        <div className="card flex items-center gap-3 overflow-hidden py-2 pl-3">
          <span className="pill pill-ok shrink-0">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" /> Recently fixed
          </span>
          <div className="relative min-w-0 flex-1 overflow-hidden" aria-label="Recently fixed problems">
            <div className="animate-ticker flex w-max gap-8 whitespace-nowrap text-sm">
              {[0, 1].map((dup) =>
                points
                  .filter((p) => p.status === 'resolved')
                  .slice(0, 12)
                  .map((p) => (
                    <span key={`${dup}-${p.id}`} className="inline-flex items-center gap-1.5 text-slate-700" aria-hidden={dup === 1}>
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {p.label}
                      <span className="text-xs text-slate-500">fixed in {p.days_open} days</span>
                    </span>
                  )),
              )}
            </div>
          </div>
        </div>
      )}

      {/* Civic health snapshot */}
      <section>
        <SectionHeader title={t('healthSnapshot')} right={<span className="pill pill-info">Last {s?.window_days ?? 30} days</span>} />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Kpi icon={ListChecks} label="Active reports" value={<CountUp value={s?.active_issues} />} hint={`${CITY} wards`} />
          <Kpi icon={Sparkles} tone="primary" label="AI triage time" value={s ? <CountUp value={s.avg_triage_ms} suffix=" ms" /> : '–'} hint="zero manual sorting" />
          <Kpi icon={CheckCircle2} label="On-time fixes" value={<CountUp value={s?.on_time_pct} decimals={1} suffix="%" />} hint="within promised deadline" />
          <Kpi icon={Timer} label="Median resolution" value={<CountUp value={s?.median_fix_days} decimals={1} suffix=" d" />} hint={s ? `${s.issues_resolved} fixed` : ''} />
        </div>
      </section>

      {/* Category grid */}
      <section>
        <SectionHeader title={t('whatIssue')} sub={t('tapToFile')} right={<span className="text-xs font-semibold text-brand-700">{GRID_CATEGORIES.length} categories</span>} />
        <div className="stagger grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GRID_CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c]
            return (
              <button
                key={c}
                type="button"
                onClick={() => onReport(c)}
                className="card lift flex h-24 flex-col justify-between p-3 text-left hover:border-brand-500 hover:bg-brand-50/40"
              >
                <div className="flex w-full items-start justify-between">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-brand-700">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="rounded-full bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 tnum">
                    {openCounts?.[c] ?? 0} {t('open')}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {lang === 'hi' ? CATEGORY_HI[c] : CATEGORY_META[c].label}
                  </span>
                  <span className="text-[11px] text-slate-500">{lang === 'hi' ? CATEGORY_META[c].label : CATEGORY_HI[c]}</span>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* How it works */}
        <section className="card p-4 sm:p-5">
          <SectionHeader title={t('howItWorks')} right={<span className="text-xs font-semibold text-brand-700">AI powered</span>} />
          <ol className="space-y-3">
            {[
              ['Speak or snap', 'Write in Hindi, Hinglish or English and add a photo. AI pulls out the problem, location and urgency.'],
              ['Smart clustering & routing', 'Repeat reports from neighbours are merged into one issue, and it goes straight to the right department.'],
              ['Deadline & photo proof', 'Every issue gets a deadline. It is closed only after an after-repair photo is checked.'],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-3 rounded-lg bg-surface-low p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
                <div>
                  <div className="text-sm font-semibold">{title}</div>
                  <p className="text-xs text-slate-600">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Your active grievance */}
        <section className="card p-4 sm:p-5">
          <SectionHeader
            title={t('yourGrievance')}
            right={mine && <span className={`pill ${mine.status === 'resolved' ? 'pill-ok' : 'pill-warn'}`}>{mine.status.replace('_', ' ')}</span>}
          />
          {!mine ? (
            <div className="flex h-full flex-col items-start gap-2 text-sm text-slate-600">
              <p>You haven't reported anything from this device yet.</p>
              <button type="button" onClick={() => onReport()} className="btn btn-ghost">
                Report your first issue
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="font-mono text-xs font-semibold text-slate-500">{mine.tracking_code}</div>
                <div className="font-display text-lg font-bold">{mine.label}</div>
                <span className="pill pill-info mt-1">{mine.department.split(' (')[0]}</span>
              </div>
              <ol className="space-y-2 text-sm">
                {mine.timeline.slice(-3).map((e, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                    <span className="flex-1">{e.message}</span>
                    <span className="text-xs text-slate-500">{fmtDate(e.at)}</span>
                  </li>
                ))}
                {mine.deadline.due_at && mine.status !== 'resolved' && (
                  <li className="flex items-start gap-2 text-slate-500">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0" /> <span className="flex-1">Target fix date</span>
                    <span className="text-xs">{fmtDate(mine.deadline.due_at)}</span>
                  </li>
                )}
              </ol>
              <button type="button" onClick={() => onTrack(mine.tracking_code)} className="btn btn-ghost w-full">
                View full timeline <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Known problems */}
      {s && s.notices.length > 0 && (
        <div className="space-y-2">
          {s.notices.map((n) => (
            <div key={`${n.locality}-${n.category}`} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-saffron-50 p-3 text-sm text-amber-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <b>Known problem:</b> {n.message} You can still report it or add your +1 below.
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Nearby issues with +1 */}
      <section>
        <SectionHeader
          title={t('nearby')}
          sub={t('nearbySub')}
          right={
            <select value={area} onChange={(e) => setArea(e.target.value)} className="field w-auto py-1 text-xs" aria-label="Filter by area">
              <option value="">All areas</option>
              {meta?.localities.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          }
        />
        <ul className="space-y-2">
          {nearby.length === 0 && <li className="card p-4 text-sm text-slate-500">No open problems reported here right now.</li>}
          {nearby.map((p) => {
            const Icon = CATEGORY_ICON[p.category]
            const done = confirmed.includes(p.id)
            return (
              <li key={p.id} className="card p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-brand-700">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{p.label}</span>
                      <span className={`pill ${p.overdue ? 'pill-crit' : p.status === 'in_progress' ? 'pill-warn' : 'pill-zone'}`}>
                        {p.overdue ? 'Overdue' : p.status === 'in_progress' ? 'Assigned' : 'In queue'}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {p.department.split(' (')[0]} · reported {timeAgo(p.first_reported)}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                    <Users className="h-3.5 w-3.5" /> {p.reports + p.confirmations} neighbours reported
                  </span>
                  <button
                    type="button"
                    disabled={done}
                    onClick={() => plusOne(p)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      done ? 'bg-brand-50 text-brand-700' : 'text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50'
                    }`}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" /> {done ? 'You confirmed' : t('haveThisToo')}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        {/* Heatmap preview */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="section-label">{t('wardHeatmap')}</h2>
            <span className="pill pill-info">Interactive</span>
          </div>
          <div className="h-56 p-3">
            <MapContainer center={JAIPUR} zoom={11} scrollWheelZoom={false} dragging={false} zoomControl={false} className="h-full w-full">
              <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {heat.length > 0 && <HeatLayer points={heat} />}
            </MapContainer>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-sm">
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <Flame className="h-4 w-4 text-red-600" />
              {s?.hotspots[0] ? `${s.hotspots[0].locality} hotspot (${s.hotspots[0].issues} issues)` : 'Hotspots'}
            </span>
            <button type="button" onClick={onMap} className="inline-flex items-center gap-0.5 font-semibold text-brand-700">
              Open map <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* Emergency contacts (national numbers) */}
        <section className="card p-4 sm:p-5">
          <div className="mb-1 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-600" />
            <h2 className="font-display text-base font-bold">{t('emergency')}</h2>
          </div>
          <p className="mb-3 text-xs text-slate-600">
            For life-threatening danger (live wires, fire, collapse, a person hurt) call now. Don't wait for a complaint.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { n: '112', l: 'Emergency', icon: Phone },
              { n: '101', l: 'Fire', icon: Flame },
              { n: '108', l: 'Ambulance', icon: Ambulance },
            ].map(({ n, l, icon: Icon }) => (
              <a key={n} href={`tel:${n}`} className="card flex flex-col items-center gap-0.5 p-3 hover:border-red-300">
                <Icon className="h-4 w-4 text-red-600" aria-hidden />
                <span className="font-display text-xl font-bold tnum">{n}</span>
                <span className="text-[11px] text-slate-500">{l}</span>
              </a>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
            <Bot className="h-3.5 w-3.5" /> Complaints with life-safety risk are auto-flagged P0 for the department.
          </p>
        </section>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-[950] mx-auto w-fit rounded-lg bg-navy-900 px-4 py-2 text-sm text-white shadow-lg lg:bottom-6" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
