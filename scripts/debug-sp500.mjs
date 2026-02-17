#!/usr/bin/env node
/**
 * Debug: vérifie la connexion Supabase et les données sp500_daily
 * Usage: node scripts/debug-sp500.mjs
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

console.log('URL:', url)
const supabase = createClient(url, key)

const { data, error } = await supabase
  .from('sp500_daily')
  .select('symbol, date, close')
  .order('date', { ascending: true })
  .range(0, 199999)

console.log('Error:', error || 'none')
console.log('Total rows:', data?.length ?? 0)

if (data?.length) {
  const bySym = {}
  for (const r of data) {
    bySym[r.symbol] = (bySym[r.symbol] || 0) + 1
  }
  const syms = Object.keys(bySym)
  const counts = syms.map((s) => bySym[s])
  console.log('Symbols:', syms.length)
  console.log('Max days per symbol:', Math.max(...counts))
  console.log('Sample symbol counts:', Object.entries(bySym).slice(0, 5))
}
