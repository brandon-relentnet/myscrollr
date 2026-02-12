import { useCallback, useRef } from 'react'
import { useScrollrAuth } from '@/hooks/useScrollrAuth'

/**
 * Returns a stable `getToken` function that fetches (and caches) a JWT
 * access token from the unified auth provider (Logto SDK or extension
 * bridge tokens).  The cached token is reused as long as it has more than
 * 60 s of lifetime remaining, which avoids triggering Logto's internal
 * `setIsLoading` on every call.
 *
 * The returned `getToken` has a stable identity (never changes reference)
 * so it is safe to use in dependency arrays without causing re-renders.
 */
export function useGetToken() {
  const { getAccessToken } = useScrollrAuth()
  const tokenCacheRef = useRef<{ token: string; expiry: number } | null>(null)

  // Store getAccessToken in a ref so getToken's identity never changes.
  // getAccessToken is already stable (empty deps) from useScrollrAuth,
  // but this adds defense-in-depth.
  const getAccessTokenRef = useRef(getAccessToken)
  getAccessTokenRef.current = getAccessToken

  const getToken = useCallback(async (): Promise<string | null> => {
    const cached = tokenCacheRef.current
    if (cached && cached.expiry - Date.now() > 60_000) {
      return cached.token
    }

    const token = await getAccessTokenRef.current()
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        if (payload.exp) {
          tokenCacheRef.current = {
            token,
            expiry: payload.exp * 1000,
          }
        }
      } catch {
        // If decoding fails, don't cache
      }
    }

    return token ?? null
  }, [])

  return getToken
}
