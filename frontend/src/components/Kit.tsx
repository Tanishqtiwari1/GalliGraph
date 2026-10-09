import { Crosshair, Loader2, Mic, MicOff, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'

/* ------------------------------------------------------------------ animated number */

export function CountUp({ value, decimals = 0, suffix = '' }: { value: number | null | undefined; decimals?: number; suffix?: string }) {
  const [shown, setShown] = useState(0)
  const target = value ?? 0
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const from = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 700)
      const eased = 1 - Math.pow(1 - k, 3)
      setShown(from + (target - from) * eased)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  if (value === null || value === undefined) return <>–</>
  return (
    <>
      {shown.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </>
  )
}

/* ------------------------------------------------------------------ skeleton */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} aria-hidden />
}

/* ------------------------------------------------------------------ modal & slide-over */

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-navy-900/45 backdrop-blur-sm" />
      <div className={`animate-rise relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function SlideOver({ onClose, children, label }: { onClose: () => void; children: React.ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[1100] flex justify-end" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-navy-900/40 backdrop-blur-[2px]" />
      <div className="animate-slide-in relative h-full w-full max-w-3xl overflow-y-auto bg-canvas p-3 shadow-2xl sm:p-4">
        <button type="button" onClick={onClose} className="mb-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-white">
          <X className="h-4 w-4" /> Close
        </button>
        {children}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ toasts */

const ToastCtx = createContext<(msg: string, tone?: 'ok' | 'error') => void>(() => {})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; tone: 'ok' | 'error' }[]>([])
  const push = useCallback((msg: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((xs) => [...xs, { id, msg, tone }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[1300] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`animate-rise rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg ${t.tone === 'error' ? 'bg-red-700' : 'bg-navy-900'}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

/* ------------------------------------------------------------------ voice to text */

type SpeechRec = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}

function speechCtor(): (new () => SpeechRec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Browser speech recognition (Chrome/Edge/Safari). Audio is handled by the browser; nothing is uploaded by GalliGraph. */
export function VoiceButton({ onText, lang }: { onText: (t: string) => void; lang: 'hi-IN' | 'en-IN' }) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<SpeechRec | null>(null)
  const Ctor = speechCtor()

  function toggle() {
    if (!Ctor) return
    if (listening) {
      rec.current?.stop()
      return
    }
    const r = new Ctor()
    r.lang = lang
    r.continuous = true
    r.interimResults = false
    r.onresult = (e) => {
      let text = ''
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript
      if (text.trim()) onText(text.trim())
    }
    r.onend = () => setListening(false)
    r.onerror = (e) => {
      setError(e.error === 'not-allowed' ? 'Microphone permission was denied.' : 'Voice input stopped. Try again.')
      setListening(false)
    }
    setError(null)
    rec.current = r
    r.start()
    setListening(true)
  }

  if (!Ctor) return <span className="text-xs text-slate-500">Voice input works in Chrome, Edge and Safari.</span>
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={listening}
        className={`btn ${listening ? 'btn-danger' : 'btn-ghost'} relative`}
      >
        {listening && <span className="absolute -left-1 -top-1 h-3 w-3 animate-ping rounded-full bg-red-500" />}
        {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        {listening ? 'Stop listening' : lang === 'hi-IN' ? 'बोलकर लिखें' : 'Speak instead'}
      </button>
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
    </span>
  )
}

/* ------------------------------------------------------------------ map pin picker */

function ClickToPin({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

function Recenter({ at }: { at: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (at) map.setView(at, Math.max(map.getZoom(), 15))
  }, [at, map])
  return null
}

export function LocationPicker({
  value,
  onChange,
}: {
  value: { lat: number; lng: number } | null
  onChange: (v: { lat: number; lng: number } | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [center, setCenter] = useState<[number, number] | null>(null)

  function useGps() {
    if (!navigator.geolocation) return setMsg('Location is not available in this browser.')
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const v = { lat: p.coords.latitude, lng: p.coords.longitude }
        onChange(v)
        setCenter([v.lat, v.lng])
        setBusy(false)
        setMsg(null)
      },
      () => {
        setBusy(false)
        setMsg('Could not read your location. Tap the map instead.')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={useGps} className="btn btn-ghost" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} Use my current location
        </button>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-slate-600 underline">
            Clear pin
          </button>
        )}
      </div>
      <div className="relative h-64 overflow-hidden rounded-xl border border-slate-200">
        <MapContainer center={value ? [value.lat, value.lng] : [26.9124, 75.7873]} zoom={value ? 16 : 12} className="h-full w-full" scrollWheelZoom={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          <ClickToPin onPick={(lat, lng) => onChange({ lat, lng })} />
          <Recenter at={center} />
          {value && <CircleMarker center={[value.lat, value.lng]} radius={11} pathOptions={{ color: '#fff', weight: 3, fillColor: '#dc2626', fillOpacity: 1 }} />}
        </MapContainer>
        {!value && (
          <div className="pointer-events-none absolute right-2 top-2 z-[400] w-fit max-w-[70%] rounded-full bg-white/95 px-3 py-1 text-xs font-semibold shadow">
            Tap the map to drop a pin on the exact spot
          </div>
        )}
      </div>
      {value && (
        <p className="text-xs text-slate-600">
          Pinned at <span className="font-mono">{value.lat.toFixed(5)}, {value.lng.toFixed(5)}</span>. Officers see the exact spot; the public map shows it only to ~100 m.
        </p>
      )}
      {msg && <p className="text-xs text-red-600">{msg}</p>}
    </div>
  )
}
