/**
 * Desktop OAuth authentication via PKCE + localhost callback.
 *
 * Flow:
 * 1. Start a temporary HTTP server on 127.0.0.1:19284 (Rust command)
 * 2. Open Logto authorization URL in the system browser
 * 3. User logs in, Logto redirects to localhost callback
 * 4. Rust server captures the code, emits `auth-callback` event
 * 5. JS exchanges the code for tokens directly with Logto
 *
 * Reuses the extension's Logto app (public PKCE client).
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fetch } from "@tauri-apps/plugin-http";
import { open } from "@tauri-apps/plugin-shell";

// ── Constants ────────────────────────────────────────────────────

import {
  AUTH_ENDPOINT as LOGTO_ENDPOINT,
  LOGTO_APP_ID,
  API_BASE as API_RESOURCE,
  REDIRECT_URI,
  REFRESH_BUFFER_MS,
} from "./config";

// ── Types ────────────────────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

interface AuthState {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  userSub: string | null;
}

interface AuthCallbackPayload {
  code?: string | null;
  state?: string | null;
  error?: string | null;
}

// ── Storage ──────────────────────────────────────────────────────

const STORAGE_KEY = "scrollr:auth";

function loadAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthState) : null;
  } catch {
    return null;
  }
}

function saveAuth(state: AuthState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearAuth(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ── PKCE helpers ─────────────────────────────────────────────────

function generateRandomHex(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ── Token exchange (via Go API proxy) ────────────────────────────
// Uses the same /extension/token proxy the browser extension uses.
// The proxy makes the Logto request server-side, avoiding the Origin
// header validation that Logto enforces on direct client requests.

async function exchangeCode(
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const res = await fetch(`${API_RESOURCE}/extension/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  return res.json();
}

async function refreshTokenRequest(
  refreshToken: string,
): Promise<TokenResponse> {
  const res = await fetch(`${API_RESOURCE}/extension/token/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  return res.json();
}

// ── JWT decode ───────────────────────────────────────────────────

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split(".")[1];
    // base64url → base64: swap URL-safe chars and restore padding
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractSub(jwt: string): string | null {
  const payload = decodeJwtPayload(jwt);
  return (payload?.sub as string) ?? null;
}

/**
 * Extract the subscription tier from the JWT's `roles` claim.
 * Logto injects roles via Custom JWT (e.g. ["uplink_unlimited"]).
 *
 * Tier hierarchy: uplink_unlimited > uplink > free
 */
export type SubscriptionTier = "free" | "uplink" | "uplink_unlimited";

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Free",
  uplink: "Uplink",
  uplink_unlimited: "Uplink Unlimited",
};

export function getTier(): SubscriptionTier {
  const auth = loadAuth();
  if (!auth) return "free";

  const payload = decodeJwtPayload(auth.accessToken);
  if (!payload) return "free";

  const roles = Array.isArray(payload.roles)
    ? (payload.roles as string[])
    : [];

  if (roles.includes("uplink_unlimited")) return "uplink_unlimited";
  if (roles.includes("uplink")) return "uplink";
  return "free";
}

// ── Concurrency guard ────────────────────────────────────────────

let refreshPromise: Promise<string | null> | null = null;

// ── Public API ───────────────────────────────────────────────────

/**
 * Start the PKCE login flow:
 * 1. Start localhost callback server (Rust)
 * 2. Open Logto login in the system browser
 * 3. Wait for the callback with the auth code
 * 4. Exchange the code for tokens
 *
 * Returns the auth state on success, or null on failure/cancel.
 */
export async function login(): Promise<AuthState | null> {
  try {
    const codeVerifier = generateRandomHex(64);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateRandomHex(16);

    // Start the callback server (returns immediately, listens in background)
    await invoke("start_auth_server");

    // Build the authorization URL
    const params = new URLSearchParams({
      client_id: LOGTO_APP_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "openid profile email offline_access",
      resource: API_RESOURCE,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      prompt: "consent",
    });

    const authUrl = `${LOGTO_ENDPOINT}/oidc/auth?${params.toString()}`;

    // Open in system browser
    await open(authUrl);

    // Wait for the callback event from Rust
    const payload = await new Promise<AuthCallbackPayload>(
      (resolve, reject) => {
        let unlisten: (() => void) | null = null;
        let settled = false;

        const timer = setTimeout(() => {
          settled = true;
          unlisten?.();
          reject(new Error("Login timed out after 5 minutes"));
        }, 300_000);

        listen<AuthCallbackPayload>("auth-callback", (event) => {
          settled = true;
          clearTimeout(timer);
          unlisten?.();
          resolve(event.payload);
        }).then((fn) => {
          if (settled) {
            fn(); // already resolved/rejected — clean up immediately
          } else {
            unlisten = fn;
          }
        });
      },
    );

    if (payload.error || !payload.code) {
      throw new Error(payload.error ?? "No authorization code received");
    }

    // Validate state to prevent CSRF
    if (payload.state !== state) {
      throw new Error("State mismatch — possible CSRF attack");
    }

    // Exchange code for tokens
    const tokenRes = await exchangeCode(payload.code, codeVerifier);

    const authState: AuthState = {
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token ?? null,
      expiresAt: Date.now() + tokenRes.expires_in * 1000,
      userSub: extractSub(tokenRes.access_token),
    };

    saveAuth(authState);
    return authState;
  } catch (err) {
    console.error("[Scrollr] Login failed:", err);
    return null;
  }
}

/**
 * Get a valid access token, refreshing silently if near expiry.
 * Returns null if not authenticated or refresh fails.
 */
export async function getValidToken(): Promise<string | null> {
  const auth = loadAuth();
  if (!auth) return null;

  // Token still valid (with buffer)
  if (auth.expiresAt - Date.now() > REFRESH_BUFFER_MS) {
    return auth.accessToken;
  }

  // Need to refresh
  if (!auth.refreshToken) {
    clearAuth();
    return null;
  }

  // Mutex: only one refresh at a time
  if (!refreshPromise) {
    refreshPromise = doRefresh(auth.refreshToken).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function doRefresh(refreshToken: string): Promise<string | null> {
  try {
    const tokenRes = await refreshTokenRequest(refreshToken);

    const authState: AuthState = {
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token ?? null,
      expiresAt: Date.now() + tokenRes.expires_in * 1000,
      userSub: extractSub(tokenRes.access_token),
    };

    saveAuth(authState);
    return authState.accessToken;
  } catch {
    clearAuth();
    return null;
  }
}

/**
 * Check if the user has valid stored auth tokens.
 */
export function isAuthenticated(): boolean {
  const auth = loadAuth();
  return auth !== null && auth.expiresAt > Date.now();
}

/**
 * Extract user identity (email/name) from the stored access token JWT.
 * Returns null fields if no auth or claims not present.
 */
export function getUserIdentity(): { email: string | null; name: string | null } {
  const auth = loadAuth();
  if (!auth) return { email: null, name: null };
  const payload = decodeJwtPayload(auth.accessToken);
  if (!payload) return { email: null, name: null };
  return {
    email: (payload.email as string) ?? null,
    name: (payload.name as string) ?? null,
  };
}

/**
 * Clear all auth state (logout).
 */
export function logout(): void {
  clearAuth();
}
