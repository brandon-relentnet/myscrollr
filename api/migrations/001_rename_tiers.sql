-- Rename uplink_unlimited → uplink_ultimate in user_preferences
-- Run once after deploying the code changes. Idempotent if run multiple times.
UPDATE user_preferences
SET subscription_tier = 'uplink_ultimate'
WHERE subscription_tier = 'uplink_unlimited';

-- Rename old plan names in stripe_customers to match new naming
UPDATE stripe_customers SET plan = 'ultimate_monthly' WHERE plan = 'unlimited_monthly';
UPDATE stripe_customers SET plan = 'ultimate_annual' WHERE plan = 'unlimited_annual';
UPDATE stripe_customers SET plan = 'ultimate_quarterly' WHERE plan = 'unlimited_quarterly';
UPDATE stripe_customers SET plan = 'annual' WHERE plan = 'legacy_annual';
UPDATE stripe_customers SET plan = 'monthly' WHERE plan = 'legacy_monthly';
UPDATE stripe_customers SET plan = 'quarterly' WHERE plan = 'legacy_quarterly';
