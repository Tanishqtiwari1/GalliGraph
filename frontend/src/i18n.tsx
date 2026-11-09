import { createContext, useContext, useState } from 'react'
import type { Category, Status } from './api'
import { setDateLocale } from './ui'

export type Lang = 'en' | 'hi'

/** Hindi names shown under the English category label (bilingual civic labels). */
export const CATEGORY_HI: Record<Category, string> = {
  road_damage: 'सड़क / गड्ढे',
  water_supply: 'पानी की आपूर्ति',
  drainage: 'नाली / सीवर',
  garbage: 'कचरा / सफ़ाई',
  streetlight: 'स्ट्रीट लाइट',
  stray_animals: 'आवारा पशु',
  traffic: 'यातायात / पार्किंग',
  electricity: 'बिजली आपूर्ति',
  other: 'अन्य',
}

const DEPARTMENT_HI: Record<string, string> = {
  'PWD / Municipal Roads': 'लोक निर्माण विभाग / नगर सड़क',
  'PHED (Jal Vibhag)': 'जल विभाग (PHED)',
  'Municipal Sewerage & Drainage': 'नगर सीवरेज और नाली विभाग',
  'Sanitation (Swachh Bharat Cell)': 'सफ़ाई विभाग (स्वच्छ भारत)',
  'Municipal Electrical Wing': 'नगर विद्युत शाखा',
  'Municipal Veterinary & Animal Control': 'नगर पशु नियंत्रण विभाग',
  'Traffic Police': 'यातायात पुलिस',
  'JVVNL (Electricity Discom)': 'बिजली विभाग (JVVNL)',
  "Commissioner's Office (manual triage)": 'आयुक्त कार्यालय',
}

const STATUS_TEXT: Record<Status, [string, string]> = {
  open: ['Waiting for review', 'जाँच की प्रतीक्षा में'],
  info_requested: ['Your answer needed', 'आपका जवाब चाहिए'],
  assigned: ['Assigned', 'सौंपी गई'],
  in_progress: ['Work in progress', 'काम जारी है'],
  needs_verification: ['Checking the repair', 'मरम्मत की जाँच'],
  resolved: ['Fixed', 'ठीक हो गई'],
  rejected: ['Closed', 'बंद'],
}

const STAGE_HI: Record<string, string> = {
  submitted: 'दर्ज हुई',
  reviewed: 'जाँची गई',
  assigned: 'सौंपी गई',
  in_progress: 'काम जारी',
  resolution_review: 'मरम्मत की जाँच',
  resolved: 'ठीक हो गई',
  rejected: 'बंद - कार्रवाई योग्य नहीं',
}

/** Timeline messages written by the server. Words typed by an officer after the prefix stay as written. */
const EVENT_HI: [string, string][] = [
  ['SMS update sent', 'SMS भेजा गया'],
  ['Update from the department:', 'विभाग की सूचना:'],
  ['Reviewed by a municipal officer', 'नगर अधिकारी ने जाँच की'],
  ['The officer needs more information from you', 'अधिकारी को आपसे और जानकारी चाहिए'],
  ['You added more information', 'आपने और जानकारी दी'],
  ['Citizen says the problem persists - sent for review', 'नागरिक के अनुसार समस्या बनी हुई है - जाँच के लिए भेजी गई'],
  ['A resident says the problem persists - sent for review', 'एक निवासी के अनुसार समस्या बनी हुई है - जाँच के लिए भेजी गई'],
  ['A resident confirmed the fix', 'एक निवासी ने मरम्मत की पुष्टि की'],
  ['Closed as not actionable', 'कार्रवाई योग्य नहीं मानकर बंद'],
  ['The department reported the problem fixed - under review', 'विभाग ने समस्या ठीक बताई - जाँच जारी'],
  ['Fix verified and complaint resolved', 'मरम्मत की पुष्टि हुई, शिकायत हल'],
  ['Fix not accepted - sent back for repair', 'मरम्मत स्वीकार नहीं - दोबारा मरम्मत के लिए भेजी गई'],
  ['Assigned to a field officer', 'फ़ील्ड अधिकारी को सौंपी गई'],
  ['Escalated to a senior officer', 'वरिष्ठ अधिकारी को भेजी गई'],
  ['Complaint received and routed', 'शिकायत मिली और विभाग को भेजी गई'],
  ['Repair verified and issue closed', 'मरम्मत की पुष्टि हुई, मामला बंद'],
  ['Department reported a fix; awaiting verification', 'विभाग ने मरम्मत बताई; पुष्टि बाकी'],
  ['Deadline missed - escalated to a senior officer', 'समय-सीमा चूकी - वरिष्ठ अधिकारी को भेजी गई'],
  ['A resident confirmed this problem (+1)', 'एक निवासी ने इस समस्या की पुष्टि की (+1)'],
  ['Transferred to the right department', 'सही विभाग को भेजी गई'],
  ['Reopened', 'फिर से खोली गई'],
]

const STRINGS = {
  home: ['Home', 'होम'],
  report: ['Report', 'शिकायत'],
  map: ['Map', 'नक्शा'],
  track: ['Track', 'स्थिति'],
  mine: ['My cases', 'मेरे मामले'],
  alerts: ['Alerts', 'सूचनाएँ'],
  help: ['Help', 'सहायता'],
  overview: ['Overview', 'सारांश'],
  complaints: ['Complaints', 'शिकायतें'],
  workOrders: ['Work orders', 'कार्य आदेश'],
  slaAlerts: ['SLA & Alerts', 'समय-सीमा'],
  analytics: ['Analytics', 'विश्लेषण'],
  staff: ['Staff & settings', 'स्टाफ़'],
  triage: ['Triage', 'छंटाई'],
  ops: ['Ops', 'कार्य'],
  citizenPortal: ['Citizen Portal', 'नागरिक पोर्टल'],
  officerTriage: ['Officer Triage', 'अधिकारी कक्ष'],
  adminIntel: ['Admin Intel', 'प्रशासन'],
  heroTitle: ['Your city. Your voice.', 'आपका शहर। आपकी आवाज़।'],
  heroSub: [
    'Report civic issues, track progress in real time, and help municipal teams see what needs urgent attention.',
    'नागरिक समस्याएँ दर्ज करें, प्रगति देखें, और नगर निगम को बताएं कि क्या ज़रूरी है।',
  ],
  reportIssue: ['Report an Issue', 'शिकायत दर्ज करें'],
  trackComplaint: ['Track Complaint', 'शिकायत की स्थिति'],
  healthSnapshot: ['Civic Health Snapshot', 'शहर की स्थिति'],
  whatIssue: ['What issue are you noticing?', 'आप कौन सी समस्या देख रहे हैं?'],
  tapToFile: ['Tap to start an AI-assisted complaint', 'टैप करें और शिकायत दर्ज करें'],
  howItWorks: ['How GalliGraph works', 'GalliGraph कैसे काम करता है'],
  yourGrievance: ['Your active grievance', 'आपकी शिकायत'],
  nearby: ['Nearby neighbourhood issues', 'आस-पास की समस्याएँ'],
  nearbySub: ['Tap "+1" if you have seen this too. It raises the priority.', 'अगर आपने भी देखा है तो "+1" दबाएं।'],
  haveThisToo: ['I have this too (+1)', 'मुझे भी है (+1)'],
  emergency: ['24x7 Emergency Contacts', 'आपातकालीन संपर्क'],
  wardHeatmap: ['Ward density heatmap', 'वार्ड हीटमैप'],
  open: ['open', 'खुली'],
} as const

export type StringKey = keyof typeof STRINGS

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (k: StringKey) => string
  /** "Home / होम" style bilingual label */
  bi: (k: StringKey) => string
  /** Inline pair for sentences used in one place: l('Fixed', 'ठीक हो गई') */
  l: (en: string, hi: string) => string
  department: (name: string) => string
  status: (s: Status) => string
  stage: (key: string, english: string) => string
  event: (message: string) => string
  /** "Pothole in Raja Park" -> "सड़क / गड्ढे, Raja Park" in Hindi */
  place: (label: string, category: Category) => string
}

const Ctx = createContext<LangCtx | null>(null)

function readLang(): Lang {
  try {
    return localStorage.getItem('gg_lang') === 'hi' ? 'hi' : 'en'
  } catch {
    return 'en'
  }
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const initial = readLang()
    setDateLocale(initial)
    return initial
  })
  const setLang = (l: Lang) => {
    setDateLocale(l)
    setLangState(l)
    try {
      localStorage.setItem('gg_lang', l)
    } catch {
      /* storage unavailable: preference lasts for this visit only */
    }
    document.documentElement.lang = l
  }
  const t = (k: StringKey) => STRINGS[k][lang === 'hi' ? 1 : 0]
  const bi = (k: StringKey) => (lang === 'hi' ? `${STRINGS[k][1]} / ${STRINGS[k][0]}` : `${STRINGS[k][0]} / ${STRINGS[k][1]}`)
  const hi = lang === 'hi'
  const value: LangCtx = {
    lang,
    setLang,
    t,
    bi,
    l: (en, h) => (hi ? h : en),
    department: (name) => (hi ? (DEPARTMENT_HI[name] ?? name) : name.split(' (')[0]),
    status: (s) => STATUS_TEXT[s][hi ? 1 : 0],
    stage: (key, english) => (hi ? (STAGE_HI[key] ?? english) : english),
    event: (message) => {
      if (!hi) return message
      const m = EVENT_HI.find(([en]) => message.startsWith(en))
      return m ? m[1] + message.slice(m[0].length) : message
    },
    place: (label, category) => {
      if (!hi) return label
      const area = label.match(/ in (.+)$/)?.[1]
      return area ? `${CATEGORY_HI[category]}, ${area}` : CATEGORY_HI[category]
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLang(): LangCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLang outside LangProvider')
  return v
}
