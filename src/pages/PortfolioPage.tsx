import { useState, useEffect } from 'react'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { getDailyTimeSeries } from '../lib/alphaVantage'
import {
  computeEfficientFrontier,
  portfolioSharpe,
  type PortfolioPoint,
} from '../lib/markowitz'

interface PortfolioAsset {
  id: string
  symbol: string
  name: string
  type: string
  weight: number
}

export function PortfolioPage() {
  const [assets, setAssets] = useState<PortfolioAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [frontier, setFrontier] = useState<PortfolioPoint[]>([])
  const [portfolioPoint, setPortfolioPoint] = useState<{ return: number; risk: number } | null>(null)
  const [portfolioSharpeRatio, setPortfolioSharpeRatio] = useState<number | null>(null)

  useEffect(() => {
    loadAssets()
  }, [])

  useEffect(() => {
    if (assets.length === 0) {
      setFrontier([])
      setPortfolioPoint(null)
      setPortfolioSharpeRatio(null)
      return
    }
    loadFrontierAndPortfolio()
  }, [assets])

  async function loadAssets() {
    setLoading(true)
    const { data, error } = await supabase
      .from('portfolio_assets')
      .select('*')
      .order('symbol')
    if (error) {
      console.error(error)
      setAssets([])
    } else {
      setAssets(data || [])
    }
    setLoading(false)
  }

  async function loadFrontierAndPortfolio() {
    const seriesList: { symbol: string; closes: number[] }[] = []
    for (const a of assets) {
      try {
        const res = await getDailyTimeSeries(a.symbol)
        if (res?.series?.length) {
          seriesList.push({
            symbol: a.symbol,
            closes: res.series.map((p) => p.close),
          })
        }
      } catch (e) {
        console.error(e)
      }
    }

    if (seriesList.length < 2) {
      setFrontier([])
      setPortfolioPoint(null)
      setPortfolioSharpeRatio(null)
      return
    }

    const minLen = Math.min(...seriesList.map((s) => s.closes.length))
    const returns = seriesList.map((s) => {
      const c = s.closes.slice(-minLen)
      const rets: number[] = []
      for (let i = 1; i < c.length; i++) rets.push((c[i] - c[i - 1]) / c[i - 1])
      return rets
    })

    const frontierPts = computeEfficientFrontier(returns.map((r) => r.map((x) => x * 252)), 40)
    setFrontier(
      frontierPts.map((p) => ({
        ...p,
        return: p.return * 100,
        risk: p.risk * 100,
      }))
    )

    const weights = assets.slice(0, seriesList.length).map((a) => (a.weight || 1) / assets.length)
    const meanRets = returns.map((r) => r.reduce((a, b) => a + b, 0) / r.length)
    const cov: number[][] = []
    for (let i = 0; i < returns.length; i++) {
      cov[i] = []
      for (let j = 0; j < returns.length; j++) {
        const meanI = meanRets[i]
        const meanJ = meanRets[j]
        let s = 0
        for (let t = 0; t < returns[0].length; t++) {
          s += (returns[i][t] - meanI) * (returns[j][t] - meanJ)
        }
        cov[i][j] = s / (returns[0].length - 1)
      }
    }
    const portRet = meanRets.reduce((s, m, j) => s + m * weights[j], 0) * 252
    const portVar = weights.reduce(
      (s, wi, i) =>
        s + weights.reduce((s2, wj, j) => s2 + wi * wj * cov[i][j], 0),
      0
    ) * 252
    setPortfolioPoint({
      return: portRet * 100,
      risk: Math.sqrt(Math.max(0, portVar)) * 100,
    })
    setPortfolioSharpeRatio(portfolioSharpe(weights, meanRets.map((r) => r * 252), cov.map((row) => row.map((v) => v * 252))))
  }

  const chartData = frontier.map((p) => ({ risk: p.risk, return: p.return }))

  return (
    <div className="pl-14 min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h2 className="text-xl font-semibold text-slate-200 mb-6">Portfolio Overview</h2>

        {loading ? (
          <p className="text-slate-400">Loading...</p>
        ) : assets.length === 0 ? (
          <p className="text-slate-400">
            No assets. Add stocks/ETFs from the Search & Add dashboard.
          </p>
        ) : (
          <>
            <div className="mb-6 rounded-xl bg-slate-800/50 border border-slate-700 p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-3">Assets</h3>
              <div className="flex flex-wrap gap-2">
                {assets.map((a) => (
                  <span
                    key={a.id}
                    className="px-3 py-1 rounded-lg bg-slate-700 text-slate-200 text-sm"
                  >
                    {a.symbol} ({a.type})
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="rounded-xl bg-slate-800/80 border border-slate-700 p-4">
                <div className="text-xs text-slate-500">Portfolio Sharpe Ratio</div>
                <div className="text-xl font-semibold text-emerald-400">
                  {portfolioSharpeRatio != null ? portfolioSharpeRatio.toFixed(2) : '—'}
                </div>
              </div>
              <div className="rounded-xl bg-slate-800/80 border border-slate-700 p-4">
                <div className="text-xs text-slate-500">Expected Return (Ann.)</div>
                <div className="text-xl font-semibold text-slate-200">
                  {portfolioPoint ? `${portfolioPoint.return.toFixed(2)}%` : '—'}
                </div>
              </div>
              <div className="rounded-xl bg-slate-800/80 border border-slate-700 p-4">
                <div className="text-xs text-slate-500">Portfolio Risk (Ann.)</div>
                <div className="text-xl font-semibold text-slate-200">
                  {portfolioPoint ? `${portfolioPoint.risk.toFixed(2)}%` : '—'}
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
              <h3 className="text-sm font-medium text-slate-300 mb-4">
                Efficient Frontier & Portfolio
              </h3>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="risk"
                      name="Risk %"
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8' }}
                      unit="%"
                    />
                    <YAxis
                      dataKey="return"
                      name="Return %"
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8' }}
                      unit="%"
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                      formatter={(value: number | undefined) => (value != null ? value.toFixed(2) : '—')}
                    />
                    <Line
                      type="monotone"
                      dataKey="return"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      name="Efficient frontier"
                    />
                    {portfolioPoint && (
                      <ReferenceDot
                        x={portfolioPoint.risk}
                        y={portfolioPoint.return}
                        r={8}
                        fill="#f59e0b"
                        stroke="#fff"
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 mt-2 text-xs text-slate-400">
                <span>🟢 Efficient frontier</span>
                <span>🟡 Your portfolio</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
