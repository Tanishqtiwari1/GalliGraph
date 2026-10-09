import { KeyRound, Loader2, Save, Trash2, UserPlus, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type Meta, type StaffUser, type Tier } from '../api'
import { timeAgo } from '../ui'
import { Modal, useToast } from './Kit'
import { TIER_PILL } from './Shell'

export function StaffView({ meta, me }: { meta: Meta | null; me: string }) {
  const toast = useToast()
  const [users, setUsers] = useState<StaffUser[]>([])
  const [policy, setPolicy] = useState<Record<Tier, number> | null>(null)
  const [defaults, setDefaults] = useState<Record<Tier, number> | null>(null)
  const [form, setForm] = useState({ username: '', display_name: '', role: 'official', department: '', password: '' })
  const [resetFor, setResetFor] = useState<string | null>(null)
  const [newPw, setNewPw] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    api.users().then(setUsers).catch(() => {})
    api.settings().then((s) => {
      setPolicy(s.sla_hours)
      setDefaults(s.defaults)
    }).catch(() => {})
  }
  useEffect(load, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.createUser({ ...form, department: form.role === 'official' && form.department ? form.department : undefined })
      toast(`Account '${form.username}' created`)
      setForm({ username: '', display_name: '', role: 'official', department: '', password: '' })
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-brand-700">Supervisor tools</div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Staff &amp; settings</h1>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card overflow-hidden">
          <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 font-display font-bold">
            <Users className="h-4 w-4 text-brand-700" /> Accounts ({users.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                  <th className="hidden px-3 py-2 font-semibold md:table-cell">Jurisdiction</th>
                  <th className="hidden px-3 py-2 font-semibold sm:table-cell">Last login</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold">{u.display_name}</div>
                      <div className="font-mono text-xs text-slate-500">{u.username}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`pill ${u.role === 'supervisor' ? 'pill-info' : 'pill-zone'}`}>{u.role}</span>
                    </td>
                    <td className="hidden px-3 py-2.5 text-xs text-slate-600 md:table-cell">{u.role === 'supervisor' ? 'City-wide' : u.department ?? 'City-wide'}</td>
                    <td className="hidden px-3 py-2.5 text-xs text-slate-500 sm:table-cell">{u.last_login_at ? timeAgo(u.last_login_at) : 'never'}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button type="button" onClick={() => setResetFor(u.username)} className="rounded p-1.5 text-slate-600 hover:bg-slate-100" title="Reset password" aria-label={`Reset password for ${u.username}`}>
                        <KeyRound className="h-4 w-4" />
                      </button>
                      {u.username !== me && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(`Remove account ${u.username}?`)) return
                            await api.deleteUser(u.username).catch(() => {})
                            toast('Account removed')
                            load()
                          }}
                          className="rounded p-1.5 text-red-600 hover:bg-red-50"
                          title="Remove account"
                          aria-label={`Remove ${u.username}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <form onSubmit={create} className="card space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-display font-bold">
            <UserPlus className="h-4 w-4 text-brand-700" /> Add an officer
          </h2>
          <input required minLength={3} pattern="[a-zA-Z0-9_.\-]+" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Username (e.g. je_roads_z3)" className="field" aria-label="Username" />
          <input required minLength={2} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Display name (e.g. JE Roads · Zone 3)" className="field" aria-label="Display name" />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="field" aria-label="Role">
              <option value="official">Official</option>
              <option value="supervisor">Supervisor</option>
            </select>
            <select disabled={form.role !== 'official'} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="field" aria-label="Department">
              <option value="">City-wide</option>
              {meta?.departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <input required minLength={8} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Initial password (min 8)" className="field" aria-label="Password" />
          <p className="text-xs text-slate-500">Officials with a department see only that department's complaints. Supervisors see the whole city.</p>
          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Create account
          </button>
        </form>
      </div>

      <section className="card p-4">
        <h2 className="mb-1 font-display font-bold">Deadline policy (SLA)</h2>
        <p className="mb-3 text-xs text-slate-500">Hours allowed from first report, by AI priority tier. Changes apply to all open issues immediately.</p>
        {policy && defaults && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(Object.keys(policy) as Tier[]).map((t) => (
              <label key={t} className="block text-sm">
                <span className={`pill ${TIER_PILL[t].cls} mb-1`}>{TIER_PILL[t].label}</span>
                <span className="flex items-center gap-2">
                  <input type="number" min={1} max={2160} value={policy[t]} onChange={(e) => setPolicy({ ...policy, [t]: Number(e.target.value) })} className="field" aria-label={`${t} hours`} />
                  <span className="text-xs text-slate-500">hours</span>
                </span>
                <span className="text-[11px] text-slate-400">default {defaults[t]} h</span>
              </label>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={async () => {
            if (!policy) return
            try {
              const r = await api.saveSettings(policy)
              toast(`Policy saved and applied to ${r.reapplied_to} open issues`)
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Failed', 'error')
            }
          }}
          className="btn btn-navy mt-3"
        >
          <Save className="h-4 w-4" /> Save policy
        </button>
      </section>

      {resetFor && (
        <Modal title={`Reset password · ${resetFor}`} onClose={() => setResetFor(null)}>
          <input type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password (min 8)" className="field" aria-label="New password" />
          <button
            type="button"
            disabled={newPw.length < 8}
            onClick={async () => {
              try {
                await api.resetPassword(resetFor, newPw)
                toast('Password updated')
                setResetFor(null)
                setNewPw('')
              } catch (e) {
                toast(e instanceof Error ? e.message : 'Failed', 'error')
              }
            }}
            className="btn btn-primary mt-3 w-full"
          >
            Set new password
          </button>
        </Modal>
      )}
    </div>
  )
}
