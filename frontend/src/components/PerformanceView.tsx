import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type Issue, type Performance, type PerfSummary } from '../api'
import { ESCALATION_LABEL, deadlineChip, fmtHours, priorityTone } from '../ui'
import { Card, Kpi as ShellKpi } from './Shell'

function pct(v: number | null) {
  return v === null ? '—' : `${v}%`
}

function complianceCls(v: number | null) {
  if (v === null) return 'text-slate-400'
  if (v >= 75) return 'text-emerald-700'
  if (v >= 50) return 'text-amber-700'
  return 'text-red-700'
}

function Kpi({ label, value, hint, cls }: { label: string; value: string | number; hint?: string; cls?: string }) {
  const tone = cls?.includes('red') ? 'critical' : cls?.includes('emerald') ? 'primary' : cls?.includes('amber') || cls?.includes('purple') ? 'warn' : 'default'
  return <ShellKpi label={label} value={value} hint={hint} tone={tone} />
}

function Row({ name, s }: { name: string; s: PerfSummary }) {
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-3 py-2 font-medium">{name}</td>
      <td className="px-3 py-2 text-right tabular-nums">{s.open}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        <span className={s.overdue ? 'font-semibold text-red-700' : ''}>{s.overdue}</span>
        <span className="text-xs text-slate-400"> ({s.overdue_rate_pct}%)</span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{s.escalated}</td>
      <td className="px-3 py-2 text-right tabular-nums">{s.resolved}</td>
      <td className="px-3 py-2 text-right tabular-nums">{s.median_resolution_hours === null ? '—' : fmtHours(s.median_resolution_hours)}</td>
      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${complianceCls(s.sla_compliance_pct)}`}>{pct(s.sla_compliance_pct)}</td>
    </tr>
  )
}

const TH = 'px-3 py-2 text-right font-medium'

export function PerformanceView({ refreshKey, onSelect }: { refreshKey: number; onSelect: (id: number) => void }) {
  const [days, setDays] = useState(30)
  const [perf, setPerf] = useState<Performance | null>(null)
  const [overdue, setOverdue] = useState<Issue[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.performance(days).then(setPerf).catch((e) => setError(String(e)))
    api.issues({ overdue: true, sort: 'deadline', limit: 25 }).then(setOverdue).catch((e) => setError(String(e)))
  }, [days, refreshKey])

  if (error) return <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">{error}</div>
  if (!perf) return <p className="text-sm text-slate-500">Loading…</p>
  const o = perf.overall

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-brand-700">Admin intel</div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Ward &amp; department accountability</h1>
          <p className="text-sm text-slate-500">Are complaints actually getting fixed, by whom, and on time?</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="field w-auto"
          aria-label="Time window"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Deadline compliance" value={pct(o.sla_compliance_pct)} hint={`of ${o.resolved} closed in window`} cls={complianceCls(o.sla_compliance_pct)} />
        <Kpi label="Median time to fix" value={o.median_resolution_hours === null ? '—' : fmtHours(o.median_resolution_hours)} hint="first report → closure" />
        <Kpi label="Open past deadline" value={o.overdue} hint={`${o.overdue_rate_pct}% of open issues`} cls="text-red-600" />
        <Kpi label="Overdue & critical" value={o.overdue_critical} hint="24 h deadline missed" cls={o.overdue_critical ? 'text-red-600' : undefined} />
        <Kpi label="Escalated" value={o.escalated} hint="to supervisor / commissioner" />
        <Kpi label="Closures flagged" value={o.awaiting_verification} hint="photo did not verify" cls={o.awaiting_verification ? 'text-purple-700' : undefined} />
      </div>

      <Card title="Department scorecard">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Department</th>
                <th className={TH}>Open</th>
                <th className={TH}>Past deadline</th>
                <th className={TH}>Escalated</th>
                <th className={TH}>Closed ({perf.window_days}d)</th>
                <th className={TH}>Median fix time</th>
                <th className={TH}>On-time %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {perf.departments.map((d) => (
                <Row key={d.department} name={d.department} s={d} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Opened vs resolved per week">
          <div className="h-64 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perf.weekly}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="week_start"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} width={30} />
                <Tooltip labelFormatter={(d) => `Week of ${new Date(String(d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="opened" name="New issues" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="resolved" name="Resolved" fill="#0d9488" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Areas with the worst backlog">
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Area</th>
                  <th className={TH}>Open</th>
                  <th className={TH}>Past deadline</th>
                  <th className={TH}>On-time %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {perf.wards.map((w) => (
                  <tr key={w.locality_id}>
                    <td className="px-3 py-2">{w.locality}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{w.open}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {w.overdue} <span className="text-xs text-slate-400">({w.overdue_rate_pct}%)</span>
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${complianceCls(w.sla_compliance_pct)}`}>
                      {pct(w.sla_compliance_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title={`Most overdue issues (${overdue.length})`}>
        <ul className="divide-y divide-slate-100">
          {overdue.map((i) => {
            const chip = deadlineChip(i.sla)
            return (
              <li key={i.id}>
                <button type="button" onClick={() => onSelect(i.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50">
                  <span className={`inline-flex min-w-11 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${priorityTone(i.priority_score).cls}`}>
                    {i.priority_score}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{i.summary}</span>
                    <span className="text-xs text-slate-500">
                      {i.department} · {i.assigned_officer ?? 'unassigned'}
                    </span>
                  </span>
                  {chip && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ring-1 ${chip.cls}`}>{chip.label}</span>}
                  {i.escalation_level > 0 && (
                    <span className="hidden shrink-0 text-xs font-medium text-red-700 md:inline">↑ {ESCALATION_LABEL[i.escalation_level]}</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
