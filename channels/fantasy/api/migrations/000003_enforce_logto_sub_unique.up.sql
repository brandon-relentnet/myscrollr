-- Enforce UNIQUE on yahoo_users.logto_sub (dedup old duplicates before adding constraint)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'yahoo_users'::regclass
        AND contype = 'u'
        AND conname LIKE '%logto_sub%'
    ) THEN
        DELETE FROM yahoo_users a USING yahoo_users b
        WHERE a.logto_sub = b.logto_sub
          AND a.logto_sub IS NOT NULL
          AND a.ctid < b.ctid;
        ALTER TABLE yahoo_users ADD CONSTRAINT yahoo_users_logto_sub_key UNIQUE (logto_sub);
    END IF;
END $$;
