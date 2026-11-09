import { CheckCircle2, ChevronRight, Flame, Landmark, MapPin, ThumbsUp, TriangleAlert, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { api, type Category, type MapPoint, type Meta, type PublicSummary } from '../api'
import { CATEGORY_HI, useLang } from '../i18n'
import { confirmedIssues, rememberConfirmed } from '../myComplaints'
import { CATEGORY_META, fmtHours } from '../ui'
import { HeatLayer } from './HeatLayer'
import { CATEGORY_ICON, CITY, SectionHeader, TIER_PILL } from './Shell'

const JAIPUR: [number, number] = [26.885, 75.795]
type Filter = 'hotspots' | 'active' | 'resolved'
const TIER_COLOR = { critical: '#dc2626', high: '#d97706', medium: '#0d9488', low: '#64748b' }

function FlyTo({ center }: { center: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (center) map.flyTo(center, 14, { duration: 0.6 })
  }, [center, map])
  return null
}

export function CitizenMap({ meta, onReport }: { meta: Meta | null; onReport: (c?: Category) => void }) {
  const { lang, l, place, department } = useLang()
  const [points, setPoints] = useState<MapPoint[]>([])
  const [summary, setSummary] = useState<PublicSummary | null>(null)
  const [filter, setFilter] = useState<Filter>('active')
  const [view, setView] = useState<'points' | 'heat'>('points')
  const [area, setArea] = useState('')
  const [selected, setSelected] = useState<MapPoint | null>(null)
  const [cat, setCat] = useState<Category | ''>('')
  const [confirmed, setConfirmed] = useState(confirmedIssues)

  useEffect(() => {
    api.publicMap().then(setPoints).catch(() => {})
    api.publicSummary().then(setSummary).catch(() => {})
  }, [])

  const loc = meta?.localities.find((l) => l.id === area)
  const inArea = points.filter((p) => (!loc || p.locality === loc.name) && (!cat || p.category === cat))
  const counts = {
    hotspots: inArea.filter((p) => p.status !== 'resolved' && (p.tier === 'critical' || p.tier === 'high')).length,
    active: inArea.filter((p) => p.status !== 'resolved').length,
    resolved: inArea.filter((p) => p.status === 'resolved').length,
  }
  const shown = inArea.filter((p) =>
    filter === 'resolved' ? p.status === 'resolved' : filter === 'hotspots' ? p.status !== 'resolved' && (p.tier === 'critical' || p.tier === 'high') : p.status !== 'resolved',
  )
  const heat = useMemo<[number, number, number][]>(() => shown.map((p) => [p.lat, p.lng, Math.min(1, 0.35 + p.reports * 0.12)]), [shown])

  // Grievance distribution among open issues in the selected area
  const dist = useMemo(() => {
    const open = inArea.filter((p) => p.status !== 'resolved')
    const c: Partial<Record<Category, number>> = {}
    open.forEach((p) => (c[p.category] = (c[p.category] ?? 0) + 1))
    return Object.entries(c)
      .map(([k, n]) => ({ k: k as Category, n: n as number, pct: Math.round((100 * (n as number)) / Math.max(1, open.length)) }))
      .sort((a, b) => b.n - a.n)
  }, [inArea])

  const areaStats = summary?.areas.find((a) => a.locality_id === area)
  const hotspots = (summary?.hotspots ?? []).filter((h) => !area || h.locality_id === area)

  async function plusOne(p: MapPoint) {
    try {
      const r = await api.confirm(p.id)
      rememberConfirmed(p.id)
      setConfirmed(confirmedIssues())
      const upd = { ...p, confirmations: r.confirmations }
      setPoints((ps) => ps.map((x) => (x.id === p.id ? upd : x)))
      setSelected(upd)
    } catch {
      /* the button simply stays enabled */
    }
  }

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="space-y-2">
        <label htmlFor="map-area" className="block text-sm font-bold">{l('Area', 'क्षेत्र')}</label>
        <select
            id="map-area"
            value={area}
            onChange={(e) => {
              setArea(e.target.value)
              setSelected(null)
            }}
            className="field"
          >
            <option value="">{l(`All of ${CITY}`, 'पूरा जयपुर')}</option>
            {meta?.localities.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </select>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ['hotspots', l('Most urgent', 'सबसे ज़रूरी'), 'bg-red-50 text-red-700 ring-red-300', 'bg-red-700 text-white ring-red-700'],
              ['active', l('Open', 'खुली'), 'bg-white text-slate-800 ring-slate-400', 'bg-brand-700 text-white ring-brand-700'],
              ['resolved', l('Fixed', 'ठीक हुई'), 'bg-white text-slate-800 ring-slate-400', 'bg-brand-700 text-white ring-brand-700'],
            ] as const
          ).map(([id, label, idle, on]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold ring-1 ${filter === id ? on : idle}`}
            >
              {id === 'hotspots' ? <span className="h-2 w-2 rounded-full bg-current" /> : id === 'active' ? <TriangleAlert className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {label} ({counts[id]})
            </button>
          ))}
          <div className="ml-auto flex shrink-0 overflow-hidden rounded-full text-sm font-bold ring-1 ring-slate-400" role="group" aria-label={l('Map style', 'नक्शे का प्रकार')}>
            {(['points', 'heat'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`min-h-11 px-4 ${view === v ? 'bg-navy-900 text-white' : 'bg-white text-slate-700'}`}
              >
                {v === 'points' ? l('Points', 'बिंदु') : l('Heat', 'घनत्व')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={l('Problem type', 'समस्या का प्रकार')}>
        <button
          type="button"
          onClick={() => setCat('')}
          aria-pressed={cat === ''}
          className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold ring-1 ${cat === '' ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-slate-800 ring-slate-400'}`}
        >
          {l('All types', 'सभी प्रकार')}
        </button>
        {(['road_damage', 'garbage', 'drainage', 'water_supply', 'streetlight', 'traffic', 'stray_animals', 'electricity'] as Category[]).map((c) => {
          const Icon = CATEGORY_ICON[c]
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCat(cat === c ? '' : c)}
              aria-pressed={cat === c}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-4 text-sm font-bold ring-1 ${cat === c ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-slate-800 ring-slate-400'}`}
            >
              <Icon className="h-3.5 w-3.5" /> {lang === 'hi' ? CATEGORY_HI[c] : CATEGORY_META[c].label}
            </button>
          )
        })}
      </div>

      {/* Map with selected-incident card */}
      <div className="card relative overflow-hidden">
        <div className="h-[420px] sm:h-[480px]">
          <MapContainer center={JAIPUR} zoom={12} scrollWheelZoom={false} className="h-full w-full !rounded-none">
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FlyTo center={loc ? [loc.lat, loc.lng] : null} />
            {view === 'heat' && heat.length > 0 && <HeatLayer points={heat} />}
            {view === 'points' &&
              shown.map((p) => (
                <CircleMarker
                  key={p.id}
                  center={[p.lat, p.lng]}
                  radius={5 + Math.min(10, (p.reports + p.confirmations) * 1.4)}
                  eventHandlers={{ click: () => setSelected(p) }}
                  pathOptions={{
                    color: selected?.id === p.id ? '#0f172a' : '#fff',
                    weight: selected?.id === p.id ? 3 : 1.5,
                    fillColor: p.status === 'resolved' ? '#16a34a' : TIER_COLOR[p.tier],
                    fillOpacity: 0.85,
                  }}
                >
                  <Tooltip>{p.label}</Tooltip>
                </CircleMarker>
              ))}
          </MapContainer>
        </div>
        {selected && (
          <div className="card-raised absolute inset-x-3 bottom-3 z-[500] p-3 sm:left-auto sm:right-3 sm:w-96">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-saffron-100 text-saffron-700">
                <MapPin className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-bold leading-snug">{place(selected.label, selected.category)}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selected.status === 'resolved' ? (
                    <span className="pill pill-ok">{l(`Fixed in ${selected.days_open} days`, `${selected.days_open} दिन में ठीक`)}</span>
                  ) : (
                    <span className={`pill ${TIER_PILL[selected.tier].cls}`}>{l(TIER_PILL[selected.tier].label, { critical: 'बहुत ज़रूरी', high: 'ज़रूरी', medium: 'मध्यम', low: 'सामान्य' }[selected.tier])}</span>
                  )}
                  {selected.overdue && <span className="pill pill-crit">{l('Past deadline', 'समय-सीमा पार')}</span>}
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {l(`${selected.reports + selected.confirmations} people reported this`, `${selected.reports + selected.confirmations} लोगों ने बताया`)}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded hover:bg-slate-100" aria-label={l('Close', 'बंद करें')}>
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-surface-low px-3 py-2 text-xs">
              <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-slate-700">
                <Landmark className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{department(selected.department)}</span>
              </span>
              {selected.status !== 'resolved' && (
                <button
                  type="button"
                  disabled={confirmed.includes(selected.id)}
                  onClick={() => plusOne(selected)}
                  className="btn btn-primary shrink-0 text-sm"
                >
                  <ThumbsUp className="h-3.5 w-3.5" /> {confirmed.includes(selected.id) ? l('Confirmed', 'पुष्टि हुई') : l('I saw this too', 'मैंने भी देखा')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <details className="card p-4">
        <summary className="min-h-11 cursor-pointer text-sm font-bold">{l(`See these ${shown.length} problems as a list`, `इन ${shown.length} समस्याओं को सूची में देखें`)}</summary>
        <ul className="mt-2 divide-y divide-slate-200">
          {shown.slice(0, 40).map((p) => (
            <li key={p.id} className="py-2 text-sm">
              <b>{place(p.label, p.category)}</b> · {department(p.department)}
              {p.overdue && <b className="text-red-700"> · {l('Past deadline', 'समय-सीमा पार')}</b>}
            </li>
          ))}
        </ul>
      </details>

      {/* Ward performance & hotspots */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-bold sm:text-2xl">{loc ? l(`${loc.name}: how it is doing`, `${loc.name}: काम कैसा है`) : l('How each area is doing', 'हर क्षेत्र का काम कैसा है')}</h2>
            <p className="text-sm text-slate-600">
              {loc ? l(`${areaStats?.open ?? 0} open · ${areaStats?.overdue ?? 0} past deadline`, `${areaStats?.open ?? 0} खुली · ${areaStats?.overdue ?? 0} समय-सीमा पार`) : l(`${counts.active} open problems across ${CITY}`, `पूरे जयपुर में ${counts.active} खुली समस्याएँ`)}
            </p>
          </div>
          <button type="button" onClick={() => onReport()} className="btn btn-primary hidden sm:inline-flex">
            {l('Report a problem', 'समस्या दर्ज करें')}
          </button>
        </div>

        <div className="card space-y-2 p-4">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>{l('Open problems by type', 'प्रकार के अनुसार खुली समस्याएँ')}</span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
            {dist.map((d) => (
              <span key={d.k} style={{ width: `${d.pct}%`, background: CATEGORY_META[d.k].color }} title={`${CATEGORY_META[d.k].label} ${d.pct}%`} />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            {dist.map((d) => (
              <li key={d.k} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_META[d.k].color }} />
                {lang === 'hi' ? CATEGORY_HI[d.k] : CATEGORY_META[d.k].label}: {d.pct}% ({d.n})
              </li>
            ))}
          </ul>
        </div>

        <div>
          <SectionHeader title={l('Places with repeated problems', 'बार-बार समस्या वाली जगहें')} />
          <ul className="space-y-2">
            {hotspots.length === 0 && <li className="card p-4 text-sm text-slate-500">{l('No repeated problems here.', 'यहाँ बार-बार की समस्या नहीं।')}</li>}
            {hotspots.map((h) => {
              const Icon = CATEGORY_ICON[h.category]
              return (
                <li key={`${h.locality_id}-${h.category}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setArea(h.locality_id)
                      setFilter('active')
                    }}
                    className="card flex w-full items-center gap-3 p-3 text-left hover:border-brand-500"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{h.locality}</span>
                        <span className="rounded bg-red-700 px-1.5 py-0.5 text-xs font-bold text-white">{l(`${h.reports} reports`, `${h.reports} शिकायतें`)}</span>
                      </span>
                      <span className="text-xs text-slate-600">
                        {l(`${h.issues} ${h.category_label.toLowerCase()} problems in 90 days`, `90 दिन में ${CATEGORY_HI[h.category]} की ${h.issues} समस्याएँ`)}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <Flame className="h-4 w-4 text-brand-700" />
            <h3 className="text-sm font-semibold">{l('How each department is doing', 'हर विभाग का काम')}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">{l('Department', 'विभाग')}</th>
                  <th className="px-3 py-2 text-right font-semibold">{l('Open', 'खुली')}</th>
                  <th className="hidden px-3 py-2 text-right font-semibold sm:table-cell">{l('Fixed', 'ठीक')}</th>
                  <th className="hidden px-3 py-2 text-right font-semibold sm:table-cell">{l('Typical fix', 'आम समय')}</th>
                  <th className="px-3 py-2 text-right font-semibold">{l('On time', 'समय पर')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary?.departments
                  .filter((d) => d.open + d.resolved > 0)
                  .map((d) => (
                    <tr key={d.department}>
                      <td className="px-3 py-2">{department(d.department)}</td>
                      <td className="px-3 py-2 text-right tnum">{d.open}</td>
                      <td className="hidden px-3 py-2 text-right tnum sm:table-cell">{d.resolved}</td>
                      <td className="hidden px-3 py-2 text-right tnum sm:table-cell">{d.median_resolution_hours === null ? '—' : fmtHours(d.median_resolution_hours)}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`pill ${d.sla_compliance_pct === null ? 'pill-zone' : d.sla_compliance_pct >= 75 ? 'pill-ok' : d.sla_compliance_pct >= 50 ? 'pill-warn' : 'pill-crit'}`}>
                          {d.sla_compliance_pct === null ? '—' : `${d.sla_compliance_pct}%`}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="flex items-center gap-1.5 border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            <Users className="h-3.5 w-3.5" /> {l('Locations are shown to about 100 metres. Complaint text and photos stay private.', 'जगहें लगभग 100 मीटर तक दिखती हैं। शिकायत का पाठ और फ़ोटो निजी रहते हैं।')}
          </p>
        </div>
      </section>
    </div>
  )
}
