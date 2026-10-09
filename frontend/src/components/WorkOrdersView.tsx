import { Hourglass, UserRound, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type Issue } from '../api'
import { fmtHours } from '../ui'
import { Skeleton } from './Kit'
import { CATEGORY_ICON, displayId, TIER_PILL } from './Shell'

const COLUMNS = [
  { key: 'ready', title: 'Ready to assign', hint: 'reviewed, no officer yet', match: (i: Issue) => (i.status === 'open' || i.status === 'info_requested') && !!i.reviewed_at, tone: 'bg-slate-400' },
  { key: 'assigned', title: 'Assigned', hint: 'work order issued', match: (i: Issue) => i.status === 'assigned', tone: 'bg-sky-500' },
  { key: 'progress', title: 'In progress', hint: 'crew on site', match: (i: Issue) => i.status === 'in_progress', tone: 'bg-amber-500' },
  { key: 'review', title: 'Resolution review', hint: 'evidence submitted', match: (i: Issue) => i.status === 'needs_verification', tone: 'bg-purple-500' },
] as const

export function WorkOrdersView({ refreshKey, openIssue }: { refreshKey: number; openIssue: (id: number) => void }) {
  const [issues, setIssues] = useState<Issue[] | null>(null)
  useEffect(() => {
    api.issues({ status: 'active', sort: 'deadline', limit: 500 }).then(setIssues).catch(() => setIssues([]))
  }, [refreshKey])

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-brand-700">Field operations</div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Work orders</h1>
        <p className="text-sm text-slate-600">Every active work order by stage, soonest deadline first. Open a card to update progress or submit evidence.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = (issues ?? []).filter(col.match)
          return (
            <section key={col.key} className="flex min-w-0 flex-col rounded-xl bg-surface-low p-2">
              <div className="flex items-center justify-between px-2 py-1.5">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <span className={`h-2.5 w-2.5 rounded-full ${col.tone}`} /> {col.title}
                </h2>
                <span className="rounded-full bg-white px-2 text-xs font-bold tnum">{issues ? items.length : '…'}</span>
              </div>
              <p className="px-2 pb-2 text-[11px] text-slate-500">{col.hint}</p>
              <div className="max-h-[70vh] space-y-2 overflow-y-auto p-0.5">
                {!issues && <Skeleton className="h-24 bg-white" />}
                {issues && items.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">Empty</p>}
                {items.slice(0, 40).map((i) => {
                  const Icon = CATEGORY_ICON[i.category]
                  const tier = i.sla_tier ?? 'low'
                  return (
                    <button key={i.id} type="button" onClick={() => openIssue(i.id)} className="card lift w-full p-3 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-slate-500">WO #{String(i.id).padStart(4, '0')}</span>
                        <span className={`pill ${TIER_PILL[tier].cls}`}>{TIER_PILL[tier].label}</span>
                      </div>
                      <div className="mt-1.5 flex items-start gap-2">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                        <span className="line-clamp-2 text-sm font-semibold">{i.summary}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="h-3 w-3" /> {i.assigned_officer ?? 'unassigned'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" /> {i.report_count}
                        </span>
                        {i.sla.hours_left !== null && (
                          <span className={`ml-auto inline-flex items-center gap-1 font-semibold ${i.sla.overdue ? 'text-red-700' : ''}`}>
                            <Hourglass className="h-3 w-3" /> {i.sla.overdue ? `${fmtHours(i.sla.hours_left)} over` : fmtHours(i.sla.hours_left)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-[11px] text-slate-500">
                        {displayId(i.id, i.first_reported)} · {i.department.split(' (')[0]}
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
