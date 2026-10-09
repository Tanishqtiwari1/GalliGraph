import { AlertTriangle, ArrowRight, Clock, Flame, Gavel, Hourglass, ListChecks, ShieldAlert, Sparkles, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type Activity, type Issue, type Performance, type Stats } from '../api'
import { timeAgo } from '../ui'
import { CountUp, Skeleton } from './Kit'
import { CATEGORY_ICON, displayId, Kpi, TIER_PILL } from './Shell'

export type ComplaintFilter = { preset?: 'untriaged' | 'high' | 'unassigned' | 'overdue' | 'disputed' | 'review' }

interface Props {
  user: { display_name: string; role: string; department: string | null }
  refreshKey: number
  goComplaints: (f: ComplaintFilter) => void
  goTriage: () => void
  goSla: () => void
  openIssue: (id: number) => void
}

export function OverviewView({ user, refreshKey, goComplaints, goTriage, goSla, openIssue }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [perf, setPerf] = useState<Performance | null>(null)
  const [activity, setActivity] = useState<Activity[] | null>(null)
  const [queue, setQueue] = useState<Issue[]>([])

  useEffect(() => {
    api.stats().then(setStats).catch(() => {})
    api.performance(30).then(setPerf).catch(() => {})
    api.activity(15).then(setActivity).catch(() => setActivity([]))
    api.issues({ untriaged: true, sort: 'priority', limit: 4 }).then(setQueue).catch(() => {})
  }, [refreshKey])

  const s = stats
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dept = (perf?.departments ?? []).map((d) => ({ name: d.department.split(' (')[0], within: d.open - d.overdue, overdue: d.overdue }))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-brand-700">Municipal operations</div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            {greet}, {user.display_name.split(' (')[0]}
          </h1>
          <p className="text-sm text-slate-600">{s?.scope ? `Your jurisdiction: ${s.scope}` : 'City-wide view · all departments'}</p>
        </div>
        <button type="button" onClick={goTriage} className="btn btn-primary">
          <Sparkles className="h-4 w-4" /> Open AI triage ({s?.untriaged ?? '…'})
        </button>
      </div>

      <div className="stagger grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Sparkles} label="Untriaged" value={<CountUp value={s?.untriaged} />} hint="needs review" onClick={() => goComplaints({ preset: 'untriaged' })} />
        <Kpi icon={ShieldAlert} tone="critical" label="High priority" value={<CountUp value={s?.high_priority} />} hint="review urgently" onClick={() => goComplaints({ preset: 'high' })} />
        <Kpi icon={UserX} label="Unassigned" value={<CountUp value={s?.unassigned} />} hint="no officer yet" onClick={() => goComplaints({ preset: 'unassigned' })} />
        <Kpi icon={Hourglass} tone="warn" label="Overdue" value={<CountUp value={s?.overdue_issues} />} hint="escalation review" onClick={goSla} />
        <Kpi icon={Gavel} label="Resolution review" value={<CountUp value={s?.awaiting_verification} />} hint="closures to approve" onClick={() => goComplaints({ preset: 'review' })} />
        <Kpi icon={AlertTriangle} tone={s?.disputed ? 'critical' : 'default'} label="Citizen disputes" value={<CountUp value={s?.disputed} />} hint="fix contested" onClick={() => goComplaints({ preset: 'disputed' })} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display font-bold">AI Triage Queue</h2>
            <span className="pill pill-warn">Needs review</span>
          </div>
          <ul className="space-y-2">
            {queue.length === 0 && <li className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">All caught up. Nothing waiting for review. ✓</li>}
            {queue.map((i) => {
              const Icon = CATEGORY_ICON[i.category]
              const tier = i.sla_tier ?? 'low'
              return (
                <li key={i.id}>
                  <button type="button" onClick={() => openIssue(i.id)} className="lift flex w-full items-start gap-3 rounded-lg border border-slate-200 p-3 text-left">
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tier === 'critical' ? 'bg-red-50 text-red-600' : 'bg-surface text-brand-700'}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="truncate font-semibold">{i.summary}</span>
                        <span className={`pill ${TIER_PILL[tier].cls}`}>{TIER_PILL[tier].label}</span>
                      </span>
                      <span className="text-xs text-slate-500">
                        {displayId(i.id, i.first_reported)} · {i.locality ?? 'location needs verification'} ·{' '}
                        {i.report_count > 1 ? `${i.report_count} related reports · duplicate review` : timeAgo(i.first_reported)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <button type="button" onClick={goTriage} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
            Review all <ArrowRight className="h-4 w-4" />
          </button>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 font-display font-bold">
            <Clock className="h-4 w-4 text-brand-700" /> Recent activity
          </h2>
          {activity === null ? (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1 text-sm">
              {activity.map((a, idx) => (
                <li key={idx}>
                  <button type="button" onClick={() => openIssue(a.issue_id)} className="w-full rounded-lg p-2 text-left hover:bg-slate-50">
                    <div className="line-clamp-1 font-medium">{a.message}</div>
                    <div className="truncate text-xs text-slate-500">
                      {a.summary} · {timeAgo(a.at)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-2 font-display font-bold">New vs resolved (weekly)</h2>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={perf?.weekly ?? []}>
                <defs>
                  <linearGradient id="gOpen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#94a3b8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0d9488" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="week_start" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={30} allowDecimals={false} />
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="opened" name="New issues" stroke="#64748b" fill="url(#gOpen)" strokeWidth={2} />
                <Area type="monotone" dataKey="resolved" name="Resolved" stroke="#0d9488" fill="url(#gRes)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card p-4">
          <h2 className="mb-2 flex items-center gap-2 font-display font-bold">
            <Flame className="h-4 w-4 text-red-600" /> Department workload
          </h2>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dept} layout="vertical" margin={{ left: 8, right: 12 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="within" name="Within deadline" stackId="a" fill="#0d9488" barSize={14} />
                <Bar dataKey="overdue" name="Overdue" stackId="a" fill="#dc2626" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <ListChecks className="h-3.5 w-3.5" /> Tap any metric to open the matching complaint list.
      </p>
    </div>
  )
}
