import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Eye, EyeOff, Shield } from 'lucide-react'
import { useLogto } from '@logto/react'
import type { FormEvent } from 'react'
import { inviteApi } from '@/api/client'

export const Route = createFileRoute('/invite')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || '',
    email: (search.email as string) || '',
  }),
  component: InvitePage,
})

type PageState = 'form' | 'submitting' | 'signing-in' | 'error'

function InvitePage() {
  const { token, email } = Route.useSearch()
  const { signIn } = useLogto()

  const [state, setState] = useState<PageState>(
    token && email ? 'form' : 'error',
  )
  const [error, setError] = useState(
    !token || !email ? 'Invalid invite link — missing token or email.' : '',
  )

  const [birthday, setBirthday] = useState('')
  const [gender, setGender] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      setState('error')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      setState('error')
      return
    }
    if (!birthday) {
      setError('Birthday is required.')
      setState('error')
      return
    }
    if (!gender) {
      setError('Please select a gender.')
      setState('error')
      return
    }

    setState('submitting')
    setError('')

    try {
      await inviteApi.completeInvite({
        email,
        token,
        password,
        birthday,
        gender,
      })

      setState('signing-in')

      // Store return path so callback redirects to /account
      sessionStorage.setItem('scrollr:returnTo', '/account')

      const callbackUrl = `${window.location.origin}/callback`
      await signIn({
        redirectUri: callbackUrl,
        extraParams: {
          one_time_token: token,
          login_hint: email,
        },
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong'
      setError(message)
      setState('error')
    }
  }

  if (state === 'signing-in') {
    return (
      <div className="min-h-screen text-base-content flex items-center justify-center font-mono">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4" />
          <p className="uppercase tracking-[0.2em] text-primary animate-pulse">
            Signing you in...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-base-content flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to MyScrollr</h1>
          <p className="text-base-content/60 text-sm">
            You&apos;ve been invited as a{' '}
            <span className="text-primary font-semibold">Super User</span>.
            Complete your profile to get started.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-base-200/50 border border-base-300 rounded-2xl p-6 space-y-5">
          {/* Email (read-only) */}
          <div>
            <label className="block text-xs font-medium text-base-content/50 uppercase tracking-wider mb-1.5">
              Email
            </label>
            <div className="px-3 py-2 bg-base-300/50 rounded-lg text-sm text-base-content/70">
              {email}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Birthday */}
            <div>
              <label
                htmlFor="birthday"
                className="block text-xs font-medium text-base-content/50 uppercase tracking-wider mb-1.5"
              >
                Birthday
              </label>
              <input
                id="birthday"
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                required
                className="w-full px-3 py-2 bg-base-300/50 border border-base-300 rounded-lg text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            {/* Gender */}
            <div>
              <label
                htmlFor="gender"
                className="block text-xs font-medium text-base-content/50 uppercase tracking-wider mb-1.5"
              >
                Gender
              </label>
              <select
                id="gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                required
                className="w-full px-3 py-2 bg-base-300/50 border border-base-300 rounded-lg text-sm focus:outline-none focus:border-primary transition-colors"
              >
                <option value="">Select...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non-binary">Non-binary</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-base-content/50 uppercase tracking-wider mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  className="w-full px-3 py-2 pr-10 bg-base-300/50 border border-base-300 rounded-lg text-sm focus:outline-none focus:border-primary transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content/70 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label
                htmlFor="confirm-password"
                className="block text-xs font-medium text-base-content/50 uppercase tracking-wider mb-1.5"
              >
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Re-enter your password"
                  className="w-full px-3 py-2 pr-10 bg-base-300/50 border border-base-300 rounded-lg text-sm focus:outline-none focus:border-primary transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content/70 transition-colors"
                >
                  {showConfirm ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Error message */}
            {state === 'error' && error && (
              <div className="px-3 py-2 bg-error/10 border border-error/20 rounded-lg text-sm text-error">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={state === 'submitting'}
              className="w-full py-2.5 bg-primary text-primary-content font-medium rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {state === 'submitting'
                ? 'Setting up your account...'
                : 'Complete Setup'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
