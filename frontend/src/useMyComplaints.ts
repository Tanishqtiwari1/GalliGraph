import { useCallback, useEffect, useState } from 'react'
import { api, type TrackResult } from './api'
import { myCodes } from './myComplaints'

const SEEN_KEY = 'gg_seen_at'

export function lastSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, new Date().toISOString().slice(0, 19))
  } catch {
    /* ignore */
  }
}

/** Live status of every complaint filed from this device (codes are kept locally; there are no citizen accounts). */
export function useMyComplaints() {
  const [items, setItems] = useState<TrackResult[] | null>(null)
  const refresh = useCallback(async () => {
    const codes = myCodes()
    const results = await Promise.all(codes.map((c) => api.track(c).catch(() => null)))
    setItems(results.filter((r): r is TrackResult => r !== null))
  }, [])
  useEffect(() => {
    refresh()
  }, [refresh])
  return { items, refresh }
}

export interface CitizenNotice {
  code: string
  label: string
  at: string
  message: string
  kind: string
  unread: boolean
}

export function noticesFrom(items: TrackResult[]): CitizenNotice[] {
  const seen = lastSeen()
  return items
    .flatMap((t) => t.timeline.map((e) => ({ code: t.tracking_code, label: t.label, at: e.at, message: e.message, kind: e.kind, unread: e.at > seen })))
    .sort((a, b) => b.at.localeCompare(a.at))
}
