-- Additive column migrations for games and tracked_leagues tables
-- Note: 'sport' and 'sport_api' are already created in 00001_initial (added later)
ALTER TABLE games ADD COLUMN IF NOT EXISTS status_short VARCHAR(20);
ALTER TABLE games ADD COLUMN IF NOT EXISTS status_long VARCHAR(100);
ALTER TABLE games ADD COLUMN IF NOT EXISTS timer VARCHAR(20);
ALTER TABLE games ADD COLUMN IF NOT EXISTS venue VARCHAR(200);
ALTER TABLE games ADD COLUMN IF NOT EXISTS season VARCHAR(20);

ALTER TABLE tracked_leagues ADD COLUMN IF NOT EXISTS api_host VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE tracked_leagues ADD COLUMN IF NOT EXISTS league_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tracked_leagues ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'Other';
ALTER TABLE tracked_leagues ADD COLUMN IF NOT EXISTS country VARCHAR(100);
ALTER TABLE tracked_leagues ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500);
ALTER TABLE tracked_leagues ADD COLUMN IF NOT EXISTS season VARCHAR(20);
ALTER TABLE tracked_leagues ADD COLUMN IF NOT EXISTS season_format VARCHAR(20);
ALTER TABLE tracked_leagues ADD COLUMN IF NOT EXISTS offseason_months INTEGER[];
