import { CheckCircle2, ChevronRight, Flame, Landmark, MapPin, Search, ThumbsUp, TriangleAlert, Users, X } from 'lucide-react'
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
  const { lang } = useLang()
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
        <label className="card flex items-center gap-2 px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" aria-hidden />
          <select
            value={area}
            onChange={(e) => {
              setArea(e.target.value)
              setSelected(null)
            }}
            className="w-full bg-transparent text-sm outline-none"
            aria-label="Choose an area"
          >
            <option value="">All of {CITY}</option>
            {meta?.localities.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          {loc && <span className="pill pill-zone">Ward</span>}
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ['hotspots', 'Critical hotspots', 'bg-red-50 text-red-700 ring-red-200', 'bg-red-600 text-white ring-red-600'],
              ['active', 'Active', 'bg-white text-slate-700 ring-slate-300', 'bg-brand-700 text-white ring-brand-700'],
              ['resolved', 'Resolved', 'bg-white text-slate-700 ring-slate-300', 'bg-brand-700 text-white ring-brand-700'],
            ] as const
          ).map(([id, label, idle, on]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ${filter === id ? on : idle}`}
            >
              {id === 'hotspots' ? <span className="h-2 w-2 rounded-full bg-current" /> : id === 'active' ? <TriangleAlert className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {label} ({counts[id]})
            </button>
          ))}
          <div className="ml-auto flex shrink-0 overflow-hidden rounded-full text-xs font-semibold ring-1 ring-slate-300" role="group" aria-label="Map style">
            {(['points', 'heat'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`px-3 py-1.5 ${view === v ? 'bg-navy-900 text-white' : 'bg-white text-slate-600'}`}
              >
                {v === 'points' ? 'Issues' : 'Heat'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Problem type">
        <button
          type="button"
          onClick={() => setCat('')}
          aria-pressed={cat === ''}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${cat === '' ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-slate-700 ring-slate-300'}`}
        >
          All types
        </button>
        {(['road_damage', 'garbage', 'drainage', 'water_supply', 'streetlight', 'traffic', 'stray_animals', 'electricity'] as Category[]).map((c) => {
          const Icon = CATEGORY_ICON[c]
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCat(cat === c ? '' : c)}
              aria-pressed={cat === c}
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${cat === c ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-slate-700 ring-slate-300'}`}
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
                <div className="truncate font-semibold">{selected.label}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selected.status === 'resolved' ? (
                    <span className="pill pill-ok">Fixed in {selected.days_open} days</span>
                  ) : (
                    <span className={`pill ${TIER_PILL[selected.tier].cls}`}>{TIER_PILL[selected.tier].label}</span>
                  )}
                  {selected.overdue && <span className="pill pill-crit">Past deadline</span>}
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {selected.reports} citizen report{selected.reports > 1 ? 's' : ''} merged
                  {selected.confirmations ? ` · ${selected.confirmations} neighbours confirmed` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded p-1 hover:bg-slate-100" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-surface-low px-3 py-2 text-xs">
              <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-slate-700">
                <Landmark className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{selected.department}</span>
              </span>
              {selected.status !== 'resolved' && (
                <button
                  type="button"
                  disabled={confirmed.includes(selected.id)}
                  onClick={() => plusOne(selected)}
                  className="btn btn-primary min-h-0 shrink-0 px-2.5 py-1 text-xs"
                >
                  <ThumbsUp className="h-3.5 w-3.5" /> {confirmed.includes(selected.id) ? 'Confirmed' : '+1'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Ward performance & hotspots */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-bold sm:text-2xl">{loc ? `${loc.name} performance` : 'Ward performance & hotspots'}</h2>
            <p className="text-sm text-slate-600">
              {loc ? `${areaStats?.open ?? 0} active issues · ${areaStats?.overdue ?? 0} past deadline` : `${counts.active} active civic issues across ${CITY}`}
            </p>
          </div>
          <button type="button" onClick={() => onReport()} className="btn btn-primary hidden sm:inline-flex">
            Report a problem
          </button>
        </div>

        <div className="card space-y-2 p-4">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Grievance distribution</span>
            <span className="text-xs text-slate-500">open issues by type</span>
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
          <SectionHeader title="Vulnerability hotspot clusters" right={<span className="text-xs font-semibold text-saffron-700">{hotspots.length} clusters</span>} />
          <ul className="space-y-2">
            {hotspots.length === 0 && <li className="card p-4 text-sm text-slate-500">No recurring hotspot here.</li>}
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
                        <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">{h.reports} reports</span>
                      </span>
                      <span className="text-xs text-slate-600">
                        {h.issues} recurring {h.category_label.toLowerCase()} issues in 90 days
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
            <h3 className="text-sm font-semibold">How each department is doing</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Department</th>
                  <th className="px-3 py-2 text-right font-semibold">Open</th>
                  <th className="hidden px-3 py-2 text-right font-semibold sm:table-cell">Fixed</th>
                  <th className="hidden px-3 py-2 text-right font-semibold sm:table-cell">Typical fix</th>
                  <th className="px-3 py-2 text-right font-semibold">On time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary?.departments
                  .filter((d) => d.open + d.resolved > 0)
                  .map((d) => (
                    <tr key={d.department}>
                      <td className="px-3 py-2">{d.department}</td>
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
            <Users className="h-3.5 w-3.5" /> Locations are shown to ~100 m. Complaint text and photos stay private.
          </p>
        </div>
      </section>
    </div>
  )
}
