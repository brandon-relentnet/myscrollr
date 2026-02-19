"""
Yahoo Fantasy sync service entry point.

Exposes a /health endpoint on port 3003 (FastAPI + uvicorn) and runs the
background sync loop concurrently. Handles graceful shutdown via SIGINT/SIGTERM.

Replaces the former Rust service (main.rs + lib.rs).
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse

import database as db
from sync import run_sync_loop

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger("yahoo-sync")

# ---------------------------------------------------------------------------
# State shared between the health endpoint and the sync loop
# ---------------------------------------------------------------------------

_startup_time = datetime.now(timezone.utc)
_sync_task: asyncio.Task | None = None
_shutdown_event = asyncio.Event()
_pool: db.asyncpg.Pool | None = None

# Health tracking (mirrors Rust YahooHealth)
_health = {
    "status": "healthy",
    "oauth_status": "no_token",
    "last_api_call": None,
    "successful_calls": 0,
    "error_count": 0,
    "last_error": None,
}


# ---------------------------------------------------------------------------
# FastAPI app with lifespan
# ---------------------------------------------------------------------------

def _on_sync_task_done(task: asyncio.Task) -> None:
    """Callback attached to the sync background task so exceptions are never silent."""
    try:
        exc = task.exception()
    except asyncio.CancelledError:
        log.info("Sync task was cancelled")
        return
    if exc is not None:
        log.error("Sync task crashed with unhandled exception: %s", exc, exc_info=exc)


def _check_required_env(name: str) -> str:
    """Return the env var value or log a FATAL-level message and raise."""
    val = os.environ.get(name, "")
    if not val:
        msg = f"Required environment variable {name} is missing or empty"
        log.error(msg)
        raise RuntimeError(msg)
    return val


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create DB pool, tables, and launch sync loop. Shutdown: clean up."""
    global _pool, _sync_task

    log.info("Yahoo Worker Service starting...")

    # Validate required env vars BEFORE creating the task so failures are loud
    try:
        _check_required_env("YAHOO_CLIENT_ID")
        _check_required_env("YAHOO_CLIENT_SECRET")
        _check_required_env("ENCRYPTION_KEY")
        log.info("Required env vars validated (YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, ENCRYPTION_KEY)")
    except RuntimeError as exc:
        log.error("Cannot start sync loop — %s", exc)
        # Still yield so the health endpoint runs (reports unhealthy)
        _health["status"] = "unhealthy"
        _health["last_error"] = str(exc)
        yield
        return

    # Create DB pool and ensure tables exist
    _pool = await db.create_pool()
    await db.create_tables(_pool)

    # Start the background sync loop with exception logging
    _sync_task = asyncio.create_task(run_sync_loop(_pool, _shutdown_event))
    _sync_task.add_done_callback(_on_sync_task_done)

    yield

    # Shutdown
    log.info("Yahoo Worker Service shutting down...")
    _shutdown_event.set()

    if _sync_task and not _sync_task.done():
        _sync_task.cancel()
        try:
            await _sync_task
        except asyncio.CancelledError:
            pass

    if _pool:
        await _pool.close()

    log.info("Yahoo Worker Service shut down gracefully")


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)


@app.get("/health")
async def health():
    """Health check endpoint consumed by the Go API's ProxyInternalHealth."""
    return JSONResponse(content=_health)


# ---------------------------------------------------------------------------
# Signal handling for graceful shutdown
# ---------------------------------------------------------------------------

def _handle_signal(sig, frame):
    log.info("Received signal %s, initiating shutdown...", sig)
    _shutdown_event.set()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # Register signal handlers
    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    port = int(os.environ.get("PORT", "3003"))
    log.info("Yahoo Health Server will listen on 0.0.0.0:%d", port)

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info",
        # Let our own signal handler manage shutdown
        timeout_graceful_shutdown=5,
    )


if __name__ == "__main__":
    main()
