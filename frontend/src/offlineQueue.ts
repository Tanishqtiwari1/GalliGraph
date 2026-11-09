/** Complaints that could not be sent because the network dropped. They wait on this device (IndexedDB, because a
 *  photo is too large for localStorage) and go out as soon as the connection is back. */
import { api, ApiError, type SubmitBody } from './api'
import { rememberCode } from './myComplaints'

export interface QueuedReport {
  id: number
  created_at: string
  body: SubmitBody
  /** Why the server refused it. Refused reports stay listed so the citizen can see and remove them. */
  error?: string
}

const STORE = 'reports'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('gg_offline', 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export const queueReport = (body: SubmitBody) =>
  run('readwrite', (s) => s.add({ created_at: new Date().toISOString().slice(0, 19), body }))
export const listQueued = () => run<QueuedReport[]>('readonly', (s) => s.getAll())
export const removeQueued = (id: number) => run('readwrite', (s) => s.delete(id))

/** True when the request never got an answer, as opposed to the server refusing it. */
export const isNetworkFailure = (e: unknown) => !navigator.onLine || e instanceof TypeError

let flushing: Promise<string[]> | null = null

/** Sends what is waiting and returns the new tracking codes. Safe to call often; only one run happens at a time. */
export function flushQueue(): Promise<string[]> {
  flushing ??= (async () => {
    const sent: string[] = []
    if (!navigator.onLine) return sent
    for (const item of await listQueued()) {
      if (item.error) continue
      try {
        const r = await api.submit(item.body)
        rememberCode(r.tracking_code)
        await removeQueued(item.id)
        sent.push(r.tracking_code)
      } catch (e) {
        // No answer, too many requests or a server fault: leave it waiting and try again later.
        if (!(e instanceof ApiError) || e.status === 429 || e.status >= 500) break
        await run('readwrite', (s) => s.put({ ...item, error: e.message }))
      }
    }
    return sent
  })().finally(() => {
    flushing = null
  })
  return flushing
}
