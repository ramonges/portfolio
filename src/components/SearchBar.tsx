import { useState, useCallback } from 'react'
import { searchSymbol, type SearchResult } from '../lib/alphaVantage'

interface SearchBarProps {
  onSelect: (symbol: string, type: 'Stock' | 'ETF') => void
  loading?: boolean
}

export function SearchBar({ onSelect, loading }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    setSearchError(null)
    try {
      const { results: matches, error } = await searchSymbol(query.trim())
      setResults(matches)
      setSearchError(error ?? null)
      setShowDropdown(true)
    } catch (e) {
      console.error(e)
      setResults([])
      setSearchError('Erreur de recherche. Vérifiez votre connexion.')
    } finally {
      setSearching(false)
    }
  }, [query])

  const handleSelect = (r: SearchResult) => {
    const type = r.type === 'ETF' ? 'ETF' : 'Stock'
    onSelect(r.symbol, type)
    setQuery(r.symbol)
    setShowDropdown(false)
    setSearchError(null)
  }

  const showMessage = showDropdown && (results.length === 0 || searchError)

  return (
    <div className="relative w-full max-w-xl">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowDropdown(false)
            setSearchError(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Symbole (ex: AAPL, QQQ)"
          className="flex-1 px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:border-transparent"
          disabled={loading}
        />
        <button
          onClick={handleSearch}
          disabled={searching || loading}
          className="px-5 py-3 rounded-lg bg-white hover:bg-neutral-200 text-black font-medium disabled:opacity-50 flex items-center gap-2 min-w-[100px] justify-center"
        >
          {searching ? (
            <>
              <span className="animate-pulse">Recherche…</span>
            </>
          ) : (
            'Rechercher'
          )}
        </button>
      </div>
      {showDropdown && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-lg bg-neutral-900 border border-neutral-700 shadow-xl overflow-hidden z-50 max-h-64 overflow-y-auto">
          {results.map((r) => (
            <button
              key={`${r.symbol}-${r.type}`}
              onClick={() => handleSelect(r)}
              className="w-full px-4 py-3 text-left hover:bg-neutral-800 flex justify-between items-center"
            >
              <span className="font-medium text-white">{r.symbol}</span>
              <span className="text-xs text-neutral-400">
                {r.type} · {r.name}
              </span>
            </button>
          ))}
        </div>
      )}
      {showMessage && (
        <div
          className={`absolute top-full left-0 right-0 mt-2 rounded-lg px-4 py-3 z-50 ${
            searchError ? 'bg-neutral-800 border border-neutral-600 text-neutral-300' : 'bg-neutral-900 border border-neutral-700 text-neutral-400'
          }`}
        >
          {searchError
            ? searchError
            : `Aucun symbole trouvé pour « ${query} ». Vérifiez l'orthographe (ex: AAPL, MSFT, QQQ).`}
        </div>
      )}
    </div>
  )
}
