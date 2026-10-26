import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Camera,
  CheckCircle2,
  Copy,
  FileText,
  GitMerge,
  ImagePlus,
  Loader2,
  MapPin,
  MessageSquareText,
  Pencil,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { api, type Category, type Meta, type Preview, type Receipt } from '../api'
import { CATEGORY_HI, useLang } from '../i18n'
import { rememberCode } from '../myComplaints'
import { CATEGORY_META, fileToBase64, fmtDate, prettySub } from '../ui'
import { LocationPicker, VoiceButton, VoiceNoteButton } from './Kit'
import { ScoreBreakdown } from './ScoreBreakdown'
import { CATEGORY_ICON, TIER_PILL } from './Shell'

const PICKABLE: Category[] = ['road_damage', 'garbage', 'water_supply', 'drainage', 'streetlight', 'traffic', 'stray_animals', 'electricity']
const STEPS = [
  { key: 'describe', label: 'Describe', icon: FileText },
  { key: 'location', label: 'Location', icon: MapPin },
  { key: 'photo', label: 'Photo', icon: Camera },
  { key: 'review', label: 'Review', icon: CheckCircle2 },
] as const

const EXAMPLES = [
  'Raja Park gali no 5 ke paas bada gaddha hai, 2 hafte ho gaye, kal ek scooty wali gir gayi',
  'Street light not working near Shiv mandir, Mansarovar for 10 days, very dark at night',
  'मालवीय नगर गली 12 में सीवर का पानी सड़क पर बह रहा है',
]

export function ReportWizard({ meta, onTrack, categoryHint }: { meta: Meta | null; onTrack: (code: string) => void; categoryHint?: Category }) {
  const { lang } = useLang()
  const [step, setStep] = useState(0)
  const [category, setCategory] = useState<Category | undefined>(categoryHint)
  const [text, setText] = useState('')
  const [area, setArea] = useState('')
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null)
  const [image, setImage] = useState<{ b64: string; type: string; preview: string } | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [copied, setCopied] = useState(false)
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [phone, setPhone] = useState('')
  const phoneOk = /^(\+?91[\s-]?)?0?[6-9]\d{9}$/.test(phone.replace(/[\s()-]/g, ''))

  const areaName = meta?.localities.find((l) => l.id === area)?.name
  // The area dropdown is folded into the text so the AI can geocode it even without a pin.
  const fullText = () => (areaName && !text.toLowerCase().includes(areaName.toLowerCase()) ? `${text.trim()} (${areaName})` : text.trim())
  const payload = () => ({
    text: fullText(),
    ...(pin ?? {}),
    ...(category ? { category_hint: category } : {}),
    ...(image ? { image_base64: image.b64, image_media_type: image.type } : {}),
  })

  async function goReview() {
    setBusy(true)
    setError(null)
    try {
      setPreview(await api.preview(payload()))
      setStep(3)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const r = await api.submit({ ...payload(), channel: 'web', ...(smsOptIn && phoneOk ? { phone, sms_opt_in: true } : {}) })
      rememberCode(r.tracking_code)
      setReceipt(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (receipt) {
    return (
      <div className="animate-rise mx-auto max-w-2xl space-y-4">
        <div className="card overflow-hidden text-center">
          <div className="bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-6 text-white">
            <CheckCircle2 className="mx-auto h-12 w-12" />
            <h2 className="mt-2 font-display text-2xl font-bold">Complaint registered</h2>
            <p className="text-sm text-brand-100">Sent to {receipt.department}. Save your tracking code.</p>
          </div>
          <div className="p-6">
            <div className="inline-flex items-center gap-2 rounded-xl bg-surface-low px-5 py-3 ring-1 ring-brand-200">
              <span className="font-mono text-2xl font-bold tracking-wider text-brand-900 sm:text-3xl">{receipt.tracking_code}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(receipt.tracking_code)
                  setCopied(true)
                }}
                className="rounded-lg p-1.5 text-brand-700 hover:bg-brand-100"
                aria-label="Copy tracking code"
              >
                <Copy className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 h-4 text-xs text-brand-700">{copied ? 'Copied ✓' : 'Also saved under My cases on this device'}</p>
            {smsOptIn && phoneOk && (
              <p className="mx-auto mt-3 flex max-w-md items-center justify-center gap-2 rounded-lg bg-emerald-50 p-2.5 text-sm text-emerald-900">
                <MessageSquareText className="h-4 w-4" /> We'll text you when this is resolved.
              </p>
            )}
            {receipt.merged && (
              <p className="mx-auto mt-3 flex max-w-md items-start gap-2 rounded-lg bg-sky-50 p-3 text-left text-sm text-sky-900">
                <GitMerge className="mt-0.5 h-4 w-4 shrink-0" />
                {receipt.report_count - 1} other {receipt.report_count - 1 === 1 ? 'person has' : 'people have'} reported the same problem. Your
                report was added to it, which raises its priority.
              </p>
            )}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => onTrack(receipt.tracking_code)} className="btn btn-primary">
                Track this complaint <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setReceipt(null)
                  setStep(0)
                  setText('')
                  setImage(null)
                  setPin(null)
                  setPreview(null)
                  setCopied(false)
                }}
                className="btn btn-ghost"
              >
                Report another problem
              </button>
            </div>
          </div>
        </div>
        {receipt.priority_breakdown && (
          <section className="card p-5">
            <h3 className="mb-3 font-display font-bold">Why it got this priority</h3>
            <ScoreBreakdown factors={receipt.priority_breakdown} total={receipt.priority_score} />
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Report a civic problem</h1>
        <p className="text-sm text-slate-600">Takes about a minute. Write in English, Hindi or Hinglish, or just speak.</p>
      </div>

      {/* Stepper */}
      <ol className="grid grid-cols-4 gap-2" aria-label="Progress">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const state = i < step ? 'done' : i === step ? 'current' : 'todo'
          return (
            <li key={s.key} aria-current={state === 'current' ? 'step' : undefined}>
              <div className={`h-1.5 rounded-full transition-colors ${state === 'todo' ? 'bg-slate-200' : 'bg-brand-600'}`} />
              <div className={`mt-1.5 flex items-center gap-1 text-xs font-semibold ${state === 'current' ? 'text-brand-700' : state === 'done' ? 'text-slate-700' : 'text-slate-400'}`}>
                <Icon className="h-3.5 w-3.5" /> {s.label}
              </div>
            </li>
          )
        })}
      </ol>

      <div key={step} className="card animate-rise space-y-4 p-5">
        {step === 0 && (
          <>
            <div>
              <div className="mb-2 text-sm font-semibold">What kind of problem? <span className="font-normal text-slate-500">(optional, AI can suggest one)</span></div>
              <div className="flex flex-wrap gap-1.5">
                {PICKABLE.map((c) => {
                  const Icon = CATEGORY_ICON[c]
                  const on = category === c
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(on ? undefined : c)}
                      aria-pressed={on}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition ${
                        on ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-700 ring-slate-300 hover:ring-brand-500'
                      }`}
                    >
                      <Icon className="h-4 w-4" /> {lang === 'hi' ? CATEGORY_HI[c] : CATEGORY_META[c].label}
                    </button>
                  )
                })}
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">Describe the problem</span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                maxLength={3000}
                placeholder="What is wrong, where exactly (lane, landmark), since when, and is anyone at risk?"
                className="field p-3"
              />
              <span className="mt-1 flex justify-between text-xs text-slate-500">
                <span>Tip: mention a lane number or landmark, how long it has been, and any danger.</span>
                <span className="tnum">{text.length}/3000</span>
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <VoiceNoteButton hindi={lang === 'hi'} onText={(t) => setText((x) => (x ? `${x}\n${t}` : t))} />
              <VoiceButton lang={lang === 'hi' ? 'hi-IN' : 'en-IN'} onText={(t) => setText((x) => (x ? `${x} ${t}` : t))} />
              <span className="text-xs text-slate-500">Examples:</span>
              {EXAMPLES.map((s) => (
                <button key={s} type="button" onClick={() => setText(s)} className="max-w-[12rem] truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-brand-100" title={s}>
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">Area / locality</span>
              <select value={area} onChange={(e) => setArea(e.target.value)} className="field">
                <option value="">Choose an area (or describe it in your text)</option>
                {meta?.localities.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <div className="mb-1 text-sm font-semibold">
                Exact spot <span className="font-normal text-slate-500">(optional but helps the crew find it)</span>
              </div>
              <LocationPicker value={pin} onChange={setPin} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="text-sm text-slate-600">A clear photo helps the department judge severity and later prove the repair. Max 5 MB.</div>
            {image ? (
              <div className="relative inline-block">
                <img src={image.preview} alt="Attached" className="max-h-64 rounded-xl object-cover ring-1 ring-slate-200" />
                <button type="button" onClick={() => setImage(null)} className="absolute -right-2 -top-2 rounded-full bg-white p-1 shadow ring-1 ring-slate-300" aria-label="Remove photo">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-surface-low px-4 py-10 text-center hover:border-brand-500">
                <ImagePlus className="h-8 w-8 text-brand-600" />
                <span className="font-semibold">Add a photo</span>
                <span className="text-xs text-slate-500">Take one now or choose from your gallery</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    if (f.size > 5 * 1024 * 1024) return setError('Photo is larger than 5 MB.')
                    setError(null)
                    setImage(await fileToBase64(f))
                  }}
                />
              </label>
            )}
            <p className="text-xs text-slate-500">Videos are not supported yet; a photo works best for verification.</p>
          </>
        )}

        {step === 3 && preview && (
          <>
            <div className="flex items-center gap-2 rounded-lg bg-surface-low px-3 py-2 text-sm">
              <Bot className="h-4 w-4 text-brand-700" /> Here's what our AI understood. Check it before you submit.
            </div>
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-slate-500">Problem</dt>
              <dd className="font-semibold">
                {CATEGORY_META[preview.understood.category].emoji} {CATEGORY_META[preview.understood.category].label} · {prettySub(preview.understood.sub_type)}
              </dd>
              <dt className="text-slate-500">Where</dt>
              <dd>
                {[preview.locality ?? preview.understood.location_text, preview.understood.location_detail].filter(Boolean).join(', ') || (
                  <span className="text-amber-700">Not clear. Go back and add the area or a pin.</span>
                )}
                {pin && <span className="pill pill-ok ml-2">pinned</span>}
              </dd>
              <dt className="text-slate-500">How long</dt>
              <dd>{preview.understood.duration_days ? `${preview.understood.duration_days} days` : 'Not mentioned'}</dd>
              <dt className="text-slate-500">Risk</dt>
              <dd>
                {preview.understood.safety_risk ? <span className="pill pill-crit">Safety risk detected</span> : <span className="pill pill-zone">No direct safety risk</span>}
              </dd>
              <dt className="text-slate-500">Goes to</dt>
              <dd className="font-semibold">
                {preview.department}
                {preview.secondary_department && <span className="block text-xs font-normal text-slate-500">+ {preview.secondary_department}</span>}
              </dd>
              <dt className="text-slate-500">Expected</dt>
              <dd>
                <span className={`pill ${TIER_PILL[preview.tier].cls}`}>{TIER_PILL[preview.tier].label}</span>{' '}
                <span className="text-slate-600">target within {preview.deadline_hours >= 48 ? `${Math.round(preview.deadline_hours / 24)} days` : `${preview.deadline_hours} h`}</span>
              </dd>
              {image && (
                <>
                  <dt className="text-slate-500">Photo</dt>
                  <dd>
                    <img src={image.preview} alt="Attached" className="h-16 w-16 rounded-lg object-cover" />
                  </dd>
                </>
              )}
            </dl>
            <blockquote className="rounded-lg border-l-4 border-brand-500 bg-slate-50 p-3 text-sm italic">“{fullText()}”</blockquote>
            <div className="flex flex-wrap gap-2 text-xs">
              <button type="button" onClick={() => setStep(0)} className="inline-flex items-center gap-1 font-semibold text-brand-700">
                <Pencil className="h-3.5 w-3.5" /> Edit text
              </button>
              <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-1 font-semibold text-brand-700">
                <MapPin className="h-3.5 w-3.5" /> Edit location
              </button>
              <button type="button" onClick={() => setStep(2)} className="inline-flex items-center gap-1 font-semibold text-brand-700">
                <Camera className="h-3.5 w-3.5" /> Edit photo
              </button>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0d9488]" />
                <span>
                  <span className="font-semibold">Text me when it's resolved</span>
                  <span className="block text-xs text-slate-500">Optional. Your number is used only for updates about this complaint and is never shown publicly.</span>
                </span>
              </label>
              {smsOptIn && (
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-2 py-2 text-sm font-semibold text-slate-600">+91</span>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      inputMode="tel"
                      autoComplete="tel-national"
                      maxLength={14}
                      placeholder="10-digit mobile number"
                      className="field"
                      aria-label="Mobile number"
                    />
                  </div>
                  {phone && !phoneOk && <p className="mt-1 text-xs text-red-600">Enter a valid 10-digit Indian mobile number.</p>}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Submitted {fmtDate(new Date().toISOString().slice(0, 19))}. A municipal officer reviews the AI's suggestion before work is assigned.
            </p>
          </>
        )}

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
          {step > 0 ? (
            <button type="button" onClick={() => setStep(step - 1)} className="btn btn-ghost">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <span />
          )}
          {step < 2 && (
            <button type="button" disabled={step === 0 && text.trim().length < 10} onClick={() => setStep(step + 1)} className="btn btn-primary">
              Next <ArrowRight className="h-4 w-4" />
            </button>
          )}
          {step === 2 && (
            <button type="button" disabled={busy} onClick={goReview} className="btn btn-primary">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />} {image ? 'Review' : 'Skip photo & review'}
            </button>
          )}
          {step === 3 && (
            <button type="button" disabled={busy || (smsOptIn && !phoneOk)} onClick={submit} className="btn btn-primary h-12 px-6">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit complaint
            </button>
          )}
        </div>
        {step === 0 && text.trim().length > 0 && text.trim().length < 10 && <p className="text-xs text-slate-500">Please write a little more (at least 10 characters).</p>}
      </div>

      <p className="flex items-start gap-1.5 text-xs text-slate-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Your words and photo are seen only by municipal officials. The public map shows only the type of problem and the approximate area.
      </p>
    </div>
  )
}
