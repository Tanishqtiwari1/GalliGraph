import { Ban, Bot, Check, GitMerge, Loader2, Lock, Megaphone, MessageCircleQuestion, MessageSquareText, Pencil, Route, Scissors, Sparkles, StickyNote } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type DuplicateRow, type IssueDetail, type Meta } from '../api'
import { CATEGORY_META, fmtDate, prettySub, timeAgo } from '../ui'
import { Modal, useToast } from './Kit'

type Run = (fn: () => Promise<IssueDetail>, ok?: string) => Promise<void>

function Section({ icon: Icon, title, right, children, tone = '' }: { icon: typeof Bot; title: string; right?: React.ReactNode; children: React.ReactNode; tone?: string }) {
  return (
    <section className={`card p-4 ${tone}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-base font-bold">
          <Icon className="h-5 w-5 text-brand-700" aria-hidden /> {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------ AI suggestion review */

export function TriageReview({ issue, meta, run }: { issue: IssueDetail; meta: Meta | null; run: Run }) {
  const [mode, setMode] = useState<null | 'edit' | 'reject' | 'info'>(null)
  const [reason, setReason] = useState('')
  const [question, setQuestion] = useState('')
  const [cat, setCat] = useState(issue.category)
  const [sub, setSub] = useState(issue.sub_type)
  const [sev, setSev] = useState(issue.severity)
  const [dept, setDept] = useState(issue.department)
  const first = issue.complaints[0]
  const tm = first?.triage_meta
  const conf = tm?.confidence
  const closed = issue.status === 'resolved' || issue.status === 'rejected'
  const subs = meta?.categories.find((c) => c.key === cat)?.sub_types ?? ['other']

  const close = () => {
    setMode(null)
    setReason('')
    setQuestion('')
  }

  return (
    <Section
      icon={Sparkles}
      title="AI suggestion review"
      tone={issue.reviewed_at ? '' : 'border-brand-300 ring-1 ring-brand-100'}
      right={
        issue.reviewed_at ? (
          <span className="pill pill-ok">
            <Check className="h-3 w-3" /> Reviewed
          </span>
        ) : (
          <span className="pill pill-warn">Needs review</span>
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-surface-low p-3 text-sm">
          <div className="section-label mb-1">AI suggests</div>
          <div className="font-semibold">
            {CATEGORY_META[issue.category].label} · {prettySub(issue.sub_type)}
          </div>
          <div className="text-slate-600">
            Severity {issue.severity}/5 · {issue.department}
          </div>
          <div className="mt-1 text-xs italic text-slate-600">“{first?.extracted.summary_en}”</div>
        </div>
        <div className="rounded-lg bg-surface-low p-3 text-sm">
          <div className="section-label mb-1">Confidence</div>
          {conf != null ? (
            <>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
                  <div className={`h-2 rounded-full ${conf >= 0.7 ? 'bg-emerald-500' : conf >= 0.45 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.round(conf * 100)}%` }} />
                </div>
                <span className="font-mono text-sm font-bold tnum">{Math.round(conf * 100)}%</span>
              </div>
              <div className="mt-0.5 text-xs text-slate-500">based on {tm?.basis ?? "the trained model"}</div>
            </>
          ) : (
            <div className="text-xs text-slate-500">Not available for this extractor</div>
          )}
          <div className="section-label mb-1 mt-2">Missing information</div>
          {tm?.missing.length ? (
            <div className="flex flex-wrap gap-1">
              {tm.missing.map((m) => (
                <span key={m} className="pill pill-warn">
                  {m}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-emerald-700">Nothing important missing</span>
          )}
        </div>
      </div>
      {issue.info_request && (
        <p className="mt-3 rounded-lg bg-sky-50 p-2.5 text-sm text-sky-900">
          <MessageCircleQuestion className="mr-1 inline h-4 w-4" /> Waiting for citizen: “{issue.info_request}”
        </p>
      )}
      {issue.reviewed_by && <p className="mt-2 text-xs text-slate-500">Reviewed by {issue.reviewed_by}{issue.reviewed_at ? ` · ${timeAgo(issue.reviewed_at)}` : ''}</p>}
      {!closed && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!issue.reviewed_at && (
            <button type="button" onClick={() => run(() => api.triage(issue.id, { action: 'approve' }), 'AI suggestion approved')} className="btn btn-primary">
              <Check className="h-4 w-4" /> Approve
            </button>
          )}
          <button type="button" onClick={() => setMode('edit')} className="btn btn-ghost">
            <Pencil className="h-4 w-4" /> Edit
          </button>
          <button type="button" onClick={() => setMode('info')} className="btn btn-ghost">
            <MessageCircleQuestion className="h-4 w-4" /> Request info
          </button>
          <button type="button" onClick={() => setMode('reject')} className="btn btn-ghost text-red-700">
            <Ban className="h-4 w-4" /> Reject
          </button>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">AI suggests; the authorised officer decides. Overrides are recorded with your reason.</p>

      {mode === 'edit' && (
        <Modal title="Correct the AI suggestion" onClose={close}>
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="mb-1 block font-semibold">Category</span>
              <select
                value={cat}
                onChange={(e) => {
                  const c = e.target.value as typeof cat
                  setCat(c)
                  setSub('other')
                  setDept(meta?.categories.find((x) => x.key === c)?.department ?? dept)
                }}
                className="field"
              >
                {meta?.categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold">Sub-type</span>
              <select value={sub} onChange={(e) => setSub(e.target.value)} className="field">
                {subs.map((s) => (
                  <option key={s} value={s}>
                    {prettySub(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold">Severity: {sev}/5</span>
              <input type="range" min={1} max={5} value={sev} onChange={(e) => setSev(Number(e.target.value))} className="w-full accent-[#0d9488]" />
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold">Department</span>
              <select value={dept} onChange={(e) => setDept(e.target.value)} className="field">
                {meta?.departments.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold">Reason for override (required)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="field" placeholder="e.g. photo shows a live wire, not a streetlight fault" />
            </label>
            <button
              type="button"
              disabled={reason.trim().length < 3}
              onClick={() =>
                run(() => api.triage(issue.id, { action: 'edit', category: cat, sub_type: sub, severity: sev, department: dept, reason }), 'Override saved to the audit log').then(close)
              }
              className="btn btn-primary w-full"
            >
              Save correction
            </button>
          </div>
        </Modal>
      )}
      {mode === 'reject' && (
        <Modal title="Reject this complaint" onClose={close}>
          <p className="mb-2 text-sm text-slate-600">The citizen will see that it was closed as not actionable, with your reason.</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="field" placeholder="e.g. Private property, not a municipal matter" />
          <button type="button" disabled={reason.trim().length < 3} onClick={() => run(() => api.triage(issue.id, { action: 'reject', reason }), 'Complaint rejected').then(close)} className="btn btn-danger mt-3 w-full">
            Reject complaint
          </button>
        </Modal>
      )}
      {mode === 'info' && (
        <Modal title="Ask the citizen for more information" onClose={close}>
          <p className="mb-2 text-sm text-slate-600">The question appears on their tracking page. The issue waits until they reply.</p>
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} className="field" placeholder="e.g. Please share the nearest landmark or a photo" />
          <button type="button" disabled={question.trim().length < 5} onClick={() => run(() => api.triage(issue.id, { action: 'request_info', question }), 'Question sent to the citizen').then(close)} className="btn btn-primary mt-3 w-full">
            Send question
          </button>
        </Modal>
      )}
    </Section>
  )
}

/* ------------------------------------------------------------------ duplicate review (side by side) */

export function DuplicateReview({ issue, onChanged }: { issue: IssueDetail; onChanged: () => void }) {
  const toast = useToast()
  const [rows, setRows] = useState<DuplicateRow[] | null>(null)
  const [pick, setPick] = useState(1)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.duplicates(issue.id).then((r) => {
      setRows(r)
      setPick(r.length > 1 ? 1 : 0)
    }).catch(() => setRows([]))
  }, [issue.id, issue.report_count])

  if (!rows) return <section className="card p-4 text-sm text-slate-500">Loading related reports…</section>
  const first = rows[0]
  const other = rows[pick]

  async function act(kind: 'confirm' | 'split') {
    if (!other) return
    setBusy(true)
    try {
      if (kind === 'confirm') {
        await api.confirmDuplicate(other.complaint_id)
        toast('Confirmed as the same problem')
      } else {
        const r = await api.split(other.complaint_id)
        toast(`Split out as incident #${r.new_issue_id}`)
      }
      onChanged()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section icon={GitMerge} title="Duplicate review" right={<span className="pill pill-warn">{rows.length} related report{rows.length !== 1 ? 's' : ''}</span>}>
      {rows.length < 2 ? (
        <p className="text-sm text-slate-600">Only one report so far. New similar reports nearby will be merged here automatically.</p>
      ) : (
        <>
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            {rows.slice(1).map((r, i) => (
              <button
                key={r.complaint_id}
                type="button"
                onClick={() => setPick(i + 1)}
                aria-pressed={pick === i + 1}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${pick === i + 1 ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white ring-slate-300'} ${r.needs_review ? 'outline outline-2 outline-amber-400' : ''}`}
              >
                Report {i + 2}
                {r.needs_review ? ' ⚠' : ''}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[first, other].map((r, i) => (
              <div key={r.complaint_id} className={`rounded-lg p-3 text-sm ${i === 0 ? 'bg-surface-low' : 'bg-amber-50/60 ring-1 ring-amber-200'}`}>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold">{i === 0 ? 'First report' : `Report ${pick + 1}`}</span>
                  <span className="font-mono">{r.tracking_code}</span>
                </div>
                <p className="mt-1">“{r.raw_text}”</p>
                <div className="mt-1 text-xs text-slate-500">
                  {fmtDate(r.created_at)} · {r.channel}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg border border-slate-200 p-2">
              <div className="font-mono text-base font-bold tnum">{other.match_score != null ? `${Math.round(other.match_score * 100)}%` : '—'}</div>
              <div className="text-slate-500">match score</div>
            </div>
            <div className="rounded-lg border border-slate-200 p-2">
              <div className="font-mono text-base font-bold tnum">{other.distance_m != null ? `${other.distance_m} m` : 'same area'}</div>
              <div className="text-slate-500">apart ({other.geo_precision})</div>
            </div>
            <div className="rounded-lg border border-slate-200 p-2">
              <div className="font-mono text-base font-bold tnum">{other.hours_after_first < 48 ? `${other.hours_after_first} h` : `${Math.round(other.hours_after_first / 24)} d`}</div>
              <div className="text-slate-500">after first</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => act('confirm')} className="btn btn-primary">
              <Check className="h-4 w-4" /> Same problem
            </button>
            <button type="button" disabled={busy} onClick={() => act('split')} className="btn btn-ghost">
              <Scissors className="h-4 w-4" /> Different, split out
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Every report keeps its own tracking code, so citizens still get updates.</p>
        </>
      )}
    </Section>
  )
}

/* ------------------------------------------------------------------ re-route & work notes */

export function RouteAndNotes({ issue, meta, run }: { issue: IssueDetail; meta: Meta | null; run: Run }) {
  const [dept, setDept] = useState(issue.department)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)
  const closed = issue.status === 'resolved' || issue.status === 'rejected'
  const notes = issue.events.filter((e) => e.kind === 'note' || e.kind === 'update')

  return (
    <>
      {!closed && (
        <Section icon={Route} title="Routing">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <select value={dept} onChange={(e) => setDept(e.target.value)} className="field" aria-label="Department">
              {meta?.departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for re-routing" className="field" aria-label="Reason" />
            <button
              type="button"
              disabled={dept === issue.department || reason.trim().length < 3}
              onClick={() => run(() => api.patchIssue(issue.id, { department: dept, reason }), 'Re-routed').then(() => setReason(''))}
              className="btn btn-navy"
            >
              Re-route
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Ward: <b>{issue.locality ?? 'unknown'}</b>. Manual overrides are recorded with the reason.
          </p>
        </Section>
      )}
      <Section icon={StickyNote} title="Work notes & progress updates">
        <ul className="mb-3 space-y-2">
          {notes.length === 0 && <li className="text-sm text-slate-500">No notes yet.</li>}
          {notes.map((n, i) => (
            <li key={i} className={`rounded-lg p-2.5 text-sm ${n.kind === 'update' ? 'bg-sky-50' : 'bg-slate-50'}`}>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 font-semibold">
                  {n.kind === 'update' ? <Megaphone className="h-3 w-3 text-sky-700" /> : <Lock className="h-3 w-3" />}
                  {n.kind === 'update' ? 'Public update' : 'Internal note'}
                </span>
                <span>
                  {n.actor} · {timeAgo(n.at)}
                </span>
              </div>
              <p className="mt-0.5">{n.message}</p>
            </li>
          ))}
        </ul>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="field" placeholder="Add a progress note…" aria-label="Note" />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="h-4 w-4 accent-[#0d9488]" />
            Show to citizens as a public update
          </label>
          <button
            type="button"
            disabled={saving || note.trim().length < 2}
            onClick={async () => {
              setSaving(true)
              await run(() => api.addNote(issue.id, note.trim(), isPublic), isPublic ? 'Public update posted' : 'Note saved')
              setNote('')
              setSaving(false)
            }}
            className="btn btn-primary"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Add note
          </button>
        </div>
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------ citizen feedback */

export function CitizenFeedback({ issue }: { issue: IssueDetail }) {
  const fb = issue.events.filter((e) => e.kind === 'citizen_feedback' || e.kind === 'dispute' || e.kind === 'info_reply')
  if (!fb.length && !issue.disputed) return null
  return (
    <section className={`card p-4 ${issue.disputed ? 'border-red-300 bg-red-50/40' : ''}`}>
      <h3 className="mb-2 font-display text-base font-bold">Citizen feedback</h3>
      {issue.disputed && <p className="mb-2 text-sm font-semibold text-red-700">A citizen says the problem persists. Review before approving the closure.</p>}
      <ul className="space-y-1.5 text-sm">
        {fb.map((e, i) => (
          <li key={i} className="flex items-start justify-between gap-2">
            <span>{e.message}</span>
            <span className="shrink-0 text-xs text-slate-500">{timeAgo(e.at)}</span>
          </li>
        ))}
      </ul>
      {issue.citizen_confirmed > 0 && <p className="mt-2 text-xs text-emerald-700">{issue.citizen_confirmed} citizen confirmation(s) that it is fixed.</p>}
    </section>
  )
}

/* ------------------------------------------------------------------ SMS to citizens */

export function SmsLog({ issue }: { issue: IssueDetail }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.issueSms>> | null>(null)
  useEffect(() => {
    api.issueSms(issue.id).then(setData).catch(() => {})
  }, [issue.id, issue.status])
  const optedIn = issue.complaints.filter((c) => c.sms_opt_in)
  return (
    <Section
      icon={MessageSquareText}
      title="Citizen SMS"
      right={data && <span className={`pill ${data.provider === 'console' ? 'pill-warn' : 'pill-ok'}`}>{data.provider === 'console' ? 'Demo mode (not sent)' : data.provider}</span>}
    >
      <p className="text-sm text-slate-600">
        {optedIn.length
          ? `${optedIn.length} citizen${optedIn.length > 1 ? 's' : ''} (${optedIn.map((c) => c.sms_to).join(', ')}) will be texted when this issue is resolved.`
          : 'No citizen on this issue asked for SMS updates.'}
      </p>
      {data && data.messages.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {data.messages.map((m, i) => (
            <li key={i} className="rounded-lg bg-slate-50 p-2.5 text-sm">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-mono">{m.to_masked}</span>
                <span className={m.status === 'failed' ? 'font-semibold text-red-700' : m.status === 'sent' ? 'font-semibold text-emerald-700' : ''}>
                  {m.status} · {timeAgo(m.created_at)}
                </span>
              </div>
              <p className="mt-0.5">{m.body}</p>
              {m.error && <p className="mt-0.5 text-xs text-red-700">{m.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
