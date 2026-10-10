import { Download, Filter, Hourglass, RotateCcw, Search, Siren, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api, type Issue, type IssueFilters, type Meta } from '../api'
import { fmtHours, STATUS_META, timeAgo } from '../ui'
import { Skeleton } from './Kit'
import type { ComplaintFilter } from './OverviewView'
import { CATEGORY_ICON, displayId, TIER_PILL } from './Shell'

const PRESETS: Record<NonNullable<ComplaintFilter['preset']>, { label: string; q: IssueFilters }> = {
  untriaged: { label: 'Untriaged', q: { untriaged: true } },
  high: { label: 'High priority', q: { status: 'active' } },
  unassigned: { label: 'Unassigned', q: { unassigned: true } },
  overdue: { label: 'Overdue', q: { overdue: true, sort: 'deadline' } },
  disputed: { label: 'Citizen disputes', q: { disputed: true } },
  review: { label: 'Resolution review', q: { status: 'needs_verification' } },
}

export function ComplaintsView({ meta, refreshKey, initial, openIssue }: { meta: Meta | null; refreshKey: number; initial?: ComplaintFilter; openIssue: (id: number) => void }) {
  const [preset, setPreset] = useState(initial?.preset)
  const [status, setStatus] = useState('active')
  const [tier, setTier] = useState('')
  const [category, setCategory] = useState('')
  const [department, setDepartment] = useState('')
  const [area, setArea] = useState('')
  const [since, setSince] = useState('')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Issue[] | null>(null)

  useEffect(() => {
    setPreset(initial?.preset)
  }, [initial])

  useEffect(() => {
    setRows(null)
    const base: IssueFilters = preset
      ? { ...PRESETS[preset].q }
      : { status, tier, category, department, locality_id: area, since_days: since ? Number(since) : undefined }
    api.issues({ sort: 'priority', limit: 500, ...base }).then((r) => setRows(preset === 'high' ? r.filter((i) => i.priority_score >= 50) : r)).catch(() => setRows([]))
  }, [preset, status, tier, category, department, area, since, refreshKey])

  const shown = useMemo(
    () => (rows ?? []).filter((i) => !q || `${i.summary} ${i.locality ?? ''} ${i.department} ${displayId(i.id, i.first_reported)} ${(i.tracking_codes ?? []).join(' ')}`.toLowerCase().includes(q.toLowerCase())),
    [rows, q],
  )

  function exportCsv() {
    const cols = ['id', 'summary', 'category', 'locality', 'status', 'priority_score', 'sla_tier', 'sla_due_at', 'report_count', 'department', 'assigned_officer', 'first_reported']
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [cols.join(','), ...shown.map((r) => cols.map((c) => esc((r as unknown as Record<string, unknown>)[c])).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `complaints-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const sel = 'field w-auto py-1.5 text-xs'
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-brand-700">Complaint register</div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">All complaints</h1>
        </div>
        <button type="button" onClick={exportCsv} className="btn btn-ghost">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setPreset(preset === k ? undefined : k)}
            aria-pressed={preset === k}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${preset === k ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-700 ring-slate-300'}`}
          >
            {PRESETS[k].label}
          </button>
        ))}
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
          <Filter className="h-3.5 w-3.5" /> Filters
        </span>
        <label className="flex min-w-48 flex-1 items-center gap-1.5 rounded-md border border-slate-300 px-2">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search JA- code, ID, text, area…" className="w-full py-1.5 text-xs outline-none" aria-label="Search" />
        </label>
        <select disabled={!!preset} value={status} onChange={(e) => setStatus(e.target.value)} className={sel} aria-label="Status">
          <option value="active">Active</option>
          {meta?.statuses.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
          <option value="">All</option>
        </select>
        <select disabled={!!preset} value={tier} onChange={(e) => setTier(e.target.value)} className={sel} aria-label="Priority">
          <option value="">All priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select disabled={!!preset} value={department} onChange={(e) => setDepartment(e.target.value)} className={sel} aria-label="Department">
          <option value="">All departments</option>
          {meta?.departments.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select disabled={!!preset} value={category} onChange={(e) => setCategory(e.target.value)} className={sel} aria-label="Category">
          <option value="">All categories</option>
          {meta?.categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <select disabled={!!preset} value={area} onChange={(e) => setArea(e.target.value)} className={sel} aria-label="Ward">
          <option value="">All wards</option>
          {meta?.localities.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select disabled={!!preset} value={since} onChange={(e) => setSince(e.target.value)} className={sel} aria-label="Date">
          <option value="">Any time</option>
          <option value="1">24 h</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
        </select>
        {(preset || status !== 'active' || tier || category || department || area || since || q) && (
          <button
            type="button"
            onClick={() => {
              setPreset(undefined)
              setStatus('active')
              setTier('')
              setCategory('')
              setDepartment('')
              setArea('')
              setSince('')
              setQ('')
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500">{rows ? `${shown.length} results` : 'Loading…'}</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Incident</th>
                <th className="px-3 py-2 font-semibold">Priority</th>
                <th className="hidden px-3 py-2 font-semibold md:table-cell">Ward</th>
                <th className="hidden px-3 py-2 font-semibold lg:table-cell">Department</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows === null &&
                [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-3 py-2">
                      <Skeleton className="h-8" />
                    </td>
                  </tr>
                ))}
              {rows && shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    No complaints match these filters.
                  </td>
                </tr>
              )}
              {shown.slice(0, 300).map((i) => {
                const Icon = CATEGORY_ICON[i.category]
                const tierKey = i.sla_tier ?? 'low'
                return (
                  <tr key={i.id} onClick={() => openIssue(i.id)} className="cursor-pointer hover:bg-brand-50/40">
                    <td className="max-w-md px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{i.summary}</div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-mono">{displayId(i.id, i.first_reported)}</span>
                            <span className="inline-flex items-center gap-0.5">
                              <Users className="h-3 w-3" /> {i.report_count}
                            </span>
                            <span>{timeAgo(i.last_reported)}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`pill ${TIER_PILL[tierKey].cls}`}>{Math.round(i.priority_score)}</span>
                    </td>
                    <td className="hidden px-3 py-2.5 text-slate-600 md:table-cell">{i.locality ?? '—'}</td>
                    <td className="hidden px-3 py-2.5 text-xs text-slate-600 lg:table-cell">{i.department}</td>
                    <td className="px-3 py-2.5">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ring-1 ${STATUS_META[i.status].cls}`}>{STATUS_META[i.status].label}</span>
                      {!i.reviewed_at && !['resolved', 'rejected'].includes(i.status) && <span className="ml-1 text-[10px] font-bold text-amber-700">NEW</span>}
                      {i.disputed && <span className="ml-1 text-[10px] font-bold text-red-700">DISPUTED</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {i.sla.hours_left !== null ? (
                        <span className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${i.sla.overdue ? 'text-red-700' : 'text-slate-600'}`}>
                          <Hourglass className="h-3 w-3" /> {i.sla.overdue ? `${fmtHours(i.sla.hours_left)} over` : fmtHours(i.sla.hours_left)}
                          {i.escalation_level > 0 && <Siren className="h-3 w-3 text-red-600" />}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
