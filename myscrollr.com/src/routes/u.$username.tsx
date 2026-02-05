import { createFileRoute } from '@tanstack/react-router'
import { useLogto } from '@logto/react'
import { useEffect, useState } from 'react'
import { Settings, Shield, Link as LinkIcon, Check, AlertCircle, Loader2 } from 'lucide-react'
import { API_BASE } from '../api/client'

export const Route = createFileRoute('/u/$username')({
  component: ProfilePage,
})

interface ProfileData {
  username: string
  display_name?: string
  bio?: string
  is_public: boolean
  connected_yahoo: boolean
  last_sync?: string
}

function ProfilePage() {
  const { username } = Route.useParams()
  const { isAuthenticated, getIdTokenClaims, getAccessToken } = useLogto()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOwnProfile, setIsOwnProfile] = useState(false)

  // Settings form state
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    display_name: '',
    bio: '',
    is_public: true,
  })
  const [usernameForm, setUsernameForm] = useState('')
  const [usernameSaving, setUsernameSaving] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchProfile() {
      setLoading(true)
      setError(null)

      // Handle /u/me redirect - fetch user profile and redirect
      if (username === 'me') {
        if (!isAuthenticated) {
          setLoading(false)
          return
        }

        try {
          // Pass resource to get a JWT access token, not opaque token
          const token = await getAccessToken('https://api.myscrollr.relentnet.dev')
          if (!token) {
            console.log('[Profile] No access token received from Logto')
            setError('Not authenticated')
            setLoading(false)
            return
          }
          // Debug: log token format
          const segments = token.split('.')
          console.log('[Profile] Token received:', {
            has3Segments: segments.length === 3,
            length: token.length,
            prefix: token.substring(0, 20) + '...'
          })
          if (segments.length !== 3) {
            setError('Invalid token format - please sign out and sign in again')
            setLoading(false)
            return
          }
          // Fetch user profile to get their username
          const res = await fetch(`${API_BASE}/users/me/profile`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          console.log('[Profile] API response:', res.status, res.statusText)
          if (res.ok) {
            const data = await res.json()
            console.log('[Profile] Response data:', data)
            // Set the profile from API response
            setProfile({
              username: data.username || '',
              display_name: data.display_name || '',
              bio: data.bio || '',
              is_public: data.is_public ?? true,
              connected_yahoo: data.connected_yahoo ?? false,
            })
            setIsOwnProfile(true)

            if (data.username) {
              // Redirect to actual username
              window.location.href = `/u/${data.username}`
              return
            }
            // No username set yet - stay on /u/me to show setup UI
            setLoading(false)
            return
          } else {
            const errData = await res.json().catch(() => ({}))
            console.log('[Profile] API error:', errData)
            setError(errData.error || 'Failed to load profile')
            setLoading(false)
            return
          }
        } catch {
          setError('Failed to load profile')
        }
        setLoading(false)
        return
      }

      // Fetch public profile by username
      try {
        const res = await fetch(`${API_BASE}/users/${username}`)
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Profile not found' }))
          throw new Error(err.error || 'Profile not found')
        }
        const data = await res.json()
        setProfile(data)

        // Check if this is the current user's profile
        if (isAuthenticated) {
          const claims = await getIdTokenClaims()
          if (claims?.sub && claims.username === username) {
            setIsOwnProfile(true)
            setFormData({
              display_name: data.display_name || '',
              bio: data.bio || '',
              is_public: data.is_public,
            })
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [username, isAuthenticated])

  const handleSaveSettings = async () => {
    if (!isAuthenticated) return
    setSaving(true)
    setError(null)

    try {
      const token = await getAccessToken('https://api.myscrollr.relentnet.dev')

      const res = await fetch(`${API_BASE}/users/me/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
      setProfile(prev => prev ? { ...prev, ...formData } : null)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleSetUsername = async () => {
    if (!isAuthenticated || !usernameForm || usernameForm.length < 3) {
      setUsernameError('Username must be at least 3 characters')
      return
    }

    setUsernameSaving(true)
    setUsernameError(null)

    try {
      const token = await getAccessToken('https://api.myscrollr.relentnet.dev')

      const res = await fetch('${API_BASE}/users/me/username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: usernameForm }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to set username')
      }
      // Redirect to new profile
      window.location.href = `/u/${usernameForm}`
    } catch (err) {
      setUsernameError(err instanceof Error ? err.message : 'Failed to set username')
    } finally {
      setUsernameSaving(false)
    }
  }

  const handleDisconnectYahoo = async () => {
    if (!isAuthenticated) return
    if (!confirm('Are you sure you want to disconnect your Yahoo account?')) return

    try {
      const token = await getAccessToken('https://api.myscrollr.relentnet.dev')

      const res = await fetch('${API_BASE}/users/me/disconnect/yahoo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to disconnect')
      }
      setProfile(prev => prev ? { ...prev, connected_yahoo: false } : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect Yahoo')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-indigo-500" />
      </div>
    )
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Profile Not Found</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          {isAuthenticated && (
            <a href="/dashboard" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-8 rounded-xl transition-all">
              Go to Dashboard
            </a>
          )}
        </div>
      </div>
    )
  }

  // Show sign-in prompt for unauthenticated /u/me
  if (username === 'me' && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Sign In Required</h1>
          <p className="text-gray-400 mb-6">Sign in to view your profile</p>
          <a href={`${window.location.origin}/callback`} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-8 rounded-xl transition-all">
            Sign In
          </a>
        </div>
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Profile Header */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 mb-6">
          <div className="flex items-start gap-6">
            <div className="h-24 w-24 rounded-full bg-indigo-600 flex items-center justify-center text-3xl font-bold">
              {profile.username ? profile.username[0].toUpperCase() : '?'}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold">@{profile.username}</h1>
                {profile.is_public ? (
                  <span className="px-2 py-1 bg-green-900/50 text-green-400 text-xs rounded-full flex items-center gap-1">
                    <Shield size={12} /> Public
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded-full flex items-center gap-1">
                    <Shield size={12} /> Private
                  </span>
                )}
              </div>
              {profile.display_name && (
                <p className="text-xl text-gray-300 mb-2">{profile.display_name}</p>
              )}
              {profile.bio && (
                <p className="text-gray-400">{profile.bio}</p>
              )}
            </div>
            {isOwnProfile && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Settings size={18} />
                Edit Profile
              </button>
            )}
          </div>
        </div>

        {/* Connected Accounts */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 mb-6">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <LinkIcon size={20} className="text-indigo-500" />
            Connected Accounts
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-800 rounded-xl">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-purple-600 flex items-center justify-center">
                  <span className="text-xl font-bold">Y!</span>
                </div>
                <div>
                  <p className="font-medium">Yahoo Fantasy</p>
                  {profile.connected_yahoo ? (
                    <p className="text-sm text-green-400 flex items-center gap-1">
                      <Check size={14} /> Connected
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400">Not connected</p>
                  )}
                </div>
              </div>
              {isOwnProfile && (
                <div>
                  {profile.connected_yahoo ? (
                    <button
                      onClick={handleDisconnectYahoo}
                      className="px-4 py-2 bg-red-900/50 text-red-400 hover:bg-red-900 rounded-lg transition-colors text-sm"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <a href="/dashboard" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm">
                      Connect
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Not your profile message */}
        {!isOwnProfile && isAuthenticated && (
          <div className="text-center py-8">
            <p className="text-gray-400 mb-4">This is {profile.username}&apos;s profile</p>
          </div>
        )}

        {/* Not authenticated message */}
        {!isAuthenticated && (
          <div className="text-center py-8">
            <p className="text-gray-400 mb-4">
              <a href={`${window.location.origin}/callback`} className="text-indigo-400 hover:text-indigo-300">
                Sign in
              </a> to view your own profile
            </p>
          </div>
        )}
      </div>

      {/* Edit Profile Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-6">Edit Profile</h2>

            {/* Username section - show if no username yet */}
            {!profile?.username && (
              <div className="mb-6 p-4 bg-indigo-900/30 border border-indigo-500/30 rounded-xl">
                <p className="text-sm text-indigo-300 mb-3">
                  Set your username to create your profile URL (e.g., /u/yourname)
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={usernameForm}
                    onChange={(e) => setUsernameForm(e.target.value)}
                    placeholder="username"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                  />
                  <button
                    onClick={handleSetUsername}
                    disabled={usernameSaving}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {usernameSaving ? 'Saving...' : 'Set'}
                  </button>
                </div>
                {usernameError && (
                  <p className="text-red-400 text-sm mt-2">{usernameError}</p>
                )}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  placeholder="Your Name"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Bio</label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="Tell us about yourself..."
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white resize-none"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_public"
                  checked={formData.is_public}
                  onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                  className="h-5 w-5 rounded bg-gray-800 border-gray-700"
                />
                <label htmlFor="is_public" className="text-sm text-gray-300">
                  Make profile public
                </label>
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={() => setEditing(false)}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProfilePage
