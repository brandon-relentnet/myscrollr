import {
  LOGTO_ENDPOINT,
  LOGTO_APP_ID,
  LOGTO_RESOURCE,
} from '~/utils/constants';
import {
  authToken,
  authTokenExpiry,
  authRefreshToken,
} from '~/utils/storage';

// ── PKCE helpers ─────────────────────────────────────────────────

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── Token exchange ───────────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const response = await fetch(`${LOGTO_ENDPOINT}/oidc/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: LOGTO_APP_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      resource: LOGTO_RESOURCE,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<TokenResponse> {
  const response = await fetch(`${LOGTO_ENDPOINT}/oidc/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: LOGTO_APP_ID,
      refresh_token: refreshToken,
      resource: LOGTO_RESOURCE,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  return response.json();
}

// ── Auth expiry callback ──────────────────────────────────────────

type AuthExpiredCallback = () => void;
let onAuthExpired: AuthExpiredCallback | null = null;

export function setOnAuthExpired(cb: AuthExpiredCallback) {
  onAuthExpired = cb;
}

// ── Concurrency guards ────────────────────────────────────────────

/** Prevents concurrent token refresh requests. */
let refreshPromise: Promise<string | null> | null = null;

/** Prevents concurrent login flows. */
let loginPromise: Promise<boolean> | null = null;

// ── Public API ───────────────────────────────────────────────────

export async function login(): Promise<boolean> {
  // If a login is already in progress, return the existing promise
  if (loginPromise) return loginPromise;

  loginPromise = doLogin().finally(() => {
    loginPromise = null;
  });
  return loginPromise;
}

async function doLogin(): Promise<boolean> {
  try {
    const redirectUri = browser.identity.getRedirectURL();
    const codeVerifier = generateRandomString(64);
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    const params = new URLSearchParams({
      client_id: LOGTO_APP_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email offline_access',
      resource: LOGTO_RESOURCE,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
    });

    const authUrl = `${LOGTO_ENDPOINT}/oidc/auth?${params.toString()}`;

    // Open Logto login in a browser popup
    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });

    if (!responseUrl) {
      throw new Error('No response URL from auth flow');
    }

    // Extract the code from the redirect URL
    const url = new URL(responseUrl);
    const code = url.searchParams.get('code');

    if (!code) {
      const error = url.searchParams.get('error');
      throw new Error(`Auth failed: ${error || 'no code returned'}`);
    }

    // Exchange code for tokens
    const tokenResponse = await exchangeCodeForToken(
      code,
      redirectUri,
      codeVerifier,
    );

    // Store tokens
    await authToken.setValue(tokenResponse.access_token);
    await authTokenExpiry.setValue(
      Date.now() + tokenResponse.expires_in * 1000,
    );

    if (tokenResponse.refresh_token) {
      await authRefreshToken.setValue(tokenResponse.refresh_token);
    }

    return true;
  } catch (err) {
    console.error('[Scrollr] Login failed:', err);
    return false;
  }
}

export async function logout(): Promise<void> {
  await authToken.setValue(null);
  await authTokenExpiry.setValue(null);
  await authRefreshToken.setValue(null);
}

export async function getValidToken(): Promise<string | null> {
  const token = await authToken.getValue();
  if (!token) return null;

  const expiry = await authTokenExpiry.getValue();

  // If token expires in less than 60 seconds, try to refresh
  if (expiry && expiry - Date.now() < 60_000) {
    const refresh = await authRefreshToken.getValue();
    if (refresh) {
      // Use mutex to prevent concurrent refresh requests
      if (!refreshPromise) {
        refreshPromise = doRefresh(refresh).finally(() => {
          refreshPromise = null;
        });
      }
      return refreshPromise;
    }

    // No refresh token and expired, clear and notify
    await logout();
    onAuthExpired?.();
    return null;
  }

  return token;
}

async function doRefresh(refresh: string): Promise<string | null> {
  try {
    const tokenResponse = await refreshAccessToken(refresh);
    await authToken.setValue(tokenResponse.access_token);
    await authTokenExpiry.setValue(
      Date.now() + tokenResponse.expires_in * 1000,
    );
    if (tokenResponse.refresh_token) {
      await authRefreshToken.setValue(tokenResponse.refresh_token);
    }
    return tokenResponse.access_token;
  } catch {
    // Refresh failed, clear tokens and notify listeners
    await logout();
    onAuthExpired?.();
    return null;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getValidToken();
  return token != null;
}
