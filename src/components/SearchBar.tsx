import { useState, useCallback } from 'react'
import { searchSymbol, type SearchResult } from '../lib/alphaVantage'

interface SearchBarProps {
  onSelect: (symbol: string, type: 'Stock' | 'ETF') => void
  loading?: boolean
}

export function SearchBar({ onSelect, loading }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const matches = await searchSymbol(query.trim())
      setResults(matches)
      setShowDropdown(true)
    } catch (e) {
      console.error(e)
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [query])

  const handleSelect = (r: SearchResult) => {
    const type = r.type === 'ETF' ? 'ETF' : 'Stock'
    onSelect(r.symbol, type)
    setQuery(r.symbol)
    setShowDropdown(false)
  }

  return (
    <div className="relative w-full max-w-xl">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search stock or ETF (e.g. AAPL, QQQ)"
          className="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          disabled={loading}
        />
        <button
          onClick={handleSearch}
          disabled={searching || loading}
          className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50"
        >
          {searching ? '...' : 'Search'}
        </button>
      </div>
      {showDropdown && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-xl bg-slate-800 border border-slate-700 shadow-xl overflow-hidden z-50 max-h-64 overflow-y-auto">
          {results.map((r) => (
            <button
              key={`${r.symbol}-${r.type}`}
              onClick={() => handleSelect(r)}
              className="w-full px-4 py-3 text-left hover:bg-slate-700 flex justify-between items-center"
            >
              <span className="font-medium text-slate-100">{r.symbol}</span>
              <span className="text-xs text-slate-400">
                {r.type} · {r.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
