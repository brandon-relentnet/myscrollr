-- Remove guid column from yahoo_leagues (was accidentally added in an earlier schema)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'yahoo_leagues' AND column_name = 'guid'
    ) THEN
        ALTER TABLE yahoo_leagues DROP COLUMN guid;
    END IF;
END $$;
