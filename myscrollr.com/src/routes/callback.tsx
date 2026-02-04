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
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto mb-4" />
          <p>Redirecting...</p>
        </div>
      </div>
    )
  }

  return null
}
