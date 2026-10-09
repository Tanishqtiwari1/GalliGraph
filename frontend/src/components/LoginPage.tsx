import { KeyRound, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { api, type User } from '../api'
import { BRAND, CITY, Logo } from './Shell'

export function LoginPage({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onLogin(await api.login(username, password))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'rgb(15 23 42 / 0.92)' }}>
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-display text-xl font-extrabold text-brand-700">{BRAND}</span>
              <span className="rounded-md bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">AI Gov</span>
            </div>
            <div className="text-xs text-slate-500">Officer console · {CITY} Municipal Corporation</div>
          </div>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-slate-700">Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required className="field" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-slate-700">Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="field" />
        </label>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="-mt-1 text-right">
          <button type="button" onClick={() => setShowHelp((v) => !v)} className="text-xs font-semibold text-brand-700 hover:underline" aria-expanded={showHelp}>
            Forgot password?
          </button>
        </div>
        {showHelp && (
          <div className="space-y-1.5 rounded-lg bg-surface-low p-3 text-xs text-slate-700">
            <p className="flex items-center gap-1.5 font-semibold text-navy-900">
              <KeyRound className="h-3.5 w-3.5" /> Resetting a password
            </p>
            <p>Officer accounts are managed by your municipal IT administrator. For security, passwords cannot be reset by email or SMS.</p>
            <p>
              <b>Officers:</b> ask your supervisor or the IT cell to reset it.
            </p>
            <p>
              <b>Administrators:</b> on the server, run <code className="rounded bg-white px-1">scripts/reset_password.py &lt;username&gt;</code>.
            </p>
          </div>
        )}
        <button type="submit" disabled={busy} className="btn btn-primary h-11 w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
          Log in
        </button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5" /> Authorised municipal staff only. All actions are logged.
        </p>
        <a href="/" className="block text-center text-xs font-semibold text-brand-700 hover:underline">
          ← Back to the citizen portal
        </a>
      </form>
    </div>
  )
}
