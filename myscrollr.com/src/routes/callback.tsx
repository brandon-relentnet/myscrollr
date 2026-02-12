import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useHandleSignInCallback, useLogto } from '@logto/react'
import { useRef } from 'react'
import { notifyExtensionAuthLogin } from '@/api/client'

const API_RESOURCE = import.meta.env.VITE_API_URL || 'https://api.myscrollr.relentnet.dev'

export const Route = createFileRoute('/callback')({
  component: Callback,
})

function Callback() {
  const navigate = useNavigate()
  const { getAccessToken } = useLogto()
  const notifiedRef = useRef(false)

  const { isLoading, error } = useHandleSignInCallback(() => {
    // After Logto callback completes, get the access token and notify
    // the extension so it can sync auth without a separate PKCE flow.
    if (!notifiedRef.current) {
      notifiedRef.current = true
      getAccessToken(API_RESOURCE)
        .then((token) => {
          if (token) {
            try {
              const payload = JSON.parse(atob(token.split('.')[1]))
              const expiresAt = payload.exp ? payload.exp * 1000 : Date.now() + 3600_000
              // Note: Logto React SDK doesn't expose the refresh token,
              // so we pass null.  The extension will use the access token
              // until it expires, then gracefully fall back to anonymous.
              notifyExtensionAuthLogin(token, null, expiresAt)
            } catch {
              notifyExtensionAuthLogin(token, null, Date.now() + 3600_000)
            }
          }
        })
        .catch(() => {
          // Token fetch failed — non-critical, extension just won't sync
        })
    }

    navigate({ to: '/dashboard' })
  })

  if (isLoading) {
    return (
      <div className="min-h-screen text-base-content flex items-center justify-center font-mono">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4" />
          <p className="uppercase tracking-[0.2em] text-primary animate-pulse">
            Establishing Secure Session...
          </p>
          <p className="text-[10px] opacity-40 uppercase">
            Redirecting to master control
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen text-base-content flex items-center justify-center font-mono">
        <div className="text-center space-y-4 max-w-md">
          <div className="h-12 w-12 rounded-full border-2 border-error flex items-center justify-center mx-auto mb-4">
            <span className="text-error text-xl">!</span>
          </div>
          <p className="uppercase tracking-[0.2em] text-error">
            Authentication Failed
          </p>
          <p className="text-xs text-base-content/50">{error.message}</p>
          <button
            onClick={() => navigate({ to: '/dashboard' })}
            className="btn btn-primary btn-sm mt-4"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return null
}
