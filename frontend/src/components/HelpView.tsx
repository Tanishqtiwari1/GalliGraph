import { ChevronDown, Eye, Languages, Lock, Phone, Settings, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Category, Meta } from '../api'
import { CATEGORY_HI, useLang } from '../i18n'
import { CATEGORY_META } from '../ui'
import { useToast } from './Kit'
import { CATEGORY_ICON } from './Shell'

const EXAMPLES: Partial<Record<Category, string>> = {
  road_damage: 'Potholes, broken or caved-in roads, damaged footpaths',
  water_supply: 'No water, low pressure, leaking pipelines, dirty tap water',
  drainage: 'Blocked drains, sewage overflow, waterlogging, open manholes',
  garbage: 'Garbage dumps, missed collection, overflowing bins, dead animals, public urination spots',
  streetlight: 'Lights not working or flickering, damaged poles, exposed wires on light poles',
  traffic: 'Jams, illegal parking, faulty signals, repeated rule violations at a spot',
  stray_animals: 'Aggressive stray dogs, stray cattle or pigs',
  electricity: 'Power cuts, voltage problems, damaged transformers or electric poles',
}

const FAQ = [
  ['Do I need an account?', 'No. You get a private tracking code (like JA-7KQ2-9XPM). This device also remembers your complaints under "My complaints".'],
  ['Who sees what I write?', 'Only municipal officials see your words, photo and exact pin. The public map shows just the type of problem and the area (to about 100 m). Officer names and internal notes are never shown publicly.'],
  ['What if someone already reported it?', 'GalliGraph merges repeat reports into one issue automatically. Your report still counts and raises the priority. You can also tap "+1" on an existing issue.'],
  ['How is priority decided?', 'AI suggests a priority from danger to people, how many are affected (schools, hospitals nearby), how long it has existed and how many people reported it. An officer reviews it. You can see the reasons on your receipt.'],
  ['How long will it take?', 'Every issue gets a target date based on its priority. If it is missed, the issue is escalated to a senior officer automatically.'],
  ['What if it is marked fixed but it is not?', 'Open your complaint and choose "No, still a problem". A supervisor reviews it. Closures are never decided by AI alone.'],
  ['Can I report by voice?', 'Yes. Tap "Speak instead" on the report page (works in Chrome, Edge and Safari) in Hindi or English.'],
]

export function HelpView({ meta }: { meta: Meta | null }) {
  const { lang, setLang } = useLang()
  const toast = useToast()
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Help &amp; settings</h1>
        <p className="text-sm text-slate-600">Simple answers, category guide and your privacy controls.</p>
      </div>

      <section className="card divide-y divide-slate-100">
        <h2 className="px-4 py-3 font-display font-bold">Frequently asked questions</h2>
        {FAQ.map(([q, a], i) => (
          <div key={q}>
            <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold hover:bg-slate-50">
              {q}
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} />
            </button>
            {open === i && <p className="animate-rise px-4 pb-4 text-sm text-slate-600">{a}</p>}
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-2 font-display font-bold">Which category should I pick?</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(EXAMPLES) as Category[]).map((c) => {
            const Icon = CATEGORY_ICON[c]
            const dept = meta?.categories.find((x) => x.key === c)?.department
            return (
              <div key={c} className="card flex gap-3 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-brand-700">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {CATEGORY_META[c].label} <span className="font-normal text-slate-500">· {CATEGORY_HI[c]}</span>
                  </div>
                  <p className="text-xs text-slate-600">{EXAMPLES[c]}</p>
                  {dept && <p className="mt-0.5 text-[11px] font-semibold text-brand-700">Goes to: {dept}</p>}
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">Not sure? Skip the category. AI suggests one and an officer checks it.</p>
      </section>

      <section className="card space-y-4 p-4">
        <h2 className="flex items-center gap-2 font-display font-bold">
          <Settings className="h-5 w-5 text-brand-700" /> Settings &amp; privacy
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm">
            <Languages className="h-4 w-4" /> Language / भाषा
          </span>
          <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-300">
            {(['en', 'hi'] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className={`px-3 py-1.5 text-sm font-semibold ${lang === l ? 'bg-navy-900 text-white' : 'bg-white'}`}>
                {l === 'en' ? 'English' : 'हिंदी'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm">
            <Trash2 className="h-4 w-4" /> Forget my complaints on this device
          </span>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem('gg_my_codes')
                localStorage.removeItem('gg_confirmed')
                localStorage.removeItem('gg_seen_at')
              } catch {
                /* ignore */
              }
              toast('Removed from this device. Your complaints still exist with the city.')
            }}
            className="btn btn-ghost"
          >
            Clear
          </button>
        </div>
        <ul className="space-y-1.5 text-xs text-slate-600">
          <li className="flex gap-2">
            <Lock className="h-3.5 w-3.5 shrink-0" /> No account, no phone number required. Your tracking code is the key.
          </li>
          <li className="flex gap-2">
            <Eye className="h-3.5 w-3.5 shrink-0" /> Public map: category, area (~100 m) and status only. Never your words, photo or home location.
          </li>
          <li className="flex gap-2">
            <Phone className="h-3.5 w-3.5 shrink-0" /> Emergencies (live wires, fire, collapse): call 112 first.
          </li>
        </ul>
      </section>
    </div>
  )
}
