# Opti Portfolio 26

A portfolio dashboard built with React, Alpha Vantage API, and Supabase.

## Features

- **Search & Add**: Search stocks/ETFs, view price chart, metrics (YoY return, volatility, max drawdown, Sharpe ratio), and add to portfolio
- **Portfolio Dashboard**: View all assets, efficient frontier (Markowitz), portfolio Sharpe ratio, expected return, and risk

## Setup

1. **Environment variables**  
   Copy `.env.example` to `.env` and fill in your keys (or use the existing `.env` if present):
   - `VITE_ALPHA_VANTAGE_API_KEY` — Alpha Vantage API key
   - `VITE_SUPABASE_URL` — `https://<project-id>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` — Supabase anon key

2. **Supabase tables**  
   In [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor, run the contents of `supabase/migrations/001_initial.sql`:

```sql
CREATE TABLE IF NOT EXISTS portfolio_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  name TEXT,
  type TEXT CHECK (type IN ('Stock', 'ETF')),
  weight DECIMAL(5,4) DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol)
);

CREATE TABLE IF NOT EXISTS asset_data_cache (
  symbol TEXT PRIMARY KEY,
  series JSONB,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);
```

3. **Run the app**

```bash
npm install
npm run dev
```

## Stack

- React 19 + Vite + TypeScript
- Tailwind CSS
- Recharts
- Supabase
- Alpha Vantage API
