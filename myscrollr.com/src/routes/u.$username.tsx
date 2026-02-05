import { createFileRoute } from '@tanstack/react-router'
import { useLogto } from '@logto/react'
import { useEffect, useState } from 'react'
import { Shield, Link as LinkIcon, Check, AlertCircle, Loader2 } from 'lucide-react'
import { API_BASE } from '../api/client'

export const Route = createFileRoute('/u/$username')({
  component: ProfilePage,
})

interface ProfileData {
  username: string
  display_name?: string
  avatar?: string
  connected_yahoo: boolean
}

function ProfilePage() {
  const { username } = Route.useParams()
  const { isAuthenticated, getIdTokenClaims, getAccessToken } = useLogto()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [, setError] = useState<string | null>(null)
  const [isOwnProfile, setIsOwnProfile] = useState(false)

  useEffect(() => {
    async function loadProfile() {
      setLoading(true)
      setError(null)

      // Handle /u/me redirect - get username from ID Token
      if (username === 'me') {
        if (!isAuthenticated) {
          setLoading(false)
          return
        }

        try {
          const claims = await getIdTokenClaims()
          const logtoUsername = claims?.username

          if (logtoUsername) {
            window.location.href = `/u/${logtoUsername}`
            return
          }

          // No username in Logto - show error
          setError('No username found in your Logto account')
        } catch {
          setError('Failed to load profile')
        }
        setLoading(false)
        return
      }

      // Get current user's identity
      let ownUsername = ''
      let ownSub = ''
      if (isAuthenticated) {
        const claims = await getIdTokenClaims()
        ownUsername = claims?.username || ''
        ownSub = claims?.sub || ''
      }

      // Check if viewing own profile
      setIsOwnProfile(ownUsername === username || ownSub === username)

      // Build profile from Logto data
      const profileData: ProfileData = {
        username,
        display_name: ownUsername || username,
        avatar: '',
        connected_yahoo: false,
      }

      // Get Yahoo connection status from our API
      if (isAuthenticated) {
        try {
          const token = await getAccessToken('https://api.myscrollr.relentnet.dev')
          if (token) {
            const res = await fetch(`${API_BASE}/users/me/yahoo-status`, {
              headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
              const data = await res.json()
              profileData.connected_yahoo = data.connected || false
            }
          }
        } catch (err) {
          console.log('[Profile] Yahoo status error:', err)
        }
      }

      setProfile(profileData)
      setLoading(false)
    }

    loadProfile()
  }, [username, isAuthenticated])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-indigo-500" />
      </div>
    )
  }

  // Sign-in prompt for unauthenticated users
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
                <span className="px-2 py-1 bg-green-900/50 text-green-400 text-xs rounded-full flex items-center gap-1">
                  <Shield size={12} /> Public
                </span>
              </div>
              {profile.display_name && profile.display_name !== profile.username && (
                <p className="text-xl text-gray-300 mb-2">{profile.display_name}</p>
              )}
            </div>
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
                    <a href="/dashboard" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm">
                      Dashboard
                    </a>
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

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm">
          <p>Profile powered by Logto</p>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
