import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from 'react-leaflet'
import type { Alert, Issue } from '../api'
import { CATEGORY_META, priorityTone } from '../ui'

const JAIPUR: [number, number] = [26.885, 75.795]

interface Props {
  issues: Issue[]
  alerts: Alert[]
  selectedId: number | null
  onSelect: (id: number) => void
}

export function IssueMap({ issues, alerts, selectedId, onSelect }: Props) {
  const located = issues.filter((i) => i.lat !== null && i.lng !== null)
  return (
    <MapContainer center={JAIPUR} zoom={12} scrollWheelZoom={false} className="h-full min-h-[420px] w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {alerts.map((a) => (
        <CircleMarker
          key={`alert-${a.locality_id}-${a.category}`}
          center={[a.lat, a.lng]}
          radius={46}
          pathOptions={{ color: '#dc2626', weight: 2, dashArray: '6 6', fillColor: '#dc2626', fillOpacity: 0.08 }}
        >
          <Tooltip direction="top">⚠️ {a.message}</Tooltip>
        </CircleMarker>
      ))}
      {[...located]
        .sort((a, b) => a.priority_score - b.priority_score)
        .map((i) => {
          const tone = priorityTone(i.priority_score)
          const selected = i.id === selectedId
          // Locality-level points share a centroid; nudge them apart deterministically so they stay clickable.
          const offset = i.geo_precision === 'locality' ? ((i.id * 137) % 360) * (Math.PI / 180) : 0
          const r = i.geo_precision === 'locality' ? 0.004 + ((i.id * 7) % 5) * 0.0012 : 0
          return (
            <CircleMarker
              key={i.id}
              center={[i.lat! + r * Math.sin(offset), i.lng! + r * Math.cos(offset)]}
              radius={5 + Math.min(14, Math.sqrt(i.report_count) * 3)}
              eventHandlers={{ click: () => onSelect(i.id) }}
              pathOptions={{
                color: selected ? '#0f172a' : CATEGORY_META[i.category].color,
                weight: selected ? 3 : 1.5,
                fillColor: tone.color,
                fillOpacity: 0.75,
              }}
            >
              <Popup>
                <div className="space-y-1 text-sm">
                  <div className="font-semibold">{i.summary}</div>
                  <div className="text-slate-600">
                    Score <b>{i.priority_score}</b> · {i.report_count} report{i.report_count > 1 ? 's' : ''} · {i.department}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
    </MapContainer>
  )
}
