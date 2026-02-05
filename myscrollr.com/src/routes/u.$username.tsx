import { createFileRoute } from '@tanstack/react-router'
import { useLogto } from '@logto/react'
import { useEffect, useState } from 'react'
import { AlertCircle, Check, Link as LinkIcon, Loader2, Shield } from 'lucide-react'
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

          // Fallback to sub if no username
          if (claims?.sub) {
             window.location.href = `/u/${claims.sub}`
             return
          }

          setError('No identity found in your Logto account')
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
      if (isAuthenticated && (ownUsername === username || ownSub === username)) {
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
  }, [username, isAuthenticated, getIdTokenClaims, getAccessToken])

  if (loading) {
    return (
      <div className="min-h-screen text-primary flex items-center justify-center font-mono">
        <div className="text-center space-y-4">
           <Loader2 className="animate-spin h-12 w-12 text-primary mx-auto" />
           <p className="uppercase tracking-[0.2em] text-xs">Accessing Identity_Logs...</p>
        </div>
      </div>
    )
  }

  // Sign-in prompt for unauthenticated users
  if (username === 'me' && !isAuthenticated) {
    return (
      <div className="min-h-screen text-base-content flex items-center justify-center p-6 font-mono">
        <div className="text-center space-y-6 max-w-md border border-base-300 p-12 rounded-lg bg-base-200 shadow-2xl">
          <AlertCircle className="h-16 w-16 text-warning mx-auto mb-4" />
          <h1 className="text-2xl font-bold tracking-[0.2em] uppercase">Auth Required</h1>
          <p className="text-base-content/60 uppercase text-xs leading-loose">Identity verification required to access private profile node.</p>
          <a href={`${window.location.origin}/callback`} className="btn btn-primary px-12">
            Sign In
          </a>
        </div>
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className="min-h-screen text-base-content pt-28 pb-20 px-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Profile Header */}
        <div className="bg-base-200 border border-base-300 rounded-xl p-10 shadow-2xl relative overflow-hidden">
          {/* Accent decoration */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full border-l border-b border-primary/10" />
          
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8 relative z-10 text-center md:text-left">
            <div className="h-28 w-28 rounded-xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-4xl font-black text-primary shadow-lg uppercase">
              {profile.username ? profile.username[0] : '?'}
            </div>
            <div className="flex-1 space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-center md:justify-start gap-3">
                  <h1 className="text-4xl font-black tracking-tight uppercase">@{profile.username}</h1>
                  <span className="px-3 py-1 bg-success/10 text-success text-[10px] font-bold rounded-full border border-success/20 flex items-center gap-1.5 uppercase tracking-widest">
                    <Shield size={12} /> Active
                  </span>
                </div>
                {profile.display_name && profile.display_name !== profile.username && (
                  <p className="text-xl text-base-content/60 font-medium">{profile.display_name}</p>
                )}
              </div>
              <div className="flex flex-wrap justify-center md:justify-start gap-2 pt-2">
                 <div className="px-3 py-1 bg-base-300 border border-base-300 rounded-md text-[10px] font-mono uppercase text-base-content/40">Status: Verified</div>
                 <div className="px-3 py-1 bg-base-300 border border-base-300 rounded-md text-[10px] font-mono uppercase text-base-content/40">Tier: Power_User</div>
              </div>
            </div>
          </div>
        </div>

        {/* Connected Accounts */}
        <div className="bg-base-200 border border-base-300 rounded-xl p-10 shadow-xl">
          <h2 className="text-xl font-black mb-8 flex items-center gap-3 uppercase tracking-tight">
            <LinkIcon size={24} className="text-primary" />
            Integration_Nodes
          </h2>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between p-6 bg-base-300/50 border border-base-300 rounded-lg gap-6 group hover:border-primary/20 transition-all">
              <div className="flex items-center gap-5">
                <div className="h-14 w-14 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary border border-secondary/20 shadow-inner group-hover:scale-105 transition-transform">
                  <span className="text-2xl font-black">Y!</span>
                </div>
                <div className="text-left">
                  <p className="font-bold text-lg uppercase tracking-tight">Yahoo Fantasy</p>
                  {profile.connected_yahoo ? (
                    <p className="text-xs text-success flex items-center gap-1.5 font-bold uppercase tracking-widest mt-1">
                      <Check size={14} strokeWidth={3} /> Connection Established
                    </p>
                  ) : (
                    <p className="text-xs text-base-content/30 font-bold uppercase tracking-widest mt-1">Status: Disconnected</p>
                  )}
                </div>
              </div>
              
              {isOwnProfile && (
                <div className="w-full sm:w-auto">
                  {profile.connected_yahoo ? (
                    <a href="/dashboard" className="btn btn-outline border-primary/30 text-primary hover:bg-primary hover:text-primary-content w-full sm:w-auto uppercase text-xs tracking-widest">
                      Enter Dashboard
                    </a>
                  ) : (
                    <a href="/dashboard" className="btn btn-primary w-full sm:w-auto uppercase text-xs tracking-widest shadow-lg">
                      Link Account
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-center gap-4 text-base-content/20 font-mono text-[10px] uppercase tracking-[0.3em] pt-4">
           <span className="h-px w-12 bg-current opacity-20" />
           <span>Security Provided by Logto OSS</span>
           <span className="h-px w-12 bg-current opacity-20" />
        </div>
      </div>
    </div>
  )
}

export default ProfilePage