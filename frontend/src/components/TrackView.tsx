import { AlertTriangle, BadgeCheck, CheckCircle2, Circle, Loader2, MessageCircleQuestion, MessageSquareText, Search, Send, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type TrackResult } from '../api'
import { useLang } from '../i18n'
import { rememberCode } from '../myComplaints'
import { deadlineChip, fmtDate } from '../ui'
import { EscalationLetter } from './EscalationLetter'
import { useToast } from './Kit'
import { CATEGORY_ICON } from './Shell'

const ALL_STAGES = ['submitted', 'reviewed', 'assigned', 'in_progress', 'resolution_review', 'resolved']
const STAGE_EN: Record<string, string> = { submitted: 'Submitted', reviewed: 'Reviewed', assigned: 'Assigned', in_progress: 'In progress', resolution_review: 'Checking the repair', resolved: 'Fixed' }

export function TrackView({ initialCode }: { initialCode?: string }) {
  const { l, lang, place, department, stage: stageName, event, status } = useLang()
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
      setError(l('No complaint found with that code. It looks like JA-XXXX-XXXX.', 'इस कोड की कोई शिकायत नहीं मिली। कोड JA-XXXX-XXXX जैसा होता है।'))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (initialCode) lookup(initialCode)
  }, [initialCode]) // eslint-disable-line react-hooks/exhaustive-deps

  async function act(fn: () => Promise<TrackResult>, ok: string) {
    setBusy(true)
    try {
      setRes(await fn())
      toast(ok)
      setShowDispute(false)
      setReply('')
    } catch (e) {
      toast(e instanceof Error ? e.message : l('Something went wrong', 'कुछ गड़बड़ हुई'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const chip = res ? deadlineChip(res.deadline) : null
  const Icon = res ? CATEGORY_ICON[res.category] : null
  const doneKeys = new Set(res?.stages.map((s) => s.key))
  const currentKey = res?.stages[res.stages.length - 1]?.key
  const closed = res ? ['resolved', 'rejected'].includes(res.status) : false
  const others = res ? res.report_count - 1 : 0

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          lookup(code)
        }}
        className="card p-5"
      >
        <h1 className="font-display text-3xl font-bold">{l('Check my complaint', 'मेरी शिकायत की स्थिति')}</h1>
        <label htmlFor="track-code" className="mt-3 block text-sm font-bold">{l('Tracking code', 'ट्रैकिंग कोड')}</label>
        <div className="mt-1 flex gap-2">
          <input id="track-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="JA-XXXX-XXXX" maxLength={12} autoComplete="off" className="field min-w-0 flex-1 font-mono tracking-wider" />
          <button type="submit" disabled={code.trim().length < 12 || busy} className="btn btn-primary">
            {busy && !res ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Search className="h-5 w-5" aria-hidden />} {l('Check', 'देखें')}
          </button>
        </div>
        {error && <p className="mt-2 text-sm font-bold text-red-700" role="alert">{error}</p>}
      </form>

      {res && Icon && (
        <div className="animate-rise space-y-4">
          <div className="card p-5">
            <div className="flex items-start gap-3">
              <Icon className="mt-1 h-8 w-8 shrink-0 text-brand-700" aria-hidden />
              <div className="min-w-0">
                <h2 className="text-xl font-bold leading-snug">{place(res.label, res.category)}</h2>
                <p className="text-lg font-bold text-brand-700">{status(res.status)}</p>
                <p className="text-sm text-slate-700">
                  <span className="font-mono">{res.tracking_code}</span> · {fmtDate(res.reported_at)}
                </p>
                <p className="mt-1 text-sm">
                  {others > 0 && l(`${others} other ${others === 1 ? 'person' : 'people'} reported the same problem. `, `${others} और लोगों ने यही समस्या बताई है। `)}
                  {res.status !== 'rejected' && l(`It is with ${department(res.department)}.`, `यह ${department(res.department)} के पास है।`)}
                </p>
              </div>
            </div>

            <ol className="mt-5">
              {(res.status === 'rejected' ? res.stages.map((s) => s.key) : ALL_STAGES).map((key, idx, arr) => {
                const stage = res.stages.find((s) => s.key === key)
                const done = doneKeys.has(key)
                const current = key === currentKey
                return (
                  <li key={key} aria-current={current ? 'step' : undefined} className="relative flex gap-3 pb-4 last:pb-0">
                    {idx < arr.length - 1 && <span className={`absolute left-[13px] top-7 h-full w-0.5 ${done ? 'bg-brand-600' : 'bg-slate-300'}`} />}
                    {done ? <CheckCircle2 className="relative z-10 h-7 w-7 shrink-0 text-brand-600" aria-hidden /> : <Circle className="relative z-10 h-7 w-7 shrink-0 text-slate-400" aria-hidden />}
                    <div className={done ? '' : 'text-slate-600'}>
                      <div className={`text-sm ${current ? 'font-bold text-brand-800' : ''}`}>{stageName(key, stage?.label ?? STAGE_EN[key])}</div>
                      <div className="text-sm text-slate-600">{stage?.at ? fmtDate(stage.at) : !done ? l('Not yet', 'अभी नहीं') : ''}</div>
                    </div>
                  </li>
                )
              })}
            </ol>

            {res.deadline.due_at && !closed && (
              <p className="mt-3 text-sm">
                {l('Target date', 'लक्ष्य तारीख़')}: <b>{fmtDate(res.deadline.due_at)}</b>{' '}
                {chip && <span className={`ml-1 whitespace-nowrap rounded-full px-2 py-0.5 text-sm ring-1 ${chip.cls}`}>{chip.label}</span>}
              </p>
            )}
            {res.escalated && (
              <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-red-700">
                <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden /> {l('The deadline was missed, so this went to a senior officer.', 'समय-सीमा चूक गई, इसलिए यह वरिष्ठ अधिकारी को भेजी गई।')}
              </p>
            )}
          </div>

          {res.deadline.overdue && !closed && <EscalationLetter key={lang} res={res} />}

          {res.info_request && (
            <div className="card border-2 border-amber-700 p-5">
              <h3 className="flex items-center gap-2 text-lg font-bold"><MessageCircleQuestion className="h-6 w-6" aria-hidden /> {l('The officer has a question', 'अधिकारी का एक सवाल है')}</h3>
              <p className="mt-1 text-sm">{res.info_request}</p>
              <label htmlFor="track-reply" className="mt-3 block text-sm font-bold">{l('Your answer', 'आपका जवाब')}</label>
              <textarea id="track-reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={3} className="field mt-1" />
              <button type="button" disabled={busy || reply.trim().length < 3} onClick={() => act(() => api.reply(res.tracking_code, reply), l('Thank you. Your answer was sent.', 'धन्यवाद। आपका जवाब भेज दिया गया।'))} className="btn btn-primary mt-2 w-full">
                <Send className="h-5 w-5" aria-hidden /> {l('Send answer', 'जवाब भेजें')}
              </button>
            </div>
          )}

          {res.can_give_feedback && (
            <div className="card p-5">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <BadgeCheck className="h-6 w-6 text-brand-700" aria-hidden /> {res.status === 'resolved' ? l('Marked as fixed', 'ठीक बताया गया') : l('The department says it is fixed', 'विभाग के अनुसार यह ठीक है')}
              </h3>
              {res.resolution_note && <p className="mt-1 text-sm">{l('Work done', 'किया गया काम')}: {res.resolution_note}</p>}
              {res.has_evidence && <img src={`/api/track/${res.tracking_code}/evidence`} alt={l('Photo from the department after the repair', 'मरम्मत के बाद विभाग की फ़ोटो')} className="mt-3 max-h-64 w-full rounded-xl object-cover" />}
              {res.disputed ? (
                <p className="mt-3 rounded-lg bg-purple-50 p-3 text-sm text-purple-800">{l('You said it is not fixed. A supervisor is checking.', 'आपने बताया कि यह ठीक नहीं है। पर्यवेक्षक जाँच कर रहे हैं।')}</p>
              ) : (
                <>
                  <p className="mt-3 text-sm font-bold">{l('Is it really fixed?', 'क्या यह सच में ठीक हो गया?')}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <button type="button" disabled={busy} onClick={() => act(() => api.feedback(res.tracking_code, 'fixed'), l('Thank you for confirming.', 'पुष्टि के लिए धन्यवाद।'))} className="btn btn-primary">
                      <ThumbsUp className="h-5 w-5" aria-hidden /> {l('Yes, it is fixed', 'हाँ, ठीक है')}
                    </button>
                    <button type="button" disabled={busy} aria-expanded={showDispute} onClick={() => setShowDispute((v) => !v)} className="btn btn-ghost">
                      <ThumbsDown className="h-5 w-5" aria-hidden /> {l('No, still a problem', 'नहीं, समस्या बनी है')}
                    </button>
                  </div>
                  {showDispute && (
                    <div className="mt-3">
                      <label htmlFor="track-dispute" className="block text-sm font-bold">{l('What is still wrong? (optional)', 'अभी क्या ख़राब है? (वैकल्पिक)')}</label>
                      <textarea id="track-dispute" value={disputeNote} onChange={(e) => setDisputeNote(e.target.value)} rows={2} className="field mt-1" />
                      <button type="button" disabled={busy} onClick={() => act(() => api.feedback(res.tracking_code, 'not_fixed', disputeNote || undefined), l('Sent. A supervisor will check.', 'भेज दिया। पर्यवेक्षक जाँच करेंगे।'))} className="btn btn-danger mt-2 w-full">
                        {l('Ask for a review', 'जाँच का अनुरोध करें')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {!res.sms_opt_in && !smsTo && !closed && (
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                try {
                  const r = await api.notifyOptIn(res.tracking_code, phone)
                  setSmsTo(r.to)
                  toast(l(`We will text ${r.to} when it is fixed.`, `ठीक होने पर ${r.to} पर SMS आएगा।`))
                } catch (err) {
                  toast(err instanceof Error ? err.message : l('Could not save the number', 'नंबर सहेजा नहीं जा सका'), 'error')
                }
              }}
              className="card p-5"
            >
              <label htmlFor="track-phone" className="flex items-center gap-2 text-sm font-bold">
                <MessageSquareText className="h-5 w-5 text-brand-700" aria-hidden /> {l('Get an SMS when it is fixed: your mobile number', 'ठीक होने पर SMS पाएँ: आपका मोबाइल नंबर')}
              </label>
              <div className="mt-1 flex gap-2">
                <input id="track-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel-national" className="field min-w-0 flex-1" />
                <button type="submit" disabled={phone.replace(/\D/g, '').length < 10} className="btn btn-primary shrink-0">{l('Save', 'सहेजें')}</button>
              </div>
            </form>
          )}
          {(res.sms_opt_in || smsTo) && (
            <div className="card p-4 text-sm">
              <p className="flex items-center gap-2">
                <MessageSquareText className="h-5 w-5 shrink-0 text-brand-700" aria-hidden />
                {closed ? l('Your number is saved for updates on this complaint.', 'इस शिकायत की सूचना के लिए आपका नंबर सहेजा गया है।') : l('You will get an SMS when this is fixed.', 'ठीक होने पर आपको SMS मिलेगा।')}
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.notifyOptOut(res.tracking_code)
                    setSmsTo(null)
                    setRes({ ...res, sms_opt_in: false })
                    toast(l('Your number was deleted. You will not get messages about this complaint.', 'आपका नंबर हटा दिया गया। इस शिकायत के संदेश अब नहीं आएँगे।'))
                  } catch (err) {
                    toast(err instanceof Error ? err.message : l('Could not delete the number', 'नंबर हटाया नहीं जा सका'), 'error')
                  }
                }}
                className="mt-1 min-h-11 font-bold text-slate-700 underline"
              >
                {l('Stop messages and delete my number', 'संदेश बंद करें और मेरा नंबर हटाएँ')}
              </button>
            </div>
          )}

          <div className="card p-5">
            <h3 className="mb-3 text-lg font-bold">{l('Updates', 'सूचनाएँ')}</h3>
            <ol className="space-y-3 border-l-2 border-slate-300 pl-4 text-sm">
              {[...res.timeline].reverse().map((e, i) => (
                <li key={i} className="relative">
                  <span className={`absolute -left-[23px] top-1.5 h-3 w-3 rounded-full ring-2 ring-white ${e.kind === 'update' ? 'bg-sky-500' : e.kind === 'dispute' ? 'bg-red-500' : 'bg-brand-600'}`} />
                  <div className={e.kind === 'update' ? 'font-bold' : ''}>{event(e.message)}</div>
                  <div className="text-slate-600">{fmtDate(e.at)}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
