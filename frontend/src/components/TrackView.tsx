import { Search } from 'lucide-react'
import { useState } from 'react'
import { api, type TrackResult } from '../api'
import { STATUS_META, deadlineChip, fmtDate } from '../ui'

const STEPS = ['open', 'assigned', 'in_progress', 'resolved'] as const
const stepIndex = (s: string) => (s === 'needs_verification' ? 2 : STEPS.indexOf(s as (typeof STEPS)[number]))

export function TrackView({ initialId }: { initialId?: number }) {
  const [id, setId] = useState(initialId ? String(initialId) : '')
  const [res, setRes] = useState<TrackResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function lookup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setRes(null)
    try {
      setRes(await api.track(Number(id)))
    } catch {
      setError('No complaint found with that tracking ID.')
    }
  }

  const step = res ? stepIndex(res.status) : -1
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <form onSubmit={lookup} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold">Track your complaint</h2>
        <p className="mb-3 text-sm text-slate-500">Enter the tracking ID you received when you reported.</p>
        <div className="flex gap-2">
          <input
            value={id}
            onChange={(e) => setId(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="e.g. 662"
            className="flex-1 rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-600 focus:outline-none"
            aria-label="Tracking ID"
          />
          <button
            type="submit"
            disabled={!id}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Search className="h-4 w-4" /> Track
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>

      {res && (
        <div className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div>
            <div className="text-xs text-slate-500">Complaint #{res.complaint_id} · Issue #{res.issue_id}</div>
            <div className="font-semibold">{res.summary}</div>
          </div>
          <ol className="grid grid-cols-4 gap-1 text-center text-xs">
            {STEPS.map((s, i) => (
              <li key={s}>
                <div className={`h-1.5 rounded-full ${i <= step ? 'bg-brand-600' : 'bg-slate-200'}`} />
                <div className={`mt-1 ${i === step ? 'font-semibold text-brand-700' : 'text-slate-500'}`}>{STATUS_META[s].label}</div>
              </li>
            ))}
          </ol>
          <p className="text-sm text-slate-700">{res.message}</p>
          {res.status === 'needs_verification' && (
            <p className="text-sm text-purple-700">The department reported a fix; it is being checked against photo evidence before closing.</p>
          )}
          {res.deadline?.due_at && res.status !== 'resolved' && (
            <p className="text-sm text-slate-600">
              Target date: <b>{fmtDate(res.deadline.due_at)}</b>{' '}
              {deadlineChip(res.deadline) && (
                <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ring-1 ${deadlineChip(res.deadline)!.cls}`}>
                  {deadlineChip(res.deadline)!.label}
                </span>
              )}
            </p>
          )}
          {res.priority_rank && (
            <p className="text-sm text-slate-500">
              Currently <b>#{res.priority_rank}</b> in the city's priority queue (score {res.priority_score}).
            </p>
          )}
        </div>
      )}
    </div>
  )
}
