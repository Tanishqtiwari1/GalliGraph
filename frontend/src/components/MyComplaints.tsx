import { ChevronRight, FolderOpen, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { api, type TrackResult } from '../api'
import { rememberCode } from '../myComplaints'
import { fmtDate } from '../ui'
import { useMyComplaints } from '../useMyComplaints'
import { Skeleton } from './Kit'
import { CATEGORY_ICON } from './Shell'

type F = 'all' | 'open' | 'progress' | 'resolved' | 'closed'
const GROUP: Record<string, F> = {
  open: 'open',
  info_requested: 'open',
  assigned: 'progress',
  in_progress: 'progress',
  needs_verification: 'progress',
  resolved: 'resolved',
  rejected: 'closed',
}
const LABEL: Record<string, { text: string; cls: string }> = {
  open: { text: 'Open', cls: 'pill-zone' },
  info_requested: { text: 'Info needed', cls: 'pill-warn' },
  assigned: { text: 'Assigned', cls: 'pill-info' },
  in_progress: { text: 'In progress', cls: 'pill-info' },
  needs_verification: { text: 'Resolution review', cls: 'pill-warn' },
  resolved: { text: 'Resolved', cls: 'pill-ok' },
  rejected: { text: 'Closed', cls: 'pill-zone' },
}

export function MyComplaints({ onOpen, onReport }: { onOpen: (code: string) => void; onReport: () => void }) {
  const { items, refresh } = useMyComplaints()
  const [f, setF] = useState<F>('all')
  const [q, setQ] = useState('')
  const [add, setAdd] = useState('')
  const [addErr, setAddErr] = useState<string | null>(null)

  const list = (items ?? []).filter(
    (t) => (f === 'all' || GROUP[t.status] === f) && (!q || `${t.tracking_code} ${t.label} ${t.department}`.toLowerCase().includes(q.toLowerCase())),
  )
  const count = (k: F) => (items ?? []).filter((t) => k === 'all' || GROUP[t.status] === k).length

  async function addCode(e: React.FormEvent) {
    e.preventDefault()
    setAddErr(null)
    try {
      await api.track(add)
      rememberCode(add.trim().toUpperCase())
      setAdd('')
      refresh()
    } catch {
      setAddErr('No complaint with that code.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">My complaints</h1>
          <p className="text-sm text-slate-600">Complaints reported from this device. No account needed.</p>
        </div>
        <button type="button" onClick={onReport} className="btn btn-primary">
          <Plus className="h-4 w-4" /> New complaint
        </button>
      </div>

      <div className="card flex items-center gap-2 px-3 py-2">
        <Search className="h-4 w-4 text-slate-400" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by code, problem or department" className="w-full bg-transparent py-1 text-sm outline-none" aria-label="Search complaints" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ['all', 'All'],
            ['open', 'Open'],
            ['progress', 'In progress'],
            ['resolved', 'Resolved'],
            ['closed', 'Closed'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setF(id)}
            aria-pressed={f === id}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ${f === id ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-700 ring-slate-300'}`}
          >
            {label} ({count(id)})
          </button>
        ))}
      </div>

      {items === null && (
        <div className="space-y-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}
      {items && items.length === 0 && (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <FolderOpen className="h-10 w-10 text-slate-300" />
          <p className="font-semibold">No complaints yet on this device</p>
          <p className="text-sm text-slate-500">Report a problem, or add a tracking code you received earlier.</p>
        </div>
      )}
      <ul className="stagger space-y-2">
        {list.map((t: TrackResult) => {
          const Icon = CATEGORY_ICON[t.category]
          const latest = t.timeline[t.timeline.length - 1]
          const lbl = LABEL[t.status] ?? LABEL.open
          return (
            <li key={t.tracking_code}>
              <button type="button" onClick={() => onOpen(t.tracking_code)} className="card lift flex w-full items-start gap-3 p-4 text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-brand-700">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-500">{t.tracking_code}</span>
                    <span className={`pill ${lbl.cls}`}>{lbl.text}</span>
                  </span>
                  <span className="mt-0.5 block font-semibold">{t.label}</span>
                  <span className="block text-xs text-slate-500">
                    Reported {fmtDate(t.reported_at)} · {t.department}
                  </span>
                  {latest && <span className="mt-1 block truncate text-sm text-slate-700">Latest: {latest.message}</span>}
                  {t.info_request && <span className="mt-1 block text-sm font-semibold text-amber-700">Action needed: the officer has a question for you</span>}
                  {t.can_give_feedback && !t.disputed && t.status === 'needs_verification' && (
                    <span className="mt-1 block text-sm font-semibold text-brand-700">Fix reported. Tell us if it is really fixed.</span>
                  )}
                </span>
                <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-slate-400" />
              </button>
            </li>
          )
        })}
      </ul>

      <form onSubmit={addCode} className="card flex flex-wrap items-center gap-2 p-3">
        <span className="text-sm font-semibold">Track another code</span>
        <input value={add} onChange={(e) => setAdd(e.target.value.toUpperCase())} placeholder="JA-XXXX-XXXX" maxLength={12} className="field w-40 font-mono" aria-label="Tracking code to add" />
        <button type="submit" disabled={add.trim().length < 12} className="btn btn-ghost">
          Add
        </button>
        {addErr && <span className="text-xs text-red-600">{addErr}</span>}
      </form>
    </div>
  )
}
