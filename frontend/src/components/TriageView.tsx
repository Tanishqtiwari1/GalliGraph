import { Clock, Copy, Hourglass, ListFilter, MapPin, Search, ShieldAlert, Siren, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api, type Issue, type Meta, type Stats } from '../api'
import { CATEGORY_HI } from '../i18n'
import { CATEGORY_META, fmtHours, timeAgo } from '../ui'
import { IssueDetail } from './IssueDetail'
import { CATEGORY_ICON, CITY, displayId, Kpi, TIER_PILL } from './Shell'

type Filter = 'untriaged' | 'all' | 'critical' | 'high' | 'overdue' | 'duplicates' | 'review' | 'disputed'
type Sort = 'priority' | 'deadline' | 'reports' | 'recent'

interface Props {
  meta?: Meta | null
  refreshKey: number
  canSupervise: boolean
  onChanged: () => void
  focusId: number | null
  onFocus: (id: number | null) => void
}

export function TriageView({ meta = null, refreshKey, canSupervise, onChanged, focusId, onFocus }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [issues, setIssues] = useState<Issue[]>([])
  const [filter, setFilter] = useState<Filter>('untriaged')
  const [sort, setSort] = useState<Sort>('priority')
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.stats().then(setStats).catch((e) => setError(String(e)))
    api
      .issues({ status: 'active', sort, limit: 400 })
      .then(setIssues)
      .catch((e) => setError(String(e)))
  }, [sort, refreshKey])

  const counts = useMemo(
    () => ({
      untriaged: issues.filter((i) => !i.reviewed_at).length,
      disputed: issues.filter((i) => i.disputed).length,
      all: issues.length,
      critical: issues.filter((i) => i.sla_tier === 'critical').length,
      high: issues.filter((i) => i.sla_tier === 'high').length,
      overdue: issues.filter((i) => i.sla.overdue).length,
      duplicates: issues.filter((i) => i.report_count > 1).length,
      review: issues.filter((i) => i.status === 'needs_verification').length,
    }),
    [issues],
  )
  const needle = q.trim().toLowerCase()
  const matches = (i: Issue) =>
    `${(i.tracking_codes ?? []).join(' ')} ${displayId(i.id, i.first_reported)} ${i.summary} ${i.locality ?? ''}`.toLowerCase().includes(needle)
  // A search looks across the whole active queue, whichever filter pill is selected
  const shown = needle ? issues.filter(matches) : issues.filter((i) =>
    filter === 'untriaged'
      ? !i.reviewed_at
      : filter === 'disputed'
        ? i.disputed
        : filter === 'all'
      ? true
      : filter === 'critical'
        ? i.sla_tier === 'critical'
        : filter === 'high'
          ? i.sla_tier === 'high'
          : filter === 'overdue'
            ? i.sla.overdue
            : filter === 'duplicates'
              ? i.report_count > 1
              : i.status === 'needs_verification',
  )

  // On wide screens the top item is opened automatically, like the design's expanded first card.
  useEffect(() => {
    if (focusId === null && shown.length && window.matchMedia('(min-width: 1024px)').matches) onFocus(shown[0].id)
  }, [shown, focusId, onFocus])

  if (error) return <div className="card p-4 text-sm text-red-700">Could not load the queue ({error}).</div>

  const pills: [Filter, string, string][] = [
    ['untriaged', 'Needs review', 'text-amber-700'],
    ['all', 'All', ''],
    ['critical', 'Critical', 'text-red-700'],
    ['high', 'High', ''],
    ['overdue', 'Overdue', ''],
    ['duplicates', 'Duplicates', ''],
    ['review', 'Resolution review', ''],
    ['disputed', 'Disputed', 'text-red-700'],
  ]

  const hideOnPhone = focusId !== null ? 'hidden lg:block' : ''
  return (
    <div className="space-y-4">
      <div className={`flex flex-wrap items-end justify-between gap-2 ${focusId !== null ? 'hidden lg:flex' : ''}`}>
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> Live officer console
          </div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">AI Triage &amp; Classification Queue</h1>
          <p className="flex items-center gap-1.5 text-sm text-slate-600">
            <MapPin className="h-4 w-4" /> {CITY} · all wards
          </p>
        </div>
        <span className="pill pill-info">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-600" /> Auto-sync active
        </span>
      </div>

      <div className={hideOnPhone}>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi icon={Clock} label="Untriaged" value={stats?.untriaged ?? '–'} hint="AI suggestion not reviewed" />
        <Kpi icon={ShieldAlert} tone="critical" label="Life-safety P0" value={counts.critical} hint="24 h deadline" />
        <Kpi icon={Copy} label="Duplicates found" value={stats?.duplicates_merged ?? '–'} hint={stats ? `${stats.dedup_reduction_pct}% fewer tickets` : ''} />
        <Kpi icon={Hourglass} tone="warn" label="Past deadline" value={stats?.overdue_issues ?? '–'} hint={stats ? `${stats.awaiting_verification} closures to review` : ''} />
      </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Feed */}
        <div className={`min-w-0 space-y-3 lg:col-span-5 ${focusId !== null ? 'hidden lg:block' : ''}`}>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {pills.map(([id, label, cls]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                aria-pressed={filter === id}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ${
                  filter === id ? 'bg-brand-700 text-white ring-brand-700' : `bg-white ring-slate-300 ${cls || 'text-slate-700'}`
                }`}
              >
                {id === 'critical' && filter !== id && <span className="h-2 w-2 rounded-full bg-red-600" />}
                {label} ({counts[id]})
              </button>
            ))}
          </div>
          <label className="card flex items-center gap-2 px-3 py-2 text-sm">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tracking code (JA-…), ID, text or area"
              className="w-full bg-transparent outline-none"
              aria-label="Search the queue"
            />
            {q && <span className="shrink-0 text-xs text-slate-500">{shown.length} found</span>}
          </label>
          <div className="card flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <ListFilter className="h-4 w-4" /> Ranked by
            </span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-md bg-surface px-2 py-1 text-sm font-semibold" aria-label="Sort">
              <option value="priority">Severity (desc)</option>
              <option value="deadline">Deadline (soonest)</option>
              <option value="reports">Most reports</option>
              <option value="recent">Newest</option>
            </select>
          </div>

          <ul className="space-y-2">
            {shown.length === 0 && <li className="card p-6 text-center text-sm text-slate-500">Nothing in this filter. 🎉</li>}
            {shown.slice(0, 80).map((i) => {
              const tier = i.sla_tier ?? 'low'
              const Icon = CATEGORY_ICON[i.category]
              const selected = focusId === i.id
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => onFocus(i.id)}
                    className={`card w-full overflow-hidden text-left transition hover:border-brand-500 ${selected ? 'ring-2 ring-brand-600' : ''}`}
                  >
                    {tier === 'critical' && <div className="h-1 bg-red-600" />}
                    <div className="p-3">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span className="flex items-center gap-2">
                          <span className="pill pill-zone font-mono">{displayId(i.id, i.first_reported)}</span>
                          <span className="text-xs text-slate-500">{timeAgo(i.last_reported)}</span>
                        </span>
                        <span className={`pill ${TIER_PILL[tier].cls}`}>
                          {TIER_PILL[tier].label.toUpperCase()} · {Math.round(i.priority_score)}/100
                        </span>
                      </div>
                      <div className="mt-2 flex items-start gap-2">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-brand-700">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="line-clamp-2 font-semibold leading-snug">{i.summary}</div>
                          <div className="text-xs text-slate-500">
                            {CATEGORY_META[i.category].label} · {CATEGORY_HI[i.category]}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="pill pill-zone">{i.locality ?? 'Unknown area'}</span>
                        <span className="pill pill-info">{i.department.split(' (')[0]}</span>
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          <Users className="h-3.5 w-3.5" /> {i.report_count + (i.confirmations ?? 0)}
                        </span>
                        {i.sla.hours_left !== null && (
                          <span className={`ml-auto inline-flex items-center gap-1 font-semibold ${i.sla.overdue ? 'text-red-700' : 'text-slate-600'}`}>
                            <Hourglass className="h-3.5 w-3.5" />
                            {i.sla.overdue ? `${fmtHours(i.sla.hours_left)} overdue` : `${fmtHours(i.sla.hours_left)} left`}
                          </span>
                        )}
                        {i.escalation_level > 0 && <Siren className="h-3.5 w-3.5 text-red-600" aria-label="Escalated" />}
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Investigation panel */}
        <div className={`min-w-0 lg:col-span-7 ${focusId === null ? 'hidden lg:block' : ''}`}>
          <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
            {focusId !== null ? (
              <IssueDetail issueId={focusId} canSupervise={canSupervise} meta={meta} onClose={() => onFocus(null)} onChanged={onChanged} />
            ) : (
              <div className="card p-8 text-center text-sm text-slate-500">Select an incident from the queue.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
