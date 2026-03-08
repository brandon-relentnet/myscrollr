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

const LOGTO_ENDPOINT = "https://auth.myscrollr.relentnet.dev";
const LOGTO_APP_ID = "kq298uwwusrvw8m6yn6b4";
const API_RESOURCE = "https://api.myscrollr.relentnet.dev";
const REDIRECT_URI = "http://127.0.0.1:19284/callback";
const REFRESH_BUFFER_MS = 60_000; // Refresh 60s before expiry

// ── Types ────────────────────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface AuthState {
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

// ── Token exchange (direct with Logto) ───────────────────────────

async function exchangeCode(
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const res = await fetch(`${LOGTO_ENDPOINT}/oidc/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: LOGTO_APP_ID,
      redirect_uri: REDIRECT_URI,
      code,
      code_verifier: codeVerifier,
      resource: API_RESOURCE,
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
  const res = await fetch(`${LOGTO_ENDPOINT}/oidc/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: LOGTO_APP_ID,
      refresh_token: refreshToken,
      resource: API_RESOURCE,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  return res.json();
}

// ── JWT decode ───────────────────────────────────────────────────

function extractSub(jwt: string): string | null {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1]));
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
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

        const timer = setTimeout(() => {
          unlisten?.();
          reject(new Error("Login timed out after 5 minutes"));
        }, 300_000);

        listen<AuthCallbackPayload>("auth-callback", (event) => {
          clearTimeout(timer);
          unlisten?.();
          resolve(event.payload);
        }).then((fn) => {
          unlisten = fn;
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
 * Get the current auth state without refreshing.
 */
export function getAuth(): AuthState | null {
  return loadAuth();
}

/**
 * Clear all auth state (logout).
 */
export function logout(): void {
  clearAuth();
}
