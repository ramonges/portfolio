-- Portfolio assets table (user's selected stocks/ETFs)
CREATE TABLE IF NOT EXISTS portfolio_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  name TEXT,
  type TEXT CHECK (type IN ('Stock', 'ETF')),
  weight DECIMAL(5,4) DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol)
);

-- Store cached time series for quicker load (optional, can refresh from API)
CREATE TABLE IF NOT EXISTS asset_data_cache (
  symbol TEXT PRIMARY KEY,
  series JSONB,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);
