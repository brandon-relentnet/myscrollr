-- Sprint 4: GDPR 30-day soft-delete tracking.
--
-- One row per user-initiated account deletion request. The background
-- purge worker (api/core/user_deletion.go) scans this table hourly and
-- cascades purges for rows whose `purge_at` has elapsed while still in
-- the `pending` state.
--
-- Primary key on logto_sub: a user cannot have two concurrent pending
-- requests; re-requesting while pending is a no-op (idempotent upsert).

CREATE TABLE IF NOT EXISTS user_deletion_requests (
    logto_sub    TEXT PRIMARY KEY,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    purge_at     TIMESTAMPTZ NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    canceled_at  TIMESTAMPTZ,
    purged_at    TIMESTAMPTZ
);

-- Partial index: the purge worker only scans pending rows, ordered by
-- purge_at. A partial index keeps the hot path small and keeps canceled
-- + purged rows out of the scan entirely.
CREATE INDEX IF NOT EXISTS user_deletion_requests_pending_purge_at
    ON user_deletion_requests (purge_at)
    WHERE status = 'pending';
