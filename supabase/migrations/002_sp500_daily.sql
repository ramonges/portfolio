-- S&P 500 daily prices (1 année de données pour efficient frontier)
CREATE TABLE IF NOT EXISTS sp500_daily (
  symbol TEXT NOT NULL,
  date DATE NOT NULL,
  close DECIMAL(18,6) NOT NULL,
  PRIMARY KEY (symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_sp500_daily_symbol ON sp500_daily(symbol);
CREATE INDEX IF NOT EXISTS idx_sp500_daily_date ON sp500_daily(date);

ALTER TABLE sp500_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon sp500" ON sp500_daily;
CREATE POLICY "Allow all for anon sp500" ON sp500_daily
  FOR ALL USING (true) WITH CHECK (true);
