import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useHandleSignInCallback } from '@logto/react'

export const Route = createFileRoute('/callback')({
  component: Callback,
})

function Callback() {
  const navigate = useNavigate()

  const { isLoading, error } = useHandleSignInCallback(() => {
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
          <p className="text-xs text-base-content/50">
            {error.message}
          </p>
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
