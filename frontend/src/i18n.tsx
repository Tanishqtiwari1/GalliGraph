import { createContext, useContext, useState } from 'react'
import type { Category } from './api'

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
  const [lang, setLangState] = useState<Lang>(readLang)
  const setLang = (l: Lang) => {
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
  return <Ctx.Provider value={{ lang, setLang, t, bi }}>{children}</Ctx.Provider>
}

export function useLang(): LangCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLang outside LangProvider')
  return v
}
