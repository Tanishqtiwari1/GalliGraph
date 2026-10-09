import {
  ArrowLeft,
  BadgeCheck,
  Bot,
  Camera,
  CircleAlert,
  ClipboardList,
  Clock,
  FileClock,
  Hourglass,
  ImagePlus,
  Loader2,
  MapPin,
  MessageSquare,
  Printer,
  ShieldAlert,
  ShieldQuestion,
  Siren,
  UserRound,
  Wrench,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet'
import { api, type IssueDetail as Detail, type Meta, type Status } from '../api'
import { CATEGORY_HI } from '../i18n'
import { CATEGORY_META, ESCALATION_LABEL, FACTOR_LABEL, STATUS_META, fileToBase64, fmtDate, fmtHours, prettySub, timeAgo } from '../ui'
import { CATEGORY_ICON, displayId, TIER_PILL } from './Shell'
import { CitizenFeedback, DuplicateReview, RouteAndNotes, SmsLog, TriageReview } from './IssueParts'
import { useToast } from './Kit'
import { WorkOrderModal } from './WorkOrderModal'

type Tab = 'evidence' | 'work' | 'verify' | 'audit'

const EVENT_DOT: Record<string, string> = {
  created: 'bg-brand-600',
  report: 'bg-slate-400',
  confirmation: 'bg-slate-300',
  escalation: 'bg-red-600',
  verification: 'bg-purple-600',
  status: 'bg-sky-600',
  assignment: 'bg-amber-500',
  sla: 'bg-orange-500',
  routing: 'bg-indigo-500',
  triage: 'bg-brand-500',
  override: 'bg-orange-600',
  info_request: 'bg-sky-500',
  info_reply: 'bg-sky-600',
  note: 'bg-slate-500',
  update: 'bg-sky-500',
  dispute: 'bg-red-600',
  citizen_feedback: 'bg-emerald-600',
  duplicate: 'bg-amber-500',
  reminder: 'bg-amber-600',
  sms: 'bg-emerald-500',
}

interface Props {
  issueId: number
  canSupervise: boolean
  meta?: Meta | null
  onClose?: () => void
  onChanged: () => void
}

function Panel({ icon: Icon, title, right, children }: { icon: typeof Bot; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-4">
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

export function IssueDetail({ issueId, canSupervise, meta = null, onClose, onChanged }: Props) {
  const toast = useToast()
  const [issue, setIssue] = useState<Detail | null>(null)
  const [tab, setTab] = useState<Tab>('evidence')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [officer, setOfficer] = useState('')
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<{ b64: string; type: string; preview: string } | null>(null)
  const [showWO, setShowWO] = useState(false)

  useEffect(() => {
    let live = true
    setIssue(null)
    setTab('evidence')
    setPhoto(null)
    setNote('')
    setError(null)
    api.issue(issueId).then((d) => live && setIssue(d)).catch((e) => live && setError(String(e)))
    return () => {
      live = false
    }
  }, [issueId])

  async function run(fn: () => Promise<Detail>, ok?: string) {
    setSaving(true)
    setError(null)
    try {
      setIssue(await fn())
      onChanged()
      if (ok) toast(ok)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }
  const reload = () => api.issue(issueId).then(setIssue).then(onChanged)

  const setStatus = (status: Status) => run(() => api.patchIssue(issueId, { status }))
  const escalate = () => {
    const reason = window.prompt('Why are you escalating this issue?')
    if (reason && reason.trim().length >= 3) run(() => api.escalate(issueId, reason.trim()))
  }

  if (error && !issue) return <div className="card p-4 text-sm text-red-600">{error}</div>
  if (!issue)
    return (
      <div className="card flex h-64 items-center justify-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )

  const tier = issue.sla_tier ?? 'low'
  const first = issue.complaints[0]
  const photos = issue.complaints.filter((c) => c.image_url).map((c) => c.image_url!)
  const Icon = CATEGORY_ICON[issue.category]
  const closed = issue.status === 'resolved'
  const topReason = issue.priority_breakdown?.find((f) => f.factor === 'safety' && f.points > 0) ? 'Safety hazard' : issue.priority_breakdown?.[0]?.reason

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="card p-4">
        {onClose && (
          <button type="button" onClick={onClose} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-slate-600 lg:hidden">
            <ArrowLeft className="h-4 w-4" /> Back to queue
          </button>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="pill pill-zone font-mono">{displayId(issue.id, issue.first_reported)}</span>
          <span className="pill pill-zone font-mono">WO #WO-{String(issue.id).padStart(4, '0')}</span>
          {!closed && issue.sla.hours_left !== null && (
            <span className={`pill ${issue.sla.overdue ? 'pill-crit' : 'pill-warn'}`}>
              <Hourglass className="h-3 w-3" />
              {issue.sla.overdue ? `${fmtHours(issue.sla.hours_left)} overdue` : `${fmtHours(issue.sla.hours_left)} left`}
            </span>
          )}
        </div>
        <h2 className="mt-2 font-display text-xl font-bold leading-snug sm:text-2xl">{issue.summary}</h2>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-600">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
          {issue.locality ?? 'Location unknown'}
          {issue.location_detail ? `, ${issue.location_detail}` : ''} · {issue.department}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className={`pill ${closed ? 'pill-ok' : issue.status === 'needs_verification' ? 'border-purple-200 bg-purple-50 text-purple-700' : 'pill-warn'}`}>
            {STATUS_META[issue.status].label}
            {issue.assigned_officer && !closed ? ` · ${issue.assigned_officer}` : ''}
          </span>
          <span className={`pill ${TIER_PILL[tier].cls}`}>
            {issue.safety_risk && <ShieldAlert className="h-3 w-3" />}
            {TIER_PILL[tier].label.toUpperCase()} (Score {issue.priority_score}/100{topReason ? ` · ${topReason}` : ''})
          </span>
          {!issue.reviewed_at && !closed && <span className="pill pill-warn">Untriaged</span>}
          {issue.disputed && <span className="pill pill-crit">Citizen dispute</span>}
          {issue.escalation_level > 0 && !closed && (
            <span className="pill pill-crit">
              <Siren className="h-3 w-3" /> {ESCALATION_LABEL[issue.escalation_level]}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface-low p-1" role="tablist">
        {(
          [
            ['evidence', 'AI & Evidence', Bot],
            ['work', 'Work Order', ClipboardList],
            ['verify', 'Verification', BadgeCheck],
            ['audit', 'Audit', FileClock],
          ] as const
        ).map(([id, label, TabIcon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${
              tab === id ? 'bg-brand-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
            }`}
          >
            <TabIcon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {tab === 'evidence' && (
        <>
          <TriageReview issue={issue} meta={meta} run={run} />
          <Panel icon={MessageSquare} title="Citizen intake report" right={<span className="pill pill-info">{first?.channel ?? 'web'}</span>}>
            {first && (
              <blockquote className="rounded-lg bg-surface-low p-3 text-sm italic text-slate-800">“{first.raw_text}”</blockquote>
            )}
            <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-slate-500">Reported</dt>
              <dd>
                {fmtDate(issue.first_reported)} · {timeAgo(issue.first_reported)}
              </dd>
              <dt className="text-slate-500">Coordinates</dt>
              <dd className="font-mono text-brand-700 tnum">
                {issue.lat !== null ? `${issue.lat.toFixed(4)}° N, ${issue.lng!.toFixed(4)}° E` : '—'}{' '}
                <span className="font-sans text-xs text-slate-500">({issue.geo_precision})</span>
              </dd>
              <dt className="text-slate-500">Language</dt>
              <dd className="capitalize">{first?.extracted.language ?? '—'}</dd>
            </dl>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {photos[0] && (
                <figure className="relative">
                  <img src={photos[0]} alt="Citizen evidence" className="h-36 w-full rounded-lg object-cover" />
                  <figcaption className="absolute bottom-1.5 left-1.5 rounded bg-navy-900/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    <Camera className="mr-1 inline h-3 w-3" /> Citizen photo
                  </figcaption>
                </figure>
              )}
              {issue.lat !== null && (
                <div className={`h-36 overflow-hidden rounded-lg ${photos[0] ? '' : 'sm:col-span-2'}`}>
                  <MapContainer center={[issue.lat, issue.lng!]} zoom={15} zoomControl={false} dragging={false} scrollWheelZoom={false} className="h-full w-full">
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                    <CircleMarker center={[issue.lat, issue.lng!]} radius={10} pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.6 }} />
                  </MapContainer>
                </div>
              )}
            </div>
          </Panel>

          <Panel icon={Bot} title="AI extraction & explainability" right={<span className="pill pill-info">{first?.extractor === 'claude' ? 'Claude AI' : first?.extractor === 'ollama' ? 'Local AI' : 'Trained model'}</span>}>
            <dl className="grid grid-cols-[7.5rem_1fr] items-center gap-x-3 gap-y-2 text-sm">
              <dt className="text-slate-500">Core issue</dt>
              <dd className="flex items-center gap-1.5 font-semibold">
                <Icon className="h-4 w-4 text-brand-700" /> {CATEGORY_META[issue.category].label} · {prettySub(issue.sub_type)}
                <span className="text-xs font-normal text-slate-500">{CATEGORY_HI[issue.category]}</span>
              </dd>
              <dt className="text-slate-500">Target depts</dt>
              <dd className="flex flex-wrap gap-1">
                {issue.tasks.map((t) => (
                  <span key={t.id} className={`pill ${t.role === 'primary' ? 'border-brand-700 bg-brand-700 text-white' : 'pill-zone'}`}>
                    {t.department}
                  </span>
                ))}
              </dd>
              <dt className="text-slate-500">Severity</dt>
              <dd>
                {issue.severity}/5 {issue.safety_risk && <span className="font-semibold text-red-700">· life-safety risk</span>}
              </dd>
            </dl>
            {issue.priority_breakdown && (
              <div className="mt-3 rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="section-label">AI risk weights breakdown</span>
                  <span className="font-mono text-sm font-bold text-red-700">Total: {issue.priority_score} / 100</span>
                </div>
                <ul className="space-y-1.5 text-sm">
                  {issue.priority_breakdown.map((f) => (
                    <li key={f.factor} className="flex items-start justify-between gap-3">
                      <span className="flex items-start gap-2">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${f.points >= f.weight * 0.6 ? 'bg-red-600' : 'bg-slate-400'}`} />
                        <span>
                          <span className="font-medium">{FACTOR_LABEL[f.factor]}</span>
                          <span className="block text-xs text-slate-500">{f.reason}</span>
                        </span>
                      </span>
                      <span className="font-mono font-semibold text-red-700 tnum">+{f.points}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <DuplicateReview issue={issue} onChanged={reload} />
        </>
      )}

      {tab === 'work' && (
        <Panel icon={Wrench} title="Deployment & logistics" right={<span className={`pill ${issue.assigned_officer ? 'pill-info' : 'pill-zone'}`}>{issue.assigned_officer ? 'Dispatched' : 'Unassigned'}</span>}>
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg bg-surface-low p-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-brand-700">
                <UserRound className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-semibold">{issue.assigned_officer ?? 'No officer assigned yet'}</div>
                <div className="text-xs text-slate-500">{issue.department}</div>
              </div>
            </div>
            {!closed && (
              <div className="flex gap-2">
                <input
                  value={officer}
                  onChange={(e) => setOfficer(e.target.value)}
                  placeholder="Officer, e.g. JE (Roads) · Zone 3"
                  aria-label="Officer"
                  className="field"
                />
                <button
                  type="button"
                  disabled={saving || !officer.trim()}
                  onClick={() => run(() => api.patchIssue(issueId, { assigned_officer: officer.trim(), status: 'assigned' }))}
                  className="btn btn-navy shrink-0"
                >
                  Assign
                </button>
              </div>
            )}
            <div>
              <div className="section-label mb-1.5">Tasks</div>
              <ul className="space-y-1.5">
                {issue.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">{t.department}</span>
                      {t.role === 'linked' && <span className="pill pill-zone ml-2">linked</span>}
                    </span>
                    <span className={`pill ${t.status === 'done' ? 'pill-ok' : 'pill-zone'}`}>{t.status === 'done' ? 'done' : 'pending'}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-surface-low p-3 text-sm">
              <Clock className="h-4 w-4 text-slate-500" />
              <span>
                Deadline <b>{issue.sla.due_at ? fmtDate(issue.sla.due_at) : '—'}</b> ({issue.sla_tier}, {issue.sla_hours && issue.sla_hours >= 48 ? `${issue.sla_hours / 24} days` : `${issue.sla_hours} h`})
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowWO(true)} className="btn btn-ghost">
                <Printer className="h-4 w-4" /> Print work order
              </button>
              {!closed && issue.status !== 'in_progress' && issue.status !== 'needs_verification' && (
                <button type="button" disabled={saving} onClick={() => setStatus('in_progress')} className="btn btn-ghost">
                  Mark work started
                </button>
              )}
            </div>
          </div>
        </Panel>
      )}

      {tab === 'work' && <RouteAndNotes issue={issue} meta={meta} run={run} />}
      {tab === 'verify' && <CitizenFeedback issue={issue} />}
      {tab === 'verify' && <SmsLog issue={issue} />}
      {tab === 'verify' && (
        <Panel icon={BadgeCheck} title="Resolution review">
          {issue.verification && (
            <div
              className={`mb-3 rounded-lg border p-3 text-sm ${
                issue.verification.verdict === 'resolved' ? 'border-emerald-200 bg-emerald-50' : issue.verification.verdict === 'not_resolved' ? 'border-red-200 bg-red-50' : 'border-purple-200 bg-purple-50'
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
                  ? closed
                    ? 'Repair verified by AI'
                    : 'AI thinks it is fixed, but confidence is too low to auto-close'
                  : issue.verification.verdict === 'not_resolved'
                    ? 'Photo does not show the problem fixed'
                    : 'Could not verify: needs supervisor review'}
              </div>
              <p className="mt-1 text-slate-700">{issue.verification.explanation}</p>
              {issue.resolution_note && <p className="mt-1 text-slate-500">Officer note: {issue.resolution_note}</p>}
              <div className="mt-2 grid grid-cols-2 gap-2">
                {photos[0] && (
                  <figure>
                    <img src={photos[0]} alt="Before" className="h-28 w-full rounded object-cover" />
                    <figcaption className="text-xs text-slate-500">Before (citizen)</figcaption>
                  </figure>
                )}
                {issue.after_image_url && (
                  <figure>
                    <img src={issue.after_image_url} alt="After repair" className="h-28 w-full rounded object-cover" />
                    <figcaption className="text-xs text-slate-500">After (field)</figcaption>
                  </figure>
                )}
              </div>
              {issue.status === 'needs_verification' &&
                (canSupervise ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={saving} onClick={() => setStatus('resolved')} className="btn btn-primary">
                      Approve closure
                    </button>
                    <button type="button" disabled={saving} onClick={() => setStatus('in_progress')} className="btn btn-ghost text-red-700">
                      Reject: send back for repair
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-600">A supervisor will review this closure.</p>
                ))}
            </div>
          )}
          {!closed && issue.status !== 'needs_verification' && (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">
                Upload an after-repair photo from the same spot. It goes to resolution review: AI compares it with the citizens' photos and flags
                inconsistencies, and a supervisor approves the closure. The citizen can confirm or dispute.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="btn btn-ghost cursor-pointer">
                  <ImagePlus className="h-4 w-4" /> {photo ? 'Change photo' : 'After-repair photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={async (e) => e.target.files?.[0] && setPhoto(await fileToBase64(e.target.files[0]))}
                  />
                </label>
                {photo && <img src={photo.preview} alt="After repair preview" className="h-10 w-10 rounded object-cover" />}
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done (optional)" aria-label="Resolution note" className="field" />
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  run(() => api.resolve(issueId, { note: note || undefined, ...(photo ? { after_image_base64: photo.b64, after_image_media_type: photo.type } : {}) }))
                }
                className="btn btn-primary w-full"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                {saving ? 'Verifying…' : 'Submit for closure'}
              </button>
            </div>
          )}
          {closed && (
            <button type="button" disabled={saving} onClick={() => setStatus('open')} className="btn btn-ghost">
              Reopen issue
            </button>
          )}
        </Panel>
      )}

      {tab === 'audit' && (
        <Panel icon={FileClock} title="Audit trail">
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
        </Panel>
      )}

      {/* Sticky action bar */}
      {!closed && (
        <div className="sticky bottom-16 z-10 grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur lg:bottom-2">
          <button type="button" onClick={() => setTab('work')} className="btn bg-surface text-navy-900 hover:bg-surface-high">
            <UserRound className="h-4 w-4" /> Assign
          </button>
          <button type="button" disabled={saving || issue.escalation_level >= 2} onClick={escalate} className="btn btn-danger">
            <Siren className="h-4 w-4" /> Escalate
          </button>
          <button type="button" onClick={() => setTab('verify')} className="btn btn-primary">
            <BadgeCheck className="h-4 w-4" /> Resolve
          </button>
        </div>
      )}

      {showWO && <WorkOrderModal issueId={issueId} onClose={() => setShowWO(false)} />}
    </div>
  )
}
