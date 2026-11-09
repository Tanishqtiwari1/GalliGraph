import { ChevronRight, CloudOff, FolderOpen, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api, type TrackResult } from '../api'
import { useLang } from '../i18n'
import { rememberCode } from '../myComplaints'
import { listQueued, removeQueued, type QueuedReport } from '../offlineQueue'
import { fmtDate } from '../ui'
import { useMyComplaints } from '../useMyComplaints'
import { Skeleton, useToast } from './Kit'
import { CATEGORY_ICON } from './Shell'

type F = 'all' | 'active' | 'done'
const DONE = ['resolved', 'rejected']

export function MyComplaints({ onOpen, onReport }: { onOpen: (code: string) => void; onReport: () => void }) {
  const { l, place, department, status, event } = useLang()
  const toast = useToast()
  const { items, refresh } = useMyComplaints()
  const [f, setF] = useState<F>('all')
  const [add, setAdd] = useState('')
  const [addErr, setAddErr] = useState<string | null>(null)
  const [waiting, setWaiting] = useState<QueuedReport[]>([])

  const reload = useCallback(() => {
    listQueued().then(setWaiting).catch(() => {})
    refresh()
  }, [refresh])

  useEffect(() => {
    listQueued().then(setWaiting).catch(() => {})
    window.addEventListener('gg-queue', reload)
    return () => window.removeEventListener('gg-queue', reload)
  }, [reload])

  const match = (t: TrackResult, k: F) => k === 'all' || (k === 'done') === DONE.includes(t.status)
  const list = (items ?? []).filter((t) => match(t, f))
  const count = (k: F) => (items ?? []).filter((t) => match(t, k)).length

  async function addCode(e: React.FormEvent) {
    e.preventDefault()
    setAddErr(null)
    try {
      await api.track(add)
      rememberCode(add.trim().toUpperCase())
      setAdd('')
      refresh()
    } catch {
      setAddErr(l('No complaint with that code.', 'इस कोड की कोई शिकायत नहीं मिली।'))
    }
  }

  async function discard(id: number) {
    try {
      await removeQueued(id)
      setWaiting((xs) => xs.filter((x) => x.id !== id))
      toast(l('Removed from this phone.', 'इस फ़ोन से हटा दी गई।'))
    } catch {
      toast(l('Could not remove it. Try again.', 'हटाई नहीं जा सकी। फिर कोशिश करें।'), 'error')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold">{l('My complaints', 'मेरी शिकायतें')}</h1>
        <p className="text-sm text-slate-700">{l('Complaints made from this phone. No account needed.', 'इस फ़ोन से की गई शिकायतें। खाते की ज़रूरत नहीं।')}</p>
        <button type="button" onClick={onReport} className="btn btn-primary mt-3 w-full">
          <Plus className="h-5 w-5" aria-hidden /> {l('New complaint', 'नई शिकायत')}
        </button>
      </div>

      {waiting.length > 0 && (
        <section className="card border-2 border-amber-700 p-4" aria-labelledby="waiting-title">
          <h2 id="waiting-title" className="flex items-center gap-2 text-lg font-bold">
            <CloudOff className="h-6 w-6" aria-hidden /> {l('Waiting to be sent', 'भेजी जानी बाकी')}
          </h2>
          <p className="text-sm">{l('These are saved on this phone and will go out when you are online with GalliGraph open.', 'ये इस फ़ोन पर सहेजी गई हैं। GalliGraph खुला होने और इंटरनेट आने पर चली जाएँगी।')}</p>
          <ul className="mt-2 space-y-2">
            {waiting.map((w) => (
              <li key={w.id} className="flex items-start gap-2 rounded-lg bg-surface-low p-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-bold">{w.body.text}</p>
                  <p className="text-sm text-slate-700">{fmtDate(w.created_at)}</p>
                  {w.error && <p className="text-sm font-bold text-red-700">{l('Could not be sent', 'भेजी नहीं जा सकी')}: {w.error}</p>}
                </div>
                <button type="button" onClick={() => discard(w.id)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-slate-200" aria-label={l('Remove this saved complaint', 'यह सहेजी गई शिकायत हटाएँ')}>
                  <Trash2 className="h-5 w-5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-3 gap-2" role="group" aria-label={l('Show', 'दिखाएँ')}>
        {([['all', l('All', 'सभी')], ['active', l('Active', 'चालू')], ['done', l('Closed', 'बंद')]] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setF(id)} aria-pressed={f === id} className={`min-h-12 rounded-lg text-sm font-bold ring-1 ${f === id ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-800 ring-slate-400'}`}>
            {label} ({count(id)})
          </button>
        ))}
      </div>

      {items === null && <Skeleton className="h-24" />}
      {items && items.length === 0 && waiting.length === 0 && (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <FolderOpen className="h-10 w-10 text-slate-400" aria-hidden />
          <p className="font-bold">{l('No complaints on this phone yet', 'इस फ़ोन पर अभी कोई शिकायत नहीं')}</p>
        </div>
      )}
      <ul className="space-y-2">
        {list.map((t) => {
          const Icon = CATEGORY_ICON[t.category]
          const latest = t.timeline[t.timeline.length - 1]
          return (
            <li key={t.tracking_code}>
              <button type="button" onClick={() => onOpen(t.tracking_code)} className="card flex w-full items-start gap-3 p-4 text-left hover:border-brand-600">
                <Icon className="mt-0.5 h-7 w-7 shrink-0 text-brand-700" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold leading-snug">{place(t.label, t.category)}</span>
                  <span className="block text-sm font-bold text-brand-700">{status(t.status)}</span>
                  <span className="block text-sm text-slate-700"><span className="font-mono">{t.tracking_code}</span> · {department(t.department)}</span>
                  {latest && <span className="mt-1 block text-sm">{event(latest.message)}</span>}
                  {t.info_request && <span className="mt-1 block text-sm font-bold text-amber-800">{l('The officer has a question for you', 'अधिकारी का आपसे एक सवाल है')}</span>}
                  {t.deadline.overdue && !DONE.includes(t.status) && <span className="mt-1 block text-sm font-bold text-red-700">{l('Past its deadline. You can take it further.', 'समय-सीमा पार। आप इसे आगे बढ़ा सकते हैं।')}</span>}
                  {t.can_give_feedback && !t.disputed && t.status === 'needs_verification' && <span className="mt-1 block text-sm font-bold text-brand-700">{l('Tell us if it is really fixed.', 'बताएँ कि क्या यह सच में ठीक हुआ।')}</span>}
                </span>
                <ChevronRight className="mt-1 h-6 w-6 shrink-0 text-slate-500" aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>

      <form onSubmit={addCode} className="card p-4">
        <label htmlFor="mine-code" className="block text-sm font-bold">{l('Add another tracking code', 'दूसरा ट्रैकिंग कोड जोड़ें')}</label>
        <div className="mt-1 flex gap-2">
          <input id="mine-code" value={add} onChange={(e) => setAdd(e.target.value.toUpperCase())} placeholder="JA-XXXX-XXXX" maxLength={12} autoComplete="off" className="field min-w-0 flex-1 font-mono" />
          <button type="submit" disabled={add.trim().length < 12} className="btn btn-ghost shrink-0">{l('Add', 'जोड़ें')}</button>
        </div>
        {addErr && <p className="mt-1 text-sm font-bold text-red-700" role="alert">{addErr}</p>}
      </form>
    </div>
  )
}
