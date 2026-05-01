-- Track which osTicket thread_entry_id each draft was generated FOR.
-- Used by the reply-loop webhook (handlers_osticket_webhook.go) to:
--   1. Dedupe — if a draft already exists for a given thread_entry_id,
--      don't generate a second one.
--   2. Audit — link each draft back to the specific user message that
--      triggered it.
--
-- Nullable because pre-existing rows (created by the /support/ticket
-- flow before this column existed) don't have a thread_entry_id —
-- their initial message lives in osTicket but we never captured the
-- entry id for those.
ALTER TABLE support_drafts
  ADD COLUMN IF NOT EXISTS osticket_thread_entry_id BIGINT;

-- Partial unique index: enforces "at most one draft per thread_entry_id"
-- without conflicting with the legacy NULL rows.
CREATE UNIQUE INDEX IF NOT EXISTS support_drafts_thread_entry_uniq
  ON support_drafts (osticket_thread_entry_id)
  WHERE osticket_thread_entry_id IS NOT NULL;
