-- Core tables: user_channels, user_preferences, stripe_customers, stripe_webhook_events
CREATE TABLE IF NOT EXISTS user_channels (
    id              SERIAL PRIMARY KEY,
    logto_sub       TEXT NOT NULL,
    channel_type    TEXT NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    visible         BOOLEAN NOT NULL DEFAULT true,
    config          JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(logto_sub, channel_type)
);

CREATE TABLE IF NOT EXISTS user_preferences (
    logto_sub         TEXT PRIMARY KEY,
    feed_mode         TEXT NOT NULL DEFAULT 'comfort',
    feed_position     TEXT NOT NULL DEFAULT 'bottom',
    feed_behavior     TEXT NOT NULL DEFAULT 'overlay',
    feed_enabled      BOOLEAN NOT NULL DEFAULT true,
    enabled_sites     JSONB NOT NULL DEFAULT '[]',
    disabled_sites    JSONB NOT NULL DEFAULT '[]',
    subscription_tier TEXT NOT NULL DEFAULT 'free',
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stripe_customers (
    logto_sub              TEXT PRIMARY KEY,
    stripe_customer_id     TEXT UNIQUE NOT NULL,
    stripe_subscription_id TEXT,
    plan                   TEXT NOT NULL DEFAULT 'free',
    status                 TEXT NOT NULL DEFAULT 'active',
    current_period_end     TIMESTAMPTZ,
    lifetime               BOOLEAN NOT NULL DEFAULT false,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    event_id   TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
