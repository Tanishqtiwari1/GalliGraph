import { AlertTriangle, BadgeCheck, CheckCircle2, Circle, HelpCircle, Loader2, MessageCircleQuestion, MessageSquareText, Search, Send, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type TrackResult } from '../api'
import { rememberCode } from '../myComplaints'
import { deadlineChip, fmtDate } from '../ui'
import { useToast } from './Kit'
import { CATEGORY_ICON } from './Shell'

const ALL_STAGES = ['submitted', 'reviewed', 'assigned', 'in_progress', 'resolution_review', 'resolved']

export function TrackView({ initialCode }: { initialCode?: string }) {
  const toast = useToast()
  const [code, setCode] = useState(initialCode ?? '')
  const [res, setRes] = useState<TrackResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState('')
  const [disputeNote, setDisputeNote] = useState('')
  const [showDispute, setShowDispute] = useState(false)
  const [phone, setPhone] = useState('')
  const [smsTo, setSmsTo] = useState<string | null>(null)

  async function lookup(c: string) {
    setError(null)
    setRes(null)
    setBusy(true)
    try {
      const r = await api.track(c)
      setRes(r)
      rememberCode(r.tracking_code)
    } catch {
      setError('No complaint found with that tracking code. It looks like JA-XXXX-XXXX.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (initialCode) lookup(initialCode)
  }, [initialCode])

  async function act(fn: () => Promise<TrackResult>, ok: string) {
    setBusy(true)
    try {
      setRes(await fn())
      toast(ok)
      setShowDispute(false)
      setReply('')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong', 'error')
    } finally {
      setBusy(false)
    }
  }

  const chip = res ? deadlineChip(res.deadline) : null
  const Icon = res ? CATEGORY_ICON[res.category] : null
  const doneKeys = new Set(res?.stages.map((s) => s.key))
  const currentKey = res?.stages[res.stages.length - 1]?.key

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          lookup(code)
        }}
        className="card p-5"
      >
        <h1 className="font-display text-2xl font-bold">Track your complaint</h1>
        <p className="mb-3 text-sm text-slate-500">Enter the tracking code you got when you reported.</p>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="JA-XXXX-XXXX"
            maxLength={12}
            className="field min-w-0 flex-1 font-mono tracking-wider"
            aria-label="Tracking code"
          />
          <button type="submit" disabled={code.trim().length < 12 || busy} className="btn btn-primary">
            {busy && !res ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Track
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>

      {res && Icon && (
        <div className="animate-rise space-y-4">
          <div className="card p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-brand-700">
                <Icon className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <div className="font-mono text-xs text-slate-500">
                  {res.tracking_code} · reported {fmtDate(res.reported_at)}
                </div>
                <h2 className="font-display text-xl font-bold">{res.label}</h2>
                <p className="text-sm text-slate-600">{res.message}</p>
              </div>
            </div>

            {/* Stage tracker: only stages that have happened are filled; the rest are shown as upcoming */}
            <ol className="mt-5 space-y-0">
              {(res.status === 'rejected' ? res.stages.map((s) => s.key) : ALL_STAGES).map((key, idx, arr) => {
                const stage = res.stages.find((s) => s.key === key)
                const done = doneKeys.has(key)
                const current = key === currentKey
                const label = stage?.label ?? { reviewed: 'Reviewed', assigned: 'Assigned', in_progress: 'In progress', resolution_review: 'Resolution review', resolved: 'Resolved' }[key]
                return (
                  <li key={key} className="relative flex gap-3 pb-4 last:pb-0">
                    {idx < arr.length - 1 && <span className={`absolute left-[11px] top-6 h-full w-0.5 ${done ? 'bg-brand-500' : 'bg-slate-200'}`} />}
                    <span className="relative z-10 mt-0.5">
                      {done ? (
                        <CheckCircle2 className={`h-6 w-6 ${current ? 'text-brand-600' : 'text-brand-500'}`} fill={current ? '#ccfbf1' : 'white'} />
                      ) : (
                        <Circle className="h-6 w-6 text-slate-300" />
                      )}
                    </span>
                    <div className={done ? '' : 'text-slate-400'}>
                      <div className={`text-sm font-semibold ${current ? 'text-brand-800' : ''}`}>{label}</div>
                      {stage?.at && <div className="text-xs text-slate-500">{fmtDate(stage.at)}</div>}
                      {!done && <div className="text-xs">Upcoming</div>}
                    </div>
                  </li>
                )
              })}
            </ol>

            {res.deadline.due_at && !['resolved', 'rejected'].includes(res.status) && (
              <p className="mt-3 text-sm text-slate-600">
                Target date: <b>{fmtDate(res.deadline.due_at)}</b>{' '}
                {chip && <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ring-1 ${chip.cls}`}>{chip.label}</span>}
              </p>
            )}
            {res.escalated && (
              <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0" /> The deadline was missed, so this was escalated to a senior officer.
              </p>
            )}
          </div>

          {/* SMS opt-in after the fact */}
          {!res.sms_opt_in && !smsTo && !['resolved', 'rejected'].includes(res.status) && (
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                try {
                  const r = await api.notifyOptIn(res.tracking_code, phone)
                  setSmsTo(r.to)
                  toast(`We'll text ${r.to} when it's resolved`)
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Could not save the number', 'error')
                }
              }}
              className="card flex flex-wrap items-center gap-2 p-4"
            >
              <MessageSquareText className="h-5 w-5 text-brand-700" />
              <span className="text-sm font-semibold">Get an SMS when it's fixed</span>
              <span className="ml-auto flex w-full gap-2 sm:w-auto">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="10-digit mobile" className="field sm:w-44" aria-label="Mobile number" />
                <button type="submit" disabled={phone.replace(/\D/g, '').length < 10} className="btn btn-primary shrink-0">
                  Notify me
                </button>
              </span>
            </form>
          )}
          {(res.sms_opt_in || smsTo) && !['resolved', 'rejected'].includes(res.status) && (
            <p className="flex items-center gap-2 text-sm text-emerald-800">
              <MessageSquareText className="h-4 w-4" /> You'll get an SMS when this is resolved.
            </p>
          )}

          {/* More information requested */}
          {res.info_request && (
            <div className="card border-amber-300 bg-saffron-50 p-5">
              <h3 className="flex items-center gap-2 font-display font-bold text-amber-900">
                <MessageCircleQuestion className="h-5 w-5" /> The officer needs more information
              </h3>
              <p className="mt-1 text-sm text-amber-900">“{res.info_request}”</p>
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} className="field mt-3 bg-white" placeholder="Your answer" aria-label="Your answer" />
              <button type="button" disabled={busy || reply.trim().length < 3} onClick={() => act(() => api.reply(res.tracking_code, reply), 'Thanks. Your answer was sent.')} className="btn btn-primary mt-2">
                <Send className="h-4 w-4" /> Send answer
              </button>
            </div>
          )}

          {/* Resolution evidence + confirm / dispute */}
          {res.can_give_feedback && (
            <div className="card p-5">
              <h3 className="flex items-center gap-2 font-display font-bold">
                <BadgeCheck className="h-5 w-5 text-brand-700" /> {res.status === 'resolved' ? 'Marked as fixed' : 'The department says it is fixed'}
              </h3>
              {res.resolution_note && <p className="mt-1 text-sm text-slate-700">Work done: {res.resolution_note}</p>}
              {res.has_evidence && (
                <img src={`/api/track/${res.tracking_code}/evidence`} alt="After-repair photo from the department" className="mt-3 max-h-64 w-full rounded-xl object-cover" />
              )}
              {res.disputed ? (
                <p className="mt-3 rounded-lg bg-purple-50 p-3 text-sm text-purple-800">You reported that it is not fixed. A supervisor is reviewing the case.</p>
              ) : (
                <>
                  <p className="mt-3 text-sm font-semibold">Is the problem really fixed?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => act(() => api.feedback(res.tracking_code, 'fixed'), 'Thank you for confirming!')} className="btn btn-primary">
                      <ThumbsUp className="h-4 w-4" /> Yes, it's fixed
                    </button>
                    <button type="button" disabled={busy} onClick={() => setShowDispute((v) => !v)} className="btn btn-ghost text-red-700">
                      <ThumbsDown className="h-4 w-4" /> No, still a problem
                    </button>
                  </div>
                  {showDispute && (
                    <div className="mt-3">
                      <textarea value={disputeNote} onChange={(e) => setDisputeNote(e.target.value)} rows={2} className="field" placeholder="What is still wrong? (optional)" aria-label="What is still wrong" />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(() => api.feedback(res.tracking_code, 'not_fixed', disputeNote || undefined), 'Sent for review. A supervisor will check.')}
                        className="btn btn-danger mt-2"
                      >
                        Request a review
                      </button>
                      <p className="mt-1 text-xs text-slate-500">This starts a review by a supervisor. It doesn't automatically reopen the case.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="card p-5">
            <h3 className="mb-3 font-display font-bold">Updates</h3>
            <ol className="space-y-3 border-l-2 border-slate-200 pl-4 text-sm">
              {[...res.timeline].reverse().map((e, i) => (
                <li key={i} className="relative">
                  <span className={`absolute -left-[23px] top-1 h-3 w-3 rounded-full ring-2 ring-white ${e.kind === 'update' ? 'bg-sky-500' : e.kind === 'dispute' ? 'bg-red-500' : 'bg-brand-600'}`} />
                  <div className={e.kind === 'update' ? 'font-medium text-sky-900' : ''}>{e.message}</div>
                  <div className="text-xs text-slate-500">{fmtDate(e.at)}</div>
                </li>
              ))}
            </ol>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <HelpCircle className="h-3.5 w-3.5" /> Officer names and internal notes are not shown publicly.
          </p>
        </div>
      )}
    </div>
  )
}
