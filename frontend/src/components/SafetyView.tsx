import { ChevronRight, Crosshair, ExternalLink, Loader2, Phone, ShieldAlert, ShieldCheck, ThumbsUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api, type Category, type DangerSpot, type Meta } from '../api'
import { useLang } from '../i18n'
import { confirmedIssues, rememberConfirmed } from '../myComplaints'
import { timeAgo } from '../ui'
import { Skeleton, useToast } from './Kit'
import { CATEGORY_ICON } from './Shell'

export const NEAR_METRES = 2000
const AREA_KEY = 'gg_safety_area'

export interface Origin {
  lat: number
  lng: number
  name: string
}

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

export function dangersNear(all: DangerSpot[], from: Origin) {
  return all
    .map((d) => ({ ...d, metres: distanceM(from, d) }))
    .filter((d) => d.metres <= NEAR_METRES)
    .sort((a, b) => a.metres - b.metres)
}

/** Only the chosen area's id is remembered, never a GPS position. */
export function savedArea(meta: Meta | null): Origin | null {
  try {
    const loc = meta?.localities.find((x) => x.id === localStorage.getItem(AREA_KEY))
    return loc ? { lat: loc.lat, lng: loc.lng, name: loc.name } : null
  } catch {
    return null
  }
}

const ADVICE: Partial<Record<Category, [string, string]>> = {
  drainage: ['Use the other side of the road. Take extra care after dark and in rain, when water can hide an open drain.', 'सड़क की दूसरी तरफ़ से जाएँ। अंधेरे और बारिश में ज़्यादा सावधान रहें, पानी खुली नाली को छिपा सकता है।'],
  streetlight: ['Stay well away from the pole and wires. Never touch them, especially when wet.', 'खंभे और तारों से दूर रहें। इन्हें कभी न छुएँ, ख़ासकर गीले होने पर।'],
  electricity: ['Stay well away from the pole and wires. Never touch them, especially when wet.', 'खंभे और तारों से दूर रहें। इन्हें कभी न छुएँ, ख़ासकर गीले होने पर।'],
  road_damage: ['Slow down and keep children away from the edge. Avoid this stretch at night if you can.', 'धीरे चलें और बच्चों को किनारे से दूर रखें। हो सके तो रात में यह रास्ता न लें।'],
  stray_animals: ['Do not go near the animals or run from them. Keep children close.', 'जानवरों के पास न जाएँ और उनसे भागें नहीं। बच्चों को पास रखें।'],
}
const DEFAULT_ADVICE: [string, string] = ['Take extra care here, especially after dark.', 'यहाँ ख़ास सावधानी रखें, ख़ासकर अंधेरे में।']

export function SafetyView({ meta, onReport }: { meta: Meta | null; onReport: () => void }) {
  const { l, lang, place } = useLang()
  const toast = useToast()
  const [all, setAll] = useState<DangerSpot[] | null>(null)
  const [origin, setOrigin] = useState<Origin | null>(null)
  const [area, setArea] = useState('')
  const [locating, setLocating] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [confirmed, setConfirmed] = useState(confirmedIssues)

  useEffect(() => {
    api.dangers().then(setAll).catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    const saved = savedArea(meta)
    if (!saved || origin) return
    setOrigin(saved)
    setArea(meta?.localities.find((x) => x.name === saved.name)?.id ?? '')
  }, [meta]) // eslint-disable-line react-hooks/exhaustive-deps

  const near = useMemo(() => (all && origin ? dangersNear(all, origin) : []), [all, origin])

  function useGps() {
    if (!navigator.geolocation) return setGpsError(l('Location is not available here. Choose your area below.', 'यहाँ लोकेशन उपलब्ध नहीं है। नीचे अपना क्षेत्र चुनें।'))
    setLocating(true)
    setGpsError(null)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setOrigin({ lat: p.coords.latitude, lng: p.coords.longitude, name: l('your location', 'आपकी लोकेशन') })
        setArea('')
        setLocating(false)
      },
      () => {
        setLocating(false)
        setGpsError(l('Could not read your location. Choose your area below.', 'आपकी लोकेशन नहीं मिली। नीचे अपना क्षेत्र चुनें।'))
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  function pickArea(id: string) {
    setArea(id)
    const loc = meta?.localities.find((x) => x.id === id)
    setOrigin(loc ? { lat: loc.lat, lng: loc.lng, name: loc.name } : null)
    try {
      if (id) localStorage.setItem(AREA_KEY, id)
      else localStorage.removeItem(AREA_KEY)
    } catch {
      /* the choice still applies for this visit */
    }
  }

  async function stillDangerous(id: number) {
    try {
      await api.confirm(id)
      rememberConfirmed(id)
      setConfirmed(confirmedIssues())
      toast(l('Thank you. The department will see this.', 'धन्यवाद। विभाग इसे देखेगा।'))
    } catch (e) {
      toast(e instanceof Error ? e.message : l('Could not save that. Try again.', 'सहेजा नहीं जा सका। फिर कोशिश करें।'), 'error')
    }
  }

  const away = (m: number) => {
    const rounded = Math.round(m / 100) * 100
    if (rounded < 100) return l('Very close to you', 'आपके बहुत पास')
    if (rounded < 1000) return l(`About ${rounded} metres away`, `लगभग ${rounded} मीटर दूर`)
    return l(`About ${(rounded / 1000).toFixed(1)} km away`, `लगभग ${(rounded / 1000).toFixed(1)} किमी दूर`)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">{l('Danger near me', 'मेरे पास ख़तरा')}</h1>
        <p className="mt-1 text-sm text-slate-700">{l('Places in the city reported as a danger to life, such as open manholes and live wires.', 'शहर की वे जगहें जहाँ जान का ख़तरा बताया गया है, जैसे खुले मैनहोल और बिजली के तार।')}</p>
      </div>

      <div className="card space-y-3 p-5">
        <button type="button" onClick={useGps} disabled={locating} className="btn btn-primary w-full">
          {locating ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Crosshair className="h-5 w-5" aria-hidden />} {l('Use my location', 'मेरी लोकेशन लें')}
        </button>
        <p className="flex items-start gap-1.5 text-sm text-slate-700">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {l('Your location stays on your phone. It is not sent to anyone.', 'आपकी लोकेशन आपके फ़ोन पर ही रहती है। किसी को नहीं भेजी जाती।')}
        </p>
        {gpsError && <p className="text-sm font-bold text-red-700" role="alert">{gpsError}</p>}
        <div>
          <label htmlFor="safety-area" className="block text-sm font-bold">{l('Or choose your area', 'या अपना क्षेत्र चुनें')}</label>
          <select id="safety-area" value={area} onChange={(e) => pickArea(e.target.value)} className="field mt-1">
            <option value="">{l('Choose an area', 'क्षेत्र चुनें')}</option>
            {meta?.localities.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
        </div>
      </div>

      {all === null && !failed && <Skeleton className="h-28" />}
      {failed && <p className="card p-4 text-sm font-bold text-red-700" role="alert">{l('Could not load the list. Check your internet and try again.', 'सूची नहीं खुली। इंटरनेट जाँचकर फिर कोशिश करें।')}</p>}

      <div aria-live="polite">
        {all && !origin && (
          <p className="card p-4 text-sm">
            {l(`${all.length} dangerous ${all.length === 1 ? 'spot is' : 'spots are'} reported across the city. Share your location or pick your area to see the ones near you.`, `पूरे शहर में ${all.length} ख़तरनाक जगहें दर्ज हैं। अपने पास की जगहें देखने के लिए लोकेशन दें या क्षेत्र चुनें।`)}
          </p>
        )}
        {all && origin && near.length === 0 && (
          <p className="card flex items-start gap-2 p-4 text-sm">
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
            {l(`No dangerous spots have been reported within 2 km of ${origin.name}. Unreported dangers may still exist, so stay careful.`, `${origin.name} के 2 किमी के अंदर कोई ख़तरनाक जगह दर्ज नहीं है। फिर भी सावधान रहें, कुछ ख़तरे दर्ज न हुए हों।`)}
          </p>
        )}
        {near.length > 0 && (
          <>
            <h2 className="text-xl font-bold">{l(`${near.length} near ${origin?.name}`, `${origin?.name} के पास ${near.length}`)}</h2>
            <ul className="mt-3 space-y-3">
              {near.map((d) => {
                const Icon = CATEGORY_ICON[d.category]
                const advice = ADVICE[d.category] ?? DEFAULT_ADVICE
                const done = confirmed.includes(d.id)
                return (
                  <li key={d.id} className="card border-l-4 border-l-red-700 p-4">
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-7 w-7 shrink-0 text-red-700" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-bold leading-snug">{place(d.label, d.category)}</p>
                        <p className="text-sm font-bold text-red-700">{away(d.metres)}</p>
                        <p className="mt-2 text-sm">{advice[lang === 'hi' ? 1 : 0]}</p>
                        <p className="mt-1 text-sm text-slate-700">
                          {l(`Reported ${timeAgo(d.first_reported)} by ${d.reports + d.confirmations} ${d.reports + d.confirmations === 1 ? 'person' : 'people'}`, `${timeAgo(d.first_reported)} ${d.reports + d.confirmations} लोगों ने बताया`)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <a href={`https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lng}#map=17/${d.lat}/${d.lng}`} target="_blank" rel="noreferrer" className="btn btn-ghost">
                        <ExternalLink className="h-5 w-5" aria-hidden /> {l('See on map', 'नक्शे पर देखें')}
                      </a>
                      <button type="button" disabled={done} onClick={() => stillDangerous(d.id)} className="btn btn-ghost">
                        <ThumbsUp className="h-5 w-5" aria-hidden /> {done ? l('You confirmed this', 'आपने पुष्टि की') : l('It is still dangerous', 'अभी भी ख़तरा है')}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <a href="tel:112" className="btn btn-danger">
          <Phone className="h-5 w-5" aria-hidden /> {l('Emergency: call 112', 'आपातकाल: 112 पर कॉल करें')}
        </a>
        <button type="button" onClick={onReport} className="btn btn-ghost">
          <ShieldAlert className="h-5 w-5" aria-hidden /> {l('Report a new danger', 'नया ख़तरा दर्ज करें')} <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  )
}
