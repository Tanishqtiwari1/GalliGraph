import { ChevronDown, ChevronRight, ShieldAlert, Users } from 'lucide-react'
import { Fragment, useState } from 'react'
import type { Issue } from '../api'
import { CATEGORY_META, ESCALATION_LABEL, STATUS_META, deadlineChip, priorityTone, timeAgo } from '../ui'
import { ScoreBreakdown } from './ScoreBreakdown'

interface Props {
  issues: Issue[]
  selectedId: number | null
  onSelect: (id: number) => void
}

export function PriorityQueue({ issues, selectedId, onSelect }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null)

  if (!issues.length) {
    return <p className="p-6 text-center text-sm text-slate-500">No issues match these filters.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Score</th>
            <th className="px-3 py-2 font-medium">Issue</th>
            <th className="px-3 py-2 font-medium">Reports</th>
            <th className="hidden px-3 py-2 font-medium lg:table-cell">Department</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Deadline</th>
            <th className="px-3 py-2 font-medium">Why?</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {issues.map((i) => {
            const tone = priorityTone(i.priority_score)
            const open = expanded === i.id
            return (
              <Fragment key={i.id}>
                <tr
                  className={`cursor-pointer hover:bg-slate-50 ${selectedId === i.id ? 'bg-brand-50' : ''}`}
                  onClick={() => onSelect(i.id)}
                >
                  <td className="px-3 py-2.5 text-slate-400 tabular-nums">{i.rank ?? '–'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex min-w-11 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${tone.cls}`}>
                      {i.priority_score}
                    </span>
                  </td>
                  <td className="max-w-md px-3 py-2.5">
                    <div className="flex items-center gap-1.5 font-medium text-ink">
                      <span aria-hidden>{CATEGORY_META[i.category].emoji}</span>
                      <span className="truncate">{i.summary}</span>
                      {i.secondary_department && (
                        <span className="shrink-0 rounded bg-indigo-50 px-1 text-[10px] font-medium text-indigo-700" title={`Linked task: ${i.secondary_department}`}>
                          +1 dept
                        </span>
                      )}
                      {i.safety_risk && <ShieldAlert className="h-4 w-4 shrink-0 text-red-500" aria-label="Safety risk" />}
                    </div>
                    <div className="text-xs text-slate-500">
                      {i.locality ?? 'Unknown location'} · first reported {timeAgo(i.first_reported)}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1 tabular-nums text-slate-700">
                      <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                      {i.report_count}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs text-slate-600 lg:table-cell">{i.department}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs ring-1 ${STATUS_META[i.status].cls}`}>
                      {STATUS_META[i.status].label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {(() => {
                      const chip = deadlineChip(i.sla)
                      return chip ? (
                        <div className="flex flex-col items-start gap-0.5">
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ring-1 ${chip.cls}`}>{chip.label}</span>
                          {i.escalation_level > 0 && i.status !== 'resolved' && (
                            <span className="whitespace-nowrap text-[11px] font-medium text-red-700">
                              ↑ {ESCALATION_LABEL[i.escalation_level]}
                            </span>
                          )}
                        </div>
                      ) : null
                    })()}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpanded(open ? null : i.id)
                      }}
                      aria-expanded={open}
                    >
                      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      Explain
                    </button>
                  </td>
                </tr>
                {open && i.priority_breakdown && (
                  <tr className="bg-slate-50/70">
                    <td colSpan={8} className="px-6 py-4">
                      <div className="max-w-2xl">
                        <ScoreBreakdown factors={i.priority_breakdown} total={i.priority_score} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
