import type { Category, Deadline, Status } from './api'

export const CATEGORY_META: Record<Category, { label: string; color: string; emoji: string }> = {
  road_damage: { label: 'Road damage', color: '#ea580c', emoji: '🛣️' },
  water_supply: { label: 'Water supply', color: '#2563eb', emoji: '🚰' },
  drainage: { label: 'Drainage & sewage', color: '#7c3aed', emoji: '🌊' },
  garbage: { label: 'Garbage', color: '#65a30d', emoji: '🗑️' },
  streetlight: { label: 'Streetlight', color: '#ca8a04', emoji: '💡' },
  stray_animals: { label: 'Stray animals', color: '#a16207', emoji: '🐕' },
  traffic: { label: 'Traffic & parking', color: '#0891b2', emoji: '🚦' },
  electricity: { label: 'Electricity supply', color: '#db2777', emoji: '⚡' },
  other: { label: 'Other', color: '#64748b', emoji: '📌' },
}

export const STATUS_META: Record<Status, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  info_requested: { label: 'Info requested', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  rejected: { label: 'Rejected', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
  assigned: { label: 'Assigned', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  in_progress: { label: 'In progress', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  needs_verification: { label: 'Resolution review', cls: 'bg-purple-50 text-purple-700 ring-purple-200' },
  resolved: { label: 'Resolved', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
}

export const FACTOR_LABEL: Record<string, string> = {
  severity: 'Severity',
  population: 'Population impact',
  reports: 'Citizen reports',
  duration: 'How long open',
  recurrence: 'Recurrence',
  safety: 'Safety risk',
}

export function priorityTone(score: number): { label: string; color: string; cls: string } {
  if (score >= 70) return { label: 'Critical', color: '#dc2626', cls: 'bg-red-600 text-white' }
  if (score >= 50) return { label: 'High', color: '#ea580c', cls: 'bg-orange-500 text-white' }
  if (score >= 30) return { label: 'Medium', color: '#ca8a04', cls: 'bg-amber-400 text-amber-950' }
  return { label: 'Low', color: '#64748b', cls: 'bg-slate-300 text-slate-800' }
}

export function timeAgo(iso: string): string {
  const then = new Date(iso.endsWith('Z') ? iso : `${iso}Z`).getTime()
  const s = Math.max(0, (Date.now() - then) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export const prettySub = (s: string) => s.replace(/_/g, ' ')

export function fmtHours(h: number): string {
  const a = Math.abs(h)
  if (a < 1) return `${Math.round(a * 60)}m`
  if (a < 48) return `${Math.round(a)}h`
  return `${Math.round(a / 24)}d`
}

/** Short deadline label + Tailwind classes, e.g. "due in 5h" / "overdue 2d" / "met". */
export function deadlineChip(d: Deadline | undefined | null): { label: string; cls: string } | null {
  if (!d || !d.due_at) return null
  if (d.met === true) return { label: 'on time', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }
  if (d.met === false) return { label: 'closed late', cls: 'bg-slate-100 text-slate-600 ring-slate-200' }
  if (d.hours_left === null) return null
  if (d.overdue) return { label: `overdue ${fmtHours(d.hours_left)}`, cls: 'bg-red-50 text-red-700 ring-red-200' }
  if (d.hours_left < 12) return { label: `due in ${fmtHours(d.hours_left)}`, cls: 'bg-amber-50 text-amber-800 ring-amber-200' }
  return { label: `due in ${fmtHours(d.hours_left)}`, cls: 'bg-slate-50 text-slate-600 ring-slate-200' }
}

export const ESCALATION_LABEL = ['', 'Ward Supervisor', 'Municipal Commissioner']

export function fmtDate(iso: string): string {
  return new Date(iso.endsWith('Z') ? iso : `${iso}Z`).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export function fileToBase64(file: File): Promise<{ b64: string; type: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      resolve({ b64: url.split(',')[1], type: file.type || 'image/jpeg', preview: url })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export const EXTRACTOR_LABEL: Record<string, string> = {
  claude: 'Claude AI',
  ollama: 'Local AI (Ollama)',
  rules: 'Offline rules',
  trained: 'Trained ML model',
}
