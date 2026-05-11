-- Polling-health columns for per-league observability.
-- last_polled_at:        timestamp of the most recent poll attempt (success or failure)
-- last_poll_success_at:  timestamp of the most recent successful poll (response parsed OK)
-- last_poll_error:       error message from the most recent failed poll (NULL on success)
--
-- The split between last_polled_at and last_poll_success_at is intentional:
-- a league with last_polled_at = NOW() but last_poll_success_at = 6h ago is
-- silently broken. The Go API exposes a derived polling_healthy bool based
-- on the gap between last_poll_success_at and NOW().

ALTER TABLE tracked_leagues ADD COLUMN IF NOT EXISTS last_polled_at TIMESTAMPTZ;
ALTER TABLE tracked_leagues ADD COLUMN IF NOT EXISTS last_poll_success_at TIMESTAMPTZ;
ALTER TABLE tracked_leagues ADD COLUMN IF NOT EXISTS last_poll_error TEXT;
