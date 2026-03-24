ALTER TABLE tracked_feeds DROP COLUMN IF EXISTS added_by;
ALTER TABLE tracked_feeds DROP COLUMN IF EXISTS last_success_at;
ALTER TABLE tracked_feeds DROP COLUMN IF EXISTS last_error_at;
ALTER TABLE tracked_feeds DROP COLUMN IF EXISTS last_error;
ALTER TABLE tracked_feeds DROP COLUMN IF EXISTS consecutive_failures;
