-- Add index on created_at for efficient cleanup of old webhook events.
-- A cron job or application-level pruning should DELETE rows older than 90 days.
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at
    ON stripe_webhook_events (created_at);
