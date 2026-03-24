-- Add lifetime column to stripe_customers (was added via inline ALTER on startup)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'stripe_customers' AND column_name = 'lifetime'
    ) THEN
        ALTER TABLE stripe_customers ADD COLUMN lifetime BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;
