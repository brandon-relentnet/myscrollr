-- Partial index supporting the common lookup "does this logto_sub have a
-- non-lifetime row?" done by the cancellation + past_due update paths in
-- api/core/stripe_webhook.go. The WHERE clause keeps the index tiny — most
-- users never upgrade to lifetime, so the predicate matches nearly the whole
-- table, but the planner can skip lifetime users outright on predicate-aware
-- queries like `... WHERE logto_sub = $1 AND lifetime = false`.
--
-- NOT using CREATE INDEX CONCURRENTLY: golang-migrate wraps each migration
-- in a transaction by default, and CONCURRENTLY cannot run inside a
-- transaction block. IF NOT EXISTS makes this safe to re-apply.
CREATE INDEX IF NOT EXISTS idx_stripe_customers_lifetime_false
    ON stripe_customers (logto_sub)
    WHERE lifetime = false;
