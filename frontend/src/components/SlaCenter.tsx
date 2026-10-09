import { BellRing, CalendarClock, History, Hourglass, Settings2, Siren } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type Alert, type SlaItem, type SlaOverview } from '../api'
import { ESCALATION_LABEL, fmtDate, fmtHours, timeAgo } from '../ui'
import { AlertsPanel } from './AlertsPanel'
import { Skeleton, useToast } from './Kit'
import { CATEGORY_ICON, TIER_PILL } from './Shell'

export function SlaCenter({ refreshKey, openIssue, canConfigure, goSettings }: { refreshKey: number; openIssue: (id: number) => void; canConfigure: boolean; goSettings: () => void }) {
  const toast = useToast()
  const [data, setData] = useState<SlaOverview | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    api.slaOverview().then(setData).catch(() => {})
    api.alerts().then(setAlerts).catch(() => {})
  }, [refreshKey, tick])

  async function remind(i: SlaItem) {
    try {
      const r = await api.remind(i.id)
      toast(`Reminder logged for ${r.to}`)
      setTick((t) => t + 1)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error')
    }
  }
  async function escalate(i: SlaItem) {
    const reason = window.prompt(`Escalate "${i.summary}"? Give a reason:`)
    if (!reason || reason.trim().length < 3) return
    try {
      await api.escalate(i.id, reason.trim())
      toast('Escalated')
      setTick((t) => t + 1)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error')
    }
  }

  const Row = ({ i }: { i: SlaItem }) => {
    const Icon = CATEGORY_ICON[i.category]
    return (
      <li className="flex flex-wrap items-center gap-3 p-3">
        <button type="button" onClick={() => openIssue(i.id)} className="flex min-w-0 flex-1 basis-72 items-center gap-3 text-left">
          <Icon className="h-5 w-5 shrink-0 text-brand-700" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{i.summary}</span>
            <span className="block truncate text-xs text-slate-500">
              {i.department.split(' (')[0]} · {i.assigned_officer ?? 'unassigned'} · due {fmtDate(i.sla_due_at)}
            </span>
          </span>
        </button>
        <span className={`pill ${TIER_PILL[i.sla_tier].cls}`}>{TIER_PILL[i.sla_tier].label}</span>
        <span className={`inline-flex items-center gap-1 text-xs font-bold tnum ${i.hours_left < 0 ? 'text-red-700' : 'text-amber-700'}`}>
          <Hourglass className="h-3.5 w-3.5" /> {i.hours_left < 0 ? `${fmtHours(i.hours_left)} over` : `${fmtHours(i.hours_left)} left`}
        </span>
        {i.escalation_level > 0 && <span className="pill pill-crit">{ESCALATION_LABEL[i.escalation_level]}</span>}
        <span className="flex gap-1">
          <button type="button" onClick={() => remind(i)} className="btn btn-ghost min-h-0 px-2.5 py-1 text-xs">
            <BellRing className="h-3.5 w-3.5" /> Remind
          </button>
          {i.escalation_level < 2 && (
            <button type="button" onClick={() => escalate(i)} className="btn btn-danger min-h-0 px-2.5 py-1 text-xs">
              <Siren className="h-3.5 w-3.5" /> Escalate
            </button>
          )}
        </span>
      </li>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-brand-700">Deadlines</div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">SLA &amp; escalation centre</h1>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-500">Configured policy:</span>
            {(Object.entries(data.policy_hours) as [keyof typeof TIER_PILL, number][]).map(([t, h]) => (
              <span key={t} className={`pill ${TIER_PILL[t].cls}`}>
                {TIER_PILL[t].label} {h >= 48 ? `${Math.round(h / 24)} d` : `${h} h`}
              </span>
            ))}
            {canConfigure && (
              <button type="button" onClick={goSettings} className="inline-flex items-center gap-1 font-semibold text-brand-700">
                <Settings2 className="h-3.5 w-3.5" /> Change
              </button>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500">Deadlines are a configurable policy for this prototype, not official municipal rules.</p>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 font-display font-bold">
            <CalendarClock className="h-4 w-4 text-amber-600" /> Due in the next 48 h ({data?.upcoming.length ?? '…'})
          </h2>
          {!data ? <Skeleton className="m-3 h-32" /> : <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">{data.upcoming.length ? data.upcoming.map((i) => <Row key={i.id} i={i} />) : <li className="p-4 text-sm text-slate-500">Nothing due soon.</li>}</ul>}
        </section>
        <section className="card overflow-hidden border-red-200">
          <h2 className="flex items-center gap-2 border-b border-slate-100 bg-red-50/50 px-4 py-3 font-display font-bold text-red-800">
            <Hourglass className="h-4 w-4" /> Overdue ({data?.overdue.length ?? '…'})
          </h2>
          {!data ? <Skeleton className="m-3 h-32" /> : <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">{data.overdue.map((i) => <Row key={i.id} i={i} />)}</ul>}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 font-display font-bold">
            <History className="h-4 w-4 text-brand-700" /> Escalation history
          </h2>
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto text-sm">
            {data?.history.map((h, idx) => (
              <li key={idx}>
                <button type="button" onClick={() => openIssue(h.issue_id)} className="w-full p-3 text-left hover:bg-slate-50">
                  <div className="font-medium">{h.message}</div>
                  <div className="truncate text-xs text-slate-500">
                    {h.summary} · {h.actor} · {timeAgo(h.at)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="card overflow-hidden">
          <h2 className="border-b border-slate-100 px-4 py-3 font-display font-bold">Complaint spike alerts ({alerts.length})</h2>
          <div className="max-h-80 overflow-y-auto">
            <AlertsPanel alerts={alerts} />
          </div>
        </section>
      </div>
    </div>
  )
}
