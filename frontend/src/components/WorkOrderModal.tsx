import { Printer, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type WorkOrder } from '../api'
import { fmtDate } from '../ui'

export function WorkOrderModal({ issueId, onClose }: { issueId: number; onClose: () => void }) {
  const [wo, setWo] = useState<WorkOrder | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.workOrder(issueId).then(setWo).catch((e) => setError(String(e)))
  }, [issueId])

  return (
    <div className="wo-overlay fixed inset-0 z-[1100] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-label="Work order">
      <div className="wo-sheet w-full max-w-2xl rounded-xl bg-white shadow-2xl">
        <div className="wo-noprint flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <span className="text-sm font-medium text-slate-500">Work order</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!wo}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Printer className="h-4 w-4" /> Print / PDF
            </button>
            <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {error && <p className="p-5 text-sm text-red-600">{error}</p>}
        {!wo && !error && <p className="p-5 text-sm text-slate-500">Loading…</p>}
        {wo && (
          <div className="space-y-5 p-6 text-sm">
            <header className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Municipal Corporation · Jaipur</div>
                <h2 className="text-xl font-bold">Work Order {wo.work_order_no}</h2>
                <div className="text-slate-600">Issued {fmtDate(wo.issued_at)} · Issue #{wo.issue_id}</div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase text-slate-500">Priority</div>
                <div className="text-2xl font-bold">{wo.priority.score}</div>
                <div className="font-semibold uppercase text-red-700">{wo.priority.tier}</div>
              </div>
            </header>

            <section>
              <h3 className="font-semibold">{wo.title}</h3>
              <p className="text-slate-600">
                {wo.category} · {wo.sub_type.replace(/_/g, ' ')}
                {wo.safety_risk && <b className="text-red-700"> · SAFETY RISK</b>}
              </p>
            </section>

            <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-slate-500">Location</dt>
              <dd>
                {[wo.location.locality, wo.location.detail].filter(Boolean).join(', ') || 'Unknown'}
                {wo.location.lat !== null && (
                  <span className="text-slate-500">
                    {' '}
                    ({wo.location.lat.toFixed(5)}, {wo.location.lng?.toFixed(5)}, {wo.location.precision})
                  </span>
                )}
              </dd>
              <dt className="text-slate-500">Complete by</dt>
              <dd className="font-semibold">
                {wo.deadline.due_at ? fmtDate(wo.deadline.due_at) : '—'}
                {wo.deadline.overdue && <span className="ml-2 text-red-700">(OVERDUE)</span>}
              </dd>
              <dt className="text-slate-500">Assigned to</dt>
              <dd>{wo.assigned_officer ?? '______________________'}</dd>
              <dt className="text-slate-500">Why prioritised</dt>
              <dd>{wo.priority.reasons.join(' · ')}</dd>
            </dl>

            <section>
              <h4 className="mb-1 font-semibold">Tasks</h4>
              <table className="w-full border border-slate-300 text-left">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border border-slate-300 px-2 py-1">Department</th>
                    <th className="border border-slate-300 px-2 py-1">Role</th>
                    <th className="border border-slate-300 px-2 py-1">Status</th>
                    <th className="border border-slate-300 px-2 py-1">Sign-off</th>
                  </tr>
                </thead>
                <tbody>
                  {wo.tasks.map((t) => (
                    <tr key={t.id}>
                      <td className="border border-slate-300 px-2 py-1">{t.department}</td>
                      <td className="border border-slate-300 px-2 py-1">{t.role === 'primary' ? 'Lead' : 'Linked'}</td>
                      <td className="border border-slate-300 px-2 py-1">{t.status}</td>
                      <td className="border border-slate-300 px-2 py-1" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section>
              <h4 className="mb-1 font-semibold">
                Evidence: {wo.evidence.report_count} citizen report{wo.evidence.report_count > 1 ? 's' : ''} (first{' '}
                {fmtDate(wo.evidence.first_reported)})
              </h4>
              <ul className="list-disc space-y-1 pl-5 text-slate-700">
                {wo.evidence.citizen_quotes.map((q, i) => (
                  <li key={i}>“{q}”</li>
                ))}
              </ul>
              {wo.evidence.photos.length > 0 && (
                <div className="mt-2 flex gap-2">
                  {wo.evidence.photos.slice(0, 3).map((p) => (
                    <img key={p} src={p} alt="Citizen evidence" className="h-24 w-24 rounded object-cover ring-1 ring-slate-300" />
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <h4 className="mb-1 font-semibold">To close this work order</h4>
              <ol className="list-decimal space-y-0.5 pl-5">
                {wo.completion_requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
