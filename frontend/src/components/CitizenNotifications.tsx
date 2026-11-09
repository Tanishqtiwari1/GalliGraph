import { Bell, BellOff, CheckCircle2, MessageCircleQuestion, Megaphone, Siren, Wrench } from 'lucide-react'
import { useEffect } from 'react'
import { useLang } from '../i18n'
import { fmtDate, timeAgo } from '../ui'
import { markSeen, noticesFrom, useMyComplaints } from '../useMyComplaints'
import { Skeleton } from './Kit'

const ICON: Record<string, typeof Bell> = {
  created: CheckCircle2,
  info_request: MessageCircleQuestion,
  update: Megaphone,
  verification: Wrench,
  escalation: Siren,
}

export function CitizenNotifications({ onOpen, onSeen }: { onOpen: (code: string) => void; onSeen: () => void }) {
  const { l, event } = useLang()
  const { items } = useMyComplaints()
  const notices = items ? noticesFrom(items) : null

  // Opening this page marks everything as read (after it has rendered once with the unread dots).
  useEffect(() => {
    if (!items) return
    const t = setTimeout(() => {
      markSeen()
      onSeen()
    }, 1500)
    return () => clearTimeout(t)
  }, [items, onSeen])

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold">{l('Updates', 'सूचनाएँ')}</h1>
        <p className="text-sm text-slate-700">{l('News on the complaints you made from this phone.', 'इस फ़ोन से की गई शिकायतों की जानकारी।')}</p>
      </div>
      {notices === null && <Skeleton className="h-16" />}
      {notices && notices.length === 0 && (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <BellOff className="h-10 w-10 text-slate-400" aria-hidden />
          {l('Nothing yet. Updates appear here after you report a problem.', 'अभी कुछ नहीं। शिकायत करने के बाद सूचनाएँ यहाँ दिखेंगी।')}
        </div>
      )}
      <ul className="space-y-2">
        {notices?.slice(0, 60).map((n, i) => {
          const Icon = ICON[n.kind] ?? Bell
          return (
            <li key={`${n.code}-${i}`}>
              <button type="button" onClick={() => onOpen(n.code)} className={`card flex w-full items-start gap-3 p-3 text-left hover:border-brand-600 ${n.unread ? 'border-2 border-brand-600' : ''}`}>
                <Icon className="mt-0.5 h-6 w-6 shrink-0 text-brand-700" aria-hidden />
                <span className="min-w-0 flex-1">
                  {n.unread && <span className="text-sm font-bold text-brand-700">{l('New', 'नई')} · </span>}
                  <span className="text-sm font-bold">{event(n.message)}</span>
                  <span className="block text-sm text-slate-700"><span className="font-mono">{n.code}</span> · <span title={fmtDate(n.at)}>{timeAgo(n.at)}</span></span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
