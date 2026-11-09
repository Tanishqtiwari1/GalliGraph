import { RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type RepeatFailure } from '../api'
import { CATEGORY_META, fmtDate, prettySub } from '../ui'
import { Card } from './Shell'

/** Places that were closed as fixed and came back: the repairs worth inspecting before paying for them again. */
export function RepeatFailures({ refreshKey, onSelect }: { refreshKey?: number; onSelect: (id: number) => void }) {
  const [spots, setSpots] = useState<RepeatFailure[] | null>(null)

  useEffect(() => {
    api.repeatFailures().then(setSpots).catch(() => setSpots([]))
  }, [refreshKey])

  return (
    <Card title={`Repairs that did not last${spots?.length ? ` (${spots.length})` : ''}`}>
      {spots !== null && spots.length === 0 && <p className="p-4 text-sm text-slate-600">No repeat failures in the last 12 months.</p>}
      <ul className="divide-y divide-slate-200">
        {spots?.map((s) => (
          <li key={s.latest_issue_id} className="flex flex-wrap items-start gap-3 p-4">
            <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden />
            <div className="min-w-0 flex-1 basis-64">
              <p className="font-bold">
                {CATEGORY_META[s.category].label}, {prettySub(s.sub_type)} · {[s.locality, s.location_detail].filter(Boolean).join(', ') || 'Location unclear'}
              </p>
              <p className="text-sm">
                {s.returned > 0 && <>Came back <b>{s.returned} time{s.returned === 1 ? '' : 's'}</b> after being closed</>}
                {s.returned > 0 && s.disputed > 0 && ' · '}
                {s.disputed > 0 && <>Fix disputed by citizens <b>{s.disputed} time{s.disputed === 1 ? '' : 's'}</b></>}
                {s.median_days_held !== null && <> · Lasted about {s.median_days_held} days</>}
              </p>
              <p className="text-sm text-slate-600">
                {s.department}
                {s.last_repaired_by && <> · Last repaired by {s.last_repaired_by}</>}
              </p>
              <ol className="mt-1 text-sm text-slate-600">
                {s.history.map((h) => (
                  <li key={h.id}>
                    #{h.id}: reported {fmtDate(h.first_reported)}
                    {h.resolved_at && h.status === 'resolved' ? `, closed ${fmtDate(h.resolved_at)}` : `, ${h.status.replace('_', ' ')}`}
                  </li>
                ))}
              </ol>
            </div>
            <button type="button" onClick={() => onSelect(s.latest_issue_id)} className="btn btn-ghost shrink-0">
              {s.still_open ? 'Open current issue' : 'Open latest issue'}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
