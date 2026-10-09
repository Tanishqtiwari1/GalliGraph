import L from 'leaflet'
import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

type HeatPoint = [number, number, number]

/** leaflet.heat is a classic plugin that attaches to a global `L`, so it is loaded after exposing Leaflet. */
export function HeatLayer({ points }: { points: HeatPoint[] }) {
  const map = useMap()
  useEffect(() => {
    let layer: L.Layer | null = null
    let cancelled = false
    ;(window as unknown as { L: typeof L }).L = L
    import('leaflet.heat').then(() => {
      if (cancelled) return
      const heat = (L as unknown as { heatLayer: (p: HeatPoint[], o: object) => L.Layer }).heatLayer
      layer = heat(points, {
        radius: 28,
        blur: 22,
        maxZoom: 15,
        minOpacity: 0.35,
        gradient: { 0.3: '#22c55e', 0.55: '#eab308', 0.75: '#f97316', 1: '#dc2626' },
      })
      layer.addTo(map)
    })
    return () => {
      cancelled = true
      if (layer) map.removeLayer(layer)
    }
  }, [map, points])
  return null
}
