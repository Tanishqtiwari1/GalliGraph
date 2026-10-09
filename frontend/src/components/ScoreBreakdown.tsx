import type { PriorityFactor } from '../api'
import { FACTOR_LABEL } from '../ui'

export function ScoreBreakdown({ factors, total }: { factors: PriorityFactor[]; total: number }) {
  return (
    <div className="space-y-2">
      {factors.map((f) => (
        <div key={f.factor} className="grid grid-cols-[8.5rem_1fr_3rem] items-center gap-3 text-sm">
          <span className="text-slate-600">{FACTOR_LABEL[f.factor] ?? f.factor}</span>
          <div>
            <div className="h-2 rounded-full bg-slate-100" title={`${f.points} of ${f.weight} points`}>
              <div className="h-2 rounded-full bg-brand-600" style={{ width: `${(f.points / f.weight) * 100}%` }} />
            </div>
            <div className="mt-0.5 text-xs text-slate-500">{f.reason}</div>
          </div>
          <span className="text-right font-medium tabular-nums">
            {f.points}
            <span className="text-xs text-slate-400">/{f.weight}</span>
          </span>
        </div>
      ))}
      <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
        <span>Priority score</span>
        <span className="tabular-nums">{total} / 100</span>
      </div>
    </div>
  )
}
