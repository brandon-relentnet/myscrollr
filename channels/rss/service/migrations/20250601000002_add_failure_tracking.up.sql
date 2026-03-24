-- Additive column migrations for failure tracking and authorization
ALTER TABLE tracked_feeds ADD COLUMN IF NOT EXISTS consecutive_failures INT NOT NULL DEFAULT 0;
ALTER TABLE tracked_feeds ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE tracked_feeds ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;
ALTER TABLE tracked_feeds ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ;
ALTER TABLE tracked_feeds ADD COLUMN IF NOT EXISTS added_by TEXT;
