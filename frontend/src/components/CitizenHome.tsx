import { Ambulance, ChevronRight, Flame, Info, MessageSquarePlus, Phone, ScanSearch, ShieldAlert, ThumbsUp, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type Category, type DangerSpot, type MapPoint, type Meta, type PublicSummary, type TrackResult } from '../api'
import { CATEGORY_HI, useLang } from '../i18n'
import { confirmedIssues, myCodes, rememberConfirmed } from '../myComplaints'
import { CATEGORY_META, timeAgo } from '../ui'
import { useToast } from './Kit'
import { dangersNear, savedArea } from './SafetyView'
import { CATEGORY_ICON } from './Shell'

const GRID_CATEGORIES: Category[] = ['road_damage', 'garbage', 'water_supply', 'drainage', 'streetlight', 'traffic', 'stray_animals', 'electricity']

interface Props {
  meta: Meta | null
  onReport: (category?: Category) => void
  onTrack: (code?: string) => void
  onSafety: () => void
}

export function CitizenHome({ meta, onReport, onTrack, onSafety }: Props) {
  const { l, lang, status, place, department } = useLang()
  const toast = useToast()
  const [summary, setSummary] = useState<PublicSummary | null>(null)
  const [points, setPoints] = useState<MapPoint[]>([])
  const [dangers, setDangers] = useState<DangerSpot[]>([])
  const [area, setArea] = useState('')
  const [trackInput, setTrackInput] = useState('')
  const [mine, setMine] = useState<TrackResult | null>(null)
  const [confirmed, setConfirmed] = useState<number[]>(confirmedIssues)

  useEffect(() => {
    api.publicSummary().then(setSummary).catch(() => {})
    api.publicMap().then(setPoints).catch(() => {})
    api.dangers().then(setDangers).catch(() => {})
    const code = myCodes()[0]
    if (code) api.track(code).then(setMine).catch(() => {})
  }, [])

  const areaName = meta?.localities.find((x) => x.id === area)?.name
  const nearby = points
    .filter((p) => p.status !== 'resolved' && (!areaName || p.locality === areaName))
    .sort((a, b) => b.reports + b.confirmations - (a.reports + a.confirmations))
    .slice(0, 3)

  const home = savedArea(meta)
  const closeBy = home ? dangersNear(dangers, home) : []

  async function plusOne(p: MapPoint) {
    try {
      const r = await api.confirm(p.id)
      rememberConfirmed(p.id)
      setConfirmed(confirmedIssues())
      setPoints((ps) => ps.map((x) => (x.id === p.id ? { ...x, confirmations: r.confirmations } : x)))
      toast(r.already ? l('You already confirmed this one.', 'आप पहले ही पुष्टि कर चुके हैं।') : l('Thank you. This raises its priority.', 'धन्यवाद। इससे इसकी प्राथमिकता बढ़ेगी।'))
    } catch (e) {
      toast(e instanceof Error ? e.message : l('Could not save that. Try again.', 'सहेजा नहीं जा सका। फिर कोशिश करें।'), 'error')
    }
  }

  const s = summary
  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <section className="space-y-3">
        <h1 className="font-display text-3xl font-bold text-ink">{l('What do you need to do?', 'आप क्या करना चाहते हैं?')}</h1>

        <button type="button" onClick={() => onReport()} className="flex w-full items-center gap-4 rounded-xl bg-brand-600 p-5 text-left text-white hover:bg-brand-700">
          <MessageSquarePlus className="h-9 w-9 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-xl font-bold">{l('Report a problem', 'समस्या दर्ज करें')}</span>
            <span className="block text-sm">{l('Write it or say it, in Hindi or English', 'हिंदी या अंग्रेज़ी में लिखें या बोलें')}</span>
          </span>
          <ChevronRight className="h-7 w-7 shrink-0" aria-hidden />
        </button>

        <button type="button" onClick={onSafety} className="card flex w-full items-center gap-4 border-2 border-red-700 p-5 text-left hover:bg-red-50">
          <ShieldAlert className="h-9 w-9 shrink-0 text-red-700" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-xl font-bold text-ink">{l('Danger near me', 'मेरे पास ख़तरा')}</span>
            <span className="block text-sm text-slate-700">
              {home
                ? closeBy.length
                  ? l(`${closeBy.length} dangerous ${closeBy.length === 1 ? 'spot' : 'spots'} near ${home.name}`, `${home.name} के पास ${closeBy.length} ख़तरनाक जगह`)
                  : l(`No dangerous spots reported near ${home.name}`, `${home.name} के पास कोई ख़तरनाक जगह दर्ज नहीं`)
                : l('Open manholes, live wires and other hazards', 'खुले मैनहोल, बिजली के तार और अन्य ख़तरे')}
            </span>
          </span>
          <ChevronRight className="h-7 w-7 shrink-0 text-slate-600" aria-hidden />
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onTrack(trackInput)
          }}
          className="card p-5"
        >
          <label htmlFor="home-code" className="flex items-center gap-2 text-lg font-bold">
            <ScanSearch className="h-6 w-6 text-brand-700" aria-hidden /> {l('Check my complaint', 'मेरी शिकायत की स्थिति')}
          </label>
          <div className="mt-2 flex gap-2">
            <input id="home-code" value={trackInput} onChange={(e) => setTrackInput(e.target.value.toUpperCase())} placeholder="JA-XXXX-XXXX" maxLength={12} autoComplete="off" className="field min-w-0 flex-1 font-mono tracking-wider" />
            <button type="submit" disabled={trackInput.trim().length < 12} className="btn btn-primary shrink-0">
              {l('Check', 'देखें')}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl bg-red-50 p-4" aria-labelledby="emergency-title">
        <h2 id="emergency-title" className="text-base font-bold text-red-800">
          {l('Someone in danger right now? Call first.', 'कोई अभी ख़तरे में है? पहले कॉल करें।')}
        </h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            { n: '112', t: l('Emergency', 'आपातकाल'), icon: Phone },
            { n: '101', t: l('Fire', 'अग्निशमन'), icon: Flame },
            { n: '108', t: l('Ambulance', 'एम्बुलेंस'), icon: Ambulance },
          ].map(({ n, t, icon: Icon }) => (
            <a key={n} href={`tel:${n}`} className="flex flex-col items-center rounded-lg bg-white p-2 ring-1 ring-red-300 hover:bg-red-100">
              <Icon className="h-5 w-5 text-red-700" aria-hidden />
              <span className="text-xl font-bold tnum text-ink">{n}</span>
              <span className="text-xs text-slate-700">{t}</span>
            </a>
          ))}
        </div>
      </section>

      {mine && (
        <section className="card p-5">
          <h2 className="text-sm font-bold text-slate-700">{l('Your latest complaint', 'आपकी पिछली शिकायत')}</h2>
          <p className="mt-1 text-lg font-bold">{place(mine.label, mine.category)}</p>
          <p className="text-sm">
            {status(mine.status)}
            {mine.deadline.overdue && mine.status !== 'resolved' && <b className="text-red-700"> · {l('Past its deadline', 'समय-सीमा पार')}</b>}
          </p>
          <button type="button" onClick={() => onTrack(mine.tracking_code)} className="btn btn-ghost mt-3 w-full">
            {l('See full details', 'पूरी जानकारी देखें')} <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </section>
      )}

      <section aria-labelledby="types-title">
        <h2 id="types-title" className="text-xl font-bold">{l('Or pick the type of problem', 'या समस्या का प्रकार चुनें')}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GRID_CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c]
            return (
              <button key={c} type="button" onClick={() => onReport(c)} className="card flex min-h-28 flex-col items-start justify-between gap-2 p-3 text-left hover:border-brand-600 hover:bg-brand-50">
                <Icon className="h-7 w-7 text-brand-700" aria-hidden />
                <span className="text-sm font-bold leading-snug text-ink">{lang === 'hi' ? CATEGORY_HI[c] : CATEGORY_META[c].label}</span>
              </button>
            )
          })}
        </div>
      </section>

      {s?.notices.map((n) => (
        <p key={`${n.locality}-${n.category}`} className="flex items-start gap-2 rounded-xl bg-saffron-50 p-4 text-sm text-amber-900">
          <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <span>
            {l(`Many ${n.category_label.toLowerCase()} complaints in ${n.locality}. The department has been told.`, `${n.locality} में ${CATEGORY_HI[n.category]} की कई शिकायतें मिली हैं। विभाग को बता दिया गया है।`)}
          </span>
        </p>
      ))}

      <section aria-labelledby="near-title">
        <h2 id="near-title" className="text-xl font-bold">{l('Problems others have reported', 'दूसरों की बताई समस्याएँ')}</h2>
        <p className="text-sm text-slate-700">{l('Seen it too? Press the button. It makes the problem a higher priority.', 'आपने भी देखा है? बटन दबाएँ। इससे प्राथमिकता बढ़ती है।')}</p>
        <label htmlFor="home-area" className="mt-3 block text-sm font-bold">{l('Your area', 'आपका क्षेत्र')}</label>
        <select id="home-area" value={area} onChange={(e) => setArea(e.target.value)} className="field mt-1">
          <option value="">{l('All areas', 'सभी क्षेत्र')}</option>
          {meta?.localities.map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </select>
        <ul className="mt-3 space-y-2">
          {nearby.length === 0 && <li className="card p-4 text-sm text-slate-700">{l('No open problems reported here right now.', 'यहाँ अभी कोई खुली समस्या दर्ज नहीं है।')}</li>}
          {nearby.map((p) => {
            const Icon = CATEGORY_ICON[p.category]
            const done = confirmed.includes(p.id)
            return (
              <li key={p.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-6 w-6 shrink-0 text-brand-700" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{place(p.label, p.category)}</p>
                    <p className="text-sm text-slate-700">
                      {department(p.department)} · {timeAgo(p.first_reported)}
                      {p.overdue && <b className="text-red-700"> · {l('Past its deadline', 'समय-सीमा पार')}</b>}
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-700">
                      <Users className="h-4 w-4" aria-hidden /> {l(`${p.reports + p.confirmations} people reported`, `${p.reports + p.confirmations} लोगों ने बताया`)}
                    </p>
                  </div>
                </div>
                <button type="button" disabled={done} onClick={() => plusOne(p)} className="btn btn-ghost mt-3 w-full">
                  <ThumbsUp className="h-5 w-5" aria-hidden /> {done ? l('You confirmed this', 'आपने पुष्टि की') : l('I have seen this too', 'मैंने भी देखा है')}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {s && (
        <section aria-labelledby="city-title">
          <h2 id="city-title" className="text-xl font-bold">{l('How the city is doing', 'शहर का काम कैसा है')}</h2>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            {[
              [s.active_issues, l('problems open', 'खुली समस्याएँ')],
              [s.on_time_pct === null ? '–' : `${Math.round(s.on_time_pct)}%`, l('fixed on time', 'समय पर ठीक')],
              [s.median_fix_days === null ? '–' : l(`${s.median_fix_days} days`, `${s.median_fix_days} दिन`), l('typical fix', 'आम तौर पर')],
            ].map(([v, t]) => (
              <div key={String(t)} className="card flex flex-col-reverse justify-end p-3">
                <dt className="text-sm text-slate-700">{t}</dt>
                <dd className="text-2xl font-bold tnum text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}
