import { Bell, BellOff, CheckCircle2, MessageCircleQuestion, Megaphone, Siren, Wrench } from 'lucide-react'
import { useEffect } from 'react'
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
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Notifications</h1>
        <p className="text-sm text-slate-600">Updates on complaints you reported from this device.</p>
      </div>
      {notices === null && (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}
      {notices && notices.length === 0 && (
        <div className="card flex flex-col items-center gap-2 p-8 text-center text-slate-500">
          <BellOff className="h-10 w-10 text-slate-300" />
          Nothing yet. You'll see updates here when you report a problem.
        </div>
      )}
      <ul className="stagger space-y-2">
        {notices?.slice(0, 60).map((n, i) => {
          const Icon = ICON[n.kind] ?? Bell
          const important = n.kind === 'info_request' || n.kind === 'verification'
          return (
            <li key={`${n.code}-${i}`}>
              <button type="button" onClick={() => onOpen(n.code)} className={`card lift flex w-full items-start gap-3 p-3 text-left ${n.unread ? 'border-brand-300 bg-brand-50/40' : ''}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${important ? 'bg-saffron-100 text-saffron-700' : 'bg-surface text-brand-700'}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{n.message}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {n.label} · <span className="font-mono">{n.code}</span>
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-slate-500" title={fmtDate(n.at)}>
                  {timeAgo(n.at)}
                  {n.unread && <span className="ml-auto mt-1 block h-2 w-2 rounded-full bg-brand-600" aria-label="unread" />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-slate-500">
        Notifications appear here in the app. SMS or WhatsApp alerts would need a messaging provider, which a city deployment would add.
      </p>
    </div>
  )
}
