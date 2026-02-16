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
  maxSharpeWeights,
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
  const [frontierLoading, setFrontierLoading] = useState(false)
  const [frontier, setFrontier] = useState<PortfolioPoint[]>([])
  const [portfolioPoint, setPortfolioPoint] = useState<{ return: number; risk: number } | null>(null)
  const [portfolioSharpeRatio, setPortfolioSharpeRatio] = useState<number | null>(null)
  const [optimalPoint, setOptimalPoint] = useState<{ return: number; risk: number } | null>(null)
  const [frontierProximity, setFrontierProximity] = useState<number | null>(null)

  useEffect(() => {
    loadAssets()
  }, [])

  useEffect(() => {
    if (assets.length === 0) {
      setFrontier([])
      setPortfolioPoint(null)
      setPortfolioSharpeRatio(null)
      setOptimalPoint(null)
      return
    }
    loadFrontierAndPortfolio()
  }, [assets])

  async function removeAsset(id: string) {
    const { error } = await supabase.from('portfolio_assets').delete().eq('id', id)
    if (error) {
      console.error(error)
      return
    }
    setAssets((prev) => prev.filter((a) => a.id !== id))
  }

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
    setFrontierLoading(true)
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

    if (seriesList.length === 0) {
      setFrontier([])
      setPortfolioPoint(null)
      setPortfolioSharpeRatio(null)
      setOptimalPoint(null)
      setFrontierLoading(false)
      return
    }
    const minLen = Math.min(...seriesList.map((s) => s.closes.length))
    const returns = seriesList.map((s) => {
      const c = s.closes.slice(-minLen)
      const rets: number[] = []
      for (let i = 1; i < c.length; i++) rets.push((c[i] - c[i - 1]) / c[i - 1])
      return rets
    })

    const meanRetsAnn = returns.map((r) => (r.reduce((a, b) => a + b, 0) / r.length) * 252)
    const covDaily = buildCovMatrix(returns)
    const covAnn = covDaily.map((row) => row.map((v) => v * 252))

    const weights = assets.slice(0, seriesList.length).map((a) => (a.weight ?? 1) / seriesList.length)
    const sumW = weights.reduce((a, b) => a + b, 0)
    const normWeights = sumW > 0 ? weights.map((w) => w / sumW) : weights

    const portRet = meanRetsAnn.reduce((s, m, j) => s + m * normWeights[j], 0)
    const portVar = normWeights.reduce(
      (s, wi, i) =>
        s + normWeights.reduce((s2, wj, j) => s2 + wi * wj * covAnn[i][j], 0),
      0
    )
    setPortfolioPoint({
      return: portRet * 100,
      risk: Math.sqrt(Math.max(0, portVar)) * 100,
    })
    setPortfolioSharpeRatio(
      portfolioSharpe(normWeights, meanRetsAnn, covAnn)
    )

    if (seriesList.length === 1) {
      setFrontier([{ return: portRet * 100, risk: Math.sqrt(Math.max(0, portVar)) * 100 }])
      setOptimalPoint(null)
      setFrontierProximity(100)
    } else {
      const frontierPts = computeEfficientFrontier(returns, 50)
      const annRet = 252
      const annRisk = Math.sqrt(252)
      setFrontier(
        frontierPts.map((p) => ({
          ...p,
          return: p.return * annRet * 100,
          risk: p.risk * annRisk * 100,
        }))
      )
      const optW = maxSharpeWeights(meanRetsAnn, covAnn)
      if (optW) {
        const optRet = meanRetsAnn.reduce((s, m, j) => s + m * optW[j], 0)
        const optVar = optW.reduce(
          (s, wi, i) => s + optW.reduce((s2, wj, j) => s2 + wi * wj * covAnn[i][j], 0),
          0
        )
        setOptimalPoint({
          return: optRet * 100,
          risk: Math.sqrt(Math.max(0, optVar)) * 100,
        })
        const optSharpe = portfolioSharpe(optW, meanRetsAnn, covAnn)
        const userSharpe = portfolioSharpe(normWeights, meanRetsAnn, covAnn)
        setFrontierProximity(
          optSharpe > 0 ? Math.min(100, Math.round((userSharpe / optSharpe) * 100)) : null
        )
      } else {
        setOptimalPoint(null)
        setFrontierProximity(null)
      }
    }
    setFrontierLoading(false)
  }

  function buildCovMatrix(returns: number[][]): number[][] {
    const n = returns.length
    const T = returns[0]?.length ?? 0
    const cov: number[][] = []
    for (let i = 0; i < n; i++) {
      cov[i] = []
      for (let j = 0; j < n; j++) {
        const meanI = returns[i].reduce((a, b) => a + b, 0) / T
        const meanJ = returns[j].reduce((a, b) => a + b, 0) / T
        let s = 0
        for (let t = 0; t < T; t++) {
          s += (returns[i][t] - meanI) * (returns[j][t] - meanJ)
        }
        cov[i][j] = T > 1 ? s / (T - 1) : 0
      }
    }
    return cov
  }

  const chartData = frontier.map((p) => ({ risk: p.risk, return: p.return }))

  return (
    <div className="pl-14 min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h2 className="text-xl font-semibold text-white mb-6">Portfolio Overview</h2>

        {loading ? (
          <p className="text-neutral-500">Loading...</p>
        ) : assets.length === 0 ? (
          <p className="text-neutral-500">
            No assets. Add stocks/ETFs from the Search & Add dashboard.
          </p>
        ) : (
          <>
            <div className="mb-6 rounded-lg bg-neutral-900/50 border border-neutral-800 p-4">
              <h3 className="text-sm font-medium text-neutral-300 mb-3">Assets</h3>
              <div className="flex flex-wrap gap-2">
                {assets.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 text-white text-sm"
                  >
                    {a.symbol} ({a.type})
                    <button
                      onClick={() => removeAsset(a.id)}
                      className="text-neutral-400 hover:text-white text-xs"
                      aria-label={`Remove ${a.symbol}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-4">
                <div className="text-xs text-neutral-500">Portfolio Sharpe Ratio</div>
                <div className="text-xl font-semibold text-white">
                  {portfolioSharpeRatio != null ? portfolioSharpeRatio.toFixed(2) : '—'}
                </div>
              </div>
              <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-4">
                <div className="text-xs text-neutral-500">Expected Return (Ann.)</div>
                <div className="text-xl font-semibold text-white">
                  {portfolioPoint ? `${portfolioPoint.return.toFixed(2)}%` : '—'}
                </div>
              </div>
              <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-4">
                <div className="text-xs text-neutral-500">Portfolio Risk (Ann.)</div>
                <div className="text-xl font-semibold text-white">
                  {portfolioPoint ? `${portfolioPoint.risk.toFixed(2)}%` : '—'}
                </div>
              </div>
              <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-4">
                <div className="text-xs text-neutral-500">Proximité frontière</div>
                <div className="text-xl font-semibold text-white">
                  {frontierProximity != null ? `${frontierProximity}%` : '—'}
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  (Sharpe vs optimal)
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-neutral-900/50 border border-neutral-800 p-6">
              <h3 className="text-sm font-medium text-neutral-300 mb-4">
                Efficient Frontier & Portfolio
              </h3>
              {frontierLoading ? (
                <div className="h-96 flex items-center justify-center text-neutral-500">
                  Computing efficient frontier...
                </div>
              ) : (
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#404040" />
                    <XAxis
                      dataKey="risk"
                      name="Risk %"
                      stroke="#737373"
                      tick={{ fill: '#737373' }}
                      unit="%"
                    />
                    <YAxis
                      dataKey="return"
                      name="Return %"
                      stroke="#737373"
                      tick={{ fill: '#737373' }}
                      unit="%"
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#171717', border: '1px solid #404040' }}
                      formatter={(value: number | undefined) => (value != null ? value.toFixed(2) : '—')}
                    />
                    <Line
                      type="monotone"
                      dataKey="return"
                      stroke="#fafafa"
                      strokeWidth={2}
                      dot={false}
                      name="Efficient frontier"
                    />
                    {portfolioPoint && (
                      <ReferenceDot
                        x={portfolioPoint.risk}
                        y={portfolioPoint.return}
                        r={10}
                        fill="#fff"
                        stroke="#000"
                        strokeWidth={2}
                        label={{ value: 'You', position: 'top' }}
                      />
                    )}
                    {optimalPoint && (
                      <ReferenceDot
                        x={optimalPoint.risk}
                        y={optimalPoint.return}
                        r={8}
                        fill="#888"
                        stroke="#fff"
                        strokeWidth={1}
                        label={{ value: 'Optimal', position: 'top' }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              )}
              <div className="flex flex-wrap gap-4 mt-2 text-xs text-neutral-500">
                <span>— Efficient frontier</span>
                <span>● Your portfolio</span>
                {optimalPoint && <span>○ Max Sharpe (optimal)</span>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
