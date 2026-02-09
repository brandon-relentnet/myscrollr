import { useCallback, useRef } from 'react'
import { useLogto } from '@logto/react'
import { API_BASE } from '@/api/client'

/**
 * Returns a stable `getToken` function that fetches (and caches) a JWT
 * access token from Logto.  The cached token is reused as long as it has
 * more than 60 s of lifetime remaining, which avoids triggering Logto's
 * internal `setIsLoading` on every call.
 */
export function useGetToken() {
  const { getAccessToken } = useLogto()
  const tokenCacheRef = useRef<{ token: string; expiry: number } | null>(null)

  const getToken = useCallback(async (): Promise<string | null> => {
    const cached = tokenCacheRef.current
    if (cached && cached.expiry - Date.now() > 60_000) {
      return cached.token
    }

    const resource = API_BASE || 'https://api.myscrollr.relentnet.dev'
    const token = await getAccessToken(resource)
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
  }, [getAccessToken])

  return getToken
}
