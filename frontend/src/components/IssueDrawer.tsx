import {
  BadgeCheck,
  Camera,
  CircleAlert,
  ClipboardList,
  Clock,
  ImagePlus,
  Loader2,
  MapPin,
  MessageSquare,
  ShieldQuestion,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type IssueDetail, type Status } from '../api'
import {
  CATEGORY_META,
  ESCALATION_LABEL,
  STATUS_META,
  deadlineChip,
  fileToBase64,
  fmtDate,
  prettySub,
  priorityTone,
  timeAgo,
} from '../ui'
import { ScoreBreakdown } from './ScoreBreakdown'
import { WorkOrderModal } from './WorkOrderModal'

interface Props {
  issueId: number
  onClose: () => void
  onChanged: () => void
}

const EVENT_DOT: Record<string, string> = {
  created: 'bg-brand-600',
  report: 'bg-slate-400',
  escalation: 'bg-red-600',
  verification: 'bg-purple-600',
  status: 'bg-sky-600',
  assignment: 'bg-amber-500',
  sla: 'bg-orange-500',
  routing: 'bg-indigo-500',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </section>
  )
}

export function IssueDrawer({ issueId, onClose, onChanged }: Props) {
  const [issue, setIssue] = useState<IssueDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [officer, setOfficer] = useState('')
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<{ b64: string; type: string; preview: string } | null>(null)
  const [showWO, setShowWO] = useState(false)

  useEffect(() => {
    let live = true
    setIssue(null)
    setPhoto(null)
    setNote('')
    api.issue(issueId).then((d) => live && setIssue(d)).catch((e) => live && setError(String(e)))
    return () => {
      live = false
    }
  }, [issueId])

  async function run(fn: () => Promise<IssueDetail>) {
    setSaving(true)
    setError(null)
    try {
      setIssue(await fn())
      onChanged()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const setStatus = (status: Status, actor = 'Ward official') => run(() => api.patchIssue(issueId, { status, actor }))
  const assign = () => officer.trim() && run(() => api.patchIssue(issueId, { assigned_officer: officer.trim(), status: 'assigned' }))
  const resolve = () =>
    run(() =>
      api.resolve(issueId, {
        officer: issue?.assigned_officer ?? 'Field officer',
        note: note || undefined,
        ...(photo ? { after_image_base64: photo.b64, after_image_media_type: photo.type } : {}),
      }),
    )

  const chip = issue ? deadlineChip(issue.sla) : null
  const beforePhotos = issue?.complaints.filter((c) => c.image_url).map((c) => c.image_url!) ?? []

  return (
    <aside
      className="fixed inset-y-0 right-0 z-[1000] flex w-full max-w-xl flex-col bg-white shadow-2xl ring-1 ring-slate-200"
      aria-label="Issue details"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <span className="text-sm font-medium text-slate-500">Issue #{issueId}</span>
        <div className="flex items-center gap-1">
          {issue && (
            <button
              type="button"
              onClick={() => setShowWO(true)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              <ClipboardList className="h-4 w-4" /> Work order
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {error && <p className="px-5 pt-3 text-sm text-red-600">{error}</p>}
      {!issue && !error && <p className="p-5 text-sm text-slate-500">Loading…</p>}

      {issue && (
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-md px-1.5 py-0.5 font-semibold ${priorityTone(issue.priority_score).cls}`}>
                {priorityTone(issue.priority_score).label}
                {issue.rank ? ` · rank #${issue.rank}` : ''}
              </span>
              <span className={`rounded-full px-2 py-0.5 ring-1 ${STATUS_META[issue.status].cls}`}>{STATUS_META[issue.status].label}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                {CATEGORY_META[issue.category].emoji} {CATEGORY_META[issue.category].label} · {prettySub(issue.sub_type)}
              </span>
            </div>
            <h2 className="mt-2 text-lg font-semibold leading-snug">{issue.summary}</h2>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {issue.locality ?? 'Unknown'}
                {issue.location_detail ? `, ${issue.location_detail}` : ''}
                <span className="text-xs text-slate-400">({issue.geo_precision})</span>
              </span>
              {issue.assigned_officer && (
                <span className="inline-flex items-center gap-1">
                  <UserRound className="h-4 w-4" /> {issue.assigned_officer}
                </span>
              )}
            </div>
          </div>

          {/* Deadline & escalation */}
          <div
            className={`rounded-lg p-3 text-sm ring-1 ${
              issue.sla.overdue ? 'bg-red-50 ring-red-200' : issue.status === 'resolved' ? 'bg-emerald-50 ring-emerald-200' : 'bg-slate-50 ring-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Clock className="h-4 w-4 text-slate-500" />
              <span className="font-medium">
                {issue.sla_tier ? `${issue.sla_tier[0].toUpperCase()}${issue.sla_tier.slice(1)} priority` : 'Deadline'}: resolve within{' '}
                {issue.sla_hours && issue.sla_hours >= 48 ? `${issue.sla_hours / 24} days` : `${issue.sla_hours} h`}
              </span>
              {chip && <span className={`rounded-full px-2 py-0.5 text-xs ring-1 ${chip.cls}`}>{chip.label}</span>}
            </div>
            {issue.sla.due_at && <div className="mt-1 text-slate-600">Due {fmtDate(issue.sla.due_at)}</div>}
            {issue.escalation_level > 0 && issue.status !== 'resolved' && (
              <div className="mt-1 font-medium text-red-700">
                Escalated to {ESCALATION_LABEL[issue.escalation_level]}
              </div>
            )}
          </div>

          {/* Tasks */}
          <Section title={issue.tasks.length > 1 ? 'Work split across departments' : 'Responsible department'}>
            <ul className="space-y-1.5">
              {issue.tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm ring-1 ring-slate-200">
                  <span>
                    <span className="font-medium">{t.department}</span>
                    {t.role === 'linked' && <span className="ml-2 rounded bg-indigo-50 px-1.5 text-xs text-indigo-700">linked task</span>}
                  </span>
                  <span className={`text-xs ${t.status === 'done' ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {t.status === 'done' ? 'done' : 'pending'}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          {/* Verification result */}
          {issue.verification && (
            <Section title={issue.status === 'needs_verification' || issue.status === 'resolved' ? 'Closure verification' : 'Last closure attempt'}>
              <div
                className={`rounded-lg p-3 text-sm ring-1 ${
                  issue.verification.verdict === 'resolved'
                    ? 'bg-emerald-50 ring-emerald-200'
                    : issue.verification.verdict === 'not_resolved'
                      ? 'bg-red-50 ring-red-200'
                      : 'bg-purple-50 ring-purple-200'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {issue.verification.verdict === 'resolved' ? (
                    <BadgeCheck className="h-4 w-4 text-emerald-700" />
                  ) : issue.verification.verdict === 'not_resolved' ? (
                    <CircleAlert className="h-4 w-4 text-red-700" />
                  ) : (
                    <ShieldQuestion className="h-4 w-4 text-purple-700" />
                  )}
                  {issue.verification.verdict === 'resolved'
                    ? issue.status === 'resolved'
                      ? 'Repair verified by AI'
                      : 'AI thinks it is fixed, but confidence is too low to auto-close'
                    : issue.verification.verdict === 'not_resolved'
                      ? 'Photo does not show the problem fixed'
                      : 'Could not verify: needs supervisor review'}
                  {issue.verification.method !== 'none' && (
                    <span className="text-xs font-normal text-slate-500">({issue.verification.confidence} confidence)</span>
                  )}
                </div>
                <p className="mt-1 text-slate-700">{issue.verification.explanation}</p>
                {issue.resolution_note && <p className="mt-1 text-slate-500">Officer note: {issue.resolution_note}</p>}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {beforePhotos[0] && (
                    <figure>
                      <img src={beforePhotos[0]} alt="Before (citizen photo)" className="h-28 w-full rounded object-cover" />
                      <figcaption className="text-xs text-slate-500">Before</figcaption>
                    </figure>
                  )}
                  {issue.after_image_url && (
                    <figure>
                      <img src={issue.after_image_url} alt="After repair" className="h-28 w-full rounded object-cover" />
                      <figcaption className="text-xs text-slate-500">After</figcaption>
                    </figure>
                  )}
                </div>
                {issue.status === 'needs_verification' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setStatus('resolved', 'Supervisor')}
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Supervisor: accept closure
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setStatus('in_progress', 'Supervisor')}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-300 disabled:opacity-50"
                    >
                      Reject: send back for repair
                    </button>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Actions */}
          {issue.status !== 'resolved' && issue.status !== 'needs_verification' && (
            <Section title="Assign & resolve">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    value={officer}
                    onChange={(e) => setOfficer(e.target.value)}
                    placeholder={issue.assigned_officer ?? 'Officer, e.g. JE (Roads) · Zone 3'}
                    className="flex-1 rounded-lg border-0 px-3 py-1.5 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-600 focus:outline-none"
                    aria-label="Officer"
                  />
                  <button
                    type="button"
                    disabled={saving || !officer.trim()}
                    onClick={assign}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Assign
                  </button>
                  {issue.status !== 'in_progress' && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setStatus('in_progress')}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Start work
                    </button>
                  )}
                </div>

                <div className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-sm font-medium">Close with evidence</div>
                  <p className="text-xs text-slate-500">
                    Upload an after-repair photo from the same spot. AI compares it with the citizens' photos; unclear or
                    mismatched photos are sent to a supervisor instead of closing.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-slate-300 hover:bg-slate-50">
                      <ImagePlus className="h-4 w-4" /> {photo ? 'Change photo' : 'After-repair photo'}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={async (e) => e.target.files?.[0] && setPhoto(await fileToBase64(e.target.files[0]))}
                      />
                    </label>
                    {photo && <img src={photo.preview} alt="After repair preview" className="h-10 w-10 rounded object-cover" />}
                  </div>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What was done (optional)"
                    className="w-full rounded-lg border-0 px-3 py-1.5 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-600 focus:outline-none"
                    aria-label="Resolution note"
                  />
                  <button
                    type="button"
                    disabled={saving}
                    onClick={resolve}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-900 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                    {saving ? 'Verifying…' : 'Submit for closure'}
                  </button>
                </div>
              </div>
            </Section>
          )}
          {issue.status === 'resolved' && (
            <button
              type="button"
              disabled={saving}
              onClick={() => setStatus('open')}
              className="rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50"
            >
              Reopen issue
            </button>
          )}

          <Section title="Why this priority?">
            {issue.priority_breakdown && <ScoreBreakdown factors={issue.priority_breakdown} total={issue.priority_score} />}
          </Section>

          <Section title={`${issue.complaints.length} citizen report${issue.complaints.length > 1 ? 's' : ''} merged into this issue`}>
            <ol className="space-y-2">
              {issue.complaints.map((c) => (
                <li key={c.id} className="flex gap-3 rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
                  {c.image_url && <img src={c.image_url} alt="Citizen photo" className="h-14 w-14 shrink-0 rounded object-cover" />}
                  <div className="min-w-0">
                    <p className="text-ink">“{c.raw_text}”</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> {c.channel}
                      </span>
                      {c.has_image && (
                        <span className="inline-flex items-center gap-1">
                          <Camera className="h-3 w-3" /> photo
                        </span>
                      )}
                      <span>{timeAgo(c.created_at)}</span>
                      <span>{c.extracted.language}</span>
                      <span>severity {c.extracted.severity}/5</span>
                      {c.dedup_score !== null && <span>match {Math.round(c.dedup_score * 100)}%</span>}
                      {c.needs_review && <span className="font-medium text-amber-700">review suggested</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section title="Timeline">
            <ol className="relative space-y-3 border-l border-slate-200 pl-4">
              {issue.events.map((e, idx) => (
                <li key={idx} className="relative text-sm">
                  <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${EVENT_DOT[e.kind] ?? 'bg-slate-400'}`} />
                  <div className="text-slate-800">{e.message}</div>
                  <div className="text-xs text-slate-500">
                    {fmtDate(e.at)} · {e.actor}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </div>
      )}
      {showWO && <WorkOrderModal issueId={issueId} onClose={() => setShowWO(false)} />}
    </aside>
  )
}
