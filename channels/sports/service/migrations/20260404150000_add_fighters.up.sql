-- Add fighters table for MMA/UFC favorite fighter selection
CREATE TABLE IF NOT EXISTS fighters (
    league TEXT NOT NULL,
    external_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    logo TEXT,
    category TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (league, external_id)
);

-- Index for fast league lookups
CREATE INDEX IF NOT EXISTS idx_fighters_league ON fighters(league);

-- Index for category filtering (weight class)
CREATE INDEX IF NOT EXISTS idx_fighters_category ON fighters(category);
