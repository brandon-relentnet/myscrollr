-- Remove fighters table
DROP INDEX IF EXISTS idx_fighters_category;
DROP INDEX IF EXISTS idx_fighters_league;
DROP TABLE IF EXISTS fighters;
