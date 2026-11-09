import { ChevronDown, Eye, Lock, Phone, Settings, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Category, Meta } from '../api'
import { CATEGORY_HI, useLang } from '../i18n'
import { CATEGORY_META } from '../ui'
import { useToast } from './Kit'
import { CATEGORY_ICON, LangSwitch, ThemeToggle } from './Shell'

const EXAMPLES: Partial<Record<Category, [string, string]>> = {
  road_damage: ['Potholes, broken roads, damaged footpaths', 'गड्ढे, टूटी सड़कें, ख़राब फ़ुटपाथ'],
  water_supply: ['No water, low pressure, leaking pipes, dirty water', 'पानी नहीं, कम दबाव, रिसते पाइप, गंदा पानी'],
  drainage: ['Blocked drains, sewage overflow, open manholes', 'बंद नालियाँ, बहता सीवर, खुले मैनहोल'],
  garbage: ['Garbage dumps, missed collection, overflowing bins', 'कचरे के ढेर, कचरा न उठना, भरे कूड़ेदान'],
  streetlight: ['Lights not working, damaged poles, exposed wires', 'बंद लाइटें, टूटे खंभे, खुले तार'],
  traffic: ['Jams, illegal parking, faulty signals', 'जाम, ग़लत पार्किंग, ख़राब सिग्नल'],
  stray_animals: ['Aggressive stray dogs, stray cattle', 'आक्रामक आवारा कुत्ते, आवारा पशु'],
  electricity: ['Power cuts, voltage problems, damaged transformers', 'बिजली कटौती, वोल्टेज समस्या, ख़राब ट्रांसफ़ॉर्मर'],
}

const FAQ: [string, string, string, string][] = [
  ['Do I need an account?', 'क्या खाता बनाना ज़रूरी है?', 'No. You get a private tracking code like JA-7KQ2-9XPM. This phone also remembers your complaints.', 'नहीं। आपको JA-7KQ2-9XPM जैसा निजी ट्रैकिंग कोड मिलता है। यह फ़ोन आपकी शिकायतें याद रखता है।'],
  ['Who sees what I write?', 'मेरा लिखा कौन देखता है?', 'Only municipal officials see your words, photo and exact pin. The public map shows only the type of problem and the area, to about 100 metres.', 'आपके शब्द, फ़ोटो और सही पिन केवल नगर अधिकारी देखते हैं। सार्वजनिक नक्शे पर केवल समस्या का प्रकार और क्षेत्र, लगभग 100 मीटर तक दिखता है।'],
  ['What if someone already reported it?', 'अगर किसी ने पहले ही बता दिया हो?', 'Repeat reports are joined into one case. Your report still counts and raises the priority.', 'एक जैसी शिकायतें एक मामले में जोड़ दी जाती हैं। आपकी शिकायत गिनी जाती है और प्राथमिकता बढ़ाती है।'],
  ['How long will it take?', 'कितना समय लगेगा?', 'Every complaint gets a target date based on how serious it is. If the date is missed, it goes to a senior officer, and you can send a letter or RTI application from the complaint page.', 'हर शिकायत को गंभीरता के अनुसार लक्ष्य तारीख़ मिलती है। तारीख़ चूकने पर यह वरिष्ठ अधिकारी को जाती है, और आप शिकायत के पेज से पत्र या RTI आवेदन भेज सकते हैं।'],
  ['What if it is marked fixed but it is not?', 'अगर ठीक बताया जाए पर ठीक न हो?', 'Open your complaint and choose "No, still a problem". A supervisor will check it.', 'अपनी शिकायत खोलें और "नहीं, समस्या बनी है" चुनें। पर्यवेक्षक जाँच करेंगे।'],
  ['What if I have no internet?', 'अगर इंटरनेट न हो?', 'You can still fill in the complaint on a page that is already open. It is saved on your phone and sent when you are back online with GalliGraph open.', 'पहले से खुले पेज पर आप शिकायत भर सकते हैं। यह फ़ोन पर सहेजी जाती है और इंटरनेट आने पर GalliGraph खुला होने पर भेजी जाती है।'],
]

export function HelpView({ meta }: { meta: Meta | null }) {
  const { lang, l } = useLang()
  const toast = useToast()
  const [open, setOpen] = useState<number | null>(0)
  const hi = lang === 'hi'

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl font-bold">{l('Help and settings', 'सहायता और सेटिंग')}</h1>

      <section className="card divide-y divide-slate-200">
        <h2 className="px-4 py-3 text-lg font-bold">{l('Common questions', 'आम सवाल')}</h2>
        {FAQ.map(([qEn, qHi, aEn, aHi], i) => (
          <div key={qEn}>
            <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-bold hover:bg-slate-50">
              {hi ? qHi : qEn}
              <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {open === i && <p className="px-4 pb-4 text-sm">{hi ? aHi : aEn}</p>}
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">{l('Which type should I pick?', 'कौन सा प्रकार चुनूँ?')}</h2>
        <div className="grid gap-2">
          {(Object.keys(EXAMPLES) as Category[]).map((c) => {
            const Icon = CATEGORY_ICON[c]
            const dept = meta?.categories.find((x) => x.key === c)?.department
            return (
              <div key={c} className="card flex gap-3 p-3">
                <Icon className="mt-0.5 h-6 w-6 shrink-0 text-brand-700" aria-hidden />
                <div className="min-w-0">
                  <div className="text-sm font-bold">{hi ? CATEGORY_HI[c] : CATEGORY_META[c].label}</div>
                  <p className="text-sm">{EXAMPLES[c]![hi ? 1 : 0]}</p>
                  {dept && <p className="sr-only">{dept}</p>}
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-sm">{l('Not sure? Skip it. The system suggests one and an officer checks it.', 'पता नहीं? छोड़ दें। सिस्टम सुझाव देगा और अधिकारी जाँचेगा।')}</p>
      </section>

      <section className="card space-y-4 p-4">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Settings className="h-6 w-6 text-brand-700" aria-hidden /> {l('Settings and privacy', 'सेटिंग और निजता')}</h2>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold">{l('Language', 'भाषा')}</span>
          <LangSwitch />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold">{l('Dark or light screen', 'गहरी या हल्की स्क्रीन')}</span>
          <ThemeToggle />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-bold"><Trash2 className="h-5 w-5" aria-hidden /> {l('Forget my complaints on this phone', 'इस फ़ोन से मेरी शिकायतें भूलें')}</span>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem('gg_my_codes')
                localStorage.removeItem('gg_confirmed')
                localStorage.removeItem('gg_seen_at')
              } catch {
                /* ignore */
              }
              toast(l('Removed from this phone. Your complaints still exist with the city.', 'इस फ़ोन से हटा दी गईं। शिकायतें नगर के पास बनी रहेंगी।'))
            }}
            className="btn btn-ghost shrink-0"
          >
            {l('Clear', 'हटाएँ')}
          </button>
        </div>
        <ul className="space-y-2 text-sm">
          <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {l('No account or phone number needed. Your tracking code is the key.', 'खाता या फ़ोन नंबर ज़रूरी नहीं। आपका ट्रैकिंग कोड ही चाबी है।')}</li>
          <li className="flex gap-2"><Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {l('The public map never shows your words, photo or home.', 'सार्वजनिक नक्शा आपके शब्द, फ़ोटो या घर कभी नहीं दिखाता।')}</li>
          <li className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {l('Emergencies: call 112 first.', 'आपातकाल में पहले 112 पर कॉल करें।')}</li>
        </ul>
        <a href="/official" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline">{l('Officials login', 'अधिकारी लॉगिन')}</a>
      </section>
    </div>
  )
}
