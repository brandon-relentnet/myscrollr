"""
Async Postgres database layer using asyncpg.

Rewritten schema:
  - yahoo_matchups rekeyed to (league_key, week) — matchups are league-wide
  - yahoo_user_leagues gains team_key — identifies which team the user owns
  - All JSONB columns store richer data (scores, injuries, ranks)
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import asyncpg

from encryption import decrypt, encrypt

log = logging.getLogger("yahoo-sync")


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

async def create_pool() -> asyncpg.Pool:
    """Create a connection pool, trying DATABASE_URL first, then individual vars."""
    database_url = os.environ.get("DATABASE_URL", "").strip().strip("'\"")

    if database_url:
        # Normalise scheme so asyncpg is happy
        if database_url.startswith("postgres:") and not database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres:", "postgres://", 1)
        elif database_url.startswith("postgresql:") and not database_url.startswith("postgresql://"):
            database_url = database_url.replace("postgresql:", "postgresql://", 1)

        return await asyncpg.create_pool(
            dsn=database_url,
            min_size=1,
            max_size=20,
            command_timeout=10,
        )

    host = os.environ["DB_HOST"]
    if host.startswith("db."):
        host = host[3:]
    port = int(os.environ["DB_PORT"])
    user = os.environ["DB_USER"]
    password = os.environ["DB_PASSWORD"]
    database = os.environ["DB_DATABASE"]

    return await asyncpg.create_pool(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        min_size=1,
        max_size=20,
        command_timeout=10,
    )


# ---------------------------------------------------------------------------
# Table creation — NEW SCHEMA
# ---------------------------------------------------------------------------

_CREATE_TABLES = """
CREATE TABLE IF NOT EXISTS yahoo_users (
    guid VARCHAR(100) PRIMARY KEY,
    logto_sub VARCHAR(255) UNIQUE,
    refresh_token TEXT NOT NULL,
    last_sync TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS yahoo_leagues (
    league_key VARCHAR(50) PRIMARY KEY,
    guid VARCHAR(100) NOT NULL REFERENCES yahoo_users(guid) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    game_code VARCHAR(10) NOT NULL,
    season VARCHAR(10) NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS yahoo_standings (
    league_key VARCHAR(50) PRIMARY KEY REFERENCES yahoo_leagues(league_key) ON DELETE CASCADE,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS yahoo_rosters (
    team_key VARCHAR(50) PRIMARY KEY,
    league_key VARCHAR(50) NOT NULL REFERENCES yahoo_leagues(league_key) ON DELETE CASCADE,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- REWRITTEN: matchups keyed by (league_key, week) instead of team_key.
-- Stores ALL matchups for a league/week, not just one team's.
CREATE TABLE IF NOT EXISTS yahoo_matchups (
    league_key VARCHAR(50) NOT NULL REFERENCES yahoo_leagues(league_key) ON DELETE CASCADE,
    week SMALLINT NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (league_key, week)
);

-- UPDATED: added team_key to identify which team the user owns in each league.
CREATE TABLE IF NOT EXISTS yahoo_user_leagues (
    guid VARCHAR(100) NOT NULL REFERENCES yahoo_users(guid) ON DELETE CASCADE,
    league_key VARCHAR(50) NOT NULL REFERENCES yahoo_leagues(league_key) ON DELETE CASCADE,
    team_key VARCHAR(50),
    team_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guid, league_key)
);
"""

# Migration statements to evolve the old schema to the new one.
# Each statement is idempotent (IF NOT EXISTS / IF EXISTS checks).
_MIGRATE_STATEMENTS = [
    # Add team_key column to yahoo_user_leagues if it doesn't exist
    """
    DO $$ BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'yahoo_user_leagues' AND column_name = 'team_key'
        ) THEN
            ALTER TABLE yahoo_user_leagues ADD COLUMN team_key VARCHAR(50);
        END IF;
    END $$;
    """,
    # Add team_name column to yahoo_user_leagues if it doesn't exist
    """
    DO $$ BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'yahoo_user_leagues' AND column_name = 'team_name'
        ) THEN
            ALTER TABLE yahoo_user_leagues ADD COLUMN team_name VARCHAR(255);
        END IF;
    END $$;
    """,
    # Migrate yahoo_matchups from old schema (PK=team_key) to new (PK=league_key,week).
    # We drop the old table if it has the wrong PK, then let CREATE TABLE IF NOT EXISTS
    # create the new one.  This is safe because matchup data is ephemeral (re-synced).
    """
    DO $$ BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'yahoo_matchups' AND column_name = 'team_key'
            AND table_schema = 'public'
        ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'yahoo_matchups' AND column_name = 'week'
            AND table_schema = 'public'
        ) THEN
            DROP TABLE yahoo_matchups;
        END IF;
    END $$;
    """,
]


async def create_tables(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        # Run migrations first (idempotent)
        for stmt in _MIGRATE_STATEMENTS:
            try:
                await conn.execute(stmt)
            except Exception as exc:
                log.warning("Migration statement warning: %s", exc)
        # Then create tables (IF NOT EXISTS)
        await conn.execute(_CREATE_TABLES)
    log.info("Database tables verified/created (v2 schema)")


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class YahooUser:
    guid: str
    logto_sub: str | None
    refresh_token: str  # plaintext (decrypted on read)
    last_sync: datetime | None
    created_at: datetime


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------

async def get_all_yahoo_users(pool: asyncpg.Pool) -> list[YahooUser]:
    """Fetch all yahoo_users and decrypt their refresh tokens."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT guid, logto_sub, refresh_token, last_sync, created_at "
            "FROM yahoo_users"
        )

    users: list[YahooUser] = []
    for row in rows:
        try:
            plaintext_token = decrypt(row["refresh_token"])
        except Exception as exc:
            log.error("Failed to decrypt token for user %s: %s", row["guid"], exc)
            continue

        users.append(YahooUser(
            guid=row["guid"],
            logto_sub=row["logto_sub"],
            refresh_token=plaintext_token,
            last_sync=row["last_sync"],
            created_at=row["created_at"],
        ))

    return users


async def get_yahoo_user_by_guid(pool: asyncpg.Pool, guid: str) -> YahooUser | None:
    """Fetch a single yahoo_user by GUID and decrypt the refresh token."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT guid, logto_sub, refresh_token, last_sync, created_at "
            "FROM yahoo_users WHERE guid = $1",
            guid,
        )

    if row is None:
        return None

    try:
        plaintext_token = decrypt(row["refresh_token"])
    except Exception as exc:
        log.error("Failed to decrypt token for user %s: %s", guid, exc)
        return None

    return YahooUser(
        guid=row["guid"],
        logto_sub=row["logto_sub"],
        refresh_token=plaintext_token,
        last_sync=row["last_sync"],
        created_at=row["created_at"],
    )


async def get_user_league_team_keys(
    pool: asyncpg.Pool,
    guid: str,
) -> dict[str, str | None]:
    """Return {league_key: team_key} for all leagues a user belongs to."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT league_key, team_key FROM yahoo_user_leagues WHERE guid = $1",
            guid,
        )
    return {row["league_key"]: row["team_key"] for row in rows}


# ---------------------------------------------------------------------------
# Upsert helpers
# ---------------------------------------------------------------------------

async def upsert_yahoo_user(
    pool: asyncpg.Pool,
    guid: str,
    logto_sub: str | None,
    refresh_token: str,
) -> None:
    """Upsert a yahoo_users row with an encrypted refresh token."""
    encrypted_token = encrypt(refresh_token)
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO yahoo_users (guid, logto_sub, refresh_token)
            VALUES ($1, $2, $3)
            ON CONFLICT (guid) DO UPDATE
            SET logto_sub = EXCLUDED.logto_sub,
                refresh_token = EXCLUDED.refresh_token
            """,
            guid,
            logto_sub,
            encrypted_token,
        )


async def upsert_yahoo_league(
    pool: asyncpg.Pool,
    guid: str,
    league_key: str,
    name: str,
    game_code: str,
    season: str,
    data: dict[str, Any],
) -> None:
    """Upsert a yahoo_leagues row."""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO yahoo_leagues (league_key, guid, name, game_code, season, data, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, CURRENT_TIMESTAMP)
            ON CONFLICT (league_key) DO UPDATE
            SET name = EXCLUDED.name,
                data = EXCLUDED.data,
                updated_at = CURRENT_TIMESTAMP
            """,
            league_key,
            guid,
            name,
            game_code,
            season,
            json.dumps(data),
        )


async def upsert_yahoo_standings(
    pool: asyncpg.Pool,
    league_key: str,
    data: list[dict],
) -> None:
    """Upsert a yahoo_standings row."""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO yahoo_standings (league_key, data, updated_at)
            VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
            ON CONFLICT (league_key) DO UPDATE
            SET data = EXCLUDED.data,
                updated_at = CURRENT_TIMESTAMP
            """,
            league_key,
            json.dumps(data),
        )


async def upsert_yahoo_matchups(
    pool: asyncpg.Pool,
    league_key: str,
    week: int,
    data: list[dict],
) -> None:
    """Upsert a yahoo_matchups row for a specific league + week."""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO yahoo_matchups (league_key, week, data, updated_at)
            VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
            ON CONFLICT (league_key, week) DO UPDATE
            SET data = EXCLUDED.data,
                updated_at = CURRENT_TIMESTAMP
            """,
            league_key,
            week,
            json.dumps(data),
        )


async def upsert_yahoo_roster(
    pool: asyncpg.Pool,
    team_key: str,
    league_key: str,
    data: dict,
) -> None:
    """Upsert a yahoo_rosters row."""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO yahoo_rosters (team_key, league_key, data, updated_at)
            VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
            ON CONFLICT (team_key) DO UPDATE
            SET data = EXCLUDED.data,
                updated_at = CURRENT_TIMESTAMP
            """,
            team_key,
            league_key,
            json.dumps(data),
        )


async def upsert_yahoo_user_league(
    pool: asyncpg.Pool,
    guid: str,
    league_key: str,
    team_key: str | None = None,
    team_name: str | None = None,
) -> None:
    """Record that a user is a member of a league, with their team_key."""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO yahoo_user_leagues (guid, league_key, team_key, team_name)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (guid, league_key) DO UPDATE
            SET team_key = COALESCE(EXCLUDED.team_key, yahoo_user_leagues.team_key),
                team_name = COALESCE(EXCLUDED.team_name, yahoo_user_leagues.team_name)
            """,
            guid,
            league_key,
            team_key,
            team_name,
        )


async def update_user_sync_time(pool: asyncpg.Pool, guid: str) -> None:
    """Update last_sync timestamp for a user."""
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE yahoo_users SET last_sync = CURRENT_TIMESTAMP WHERE guid = $1",
            guid,
        )
