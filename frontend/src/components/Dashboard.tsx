import { Filter, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type Alert, type Issue, type IssueFilters, type Meta, type Stats } from '../api'
import { AlertsPanel } from './AlertsPanel'
import { DepartmentLoad } from './DepartmentLoad'
import { IssueMap } from './IssueMap'
import { PriorityQueue } from './PriorityQueue'
import { StatCards } from './StatCards'

interface Props {
  meta: Meta | null
  refreshKey: number
  selectedId: number | null
  onSelect: (id: number) => void
}

export function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {right}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}

const selectCls = 'rounded-lg border-0 bg-white py-1.5 pl-2.5 pr-7 text-xs ring-1 ring-slate-300'

const DEFAULT_FILTERS = { status: 'active', category: '', locality_id: '', department: '', tier: '', since: '', overdue: '' }
type FilterState = typeof DEFAULT_FILTERS

export function Dashboard({ meta, refreshKey, selectedId, onSelect }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [f, setF] = useState<FilterState>(DEFAULT_FILTERS)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof FilterState) => (e: React.ChangeEvent<HTMLSelectElement>) => setF({ ...f, [key]: e.target.value })
  const activeCount = Object.entries(f).filter(([k, v]) => v !== DEFAULT_FILTERS[k as keyof FilterState]).length

  useEffect(() => {
    Promise.all([api.stats(), api.alerts()])
      .then(([s, a]) => {
        setStats(s)
        setAlerts(a)
      })
      .catch((e) => setError(String(e)))
  }, [refreshKey])

  useEffect(() => {
    const q: IssueFilters = {
      status: f.status,
      category: f.category,
      locality_id: f.locality_id,
      department: f.department,
      tier: f.tier,
      since_days: f.since ? Number(f.since) : undefined,
      overdue: f.overdue === '' ? undefined : f.overdue === 'yes',
      sort: f.overdue === 'yes' ? 'deadline' : 'priority',
      limit: 400,
    }
    api.issues(q).then(setIssues).catch((e) => setError(String(e)))
  }, [f, refreshKey])

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
        Could not reach the CivicPulse API ({error}). Is the backend running on port 8000?
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <StatCards stats={stats} />

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
        <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <Filter className="h-3.5 w-3.5" /> Filters
        </span>
        <select className={selectCls} value={f.status} onChange={set('status')} aria-label="Status">
          <option value="active">Active</option>
          <option value="open">Open (unassigned)</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In progress</option>
          <option value="needs_verification">Closure flagged</option>
          <option value="resolved">Resolved</option>
          <option value="">All statuses</option>
        </select>
        <select className={selectCls} value={f.tier} onChange={set('tier')} aria-label="Severity tier">
          <option value="">All priorities</option>
          <option value="critical">Critical (≥ 70)</option>
          <option value="high">High (50–70)</option>
          <option value="medium">Medium (30–50)</option>
          <option value="low">Low (&lt; 30)</option>
        </select>
        <select className={selectCls} value={f.overdue} onChange={set('overdue')} aria-label="Deadline">
          <option value="">Any deadline</option>
          <option value="yes">Past deadline</option>
          <option value="no">Within deadline</option>
        </select>
        <select className={selectCls} value={f.department} onChange={set('department')} aria-label="Department">
          <option value="">All departments</option>
          {meta?.departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select className={selectCls} value={f.category} onChange={set('category')} aria-label="Category">
          <option value="">All categories</option>
          {meta?.categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <select className={selectCls} value={f.locality_id} onChange={set('locality_id')} aria-label="Area">
          <option value="">All areas</option>
          {meta?.localities.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select className={selectCls} value={f.since} onChange={set('since')} aria-label="Reported within">
          <option value="">Any time</option>
          <option value="1">Last 24 hours</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => setF(DEFAULT_FILTERS)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500">
          {issues.length} issue{issues.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card
          title="Live issue map"
          right={<span className="text-xs text-slate-500">size = reports · colour = priority · dashed = spike</span>}
        >
          <div className="h-[460px] p-2">
            <IssueMap issues={issues} alerts={alerts} selectedId={selectedId} onSelect={onSelect} />
          </div>
        </Card>
        <div className="grid gap-4">
          <Card title={`Spike alerts (${alerts.length})`}>
            <div className="max-h-[260px] overflow-y-auto">
              <AlertsPanel alerts={alerts} />
            </div>
          </Card>
          <Card title="Open issues by department">
            <div className="p-2">
              <DepartmentLoad stats={stats} />
            </div>
          </Card>
        </div>
      </div>

      <Card title={f.overdue === 'yes' ? 'Overdue issues (most overdue first)' : 'Priority queue'}>
        <div className="max-h-[560px] overflow-y-auto">
          <PriorityQueue issues={issues.slice(0, 80)} selectedId={selectedId} onSelect={onSelect} />
        </div>
      </Card>
    </div>
  )
}
