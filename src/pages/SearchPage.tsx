import { useState, useCallback } from 'react'
import { SearchBar } from '../components/SearchBar'
import { PriceChart } from '../components/PriceChart'
import { MetricsCard } from '../components/MetricsCard'
import { getDailyTimeSeries } from '../lib/alphaVantage'
import { computeMetrics } from '../lib/metrics'
import { supabase } from '../lib/supabase'

export function SearchPage() {
  const [symbol, setSymbol] = useState('')
  const [assetType, setAssetType] = useState<'Stock' | 'ETF'>('Stock')
  const [series, setSeries] = useState<{ date: string; open: number; high: number; low: number; close: number; volume: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)

  const handleSelect = useCallback(async (s: string, type: 'Stock' | 'ETF') => {
    setSymbol(s)
    setAssetType(type)
    setLoading(true)
    setSeries([])
    try {
      const res = await getDailyTimeSeries(s)
      if (res) setSeries(res.series)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleAddToPortfolio = async () => {
    if (!symbol.trim()) return
    setAdding(true)
    try {
      const { error } = await supabase.from('portfolio_assets').upsert(
        {
          symbol: symbol.trim(),
          type: assetType,
          name: symbol,
          weight: 1,
        },
        { onConflict: 'symbol' }
      )
      if (error) throw error
      alert(`Added ${symbol} to portfolio`)
    } catch (e) {
      console.error(e)
      alert('Failed to add. Ensure Supabase tables exist. Run: supabase/migrations/001_initial.sql')
    } finally {
      setAdding(false)
    }
  }

  const metrics = series.length > 0 ? computeMetrics(series) : null

  return (
    <div className="pl-14 min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col items-center mb-8">
          <SearchBar onSelect={handleSelect} loading={loading} />
          {symbol && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-slate-400">Type:</span>
              <span className="text-sm font-medium text-slate-200">{assetType}</span>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6 mb-6">
          <PriceChart data={series} symbol={symbol} loading={loading} />
        </div>

        {metrics && symbol && (
          <>
            <div className="mb-6">
              <MetricsCard metrics={metrics} symbol={symbol} />
            </div>
            <button
              onClick={handleAddToPortfolio}
              disabled={adding}
              className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50"
            >
              {adding ? 'Adding...' : 'Add to Portfolio'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
