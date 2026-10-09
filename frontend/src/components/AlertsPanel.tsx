import { Activity, TrendingUp } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import type { Alert } from '../api'
import { CATEGORY_META } from '../ui'

export function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
        <Activity className="h-4 w-4" /> No unusual complaint spikes right now.
      </div>
    )
  }
  return (
    <ul className="divide-y divide-slate-100">
      {alerts.map((a) => (
        <li key={`${a.locality_id}-${a.category}`} className="p-4">
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 rounded-md p-1.5 ${a.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}
            >
              <TrendingUp className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold">
                  {CATEGORY_META[a.category].emoji} {a.category_label} · {a.locality}
                </span>
                <span className="text-xs font-medium uppercase text-red-600">
                  {a.ratio ? `${a.ratio}× normal` : 'new pattern'}
                </span>
              </div>
              <p className="text-sm text-slate-600">
                {a.observed} complaints in the last {a.window_days} days vs ~{a.expected} expected (z = {a.z_score})
              </p>
              <div className="mt-2 h-14">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={a.series} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="day" hide />
                    <Tooltip
                      formatter={(v) => [v, 'complaints']}
                      labelFormatter={(d) => new Date(String(d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    />
                    <Area type="monotone" dataKey="count" stroke="#dc2626" fill="#fecaca" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
