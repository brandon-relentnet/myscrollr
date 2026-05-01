-- Map osTicket ticket numbers to Discord thread IDs.
--
-- Why a separate table (vs. a column on support_drafts): a ticket has
-- many drafts (initial + each user reply), but ONE Discord thread.
-- Keying by ticket_number cleanly expresses the 1:1 ticket-to-thread
-- relationship without duplicating thread IDs across draft rows.
--
-- Nullable channel_id field is the channel the thread lives under;
-- stored explicitly so we can reconstruct the thread URL or move
-- a thread later if needed (e.g., per-category routing in v2).
CREATE TABLE IF NOT EXISTS support_ticket_threads (
    ticket_number      TEXT PRIMARY KEY,
    discord_thread_id  TEXT NOT NULL,
    channel_id         TEXT NOT NULL,
    archived           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_ticket_threads_thread_id_idx
    ON support_ticket_threads(discord_thread_id);
