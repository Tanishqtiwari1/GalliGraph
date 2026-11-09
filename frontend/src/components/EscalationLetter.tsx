import { Copy, FileText, MessageCircle, Printer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TrackResult } from '../api'
import { useLang } from '../i18n'
import { fmtDate } from '../ui'
import { Modal, useToast } from './Kit'

type Kind = 'letter' | 'rti'

const dateOnly = (iso: string) => fmtDate(iso).split(',')[0]

function buildLetter(kind: Kind, res: TrackResult, name: string, address: string, hi: boolean, ctx: { place: string; department: string }) {
  const today = dateOnly(new Date().toISOString().slice(0, 19))
  const reported = dateOnly(res.reported_at)
  const due = res.deadline.due_at ? dateOnly(res.deadline.due_at) : ''
  const late = Math.max(1, Math.round(Math.abs(res.deadline.hours_left ?? 24) / 24))
  const sign = `${name || (hi ? '[आपका नाम]' : '[Your name]')}\n${address || (hi ? '[आपका पता और मोबाइल नंबर]' : '[Your address and mobile number]')}\n${hi ? 'दिनांक' : 'Date'}: ${today}`
  const facts = hi
    ? `समस्या: ${ctx.place}\nट्रैकिंग कोड: ${res.tracking_code}\nदर्ज करने की तारीख़: ${reported}\nविभाग: ${ctx.department}\nवादा की गई तारीख़: ${due}\nदेरी: ${late} दिन\nइसे बताने वाले नागरिक: ${res.report_count}`
    : `Problem: ${ctx.place}\nTracking code: ${res.tracking_code}\nReported on: ${reported}\nDepartment: ${ctx.department}\nPromised fix date: ${due}\nDelay: ${late} day${late === 1 ? '' : 's'}\nCitizens who reported it: ${res.report_count}`
  const danger = res.safety_risk
  if (kind === 'rti') {
    return hi
      ? `सेवा में,\nलोक सूचना अधिकारी,\n${ctx.department}, जयपुर\n\nविषय: सूचना का अधिकार अधिनियम, 2005 की धारा 6(1) के तहत आवेदन\n\nमहोदय/महोदया,\n\nमैं भारत का/की नागरिक हूँ। कृपया नीचे दी गई शिकायत के बारे में सूचना दें:\n\n${facts}\n\nमाँगी गई सूचना:\n1. इस शिकायत पर अब तक की गई कार्रवाई का तारीख़वार विवरण।\n2. इस शिकायत के लिए ज़िम्मेदार अधिकारी का नाम और पद।\n3. इस काम का कार्य आदेश नंबर, तारीख़ और ठेकेदार का नाम, यदि कोई हो।\n4. वादा की गई तारीख़ तक काम न होने का कारण।\n5. वह तारीख़ जिस तक काम पूरा होगा।\n\nआवेदन शुल्क ₹10 इस प्रकार जमा है: ____________\n\nभवदीय,\n${sign}`
      : `To,\nThe Public Information Officer,\n${ctx.department}, Jaipur\n\nSubject: Application under Section 6(1) of the Right to Information Act, 2005\n\nSir/Madam,\n\nI am a citizen of India. Please provide the following information about this complaint:\n\n${facts}\n\nInformation requested:\n1. Date-wise details of the action taken on this complaint so far.\n2. Name and designation of the officer responsible for it.\n3. The work order number and date, and the contractor's name, if any.\n4. The reason the work was not done by the promised date.\n5. The date by which the work will be completed.\n\nThe application fee of Rs 10 is paid by: ____________\n\nYours faithfully,\n${sign}`
  }
  return hi
    ? `सेवा में,\nनगर आयुक्त,\nजयपुर\n\nविषय: शिकायत ${res.tracking_code} का तय समय में समाधान न होना\n\nमहोदय/महोदया,\n\nमैंने GalliGraph पर यह समस्या दर्ज की थी:\n\n${facts}\n\nआज ${today} तक समस्या ठीक नहीं हुई है।${danger ? ' इस जगह पर लोगों की सुरक्षा को गंभीर ख़तरा है।' : ''}\n\nआपसे निवेदन है कि:\n1. समस्या जल्द ठीक कराएँ और मुझे पूरा होने की तारीख़ बताएँ।\n2. ज़िम्मेदार अधिकारी का नाम और पद बताएँ।\n3. देरी के कारण की जाँच कराएँ।\n\nभवदीय,\n${sign}`
    : `To,\nThe Municipal Commissioner,\nJaipur\n\nSubject: Complaint ${res.tracking_code} not resolved by the promised date\n\nSir/Madam,\n\nI reported the following problem through GalliGraph:\n\n${facts}\n\nAs of ${today}, the problem has not been fixed.${danger ? ' This location is a serious risk to public safety.' : ''}\n\nI request you to:\n1. Have the problem fixed urgently and tell me the completion date.\n2. Tell me the name and designation of the officer responsible.\n3. Look into the reason for the delay.\n\nYours faithfully,\n${sign}`
}

/** When a deadline is missed the citizen gets a next step: a ready-made letter or RTI application built from the facts on record. */
export function EscalationLetter({ res }: { res: TrackResult }) {
  const { l, lang, place, department } = useLang()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind>('letter')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const generated = useMemo(
    () => buildLetter(kind, res, name, address, lang === 'hi', { place: place(res.label, res.category), department: department(res.department) }),
    [kind, res, name, address, lang], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const [text, setText] = useState(generated)
  useEffect(() => setText(generated), [generated])

  const late = Math.max(1, Math.round(Math.abs(res.deadline.hours_left ?? 24) / 24))

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      toast(l('Copied. You can paste it anywhere.', 'कॉपी हो गया। अब कहीं भी पेस्ट करें।'))
    } catch {
      toast(l('Could not copy. Select the text and copy it yourself.', 'कॉपी नहीं हुआ। टेक्स्ट चुनकर ख़ुद कॉपी करें।'), 'error')
    }
  }

  return (
    <section className="card border-2 border-red-700 p-5">
      <h3 className="text-lg font-bold">{l(`This is ${late} day${late === 1 ? '' : 's'} past its deadline`, `यह समय-सीमा से ${late} दिन ऊपर हो चुका है`)}</h3>
      <p className="mt-1 text-sm">{l('You can take it further. We will write the letter using the details of your complaint.', 'आप इसे आगे ले जा सकते हैं। आपकी शिकायत की जानकारी से हम पत्र लिख देंगे।')}</p>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary mt-3 w-full">
        <FileText className="h-5 w-5" aria-hidden /> {l('Write a letter for me', 'मेरे लिए पत्र लिखें')}
      </button>

      {open && (
        <Modal title={l('Take your complaint further', 'अपनी शिकायत आगे बढ़ाएँ')} onClose={() => setOpen(false)} wide>
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={l('Type of letter', 'पत्र का प्रकार')}>
              {(
                [
                  ['letter', l('Letter to the Commissioner', 'आयुक्त को पत्र'), l('Asks for the repair and action on the delay', 'मरम्मत और देरी पर कार्रवाई की माँग')],
                  ['rti', l('RTI application', 'RTI आवेदन'), l('Legally asks why it is delayed and who is responsible', 'क़ानूनी रूप से देरी का कारण और ज़िम्मेदार पूछता है')],
                ] as const
              ).map(([id, title, sub]) => (
                <button key={id} type="button" aria-pressed={kind === id} onClick={() => setKind(id)} className={`rounded-lg p-3 text-left ring-2 ${kind === id ? 'bg-brand-50 ring-brand-700' : 'ring-slate-300'}`}>
                  <span className="block text-sm font-bold">{title}</span>
                  <span className="block text-xs">{sub}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="letter-name" className="block text-sm font-bold">{l('Your name', 'आपका नाम')}</label>
                <input id="letter-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="field mt-1" />
              </div>
              <div>
                <label htmlFor="letter-address" className="block text-sm font-bold">{l('Address and mobile', 'पता और मोबाइल')}</label>
                <input id="letter-address" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" className="field mt-1" />
              </div>
            </div>
            <div>
              <label htmlFor="letter-text" className="block text-sm font-bold">{l('Your letter (you can change it)', 'आपका पत्र (आप बदल सकते हैं)')}</label>
              <textarea id="letter-text" value={text} onChange={(e) => setText(e.target.value)} rows={12} className="field mt-1 font-sans" />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <button type="button" onClick={copy} className="btn btn-ghost">
                <Copy className="h-5 w-5" aria-hidden /> {l('Copy', 'कॉपी')}
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="btn btn-ghost">
                <MessageCircle className="h-5 w-5" aria-hidden /> WhatsApp
              </a>
              <button type="button" onClick={() => window.print()} className="btn btn-ghost">
                <Printer className="h-5 w-5" aria-hidden /> {l('Print', 'प्रिंट')}
              </button>
            </div>
            <div className="rounded-lg bg-surface-low p-3 text-sm">
              <p className="font-bold">{l('Where to send it', 'कहाँ भेजें')}</p>
              {kind === 'letter' ? (
                <p>
                  {l('Give it at the Commissioner’s office, or file it on Rajasthan Sampark: ', 'आयुक्त कार्यालय में दें, या राजस्थान संपर्क पर दर्ज करें: ')}
                  <a href="https://sampark.rajasthan.gov.in" target="_blank" rel="noreferrer" className="font-bold underline">sampark.rajasthan.gov.in</a>
                  {l(' or call 181.', ' या 181 पर कॉल करें।')}
                </p>
              ) : (
                <p>
                  {l('File it online at ', 'ऑनलाइन दर्ज करें: ')}
                  <a href="https://rti.rajasthan.gov.in" target="_blank" rel="noreferrer" className="font-bold underline">rti.rajasthan.gov.in</a>
                  {l(' or post it to the department. A fee of Rs 10 usually applies, and the reply is due within 30 days.', ' या विभाग को डाक से भेजें। आम तौर पर ₹10 शुल्क लगता है और 30 दिन में जवाब मिलना चाहिए।')}
                </p>
              )}
              <p className="mt-1 text-xs">{l('Your name and address stay on this device until you send the letter yourself. This is general help, not legal advice.', 'आपका नाम और पता इसी डिवाइस पर रहता है, जब तक आप ख़ुद पत्र न भेजें। यह सामान्य मदद है, क़ानूनी सलाह नहीं।')}</p>
            </div>
          </div>
        </Modal>
      )}
      {open && createPortal(<div className="wo-sheet hidden whitespace-pre-wrap p-8 text-base print:block">{text}</div>, document.body)}
    </section>
  )
}
