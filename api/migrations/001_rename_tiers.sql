-- Rename uplink_unlimited → uplink_ultimate in user_preferences
-- Run once after deploying the code changes. Idempotent if run multiple times.
UPDATE user_preferences
SET subscription_tier = 'uplink_ultimate'
WHERE subscription_tier = 'uplink_unlimited';
