import { AlertTriangle, Clock, GitMerge, Inbox, ListChecks, Zap } from 'lucide-react'
import type { Stats } from '../api'

export function StatCards({ stats }: { stats: Stats | null }) {
  const s = stats
  const cards = [
    { icon: Inbox, label: 'Complaints received', value: s?.complaints ?? '–', hint: 'all channels' },
    {
      icon: GitMerge,
      label: 'Real issues found',
      value: s?.issues ?? '–',
      hint: s ? `${s.dedup_reduction_pct}% fewer tickets · ${s.needs_review} to review` : '',
      accent: 'text-brand-700',
    },
    { icon: ListChecks, label: 'Active issues', value: s?.active_issues ?? '–', hint: s ? `${s.resolved_issues} resolved` : '' },
    {
      icon: AlertTriangle,
      label: 'Critical (score ≥ 70)',
      value: s?.critical_issues ?? '–',
      hint: 'need action today',
      accent: 'text-red-600',
    },
    {
      icon: Clock,
      label: 'Past deadline',
      value: s?.overdue_issues ?? '–',
      hint: s ? `${s.awaiting_verification} closure${s.awaiting_verification === 1 ? '' : 's'} awaiting verification` : '',
      accent: 'text-red-600',
    },
    {
      icon: Zap,
      label: 'Avg triage time',
      value: s ? `${s.avg_processing_ms < 1000 ? Math.round(s.avg_processing_ms) + ' ms' : (s.avg_processing_ms / 1000).toFixed(1) + ' s'}` : '–',
      hint: 'vs. days of manual sorting',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map(({ icon: Icon, label, value, hint, accent }) => (
        <div key={label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </div>
          <div className={`mt-1 text-2xl font-semibold tabular-nums ${accent ?? 'text-ink'}`}>{value}</div>
          <div className="mt-0.5 truncate text-xs text-slate-500">{hint}</div>
        </div>
      ))}
    </div>
  )
}
