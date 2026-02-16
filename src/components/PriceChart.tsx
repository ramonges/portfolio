import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { TimeSeriesPoint } from '../lib/alphaVantage'

interface PriceChartProps {
  data: TimeSeriesPoint[]
  symbol: string
  loading?: boolean
}

export function PriceChart({ data, symbol, loading }: PriceChartProps) {
  if (loading) {
    return (
      <div className="h-80 flex items-center justify-center text-slate-400">
        Loading chart...
      </div>
    )
  }
  if (!data || data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-slate-400">
        No data for {symbol || 'symbol'}. Search and select a symbol.
      </div>
    )
  }

  const chartData = data.map((p) => ({
    date: p.date,
    close: p.close,
    full: p,
  }))

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="date"
            stroke="#94a3b8"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            tickFormatter={(v) => v.slice(0, 10)}
          />
          <YAxis
            stroke="#94a3b8"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
            labelStyle={{ color: '#e2e8f0' }}
            formatter={(value: number | undefined) => [value != null ? value.toFixed(2) : '—', 'Close']}
            labelFormatter={(label) => label}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
