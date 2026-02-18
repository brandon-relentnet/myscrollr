"""
Async Postgres database layer using asyncpg.

Table schemas and upsert functions mirror the former Rust service
(database.rs) exactly so the Go API can read the data unchanged.
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
# Table creation  (matches database.rs create_tables)
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

CREATE TABLE IF NOT EXISTS yahoo_matchups (
    team_key VARCHAR(50) PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
"""


async def create_tables(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute(_CREATE_TABLES)
    log.info("Database tables verified/created")


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


# ---------------------------------------------------------------------------
# Upsert helpers  (match database.rs upserts exactly)
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
    team_key: str,
    data: list[dict],
) -> None:
    """Upsert a yahoo_matchups row."""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO yahoo_matchups (team_key, data, updated_at)
            VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
            ON CONFLICT (team_key) DO UPDATE
            SET data = EXCLUDED.data,
                updated_at = CURRENT_TIMESTAMP
            """,
            team_key,
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


async def update_user_sync_time(pool: asyncpg.Pool, guid: str) -> None:
    """Update last_sync timestamp for a user."""
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE yahoo_users SET last_sync = CURRENT_TIMESTAMP WHERE guid = $1",
            guid,
        )
