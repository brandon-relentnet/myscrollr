ALTER TABLE tracked_leagues DROP COLUMN IF EXISTS last_polled_at;
ALTER TABLE tracked_leagues DROP COLUMN IF EXISTS last_poll_success_at;
ALTER TABLE tracked_leagues DROP COLUMN IF EXISTS last_poll_error;
