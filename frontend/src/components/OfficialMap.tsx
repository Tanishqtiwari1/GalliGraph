import { ArrowRight, CheckCircle2, ChevronRight, Download, Landmark, MapPin, Search, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api, type Alert, type Category, type Issue, type Meta } from '../api'
import { CATEGORY_HI } from '../i18n'
import { CATEGORY_META } from '../ui'
import { AlertsPanel } from './AlertsPanel'
import { IssueMap } from './IssueMap'
import { CATEGORY_ICON, CITY, SectionHeader, TIER_PILL } from './Shell'

type Filter = 'hotspots' | 'active' | 'resolved'

interface Hotspot {
  locality_id: string
  locality: string
  category: Category
  category_label: string
  issues: number
  reports: number
}

function toCsv(rows: Issue[]): string {
  const cols = ['id', 'category', 'sub_type', 'summary', 'locality', 'lat', 'lng', 'status', 'priority_score', 'sla_tier', 'sla_due_at', 'report_count', 'department', 'first_reported']
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc((r as unknown as Record<string, unknown>)[c])).join(','))].join('\n')
}

export function OfficialMap({ meta, refreshKey, onTriage }: { meta: Meta | null; refreshKey: number; onTriage: (id: number) => void }) {
  const [issues, setIssues] = useState<Issue[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [hotspots, setHotspots] = useState<Hotspot[]>([])
  const [filter, setFilter] = useState<Filter>('active')
  const [area, setArea] = useState('')
  const [selected, setSelected] = useState<Issue | null>(null)

  useEffect(() => {
    api.issues({ status: '', since_days: 90, limit: 1000 }).then(setIssues).catch(() => {})
    api.alerts().then(setAlerts).catch(() => {})
    fetch('/api/hotspots?limit=8', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : []))
      .then(setHotspots)
      .catch(() => {})
  }, [refreshKey])

  const loc = meta?.localities.find((l) => l.id === area)
  const inArea = issues.filter((i) => !area || i.locality_id === area)
  const counts = {
    hotspots: inArea.filter((i) => i.status !== 'resolved' && (i.sla_tier === 'critical' || i.sla_tier === 'high')).length,
    active: inArea.filter((i) => i.status !== 'resolved').length,
    resolved: inArea.filter((i) => i.status === 'resolved').length,
  }
  const shown = inArea.filter((i) =>
    filter === 'resolved' ? i.status === 'resolved' : filter === 'hotspots' ? i.status !== 'resolved' && (i.sla_tier === 'critical' || i.sla_tier === 'high') : i.status !== 'resolved',
  )
  const dist = useMemo(() => {
    const open = inArea.filter((i) => i.status !== 'resolved')
    const c: Partial<Record<Category, number>> = {}
    open.forEach((i) => (c[i.category] = (c[i.category] ?? 0) + 1))
    return Object.entries(c)
      .map(([k, n]) => ({ k: k as Category, n: n as number, pct: Math.round((100 * (n as number)) / Math.max(1, open.length)) }))
      .sort((a, b) => b.n - a.n)
  }, [inArea])

  function exportCsv() {
    const blob = new Blob([toCsv(shown)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `galligraph-${loc?.id ?? 'jaipur'}-${filter}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="card flex items-center gap-2 px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" aria-hidden />
          <select value={area} onChange={(e) => setArea(e.target.value)} className="w-full bg-transparent text-sm outline-none" aria-label="Ward">
            <option value="">All wards · {CITY}</option>
            {meta?.localities.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ['hotspots', 'Critical hotspots', 'bg-red-50 text-red-700 ring-red-200', 'bg-red-600 text-white ring-red-600'],
              ['active', 'Active', 'bg-white text-slate-700 ring-slate-300', 'bg-brand-700 text-white ring-brand-700'],
              ['resolved', 'Resolved (90 d)', 'bg-white text-slate-700 ring-slate-300', 'bg-brand-700 text-white ring-brand-700'],
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
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="card relative overflow-hidden">
          <div className="h-[460px] p-2">
            <IssueMap issues={shown} alerts={alerts} selectedId={selected?.id ?? null} onSelect={(id) => setSelected(issues.find((i) => i.id === id) ?? null)} />
          </div>
          {selected && (
            <div className="card-raised absolute inset-x-3 bottom-3 z-[500] p-3 sm:left-auto sm:right-3 sm:w-96">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-saffron-100 text-saffron-700">
                  <MapPin className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 font-semibold">{selected.summary}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selected.sla_tier && <span className={`pill ${TIER_PILL[selected.sla_tier].cls}`}>{TIER_PILL[selected.sla_tier].label}</span>}
                    {selected.sla.overdue && <span className="pill pill-crit">Overdue</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{selected.report_count} citizen reports merged</p>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="rounded p-1 hover:bg-slate-100" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-surface-low px-3 py-2 text-xs">
                <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-slate-700">
                  <Landmark className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{selected.department}</span>
                </span>
                <button type="button" onClick={() => onTriage(selected.id)} className="btn btn-primary min-h-0 shrink-0 px-2.5 py-1 text-xs">
                  Triage incident <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Spike alerts ({alerts.length})</div>
            <div className="max-h-72 overflow-y-auto">
              <AlertsPanel alerts={alerts} />
            </div>
          </div>
          <div className="card space-y-2 p-4">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Grievance distribution</span>
              <span className="text-xs text-slate-500">{loc?.name ?? CITY}</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
              {dist.map((d) => (
                <span key={d.k} style={{ width: `${d.pct}%`, background: CATEGORY_META[d.k].color }} />
              ))}
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {dist.map((d) => (
                <li key={d.k} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_META[d.k].color }} />
                  {CATEGORY_META[d.k].label}: {d.pct}% ({d.n})
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <section>
        <SectionHeader title="Vulnerability hotspot clusters" right={<span className="text-xs font-semibold text-saffron-700">{alerts.length} active alerts</span>} />
        <div className="grid gap-2 md:grid-cols-2">
          {hotspots.map((h) => {
            const Icon = CATEGORY_ICON[h.category]
            return (
              <button
                key={`${h.locality_id}-${h.category}`}
                type="button"
                onClick={() => {
                  setArea(h.locality_id)
                  setFilter('active')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="card flex items-center gap-3 p-3 text-left hover:border-brand-500"
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
                    {h.issues} {h.category_label.toLowerCase()} issues in 90 days · {CATEGORY_HI[h.category]}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            )
          })}
        </div>
      </section>

      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={exportCsv} className="btn h-12 bg-surface text-navy-900 hover:bg-surface-high">
          <Download className="h-4 w-4" /> Export GIS dataset (CSV)
        </button>
        <a href="/official#triage" className="btn btn-primary h-12">
          Open triage queue <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  )
}
