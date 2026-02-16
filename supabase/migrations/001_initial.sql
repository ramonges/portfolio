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

-- Enable RLS and allow anon access (personal use)
ALTER TABLE portfolio_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON portfolio_assets;
CREATE POLICY "Allow all for anon" ON portfolio_assets
  FOR ALL USING (true) WITH CHECK (true);

-- Store cached time series for quicker load (optional)
CREATE TABLE IF NOT EXISTS asset_data_cache (
  symbol TEXT PRIMARY KEY,
  series JSONB,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);
