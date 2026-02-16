import type { TimeSeriesPoint } from './alphaVantage'

export interface AssetMetrics {
  yearlyReturns: Record<string, number>
  volatility: number
  maxDrawdown: number
  sharpeRatio: number
}

const RISK_FREE_RATE = 0.04

export function computeMetrics(series: TimeSeriesPoint[]): AssetMetrics {
  if (series.length < 2) {
    return {
      yearlyReturns: {},
      volatility: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
    }
  }

  const closes = series.map(p => p.close)
  const returns: number[] = []
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1])
  }

  const yearlyReturns: Record<string, number> = {}
  const byYear = new Map<string, number[]>()
  for (let i = 1; i < series.length; i++) {
    const year = series[i].date.slice(0, 4)
    const r = (closes[i] - closes[i - 1]) / closes[i - 1]
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push(r)
  }
  byYear.forEach((rets, year) => {
    const compounded = rets.reduce((acc, r) => acc * (1 + r), 1) - 1
    yearlyReturns[year] = compounded
  })

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / returns.length
  const volatility = Math.sqrt(variance * 252) || 0

  let peak = closes[0]
  let maxDrawdown = 0
  for (const c of closes) {
    if (c > peak) peak = c
    const dd = (peak - c) / peak
    if (dd > maxDrawdown) maxDrawdown = dd
  }

  const excessReturn = mean * 252 - RISK_FREE_RATE
  const sharpeRatio = volatility > 0 ? excessReturn / volatility : 0

  return {
    yearlyReturns,
    volatility,
    maxDrawdown,
    sharpeRatio,
  }
}
