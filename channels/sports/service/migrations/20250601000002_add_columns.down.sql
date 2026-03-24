ALTER TABLE tracked_leagues DROP COLUMN IF EXISTS offseason_months;
ALTER TABLE tracked_leagues DROP COLUMN IF EXISTS season_format;
ALTER TABLE tracked_leagues DROP COLUMN IF EXISTS season;
ALTER TABLE tracked_leagues DROP COLUMN IF EXISTS logo_url;
ALTER TABLE tracked_leagues DROP COLUMN IF EXISTS country;
ALTER TABLE tracked_leagues DROP COLUMN IF EXISTS category;
ALTER TABLE tracked_leagues DROP COLUMN IF EXISTS league_id;
ALTER TABLE tracked_leagues DROP COLUMN IF EXISTS api_host;

ALTER TABLE games DROP COLUMN IF EXISTS season;
ALTER TABLE games DROP COLUMN IF EXISTS venue;
ALTER TABLE games DROP COLUMN IF EXISTS timer;
ALTER TABLE games DROP COLUMN IF EXISTS status_long;
ALTER TABLE games DROP COLUMN IF EXISTS status_short;
