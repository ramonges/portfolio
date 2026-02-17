#!/usr/bin/env node
/**
 * Script pour remplir la table sp500_daily avec 1 an de données
 * Usage: node scripts/populate-sp500.mjs
 * Nécessite: VITE_ALPHA_VANTAGE_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY dans .env
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const API_KEY = process.env.VITE_ALPHA_VANTAGE_API_KEY
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

if (!API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env: VITE_ALPHA_VANTAGE_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const symbols = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'sp500-symbols.json'), 'utf8')
)

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Premium: 75/min → ~800ms. Free: 5/min → 12s. DELAY_MS env to override.
const DELAY_MS = parseInt(process.env.DELAY_MS || '12000', 10)
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchDaily(symbol) {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=full&apikey=${API_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  const key = Object.keys(data).find((k) => k.includes('Time Series'))
  if (!key) return []
  const series = data[key]
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const cutoff = oneYearAgo.toISOString().slice(0, 10)
  const rows = []
  for (const [date, v] of Object.entries(series)) {
    if (date < cutoff) continue
    rows.push({
      symbol,
      date,
      close: parseFloat(v['4. close'] || 0),
    })
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

async function main() {
  console.log(`Fetching ${symbols.length} symbols (1 year each)...`)
  console.log('Rate limit: ~5-75 req/min. Premium key recommended.')
  let count = 0
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i]
    try {
      const rows = await fetchDaily(sym)
      if (rows.length === 0) {
        console.log(`  ${sym}: no data`)
        await delay(DELAY_MS)
        continue
      }
      const { error } = await supabase.from('sp500_daily').upsert(rows, {
        onConflict: 'symbol,date',
      })
      if (error) throw error
      count += rows.length
      console.log(`  ${sym}: ${rows.length} days`)
    } catch (e) {
      console.error(`  ${sym} error:`, e.message)
      if (e.message?.includes('limit')) {
        console.log('  Rate limit hit, waiting 60s...')
        await delay(60000)
      }
    }
    await delay(DELAY_MS)
  }
  console.log(`Done. ${count} rows inserted.`)
}

main()
