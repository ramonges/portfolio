import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { getDailyTimeSeries, type TimeSeriesPoint } from '../lib/alphaVantage'
import {
  maxSharpeWeightsLongOnly,
  minVarianceWeights,
  portfolioSharpe,
} from '../lib/markowitz'

interface PortfolioAsset {
  id: string
  symbol: string
  name: string
  type: string
}

type Strategy = 'maxSharpe' | 'minVariance'

export function OptimizationPage() {
  const [assets, setAssets] = useState<PortfolioAsset[]>([])
  const [amount, setAmount] = useState<string>('500000')
  const [strategy, setStrategy] = useState<Strategy>('maxSharpe')
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [allocation, setAllocation] = useState<
    { symbol: string; weight: number; amount: number }[]
  >([])
  const [metrics, setMetrics] = useState<{
    expectedReturn: number
    stdDev: number
    sharpeRatio: number
  } | null>(null)
  const [evolutionData, setEvolutionData] = useState<{ date: string; value: number }[]>([])
  const [historyPeriod, setHistoryPeriod] = useState<'1y' | '3y'>('3y')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadAssets()
  }, [])

  useEffect(() => {
    if (assets.length < 2) {
      setAllocation([])
      setMetrics(null)
      setEvolutionData([])
      setError(null)
      return
    }
    computeOptimal()
  }, [assets, strategy, historyPeriod])

  async function loadAssets() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('portfolio_assets')
      .select('id, symbol, name, type')
      .order('symbol')
    if (err) {
      setError('Erreur lors du chargement des actifs.')
      setAssets([])
    } else {
      setAssets(data || [])
    }
    setLoading(false)
  }

  async function computeOptimal() {
    if (assets.length < 2) return
    setComputing(true)
    setError(null)
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
      setError('Données insuffisantes. Ajoutez au moins 2 actifs avec historique.')
      setAllocation([])
      setMetrics(null)
      setComputing(false)
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
    const covDaily: number[][] = []
    const n = returns.length
    const T = returns[0]?.length ?? 0
    for (let i = 0; i < n; i++) {
      covDaily[i] = []
      for (let j = 0; j < n; j++) {
        const meanI = returns[i].reduce((a, b) => a + b, 0) / T
        const meanJ = returns[j].reduce((a, b) => a + b, 0) / T
        let s = 0
        for (let t = 0; t < T; t++) {
          s += (returns[i][t] - meanI) * (returns[j][t] - meanJ)
        }
        covDaily[i][j] = T > 1 ? s / (T - 1) : 0
      }
    }
    const covAnn = covDaily.map((row) => row.map((v) => v * 252))
    let weights: number[] | null = null
    if (strategy === 'maxSharpe') {
      weights = maxSharpeWeightsLongOnly(meanRetsAnn, covAnn)
    } else {
      weights = minVarianceWeights(covAnn)
    }
    if (!weights) {
      setError('Optimisation impossible. Essayez d’autres actifs.')
      setAllocation([])
      setMetrics(null)
      setEvolutionData([])
      setComputing(false)
      return
    }
    const normWeights = weights
    const alloc = seriesList.map((s, i) => ({
      symbol: s.symbol,
      weight: normWeights[i],
      amount: 0,
    }))
    const portRet = meanRetsAnn.reduce((s, m, j) => s + m * normWeights[j], 0)
    const portVar = normWeights.reduce(
      (s, wi, i) =>
        s + normWeights.reduce((s2, wj, j) => s2 + wi * wj * covAnn[i][j], 0),
      0
    )
    const stdDev = Math.sqrt(Math.max(0, portVar))
    const sharpe = portfolioSharpe(normWeights, meanRetsAnn, covAnn)
    setAllocation(alloc)
    setMetrics({
      expectedReturn: portRet * 100,
      stdDev: stdDev * 100,
      sharpeRatio: sharpe,
    })

    const evoData = await computeEvolution(
      assets.filter((a) => seriesList.some((s) => s.symbol === a.symbol)),
      seriesList,
      normWeights,
      historyPeriod
    )
    setEvolutionData(evoData)
    setComputing(false)
  }

  async function computeEvolution(
    assetsList: PortfolioAsset[],
    seriesList: { symbol: string; closes: number[] }[],
    weights: number[],
    period: '1y' | '3y'
  ): Promise<{ date: string; value: number }[]> {
    const symbols = seriesList.map((s) => s.symbol)
    const seriesBySymbol: Record<string, TimeSeriesPoint[]> = {}
    for (const a of assetsList) {
      try {
        const res = await getDailyTimeSeries(a.symbol, true)
        if (res?.series?.length) seriesBySymbol[a.symbol] = res.series
      } catch {
        /* ignore */
      }
    }
    const validSymbols = symbols.filter((s) => seriesBySymbol[s]?.length)
    if (validSymbols.length < 2) return []

    const cutOff = new Date()
    if (period === '1y') cutOff.setFullYear(cutOff.getFullYear() - 1)
    else cutOff.setFullYear(cutOff.getFullYear() - 3)
    const cutOffStr = cutOff.toISOString().slice(0, 10)

    const byDate: Record<string, Record<string, number>> = {}
    for (const s of validSymbols) {
      for (const p of seriesBySymbol[s]) {
        if (p.date < cutOffStr) continue
        if (!byDate[p.date]) byDate[p.date] = {}
        byDate[p.date][s] = p.close
      }
    }
    const commonDates = Object.keys(byDate).filter((d) =>
      validSymbols.every((s) => byDate[d][s] != null)
    ).sort()

    if (commonDates.length < 2) return []
    const firstDate = commonDates[0]
    const idxMap = validSymbols.reduce((acc, s) => {
      acc[s] = seriesList.findIndex((x) => x.symbol === s)
      return acc
    }, {} as Record<string, number>)
    const firstPrices: Record<string, number> = {}
    for (const s of validSymbols) firstPrices[s] = byDate[firstDate][s]

    const result = commonDates.map((date) => {
      let cumulativeReturn = 0
      for (const s of validSymbols) {
        const idx = idxMap[s]
        if (idx < 0 || idx >= weights.length) continue
        cumulativeReturn += weights[idx] * (byDate[date][s] / firstPrices[s])
      }
      return { date, value: cumulativeReturn }
    })
    return result
  }

  const totalAmount = parseFloat(amount.replace(/\s/g, '')) || 0
  const displayAllocation = allocation.map((a) => ({
    ...a,
    amount: totalAmount * a.weight,
  }))

  return (
    <div className="pl-14 min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h2 className="text-xl font-semibold text-white mb-6">
          Portfolio Optimization
        </h2>

        {loading ? (
          <p className="text-neutral-500">Chargement...</p>
        ) : assets.length < 2 ? (
          <p className="text-neutral-500">
            Ajoutez au moins 2 actifs depuis la page Search & Add pour optimiser.
          </p>
        ) : (
          <>
            <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-6 mb-6">
              <h3 className="text-sm font-medium text-neutral-300 mb-4">
                Montant du portefeuille
              </h3>
              <div className="flex flex-wrap items-center gap-4">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ''))}
                  placeholder="500000"
                  className="px-4 py-3 rounded-lg bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 w-40 focus:outline-none focus:ring-2 focus:ring-neutral-500"
                />
                <span className="text-neutral-400">€</span>
              </div>
            </div>

            <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-6 mb-6">
              <h3 className="text-sm font-medium text-neutral-300 mb-4">
                Période historique (évolution)
              </h3>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="historyPeriod"
                    checked={historyPeriod === '1y'}
                    onChange={() => setHistoryPeriod('1y')}
                    className="accent-white"
                  />
                  <span className="text-white">1 an</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="historyPeriod"
                    checked={historyPeriod === '3y'}
                    onChange={() => setHistoryPeriod('3y')}
                    className="accent-white"
                  />
                  <span className="text-white">3 ans</span>
                </label>
              </div>
            </div>

            <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-6 mb-6">
              <h3 className="text-sm font-medium text-neutral-300 mb-4">
                Stratégie
              </h3>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="strategy"
                    checked={strategy === 'maxSharpe'}
                    onChange={() => setStrategy('maxSharpe')}
                    className="accent-white"
                  />
                  <span className="text-white">
                    Max Sharpe — meilleur rendement ajusté au risque
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="strategy"
                    checked={strategy === 'minVariance'}
                    onChange={() => setStrategy('minVariance')}
                    className="accent-white"
                  />
                  <span className="text-white">
                    Min variance — risque minimal
                  </span>
                </label>
              </div>
            </div>

            {error && (
              <p className="text-neutral-400 mb-4">{error}</p>
            )}

            {computing ? (
              <p className="text-neutral-500">Calcul en cours...</p>
            ) : displayAllocation.length > 0 && metrics && (
              <>
                <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-6 mb-6 overflow-x-auto">
                  <h3 className="text-sm font-medium text-neutral-300 mb-4">
                    Allocation optimale
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-neutral-500 border-b border-neutral-800">
                        <th className="pb-3 pr-4">Actif</th>
                        <th className="pb-3 pr-4 text-right">Poids</th>
                        <th className="pb-3 text-right">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayAllocation.map((a) => (
                        <tr key={a.symbol} className="border-b border-neutral-800/50">
                          <td className="py-3 pr-4 font-medium text-white">
                            {a.symbol}
                          </td>
                          <td className="py-3 pr-4 text-right text-neutral-300">
                            {(a.weight * 100).toFixed(1)}%
                          </td>
                          <td className="py-3 text-right text-white">
                            {a.amount.toLocaleString('fr-FR', {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            })}{' '}
                            €
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-4">
                    <div className="text-xs text-neutral-500 mb-1">
                      Rendement attendu (ann.)
                    </div>
                    <div className="text-xl font-semibold text-white">
                      {metrics.expectedReturn.toFixed(2)}%
                    </div>
                  </div>
                  <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-4">
                    <div className="text-xs text-neutral-500 mb-1">
                      Volatilité (écart-type ann.)
                    </div>
                    <div className="text-xl font-semibold text-white">
                      {metrics.stdDev.toFixed(2)}%
                    </div>
                  </div>
                  <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-4">
                    <div className="text-xs text-neutral-500 mb-1">
                      Sharpe Ratio
                    </div>
                    <div className="text-xl font-semibold text-white">
                      {metrics.sharpeRatio.toFixed(2)}
                    </div>
                  </div>
                </div>

                {evolutionData.length > 0 && (
                  <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-6 mb-6">
                    <h3 className="text-sm font-medium text-neutral-300 mb-4">
                      Évolution du portfolio ({historyPeriod === '1y' ? '1 an' : '3 ans'})
                    </h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={evolutionData.map((d) => ({
                            ...d,
                            value: d.value * totalAmount,
                          }))}
                          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#404040" />
                          <XAxis
                            dataKey="date"
                            stroke="#737373"
                            tick={{ fill: '#737373', fontSize: 11 }}
                            tickFormatter={(v: string) => v.slice(0, 10)}
                          />
                          <YAxis
                            stroke="#737373"
                            tick={{ fill: '#737373', fontSize: 11 }}
                            tickFormatter={(v: number) =>
                              (v / 1000).toFixed(0) + 'k'
                            }
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#171717',
                              border: '1px solid #404040',
                            }}
                            formatter={(value: number | undefined) =>
                              [
                                (value != null
                                  ? value.toLocaleString('fr-FR', {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 0,
                                    })
                                  : '—') + ' €',
                                'Valeur',
                              ]
                            }
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#fafafa"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-6">
                  <h3 className="text-sm font-medium text-neutral-300 mb-2">
                    Projection 1 an
                  </h3>
                  <p className="text-neutral-400 text-sm mb-2">
                    Avec un rendement attendu de {metrics.expectedReturn.toFixed(1)}% :
                  </p>
                  <p className="text-2xl font-semibold text-white">
                    {(
                      totalAmount *
                      (1 + metrics.expectedReturn / 100)
                    ).toLocaleString('fr-FR', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}{' '}
                    €
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">
                    (estimation, non garantie)
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
