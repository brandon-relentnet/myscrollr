DROP INDEX IF EXISTS support_drafts_thread_entry_uniq;
ALTER TABLE support_drafts DROP COLUMN IF EXISTS osticket_thread_entry_id;
