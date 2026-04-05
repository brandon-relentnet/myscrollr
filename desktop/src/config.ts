/**
 * Centralized configuration for the desktop app.
 *
 * API endpoints are configurable via VITE_API_URL env var (set in
 * .env or passed at build time). Auth and app-wide constants are
 * compile-time values — swap via this file when targeting a
 * different environment.
 */

// ── API ─────────────────────────────────────────────────────────

const DEFAULT_API = "https://api.myscrollr.relentnet.dev";
export const API_BASE = import.meta.env.VITE_API_URL ?? DEFAULT_API;
export const API_HOST = new URL(API_BASE).host;

// ── Auth (Logto PKCE) ───────────────────────────────────────────

export const AUTH_ENDPOINT = "https://auth.myscrollr.relentnet.dev";
export const LOGTO_APP_ID = "kq298uwwusrvw8m6yn6b4";
export const REDIRECT_URI = "http://127.0.0.1:19284/callback";
export const REFRESH_BUFFER_MS = 60_000;
