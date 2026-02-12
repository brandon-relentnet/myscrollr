/**
 * Unified auth provider that merges Logto SDK auth with extension bridge auth.
 *
 * When the user logs in via the Scrollr browser extension, the extension relays
 * its access token to the website via a CustomEvent.  This provider stores
 * those "bridge tokens" so the website appears authenticated even though the
 * Logto React SDK has no active session.
 *
 * Consumers should use `useScrollrAuth()` instead of `useLogto()` for a
 * unified `isAuthenticated` / `getToken` / `signIn` / `signOut` surface.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLogto } from '@logto/react'
import type { IdTokenClaims } from '@logto/react'
import { notifyExtensionAuthLogout } from '@/api/client'

// ── Bridge token types ────────────────────────────────────────────

interface BridgeAuth {
  accessToken: string
  refreshToken: string | null
  expiresAt: number
  sub: string | null
}

const BRIDGE_STORAGE_KEY = 'scrollr:bridge-auth'

function saveBridge(bridge: BridgeAuth) {
  try {
    sessionStorage.setItem(BRIDGE_STORAGE_KEY, JSON.stringify(bridge))
  } catch {
    // Private browsing or quota exceeded — ignore
  }
}

function loadBridge(): BridgeAuth | null {
  try {
    const raw = sessionStorage.getItem(BRIDGE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as BridgeAuth
    // Discard expired bridge tokens
    if (parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(BRIDGE_STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function clearBridge() {
  try {
    sessionStorage.removeItem(BRIDGE_STORAGE_KEY)
  } catch {
    // ignore
  }
}

function extractSub(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.sub ?? null
  } catch {
    return null
  }
}

// ── Context shape ─────────────────────────────────────────────────

interface ScrollrAuthContextValue {
  /** True if authenticated via Logto SDK OR extension bridge tokens. */
  isAuthenticated: boolean
  /** True only while the Logto SDK is initialising. */
  isLoading: boolean
  /** 'logto' | 'bridge' | null */
  authSource: 'logto' | 'bridge' | null
  /** Initiate Logto sign-in redirect. */
  signIn: (redirectUri: string) => void
  /** Sign out of both Logto and bridge, and notify extension. */
  signOut: (postLogoutRedirectUri: string) => void
  /** Returns an access token from whichever source is active. */
  getAccessToken: (resource?: string) => Promise<string | null>
  /** Returns ID token claims (Logto only; bridge returns minimal). */
  getIdTokenClaims: () => Promise<IdTokenClaims | undefined>
}

const ScrollrAuthContext = createContext<ScrollrAuthContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────

const API_RESOURCE =
  import.meta.env.VITE_API_URL || 'https://api.myscrollr.relentnet.dev'

export function ScrollrAuthProvider({ children }: { children: ReactNode }) {
  const logto = useLogto()
  const [bridge, setBridge] = useState<BridgeAuth | null>(loadBridge)

  // Refs to avoid stale closures — the logto context object and bridge
  // state get new references on every internal state change, so we
  // store them in refs so callbacks below have stable identities.
  const logtoRef = useRef(logto)
  logtoRef.current = logto
  const bridgeRef = useRef(bridge)
  bridgeRef.current = bridge

  // ── Listen for extension auth events ──────────────────────────

  useEffect(() => {
    function handleExtLogin(e: Event) {
      const detail = (e as CustomEvent).detail as
        | {
            accessToken: string
            refreshToken: string | null
            expiresAt: number
          }
        | undefined
      if (!detail?.accessToken) return

      const newBridge: BridgeAuth = {
        accessToken: detail.accessToken,
        refreshToken: detail.refreshToken,
        expiresAt: detail.expiresAt,
        sub: extractSub(detail.accessToken),
      }
      saveBridge(newBridge)
      setBridge(newBridge)
    }

    function handleExtLogout() {
      clearBridge()
      setBridge(null)
      // If also authenticated via Logto, sign out of that too
      if (logtoRef.current.isAuthenticated) {
        logtoRef.current.signOut(window.location.origin)
      }
    }

    document.addEventListener('scrollr:ext-auth-login', handleExtLogin)
    document.addEventListener('scrollr:ext-auth-logout', handleExtLogout)

    return () => {
      document.removeEventListener('scrollr:ext-auth-login', handleExtLogin)
      document.removeEventListener('scrollr:ext-auth-logout', handleExtLogout)
    }
  }, [])

  // When Logto auth activates, clear bridge tokens (Logto takes priority)
  useEffect(() => {
    if (logto.isAuthenticated && bridge) {
      clearBridge()
      setBridge(null)
    }
  }, [logto.isAuthenticated, bridge])

  // ── Derived state ─────────────────────────────────────────────

  const logtoAuthed = logto.isAuthenticated
  const bridgeAuthed = bridge != null && bridge.expiresAt > Date.now()
  const isAuthenticated = logtoAuthed || bridgeAuthed
  const authSource: 'logto' | 'bridge' | null = logtoAuthed
    ? 'logto'
    : bridgeAuthed
      ? 'bridge'
      : null

  // ── Methods ───────────────────────────────────────────────────

  const signIn = useCallback((redirectUri: string) => {
    logtoRef.current.signIn(redirectUri)
  }, [])

  const signOut = useCallback((postLogoutRedirectUri: string) => {
    clearBridge()
    setBridge(null)
    notifyExtensionAuthLogout()
    logtoRef.current.signOut(postLogoutRedirectUri)
  }, [])

  const getAccessToken = useCallback(
    async (resource?: string): Promise<string | null> => {
      // Prefer Logto SDK token — read from refs for stable identity
      if (logtoRef.current.isAuthenticated) {
        const token = await logtoRef.current.getAccessToken(
          resource || API_RESOURCE,
        )
        return token ?? null
      }
      // Fall back to bridge token
      const currentBridge = bridgeRef.current
      if (currentBridge && currentBridge.expiresAt > Date.now()) {
        return currentBridge.accessToken
      }
      return null
    },
    [],
  )

  const getIdTokenClaims = useCallback(async (): Promise<
    IdTokenClaims | undefined
  > => {
    if (logtoRef.current.isAuthenticated) {
      return logtoRef.current.getIdTokenClaims()
    }
    // Bridge: construct minimal claims from JWT sub
    const currentBridge = bridgeRef.current
    if (currentBridge?.sub) {
      return { sub: currentBridge.sub } as IdTokenClaims
    }
    return undefined
  }, [])

  // ── Render ────────────────────────────────────────────────────

  const value: ScrollrAuthContextValue = {
    isAuthenticated,
    isLoading: logto.isLoading,
    authSource,
    signIn,
    signOut,
    getAccessToken,
    getIdTokenClaims,
  }

  return (
    <ScrollrAuthContext.Provider value={value}>
      {children}
    </ScrollrAuthContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────

export function useScrollrAuth(): ScrollrAuthContextValue {
  const ctx = useContext(ScrollrAuthContext)
  if (!ctx) {
    throw new Error('useScrollrAuth must be used within a ScrollrAuthProvider')
  }
  return ctx
}
