import { CheckCircle2, GitMerge, ImagePlus, Loader2, LocateFixed, Send, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { api, type IngestResult } from '../api'
import { CATEGORY_META, EXTRACTOR_LABEL, prettySub, priorityTone } from '../ui'
import { ScoreBreakdown } from './ScoreBreakdown'

const SAMPLES = [
  'bhai Raja Park gali no 5 ke paas bada gaddha hai, 2 hafte ho gaye, kal ek scooty wali gir gayi',
  'Huge pothole in Raja Park lane 5, a two wheeler fell yesterday evening. Please fix urgently!',
  'मालवीय नगर गली 12 में सीवर का पानी सड़क पर बह रहा है, बच्चे यहीं से स्कूल जाते हैं',
  'Street light not working near Shiv mandir, Mansarovar for 10 days, very dark at night',
  'jhotwara gali 3 me 4 din se paani nahi aa raha, tanker bhi nahi aaya',
]

interface Props {
  onSubmitted: (r: IngestResult) => void
  onOpenIssue: (id: number) => void
}

export function ReportForm({ onSubmitted, onOpenIssue }: Props) {
  const [text, setText] = useState('')
  const [channel, setChannel] = useState('web')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [image, setImage] = useState<{ b64: string; type: string; preview: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<IngestResult | null>(null)

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setError('Could not read your location; the area name in the text will be used instead.'),
    )
  }

  function pickImage(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      setImage({ b64: url.split(',')[1], type: file.type || 'image/jpeg', preview: url })
    }
    reader.readAsDataURL(file)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await api.submit({
        text,
        channel,
        ...(coords ?? {}),
        ...(image ? { image_base64: image.b64, image_media_type: image.type } : {}),
      })
      setResult(r)
      onSubmitted(r)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const ex = result?.complaint.extracted
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={submit} className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div>
          <h2 className="text-lg font-semibold">Report a civic problem</h2>
          <p className="text-sm text-slate-500">Write in English, Hindi or Hinglish — no form to fill.</p>
        </div>

        <label className="block">
          <span className="sr-only">Complaint</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            required
            minLength={3}
            placeholder="e.g. Raja Park gali 5 me 2 hafte se bada gaddha hai…"
            className="w-full rounded-lg border-0 p-3 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-600 focus:outline-none"
          />
        </label>

        <div>
          <div className="mb-1.5 text-xs font-medium text-slate-500">Try a sample</div>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setText(s)}
                className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 text-left text-xs text-slate-700 hover:bg-brand-100"
                title={s}
              >
                {s.slice(0, 42)}…
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={locate}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-300 hover:bg-slate-50"
          >
            <LocateFixed className="h-4 w-4" />
            {coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : 'Use my location'}
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-300 hover:bg-slate-50">
            <ImagePlus className="h-4 w-4" /> {image ? 'Change photo' : 'Add photo'}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => pickImage(e.target.files?.[0])} />
          </label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="rounded-lg border-0 py-1.5 pl-3 pr-8 text-sm ring-1 ring-slate-300"
            aria-label="Channel"
          >
            <option value="web">Web</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="app">Mobile app</option>
            <option value="email">Email</option>
          </select>
        </div>

        {image && (
          <div className="relative inline-block">
            <img src={image.preview} alt="Attached" className="h-24 rounded-lg object-cover ring-1 ring-slate-200" />
            <button
              type="button"
              onClick={() => setImage(null)}
              className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 shadow ring-1 ring-slate-300"
              aria-label="Remove photo"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy || text.trim().length < 3}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-900 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {busy ? 'AI is reading the complaint…' : 'Submit complaint'}
        </button>
      </form>

      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        {!result ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center text-sm text-slate-500">
            <Sparkles className="h-8 w-8 text-brand-500" />
            <p>Submit a complaint to see CivicPulse extract, deduplicate, prioritise and route it in real time.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div
              className={`flex items-start gap-3 rounded-lg p-3 ${result.merged ? 'bg-brand-50 text-brand-900' : 'bg-sky-50 text-sky-900'}`}
            >
              {result.merged ? <GitMerge className="mt-0.5 h-5 w-5" /> : <CheckCircle2 className="mt-0.5 h-5 w-5" />}
              <div className="text-sm">
                <div className="font-semibold">
                  {result.merged
                    ? `Merged into existing issue #${result.issue.id} — now ${result.issue.report_count} reports`
                    : `New issue #${result.issue.id} created`}
                </div>
                <div>
                  Tracking ID <b>#{result.complaint.id}</b> · routed to <b>{result.issue.department}</b> · processed in{' '}
                  {(result.complaint.processing_ms ?? 0) < 1000
                    ? `${result.complaint.processing_ms ?? 0} ms`
                    : `${((result.complaint.processing_ms ?? 0) / 1000).toFixed(1)} s`}{' '}
                  (
                  {EXTRACTOR_LABEL[result.complaint.extractor] ?? result.complaint.extractor})
                </div>
                {result.needs_review && <div className="mt-1 text-amber-700">Possible duplicate — flagged for a quick human check.</div>}
              </div>
            </div>

            {ex && (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">What the AI understood</h3>
                <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-slate-500">Category</dt>
                  <dd>
                    {CATEGORY_META[ex.category].emoji} {CATEGORY_META[ex.category].label} · {prettySub(ex.sub_type)}
                  </dd>
                  <dt className="text-slate-500">Location</dt>
                  <dd>
                    {[ex.location_text, ex.location_detail].filter(Boolean).join(', ') || '—'}{' '}
                    <span className="text-xs text-slate-400">({result.complaint.geo_precision})</span>
                  </dd>
                  <dt className="text-slate-500">Open for</dt>
                  <dd>{ex.duration_days ? `${ex.duration_days} days` : '—'}</dd>
                  <dt className="text-slate-500">Severity</dt>
                  <dd>
                    {ex.severity}/5 {ex.safety_risk && <span className="font-medium text-red-600">· safety risk</span>}
                  </dd>
                  <dt className="text-slate-500">Language</dt>
                  <dd className="capitalize">{ex.language}</dd>
                  <dt className="text-slate-500">Summary</dt>
                  <dd>{ex.summary_en}</dd>
                </dl>
              </section>
            )}

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Priority</h3>
                <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${priorityTone(result.issue.priority_score).cls}`}>
                  {priorityTone(result.issue.priority_score).label}
                </span>
              </div>
              {result.issue.priority_breakdown && (
                <ScoreBreakdown factors={result.issue.priority_breakdown} total={result.issue.priority_score} />
              )}
            </section>

            <button
              type="button"
              onClick={() => onOpenIssue(result.issue.id)}
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Open issue #{result.issue.id} on the dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
