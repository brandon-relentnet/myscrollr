-- Sequin CDC relies on full row data to propagate DELETE events for tables
-- keyed by anything other than the primary key. `standings` and `teams` are
-- low-volume tables where we'd rather spend a few extra WAL bytes per
-- update than lose delete events downstream — REPLICA IDENTITY FULL writes
-- the old row to the WAL on every UPDATE/DELETE, which is what Sequin needs
-- to fan out to its destination streams. See docs/cdc-runbook.md.
ALTER TABLE standings REPLICA IDENTITY FULL;
ALTER TABLE teams REPLICA IDENTITY FULL;
