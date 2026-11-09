import { ArrowLeft, ArrowRight, Bot, Camera, CheckCircle2, CloudOff, Copy, FileText, GitMerge, ImagePlus, Loader2, MapPin, MessageSquareText, Pencil, Phone, Send, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { api, type Category, type Meta, type Preview, type Receipt, type SubmitBody } from '../api'
import { CATEGORY_HI, useLang } from '../i18n'
import { rememberCode } from '../myComplaints'
import { isNetworkFailure, queueReport } from '../offlineQueue'
import { CATEGORY_META, fileToBase64, prettySub } from '../ui'
import { LocationPicker, VoiceButton, VoiceNoteButton } from './Kit'
import { ScoreBreakdown } from './ScoreBreakdown'
import { CATEGORY_ICON, TIER_PILL } from './Shell'

const PICKABLE: Category[] = ['road_damage', 'garbage', 'water_supply', 'drainage', 'streetlight', 'traffic', 'stray_animals', 'electricity']

export function ReportWizard({ meta, onTrack, onMine, categoryHint }: { meta: Meta | null; onTrack: (code: string) => void; onMine: () => void; categoryHint?: Category }) {
  const { lang, l, department } = useLang()
  const [step, setStep] = useState(0)
  const [category, setCategory] = useState<Category | undefined>(categoryHint)
  const [text, setText] = useState('')
  const [area, setArea] = useState('')
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null)
  const [image, setImage] = useState<{ b64: string; type: string; preview: string } | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [offline, setOffline] = useState(false)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [copied, setCopied] = useState(false)
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [phone, setPhone] = useState('')
  const phoneOk = /^(\+?91[\s-]?)?0?[6-9]\d{9}$/.test(phone.replace(/[\s()-]/g, ''))

  const STEPS = [
    { key: 'describe', label: l('Describe', 'बताएँ'), icon: FileText },
    { key: 'location', label: l('Place', 'जगह'), icon: MapPin },
    { key: 'photo', label: l('Photo', 'फ़ोटो'), icon: Camera },
    { key: 'review', label: l('Check', 'जाँचें'), icon: CheckCircle2 },
  ]

  const areaName = meta?.localities.find((x) => x.id === area)?.name
  // The area dropdown is folded into the text so the AI can geocode it even without a pin.
  const fullText = () => (areaName && !text.toLowerCase().includes(areaName.toLowerCase()) ? `${text.trim()} (${areaName})` : text.trim())
  const payload = () => ({
    text: fullText(),
    ...(pin ?? {}),
    ...(category ? { category_hint: category } : {}),
    ...(image ? { image_base64: image.b64, image_media_type: image.type } : {}),
  })

  function reset() {
    setReceipt(null)
    setSaved(false)
    setOffline(false)
    setStep(0)
    setText('')
    setImage(null)
    setPin(null)
    setPreview(null)
    setCopied(false)
  }

  async function goReview() {
    setBusy(true)
    setError(null)
    try {
      setPreview(await api.preview(payload()))
      setOffline(false)
      setStep(3)
    } catch (e) {
      if (isNetworkFailure(e)) {
        setPreview(null)
        setOffline(true)
        setStep(3)
      } else setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    setBusy(true)
    setError(null)
    const body: SubmitBody = { ...payload(), channel: 'web', ...(smsOptIn && phoneOk ? { phone, sms_opt_in: true } : {}) }
    try {
      const r = await api.submit(body)
      rememberCode(r.tracking_code)
      setReceipt(r)
    } catch (e) {
      if (!isNetworkFailure(e)) setError(e instanceof Error ? e.message : String(e))
      else {
        try {
          await queueReport(body)
          window.dispatchEvent(new Event('gg-queue'))
          setSaved(true)
        } catch {
          setError(l('No internet, and this phone could not save the complaint. Please try again when you are online.', 'इंटरनेट नहीं है और फ़ोन पर शिकायत सहेजी नहीं जा सकी। इंटरनेट आने पर फिर कोशिश करें।'))
        }
      }
    } finally {
      setBusy(false)
    }
  }

  if (saved) {
    return (
      <div className="animate-rise card mx-auto max-w-2xl space-y-4 p-6 text-center">
        <CloudOff className="mx-auto h-12 w-12 text-brand-700" aria-hidden />
        <h1 className="text-2xl font-bold">{l('Saved on this phone', 'इस फ़ोन पर सहेजी गई')}</h1>
        <p role="status">
          {l('There is no internet right now. Open GalliGraph when you are back online and your complaint will be sent automatically. You will then get a tracking code.', 'अभी इंटरनेट नहीं है। इंटरनेट आने पर GalliGraph खोलें, आपकी शिकायत अपने-आप चली जाएगी। तब आपको ट्रैकिंग कोड मिलेगा।')}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onMine} className="btn btn-primary">{l('See my complaints', 'मेरी शिकायतें देखें')}</button>
          <button type="button" onClick={reset} className="btn btn-ghost">{l('Report another problem', 'दूसरी समस्या बताएँ')}</button>
        </div>
      </div>
    )
  }

  if (receipt) {
    return (
      <div className="animate-rise mx-auto max-w-2xl space-y-4">
        <div className="card p-6 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-700" aria-hidden />
          <h1 className="mt-2 text-2xl font-bold">{l('Your complaint is registered', 'आपकी शिकायत दर्ज हो गई')}</h1>
          <p>{l(`It has gone to ${department(receipt.department)}.`, `यह ${department(receipt.department)} को भेज दी गई है।`)}</p>
          <p className="mt-4 text-sm font-bold">{l('Your tracking code', 'आपका ट्रैकिंग कोड')}</p>
          <div className="mt-1 inline-flex items-center gap-2 rounded-xl bg-surface-low px-5 py-3 ring-1 ring-brand-200">
            <span className="font-mono text-2xl font-bold tracking-wider text-brand-900 sm:text-3xl">{receipt.tracking_code}</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(receipt.tracking_code)
                setCopied(true)
              }}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-brand-700 hover:bg-brand-100"
              aria-label={l('Copy tracking code', 'ट्रैकिंग कोड कॉपी करें')}
            >
              <Copy className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <p className="mt-1 text-sm text-slate-700" role="status">{copied ? l('Copied', 'कॉपी हो गया') : l('Also saved under My cases on this phone', 'इस फ़ोन पर मेरे मामले में भी सहेजा गया')}</p>
          {smsOptIn && phoneOk && (
            <p className="mx-auto mt-3 flex max-w-md items-center justify-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              <MessageSquareText className="h-5 w-5" aria-hidden /> {l('We will text you when it is fixed.', 'ठीक होने पर हम आपको SMS करेंगे।')}
            </p>
          )}
          {receipt.merged && (
            <p className="mx-auto mt-3 flex max-w-md items-start gap-2 rounded-lg bg-sky-50 p-3 text-left text-sm text-sky-900">
              <GitMerge className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              {l(`${receipt.report_count - 1} other ${receipt.report_count === 2 ? 'person has' : 'people have'} reported the same problem. Your report was added and raises its priority.`, `${receipt.report_count - 1} और लोगों ने यही समस्या बताई है। आपकी शिकायत जोड़ दी गई है, इससे प्राथमिकता बढ़ती है।`)}
            </p>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => onTrack(receipt.tracking_code)} className="btn btn-primary">
              {l('Track this complaint', 'इस शिकायत की स्थिति देखें')} <ArrowRight className="h-5 w-5" aria-hidden />
            </button>
            <button type="button" onClick={reset} className="btn btn-ghost">{l('Report another problem', 'दूसरी समस्या बताएँ')}</button>
          </div>
        </div>
        {receipt.priority_breakdown && (
          <details className="card p-5">
            <summary className="min-h-11 cursor-pointer font-bold">{l('Why it got this priority', 'इसे यह प्राथमिकता क्यों मिली')}</summary>
            <div className="mt-3"><ScoreBreakdown factors={receipt.priority_breakdown} total={receipt.priority_score} /></div>
          </details>
        )}
      </div>
    )
  }

  const hours = preview?.deadline_hours ?? 0
  const target = hours >= 48 ? l(`Target: within ${Math.round(hours / 24)} days`, `लक्ष्य: ${Math.round(hours / 24)} दिन में`) : l(`Target: within ${hours} hours`, `लक्ष्य: ${hours} घंटे में`)
  const tierName = preview ? l(TIER_PILL[preview.tier].label, { Critical: 'बहुत ज़रूरी', High: 'ज़रूरी', Medium: 'मध्यम', Low: 'सामान्य' }[TIER_PILL[preview.tier].label] ?? '') : ''
  const ReviewIcon = preview ? CATEGORY_ICON[preview.understood.category] : null

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-3xl font-bold">{l('Report a problem', 'समस्या दर्ज करें')}</h1>

      <p className="text-sm font-bold text-brand-700">{l(`Step ${step + 1} of 4: ${STEPS[step].label}`, `चरण ${step + 1} / 4: ${STEPS[step].label}`)}</p>
      <ol className="grid grid-cols-4 gap-2" aria-hidden>
        {STEPS.map((s, i) => (
          <li key={s.key} className={`h-2 rounded-full ${i <= step ? 'bg-brand-600' : 'bg-slate-300'}`} />
        ))}
      </ol>

      <div key={step} className="card animate-rise space-y-5 p-5">
        {step === 0 && (
          <>
            <div>
              <label htmlFor="report-text" className="block text-lg font-bold">{l('What is the problem?', 'समस्या क्या है?')}</label>
              <p id="report-tip" className="text-sm text-slate-700">{l('Say what is wrong, where, since when, and if anyone is at risk.', 'बताएँ क्या ख़राब है, कहाँ, कब से और क्या किसी को ख़तरा है।')}</p>
              <textarea id="report-text" aria-describedby="report-tip" value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={3000} className="field mt-2 p-3" />
              {text.trim().length > 0 && text.trim().length < 10 && <p className="mt-1 text-sm font-bold text-amber-800">{l('Please write a little more.', 'कृपया थोड़ा और लिखें।')}</p>}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <VoiceNoteButton hindi={lang === 'hi'} onText={(t) => setText((x) => (x ? `${x}\n${t}` : t))} />
              <VoiceButton lang={lang === 'hi' ? 'hi-IN' : 'en-IN'} onText={(t) => setText((x) => (x ? `${x} ${t}` : t))} />
            </div>
            <fieldset>
              <legend className="text-sm font-bold">{l('Type of problem (you can skip this)', 'समस्या का प्रकार (छोड़ सकते हैं)')}</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {PICKABLE.map((c) => {
                  const Icon = CATEGORY_ICON[c]
                  const on = category === c
                  return (
                    <button key={c} type="button" onClick={() => setCategory(on ? undefined : c)} aria-pressed={on} className={`flex min-h-12 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold ring-1 ${on ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-800 ring-slate-400 hover:bg-slate-50'}`}>
                      {on ? <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /> : <Icon className="h-5 w-5 shrink-0" aria-hidden />} {lang === 'hi' ? CATEGORY_HI[c] : CATEGORY_META[c].label}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <label htmlFor="report-area" className="block text-lg font-bold">{l('Which area?', 'कौन सा क्षेत्र?')}</label>
              <select id="report-area" value={area} onChange={(e) => setArea(e.target.value)} className="field mt-2">
                <option value="">{l('Choose an area', 'क्षेत्र चुनें')}</option>
                {meta?.localities.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-2 text-sm font-bold">{l('Exact spot (helps the crew find it)', 'सही जगह (टीम को ढूँढने में मदद)')}</p>
              <LocationPicker value={pin} onChange={setPin} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-lg font-bold">{l('Add a photo (you can skip this)', 'फ़ोटो जोड़ें (छोड़ सकते हैं)')}</p>
            {image ? (
              <div className="relative inline-block">
                <img src={image.preview} alt={l('Your photo of the problem', 'समस्या की आपकी फ़ोटो')} className="max-h-64 rounded-xl object-cover ring-1 ring-slate-200" />
                <button type="button" onClick={() => setImage(null)} className="absolute -right-2 -top-2 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow ring-1 ring-slate-400" aria-label={l('Remove photo', 'फ़ोटो हटाएँ')}>
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-400 bg-surface-low px-4 py-10 text-center hover:border-brand-600 focus-within:outline focus-within:outline-3 focus-within:outline-[var(--color-focus)]">
                <ImagePlus className="h-10 w-10 text-brand-700" aria-hidden />
                <span className="font-bold">{l('Take or choose a photo', 'फ़ोटो लें या चुनें')}</span>
                <span className="text-sm text-slate-700">{l('A clear photo helps prove the repair later. Up to 5 MB.', 'साफ़ फ़ोटो से बाद में मरम्मत साबित होती है। 5 MB तक।')}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    if (f.size > 5 * 1024 * 1024) return setError(l('This photo is larger than 5 MB.', 'यह फ़ोटो 5 MB से बड़ी है।'))
                    setError(null)
                    setImage(await fileToBase64(f))
                  }}
                />
              </label>
            )}
          </>
        )}

        {step === 3 && (preview || offline) && (
          <>
            {offline && (
              <p className="flex items-start gap-2 rounded-lg bg-saffron-50 p-3 text-sm text-amber-900" role="status">
                <CloudOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                {l('No internet right now, so we cannot check this yet. You can still save it and we will send it when you are online.', 'अभी इंटरनेट नहीं है, इसलिए जाँच नहीं हो सकती। आप इसे सहेज सकते हैं, इंटरनेट आने पर हम भेज देंगे।')}
              </p>
            )}
            {preview?.understood.safety_risk && (
              <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-800">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <span>
                  {l('This looks dangerous. If anyone is in danger right now, call ', 'यह ख़तरनाक लगता है। अगर कोई अभी ख़तरे में है तो ')}
                  <a href="tel:112" className="inline-flex items-center gap-0.5 underline"><Phone className="h-4 w-4" aria-hidden />112</a>
                  {l('.', ' पर कॉल करें।')}
                </span>
              </p>
            )}
            {preview && ReviewIcon && (
              <>
                <h2 className="flex items-center gap-2 text-lg font-bold"><Bot className="h-6 w-6 text-brand-700" aria-hidden /> {l('Is this right?', 'क्या यह सही है?')}</h2>
                <dl className="grid gap-x-3 gap-y-3 text-sm sm:grid-cols-[8rem_1fr]">
                  <dt className="font-bold text-slate-700">{l('Problem', 'समस्या')}</dt>
                  <dd className="-mt-2 flex items-center gap-1.5 sm:mt-0">
                    <ReviewIcon className="h-5 w-5 text-brand-700" aria-hidden />
                    {lang === 'hi' ? CATEGORY_HI[preview.understood.category] : `${CATEGORY_META[preview.understood.category].label} · ${prettySub(preview.understood.sub_type)}`}
                  </dd>
                  <dt className="font-bold text-slate-700">{l('Place', 'जगह')}</dt>
                  <dd className="-mt-2 sm:mt-0">
                    {[preview.locality ?? preview.understood.location_text, preview.understood.location_detail].filter(Boolean).join(', ') || <b className="text-amber-800">{l('Not clear. Please go back and add the area or a pin.', 'साफ़ नहीं है। वापस जाकर क्षेत्र या पिन जोड़ें।')}</b>}
                  </dd>
                  <dt className="font-bold text-slate-700">{l('Risk', 'ख़तरा')}</dt>
                  <dd className="-mt-2 sm:mt-0">{preview.understood.safety_risk ? <span className="pill pill-crit">{l('Safety risk', 'सुरक्षा का ख़तरा')}</span> : l('No direct safety risk found', 'सीधा ख़तरा नहीं मिला')}</dd>
                  <dt className="font-bold text-slate-700">{l('Goes to', 'किसे जाएगी')}</dt>
                  <dd className="-mt-2 sm:mt-0">{department(preview.department)}{preview.secondary_department && <span className="block text-slate-700">+ {department(preview.secondary_department)}</span>}</dd>
                  <dt className="font-bold text-slate-700">{l('Priority', 'प्राथमिकता')}</dt>
                  <dd className="-mt-2 sm:mt-0">{tierName}. {target}</dd>
                </dl>
              </>
            )}
            {image && <img src={image.preview} alt={l('Your photo of the problem', 'समस्या की आपकी फ़ोटो')} className="h-20 w-20 rounded-lg object-cover" />}
            <blockquote className="rounded-lg border-l-4 border-brand-600 bg-slate-50 p-3 text-sm">{fullText()}</blockquote>
            <div className="flex flex-wrap gap-x-4">
              {([[0, Pencil, l('Change text', 'टेक्स्ट बदलें')], [1, MapPin, l('Change place', 'जगह बदलें')], [2, Camera, l('Change photo', 'फ़ोटो बदलें')]] as const).map(([s, Icon, label]) => (
                <button key={s} type="button" onClick={() => setStep(s)} className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-brand-700 underline">
                  <Icon className="h-4 w-4" aria-hidden /> {label}
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-slate-300 p-3">
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-[#0f766e]" />
                <span>
                  <b>{l('Text me when it is fixed', 'ठीक होने पर मुझे SMS करें')}</b>
                  <span className="block text-slate-700">{l('Optional. Your number is used only for this complaint and is never public.', 'वैकल्पिक। आपका नंबर केवल इस शिकायत के लिए है और सार्वजनिक नहीं होता।')}</span>
                </span>
              </label>
              {smsOptIn && (
                <div className="mt-2">
                  <label htmlFor="report-phone" className="block text-sm font-bold">{l('Mobile number', 'मोबाइल नंबर')}</label>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-lg bg-slate-100 px-3 py-3 text-sm font-bold">+91</span>
                    <input id="report-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel-national" maxLength={14} className="field" />
                  </div>
                  {phone && !phoneOk && <p className="mt-1 text-sm font-bold text-red-700">{l('Enter a valid 10-digit mobile number.', 'सही 10 अंकों का मोबाइल नंबर लिखें।')}</p>}
                </div>
              )}
            </div>
          </>
        )}

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700" role="alert">{error}</p>}

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-4">
          {step > 0 ? (
            <button type="button" onClick={() => setStep(step - 1)} className="btn btn-ghost">
              <ArrowLeft className="h-5 w-5" aria-hidden /> {l('Back', 'वापस')}
            </button>
          ) : <span />}
          {step < 2 && (
            <button type="button" disabled={step === 0 && text.trim().length < 10} onClick={() => setStep(step + 1)} className="btn btn-primary px-6">
              {l('Next', 'आगे')} <ArrowRight className="h-5 w-5" aria-hidden />
            </button>
          )}
          {step === 2 && (
            <button type="button" disabled={busy} onClick={goReview} className="btn btn-primary px-6">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ArrowRight className="h-5 w-5" aria-hidden />} {image ? l('Next', 'आगे') : l('Skip photo', 'फ़ोटो छोड़ें')}
            </button>
          )}
          {step === 3 && (
            <button type="button" disabled={busy || (smsOptIn && !phoneOk)} onClick={submit} className="btn btn-primary px-6">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Send className="h-5 w-5" aria-hidden />} {offline ? l('Save and send later', 'सहेजें, बाद में भेजें') : l('Send complaint', 'शिकायत भेजें')}
            </button>
          )}
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-sm text-slate-700">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {l('Only municipal officials see your words and photo. An officer checks the AI suggestion before work is assigned.', 'आपके शब्द और फ़ोटो केवल नगर अधिकारी देखते हैं। काम सौंपने से पहले अधिकारी AI के सुझाव की जाँच करता है।')}
      </p>
    </div>
  )
}
