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

  const [dataError, setDataError] = useState<string | null>(null)

  const handleSelect = useCallback(async (s: string, type: 'Stock' | 'ETF') => {
    setSymbol(s)
    setAssetType(type)
    setLoading(true)
    setSeries([])
    setDataError(null)
    try {
      const res = await getDailyTimeSeries(s)
      if (res) {
        setSeries(res.series)
        if (res.series.length === 0) setDataError('Aucune donnée de prix pour ce symbole.')
      } else {
        setDataError('Symbole non trouvé ou non supporté. Vérifiez le symbole (ex: AAPL, QQQ).')
      }
    } catch (e) {
      console.error(e)
      setDataError('Erreur lors du chargement des données.')
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
              <span className="text-sm text-neutral-500">Type:</span>
              <span className="text-sm font-medium text-white">{assetType}</span>
            </div>
          )}
        </div>

        <div className="rounded-lg bg-neutral-900/50 border border-neutral-800 p-6 mb-6">
          <PriceChart data={series} symbol={symbol} loading={loading} />
          {!loading && symbol && series.length === 0 && dataError && (
            <p className="mt-3 text-sm text-neutral-400">{dataError}</p>
          )}
        </div>

        {metrics && symbol && (
          <>
            <div className="mb-6">
              <MetricsCard metrics={metrics} symbol={symbol} />
            </div>
            <button
              onClick={handleAddToPortfolio}
              disabled={adding}
              className="px-6 py-3 rounded-lg bg-white hover:bg-neutral-200 text-black font-medium disabled:opacity-50"
            >
              {adding ? 'Adding...' : 'Add to Portfolio'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
