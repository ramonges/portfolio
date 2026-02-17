import { useState, useEffect } from 'react'
import {
  ComposedChart,
  Line,
  Scatter,
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
  maxSharpeWeightsLongOnly,
  portfolioSharpe,
  type PortfolioPoint,
} from '../lib/markowitz'

/** Max symbols pour la frontière (500×500 covariance = lent). Prend les symboles avec le plus de données. */
const MAX_FRONTIER_SYMBOLS = 120

/** Écart-type annualisé : σ_ann = √252 × σ_daily (252 jours de bourse) */
const ANNUALIZE_STD = Math.sqrt(252)

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
  const [sp500DataReady, setSp500DataReady] = useState(false)
  const [stockPoints, setStockPoints] = useState<{ symbol: string; risk: number; return: number }[]>([])
  const [sp500Error, setSp500Error] = useState<string | null>(null)

  useEffect(() => {
    loadAssets()
  }, [])

  useEffect(() => {
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

  async function loadSp500FromSupabase(): Promise<Map<string, number[]>> {
    setSp500Error(null)
    const pageSize = 1000
    let rows: { symbol: string; date: string; close: number }[] = []
    let offset = 0
    while (true) {
      const { data, error } = await supabase
        .from('sp500_daily')
        .select('symbol, date, close')
        .order('date', { ascending: true })
        .range(offset, offset + pageSize - 1)
      if (error) {
        const msg = `${error.message} (${error.code || 'code'})`
        console.error('sp500_daily:', error)
        setSp500Error(msg)
        return new Map()
      }
      const chunk = (data || []) as { symbol: string; date: string; close: number }[]
      rows = rows.concat(chunk)
      if (chunk.length < pageSize) break
      offset += pageSize
    }
    if (rows.length === 0) {
      setSp500Error('Requête vide (0 lignes). Vérifiez la politique RLS sur sp500_daily.')
      return new Map()
    }
    const bySymbol = new Map<string, { date: string; close: number }[]>()
    for (const row of rows) {
      const sym = String(row.symbol)
      if (!sym) continue
      if (!bySymbol.has(sym)) bySymbol.set(sym, [])
      bySymbol.get(sym)!.push({
        date: row.date,
        close: Number(row.close),
      })
    }
    const result = new Map<string, number[]>()
    for (const [sym, symbolRows] of bySymbol) {
      const closes = symbolRows.sort((a, b) => a.date.localeCompare(b.date)).map((r) => r.close)
      if (closes.length >= 60) result.set(sym, closes)
    }
    if (result.size === 0) {
      const maxDays = Math.max(...Array.from(bySymbol.values()).map((r) => r.length), 0)
      setSp500Error(`Aucun symbole avec ≥60 jours. Max par symbole: ${maxDays} jours.`)
    }
    return result
  }

  async function loadFrontierAndPortfolio() {
    setFrontierLoading(true)
    setSp500DataReady(false)

    const sp500Map = await loadSp500FromSupabase()
    if (sp500Map.size === 0) {
      if (!sp500Error) setSp500Error('Aucun symbole avec ≥60 jours de données.')
      setFrontier([])
      setStockPoints([])
      setPortfolioPoint(null)
      setPortfolioSharpeRatio(null)
      setOptimalPoint(null)
      setFrontierProximity(null)
      setFrontierLoading(false)
      return
    }
    setSp500DataReady(true)

    const symbols = Array.from(sp500Map.keys())
    const allCloses = symbols.map((s) => sp500Map.get(s)!)
    const minLen = Math.min(...allCloses.map((c) => c.length))
    const commonCloses = allCloses.map((c) => c.slice(-minLen))

    const byLen = symbols
      .map((s, i) => ({ sym: s, len: commonCloses[i].length }))
      .sort((a, b) => b.len - a.len)
    const selectedSymbols = byLen.slice(0, MAX_FRONTIER_SYMBOLS).map((x) => x.sym)
    const selectedIdx = selectedSymbols.map((s) => symbols.indexOf(s))
    const frontierCloses = selectedIdx.map((i) => commonCloses[i])

    const frontierReturns = frontierCloses.map((c) => {
      const rets: number[] = []
      for (let i = 1; i < c.length; i++) rets.push((c[i] - c[i - 1]) / c[i - 1])
      return rets
    })

    const meanRetsDaily = frontierReturns.map(
      (r) => r.reduce((a, b) => a + b, 0) / r.length
    )
    const meanRetsAnn = meanRetsDaily.map((m) => m * 252)
    const covDaily = buildCovMatrix(frontierReturns)
    const covAnn = covDaily.map((row) => row.map((v) => v * 252))

    const allReturns = commonCloses.map((c) => {
      const rets: number[] = []
      for (let i = 1; i < c.length; i++) rets.push((c[i] - c[i - 1]) / c[i - 1])
      return rets
    })
    const points = symbols.map((sym, i) => {
      const r = allReturns[i]
      const T = r.length
      const mean = r.reduce((a, b) => a + b, 0) / T
      const variance = T > 1 ? r.reduce((s, x) => s + (x - mean) ** 2, 0) / (T - 1) : 0
      return {
        symbol: sym,
        risk: Math.sqrt(Math.max(0, variance)) * ANNUALIZE_STD * 100,
        return: mean * 252 * 100,
      }
    })
    setStockPoints(points)

    const frontierPts = computeEfficientFrontier(frontierReturns, 50)
    setFrontier(
      frontierPts.map((p) => ({
        ...p,
        return: p.return * 252 * 100,
        risk: p.risk * ANNUALIZE_STD * 100,
      }))
    )

    const optW = maxSharpeWeightsLongOnly(meanRetsAnn, covAnn)
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
    } else {
      setOptimalPoint(null)
    }

    if (assets.length === 0) {
      setPortfolioPoint(null)
      setPortfolioSharpeRatio(null)
      setFrontierProximity(null)
    } else {
      const userSeriesList: { symbol: string; closes: number[] }[] = []
      for (const a of assets) {
        const fromSp500 = sp500Map.get(a.symbol)
        if (fromSp500?.length) {
          userSeriesList.push({ symbol: a.symbol, closes: fromSp500 })
        } else {
          try {
            const res = await getDailyTimeSeries(a.symbol)
            if (res?.series?.length) {
              userSeriesList.push({
                symbol: a.symbol,
                closes: res.series.map((p) => p.close),
              })
            }
          } catch (e) {
            console.error(e)
          }
        }
      }

      if (userSeriesList.length === 0) {
        setPortfolioPoint(null)
        setPortfolioSharpeRatio(null)
        setFrontierProximity(null)
      } else {
        const userMinLen = Math.min(...userSeriesList.map((s) => s.closes.length))
        const userReturns = userSeriesList.map((s) => {
          const c = s.closes.slice(-userMinLen)
          const rets: number[] = []
          for (let i = 1; i < c.length; i++) rets.push((c[i] - c[i - 1]) / c[i - 1])
          return rets
        })

        const userMeanAnn = userReturns.map(
          (r) => (r.reduce((a, b) => a + b, 0) / r.length) * 252
        )
        const userCovDaily = buildCovMatrix(userReturns)
        const userCovAnn = userCovDaily.map((row) => row.map((v) => v * 252))

        const weights = assets
          .slice(0, userSeriesList.length)
          .map((a) => (a.weight ?? 1) / userSeriesList.length)
        const sumW = weights.reduce((a, b) => a + b, 0)
        const normWeights = sumW > 0 ? weights.map((w) => w / sumW) : weights

        const portRet = userMeanAnn.reduce((s, m, j) => s + m * normWeights[j], 0)
        const portVar = normWeights.reduce(
          (s, wi, i) =>
            s + normWeights.reduce((s2, wj, j) => s2 + wi * wj * userCovAnn[i][j], 0),
          0
        )
        setPortfolioPoint({
          return: portRet * 100,
          risk: Math.sqrt(Math.max(0, portVar)) * 100,
        })
        setPortfolioSharpeRatio(portfolioSharpe(normWeights, userMeanAnn, userCovAnn))

        if (optW) {
          const optSharpe = portfolioSharpe(optW, meanRetsAnn, covAnn)
          const userSharpe = portfolioSharpe(normWeights, userMeanAnn, userCovAnn)
          setFrontierProximity(
            optSharpe > 0 ? Math.min(100, Math.round((userSharpe / optSharpe) * 100)) : null
          )
        } else {
          setFrontierProximity(null)
        }
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
        ) : !sp500DataReady && !frontierLoading ? (
          <div className="text-neutral-500 space-y-2">
            <p>Pas de données S&P 500.</p>
            {sp500Error && (
              <p className="text-amber-400/90 text-sm">Erreur : {sp500Error}</p>
            )}
            <p className="text-sm">
              Exécutez <code className="text-neutral-400">node scripts/populate-sp500.mjs</code> pour remplir la base.
              Vérifiez aussi <code className="text-neutral-400">VITE_SUPABASE_URL</code> et <code className="text-neutral-400">VITE_SUPABASE_ANON_KEY</code> dans .env.
            </p>
          </div>
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
                      name="Risk (Std. dev. ann.)"
                      stroke="#737373"
                      tick={{ fill: '#737373' }}
                      unit="%"
                      tickFormatter={(v) => (typeof v === 'number' ? Math.round(v).toString() : String(v))}
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
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const p = payload[0]?.payload
                        const sym = p?.symbol
                        return (
                          <div className="rounded bg-neutral-800 px-3 py-2 text-sm">
                            {sym && <div className="font-medium text-white">{sym}</div>}
                            <div>Risk: {(p?.risk ?? 0).toFixed(2)}%</div>
                            <div>Return: {(p?.return ?? 0).toFixed(2)}%</div>
                          </div>
                        )
                      }}
                    />
                    <Scatter
                      data={stockPoints}
                      dataKey="return"
                      fill="#525252"
                      fillOpacity={0.6}
                      name="Stocks"
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
                <span>● Stocks (σ, return)</span>
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
