import { AudioLines, Crosshair, Loader2, Mic, MicOff, Square, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { api } from '../api'
import { useLang } from '../i18n'

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

/** Moves keyboard focus into a dialog, keeps Tab inside it, closes on Escape and hands focus back afterwards. */
function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const focusable = () =>
      [...(ref.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? [])].filter(
        (el) => el.offsetParent !== null && !el.dataset.backdrop,
      )
    focusable()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close.current()
      if (e.key !== 'Tab') return
      const els = focusable()
      if (!els.length) return
      const [first, last] = [els[0], els[els.length - 1]]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [])
  return ref
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useDialog(onClose)
  return (
    <div ref={ref} className="fixed inset-0 z-[1200] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" tabIndex={-1} data-backdrop="1" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-navy-900/45 backdrop-blur-sm" />
      <div className={`animate-rise relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function SlideOver({ onClose, children, label }: { onClose: () => void; children: React.ReactNode; label: string }) {
  const ref = useDialog(onClose)
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])
  return (
    <div ref={ref} className="fixed inset-0 z-[1100] flex justify-end" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" tabIndex={-1} data-backdrop="1" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-navy-900/40 backdrop-blur-[2px]" />
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
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 6000)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[1300] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
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
  const { l } = useLang()
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
      setError(e.error === 'not-allowed' ? l('Microphone permission was denied.', 'माइक्रोफ़ोन की अनुमति नहीं मिली।') : l('Voice input stopped. Try again.', 'आवाज़ लेना रुक गया। फिर कोशिश करें।'))
      setListening(false)
    }
    setError(null)
    rec.current = r
    r.start()
    setListening(true)
  }

  if (!Ctor) return <span className="text-xs text-slate-500">{l('Voice input works in Chrome, Edge and Safari.', 'बोलकर लिखना Chrome, Edge और Safari में चलता है।')}</span>
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
        {listening ? l('Stop listening', 'सुनना बंद करें') : l('Speak instead', 'बोलकर लिखें')}
      </button>
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
    </span>
  )
}

/* ------------------------------------------------------------------ recorded voice note (server Whisper) */

const MAX_VOICE_SECONDS = 90
let voiceEnabled: Promise<boolean> | null = null
function voiceNotesEnabled() {
  voiceEnabled ??= api
    .health()
    .then((h) => !!h.voice_notes && h.voice_notes !== 'none')
    .catch(() => false)
  return voiceEnabled
}

function pickMime() {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return options.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? ''
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** Record a voice note in any language; the server transcribes it (Hindi gets an English translation too).
 *  Works in every modern browser, unlike live dictation. The audio itself is not stored. */
export function VoiceNoteButton({ onText, hindi }: { onText: (t: string) => void; hindi: boolean }) {
  const [enabled, setEnabled] = useState(false)
  const [state, setState] = useState<'idle' | 'recording' | 'working'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [heard, setHeard] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    voiceNotesEnabled().then(setEnabled)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
      rec.current?.stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  if (!enabled || typeof MediaRecorder === 'undefined') return null

  async function start() {
    setError(null)
    setHeard(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError(hindi ? 'माइक्रोफ़ोन की अनुमति नहीं मिली।' : 'Microphone permission was denied.')
      return
    }
    const mime = pickMime()
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const chunks: Blob[] = []
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    r.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      if (timer.current) window.clearInterval(timer.current)
      const type = (r.mimeType || mime || 'audio/webm').split(';')[0]
      const blob = new Blob(chunks, { type })
      if (blob.size < 2000) {
        setState('idle')
        setError(hindi ? 'रिकॉर्डिंग बहुत छोटी थी।' : 'That recording was too short.')
        return
      }
      setState('working')
      try {
        const t = await api.transcribe(await blobToBase64(blob), type)
        setHeard(t.text)
        onText(t.for_ai)
      } catch (e) {
        setError(e instanceof Error ? e.message : hindi ? 'वॉइस नोट समझ नहीं पाए।' : 'Could not transcribe the voice note.')
      } finally {
        setState('idle')
      }
    }
    rec.current = r
    r.start()
    setSeconds(0)
    setState('recording')
    timer.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_VOICE_SECONDS && r.state === 'recording') r.stop()
        return s + 1
      })
    }, 1000)
  }

  const label =
    state === 'recording'
      ? `${hindi ? 'रोकें' : 'Stop'} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
      : state === 'working'
        ? hindi ? 'समझ रहे हैं…' : 'Transcribing…'
        : hindi ? 'वॉइस नोट रिकॉर्ड करें' : 'Record voice note'
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={state === 'working'}
        onClick={() => (state === 'recording' ? rec.current?.stop() : start())}
        aria-pressed={state === 'recording'}
        className={`btn ${state === 'recording' ? 'btn-danger' : 'btn-primary'} relative`}
      >
        {state === 'recording' && <span className="absolute -left-1 -top-1 h-3 w-3 animate-ping rounded-full bg-red-500" />}
        {state === 'recording' ? <Square className="h-4 w-4" /> : state === 'working' ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}
        {label}
      </button>
      {heard && <span className="mt-1 max-w-xs text-xs text-emerald-700">✓ {hindi ? 'सुना' : 'Heard'}: “{heard}”</span>}
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
  const { l } = useLang()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [center, setCenter] = useState<[number, number] | null>(null)

  function useGps() {
    if (!navigator.geolocation) return setMsg(l('Location is not available in this browser.', 'इस ब्राउज़र में लोकेशन उपलब्ध नहीं है।'))
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
        setMsg(l('Could not read your location. Tap the map instead.', 'आपकी लोकेशन नहीं मिली। नक्शे पर टैप करें।'))
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={useGps} className="btn btn-ghost" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} {l('Use my current location', 'मेरी मौजूदा लोकेशन लें')}
        </button>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="min-h-11 px-2 text-sm font-bold text-slate-700 underline">
            {l('Remove pin', 'पिन हटाएँ')}
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
            {l('Tap the map on the exact spot', 'नक्शे पर सही जगह टैप करें')}
          </div>
        )}
      </div>
      {value && (
        <p className="text-xs text-slate-600">
          {l('Pin added. Officers see the exact spot. The public map shows it only to about 100 m.', 'पिन लग गया। अधिकारी सही जगह देखेंगे। सार्वजनिक नक्शे पर लगभग 100 मीटर तक ही दिखेगा।')}
        </p>
      )}
      {msg && <p className="text-xs text-red-600">{msg}</p>}
    </div>
  )
}
