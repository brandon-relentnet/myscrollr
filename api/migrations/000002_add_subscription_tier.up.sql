-- Add subscription_tier column to user_preferences (was added via inline ALTER on startup)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_preferences' AND column_name = 'subscription_tier'
    ) THEN
        ALTER TABLE user_preferences ADD COLUMN subscription_tier TEXT NOT NULL DEFAULT 'free';
    END IF;
END $$;
