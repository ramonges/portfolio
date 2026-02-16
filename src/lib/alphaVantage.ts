const API_KEY = import.meta.env.VITE_ALPHA_VANTAGE_API_KEY
const BASE_URL = 'https://www.alphavantage.co/query'

async function fetchApi(params: Record<string, string>): Promise<unknown> {
  const searchParams = new URLSearchParams({ ...params, apikey: API_KEY || 'demo' })
  const res = await fetch(`${BASE_URL}?${searchParams}`)
  return res.json()
}

export interface SearchResult {
  symbol: string
  name: string
  type: string
  region: string
  currency: string
  matchScore: string
}

export async function searchSymbol(keywords: string): Promise<SearchResult[]> {
  const data = await fetchApi({ function: 'SYMBOL_SEARCH', keywords }) as { bestMatches?: Array<Record<string, string>>; Note?: string }
  if (data.Note) return []
  const matches = data.bestMatches || []
  return matches.map((m: Record<string, string>) => ({
    symbol: m['1. symbol'],
    name: m['2. name'],
    type: m['3. type'],
    region: m['4. region'],
    currency: m['8. currency'],
    matchScore: m['9. matchScore'],
  }))
}

export interface TimeSeriesPoint {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface TimeSeriesResponse {
  meta: { symbol: string; lastRefreshed: string }
  series: TimeSeriesPoint[]
}

export async function getDailyTimeSeries(symbol: string): Promise<TimeSeriesResponse | null> {
  const data = await fetchApi({
    function: 'TIME_SERIES_DAILY',
    symbol,
    outputsize: 'compact',
  }) as Record<string, unknown>

  const metaKey = Object.keys(data).find(k => k.startsWith('Meta'))
  const seriesKey = Object.keys(data).find(k => k.includes('Time Series'))
  if (!metaKey || !seriesKey) return null

  const meta = data[metaKey] as Record<string, string>
  const series = data[seriesKey] as Record<string, Record<string, string>>

  const points: TimeSeriesPoint[] = Object.entries(series)
    .map(([date, v]) => ({
      date,
      open: parseFloat(v['1. open'] || '0'),
      high: parseFloat(v['2. high'] || '0'),
      low: parseFloat(v['3. low'] || '0'),
      close: parseFloat(v['4. close'] || '0'),
      volume: parseInt(v['5. volume'] || '0', 10),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    meta: { symbol: meta['2. Symbol'] || symbol, lastRefreshed: meta['3. Last Refreshed'] || '' },
    series: points,
  }
}

export interface Quote {
  symbol: string
  price: number
  change: number
  changePercent: string
  volume: string
}

export async function getGlobalQuote(symbol: string): Promise<Quote | null> {
  const data = await fetchApi({ function: 'GLOBAL_QUOTE', symbol }) as { 'Global Quote'?: Record<string, string> }
  const q = data['Global Quote']
  if (!q || !q['05. price']) return null
  return {
    symbol: q['01. symbol'],
    price: parseFloat(q['05. price']),
    change: parseFloat(q['09. change'] || '0'),
    changePercent: q['10. change percent'] || '0%',
    volume: q['06. volume'] || '0',
  }
}
