import { createFileRoute } from '@tanstack/react-router'
import { useNavigate } from '@tanstack/react-router'
import { useHandleSignInCallback } from '@logto/react'

export const Route = createFileRoute('/callback')({
  component: Callback,
})

function Callback() {
  const navigate = useNavigate()

  const { isLoading } = useHandleSignInCallback(() => {
    // Navigate to root when sign-in completes
    navigate({ to: '/' })
  })

  if (isLoading) {
    return (
      <div className="min-h-screen text-base-content flex items-center justify-center font-mono">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4" />
          <p className="uppercase tracking-[0.2em] text-primary animate-pulse">Establishing Secure Session...</p>
          <p className="text-[10px] opacity-40 uppercase">Redirecting to master control</p>
        </div>
      </div>
    )
  }

  return null
}
