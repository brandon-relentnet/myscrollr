-- =============================================================================
-- One-off: seed `_sqlx_migrations` with the rows the finance and sports
-- services need to start up cleanly after the version-prefix rename.
--
-- Context (see PR #107 for full detail):
--
-- All three Rust services (finance, sports, rss) share a single
-- `_sqlx_migrations` table in the scrollr Postgres DB. Historically every
-- service's first migration was versioned `20250601000001`, so sqlx would
-- see a matching version but a different checksum and fail with
-- `VersionMismatch`. Finance and sports have been silently broken this
-- way since deploy (the bug was masked by `set_ignore_missing(true)` + a
-- /health endpoint that always returned 200).
--
-- sqlx 0.8.6 cannot be told to use a different table name (the API doesn't
-- exist yet), so this PR instead renames the finance and sports migration
-- files to use service-unique numeric prefixes (finance: 11*, sports: 12*).
-- RSS keeps 20250601* because its rows already match on disk.
--
-- This script INSERTs the rows finance and sports would have produced if
-- their migrations had been recorded cleanly when the schema was first
-- applied. Every schema change those migrations describe is already
-- present in the `public` schema (verified against live DB at
-- 2026-04-22) — the rows exist on disk, their effects exist in the
-- tables, only the migration history was ever missing.
--
-- Idempotent: safe to re-run. Uses `ON CONFLICT DO NOTHING` so running
-- twice is a no-op.
--
-- To run:
--
--   kubectl -n scrollr run pg-seed --rm -i --restart=Never \
--     --image=postgres:16-alpine \
--     --env="PGURL=$(kubectl -n scrollr get secret scrollr-secrets \
--            -o jsonpath='{.data.DATABASE_URL}' | base64 -d)" \
--     --command -- sh -c 'psql "$PGURL" -v ON_ERROR_STOP=1' \
--     < scripts/migrations/seed-service-migrations.sql
--
-- Rollback: `DELETE FROM _sqlx_migrations WHERE version >= 110000000000
-- AND version < 130000000000;` — this deletes only the rows seeded here
-- and leaves the existing RSS rows (versions in the 2025060100000x range)
-- untouched.
-- =============================================================================

BEGIN;

-- ─── Pre-flight: confirm we're connected to a scrollr DB ─────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = '_sqlx_migrations') THEN
        RAISE EXCEPTION 'Pre-flight failed: `_sqlx_migrations` table does not exist. Wrong database?';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name IN ('games', 'trades', 'tracked_feeds')) THEN
        RAISE EXCEPTION 'Pre-flight failed: none of `games`, `trades`, `tracked_feeds` found. Not the scrollr DB.';
    END IF;
END $$;

-- ─── Finance (11*) ───────────────────────────────────────────────────────
-- Checksums computed by sha384 of the file contents on disk at HEAD of
-- PR #107. If you edit any of these migration files, the hash must be
-- updated both here AND in the _sqlx_migrations row (use `UPDATE ...
-- WHERE version = ...`).

INSERT INTO _sqlx_migrations
    (version, description, installed_on, success, checksum, execution_time)
VALUES
    (110000000001,
     'initial',
     NOW(),
     TRUE,
     decode(
         '15bb5217bd2624d6d8d49acbb7ee8ba35d7a0ba1ed619f4ab39ab05d2ddaf63dc6b896428974485332a00023ecad31b7',
         'hex'),
     0),
    (110000000002,
     'add name category',
     NOW(),
     TRUE,
     decode(
         '59985aec5b2296d1bb2c82a5ca7084ff4e33af9d9d6df8b6c502eb6a868105cd750e28b9e670d444ca4c6d474985119b',
         'hex'),
     0),
    (110000000003,
     'add exchange link',
     NOW(),
     TRUE,
     decode(
         '06fbd2dcd1ef0dd5beefd73fd71ed84488749bbf0dd1f58a9418fbbd77c6554560c70debaf22253d6c3dcc2a223547f7',
         'hex'),
     0)
ON CONFLICT (version) DO NOTHING;

-- ─── Sports (12*) ────────────────────────────────────────────────────────
INSERT INTO _sqlx_migrations
    (version, description, installed_on, success, checksum, execution_time)
VALUES
    (120000000001,
     'initial',
     NOW(),
     TRUE,
     decode(
         'c84e95f2488837a31f480bc0bcb0de9c4ba0a376aa0185e7d70a17e5f5bfc71126dfe417c9ab66e6f082ad111f6558eb',
         'hex'),
     0),
    (120000000002,
     'add columns',
     NOW(),
     TRUE,
     decode(
         '970538d20528d5a00c72ca127593e980db8ecb1f765d9c6982127e5bb00e957a5a33b4788184714f32f6a58de82bc570',
         'hex'),
     0),
    (120000000003,
     'add team code',
     NOW(),
     TRUE,
     decode(
         '2e03ede847bf5979cb16c95d2913d4117a14623403dc8968c5cfa950e255b72525945482dd0ce66e7d9462abd48364a1',
         'hex'),
     0),
    (120000000004,
     'add standings teams',
     NOW(),
     TRUE,
     decode(
         'f42655ec14229c029b5205d2de6ab3772e31cef324f33a4571db07103e521f4b36f46bd47cc2b7c694d94b5b1dac7fce',
         'hex'),
     0),
    (120000000005,
     'extend standings sport columns',
     NOW(),
     TRUE,
     decode(
         '98f0bf407513ab3bcd1eb51ba87dc186718427051646d5e8ea079560e860720822dbe343e99a88760032411c7131d3ad',
         'hex'),
     0)
ON CONFLICT (version) DO NOTHING;

-- ─── Post-flight: show what we just ensured is in place ──────────────────
SELECT
    CASE
        WHEN version BETWEEN 110000000000 AND 119999999999 THEN 'finance'
        WHEN version BETWEEN 120000000000 AND 129999999999 THEN 'sports'
        WHEN version BETWEEN 20250601000000 AND 20250601999999 THEN 'rss (pre-existing)'
        ELSE 'unknown'
    END AS service,
    version,
    description,
    success,
    installed_on
FROM _sqlx_migrations
ORDER BY service, version;

COMMIT;
