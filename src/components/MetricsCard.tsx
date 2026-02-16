import type { AssetMetrics } from '../lib/metrics'

interface MetricsCardProps {
  metrics: AssetMetrics
  symbol: string
}

export function MetricsCard({ metrics, symbol }: MetricsCardProps) {
  const years = Object.keys(metrics.yearlyReturns).sort()
  const latestYear = years[years.length - 1]
  const latestReturn = latestYear ? metrics.yearlyReturns[latestYear] : null

  return (
    <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-4">
      <h3 className="text-sm font-semibold text-neutral-300 mb-3">Metrics — {symbol}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <div className="text-xs text-neutral-500">YoY Return ({latestYear || '—'})</div>
          <div className="text-lg font-semibold text-white">
            {latestReturn != null
              ? `${(latestReturn * 100).toFixed(2)}%`
              : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Volatility (Ann.)</div>
          <div className="text-lg font-semibold text-white">
            {(metrics.volatility * 100).toFixed(2)}%
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Max Drawdown</div>
          <div className="text-lg font-semibold text-neutral-400">
            {(metrics.maxDrawdown * 100).toFixed(2)}%
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">Sharpe Ratio</div>
          <div className="text-lg font-semibold text-white">
            {metrics.sharpeRatio.toFixed(2)}
          </div>
        </div>
      </div>
      {years.length > 1 && (
        <div className="mt-3 pt-3 border-t border-neutral-800">
          <div className="text-xs text-neutral-500 mb-1">Yearly Returns</div>
          <div className="flex flex-wrap gap-2">
            {years.slice(-5).map((y) => (
              <span key={y} className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-300">
                {y}: {(metrics.yearlyReturns[y] * 100).toFixed(1)}%
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
