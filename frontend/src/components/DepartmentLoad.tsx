import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Stats } from '../api'

export function DepartmentLoad({ stats }: { stats: Stats | null }) {
  const data = (stats?.by_department ?? []).map((d) => ({
    name: d.department.split(' (')[0],
    department: d.department,
    within: d.open_issues - (d.overdue ?? 0),
    overdue: d.overdue ?? 0,
  }))
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12, fill: '#475569' }} />
          <Tooltip labelFormatter={(_, p) => p?.[0]?.payload?.department ?? ''} />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="within" name="Within deadline" stackId="a" fill="#0d9488" barSize={14} />
          <Bar dataKey="overdue" name="Past deadline" stackId="a" fill="#dc2626" radius={[0, 4, 4, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
