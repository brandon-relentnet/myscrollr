import { createFileRoute } from '@tanstack/react-router'
import { useScrollrAuth } from '@/hooks/useScrollrAuth'
import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  Link as LinkIcon,
  Loader2,
  Shield,
} from 'lucide-react'
import { motion } from 'motion/react'
import { pageVariants, sectionVariants } from '@/lib/animations'
import { API_BASE, authenticatedFetch } from '@/api/client'

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
  const { isAuthenticated, getIdTokenClaims, getAccessToken } = useScrollrAuth()
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
      if (
        isAuthenticated &&
        (ownUsername === username || ownSub === username)
      ) {
        try {
          const getToken = async () => {
            const token = await getAccessToken(API_BASE)
            return token ?? null
          }
          const data = await authenticatedFetch<{ connected: boolean }>(
            '/users/me/yahoo-status',
            {},
            getToken,
          )
          profileData.connected_yahoo = data.connected || false
        } catch {
          // Yahoo status unavailable — leave connected_yahoo as false
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
          <p className="uppercase tracking-[0.2em] text-xs">
            Accessing Identity_Logs...
          </p>
        </div>
      </div>
    )
  }

  // Sign-in prompt for unauthenticated users
  if (username === 'me' && !isAuthenticated) {
    return (
      <div className="min-h-screen text-base-content flex items-center justify-center p-6 font-mono">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="text-center space-y-6 max-w-md border border-base-300/50 p-12 rounded-sm bg-base-200/50"
        >
          <AlertCircle className="h-16 w-16 text-warning mx-auto mb-4" />
          <h1 className="text-2xl font-bold tracking-[0.2em] uppercase">
            Auth Required
          </h1>
          <p className="text-base-content/60 uppercase text-xs leading-loose">
            Identity verification required to access private profile node.
          </p>
          <a
            href={`${window.location.origin}/callback`}
            className="inline-flex items-center justify-center px-8 py-2.5 rounded-sm bg-primary text-primary-content text-[11px] font-bold uppercase tracking-[0.15em] hover:brightness-110 transition-all"
          >
            Sign In
          </a>
        </motion.div>
      </div>
    )
  }

  if (!profile) return null

  return (
    <motion.div
      className="min-h-screen text-base-content pt-28 pb-20 px-6"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Profile Header */}
        <motion.div
          variants={sectionVariants}
          className="bg-base-200/50 border border-base-300/50 rounded-sm p-10 relative overflow-hidden"
        >
          {/* Accent decoration */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full border-l border-b border-primary/10" />

          <div className="flex flex-col md:flex-row items-center md:items-start gap-8 relative z-10 text-center md:text-left">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className="h-28 w-28 rounded-sm bg-primary/8 border border-primary/15 flex items-center justify-center text-4xl font-black text-primary uppercase"
            >
              {profile.username ? profile.username[0] : '?'}
            </motion.div>
            <div className="flex-1 space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-center md:justify-start gap-3">
                  <h1 className="text-4xl font-black tracking-tight uppercase">
                    @{profile.username}
                  </h1>
                  <span className="px-3 py-1 bg-success/10 text-success text-[10px] font-bold rounded-sm border border-success/20 flex items-center gap-1.5 uppercase tracking-widest">
                    <Shield size={12} /> Active
                  </span>
                </div>
                {profile.display_name &&
                  profile.display_name !== profile.username && (
                    <p className="text-sm text-base-content/40 font-medium">
                      {profile.display_name}
                    </p>
                  )}
              </div>
              <div className="flex flex-wrap justify-center md:justify-start gap-2 pt-2">
                <div className="px-3 py-1 bg-base-300/50 border border-base-300/50 rounded-sm text-[10px] font-mono uppercase text-base-content/40">
                  Status: Verified
                </div>
                <div className="px-3 py-1 bg-base-300/50 border border-base-300/50 rounded-sm text-[10px] font-mono uppercase text-base-content/40">
                  Tier: Power_User
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Connected Accounts */}
        <motion.div
          variants={sectionVariants}
          className="bg-base-200/50 border border-base-300/50 rounded-sm p-10"
        >
          <h2 className="text-sm font-bold uppercase tracking-widest text-primary mb-8 flex items-center gap-2">
            <LinkIcon size={16} />
            Integration Nodes
          </h2>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between p-6 bg-base-300/50 border border-base-300/50 rounded-sm gap-6 group hover:border-primary/20 transition-all">
              <div className="flex items-center gap-5">
                <div className="h-10 w-10 rounded-sm bg-secondary/8 flex items-center justify-center text-secondary border border-secondary/15">
                  <span className="text-lg font-black">Y!</span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold uppercase tracking-tight">
                    Yahoo Fantasy
                  </p>
                  {profile.connected_yahoo ? (
                    <p className="text-xs text-success flex items-center gap-1.5 font-bold uppercase tracking-widest mt-1">
                      <Check size={14} strokeWidth={3} /> Connection Established
                    </p>
                  ) : (
                    <p className="text-xs text-base-content/30 font-bold uppercase tracking-widest mt-1">
                      Status: Disconnected
                    </p>
                  )}
                </div>
              </div>

              {isOwnProfile && (
                <div className="w-full sm:w-auto">
                  {profile.connected_yahoo ? (
                    <a
                      href="/dashboard"
                      className="inline-flex items-center justify-center px-6 py-2.5 rounded-sm border border-primary/30 text-primary text-[11px] font-bold uppercase tracking-[0.15em] hover:bg-primary hover:text-primary-content transition-all w-full sm:w-auto"
                    >
                      Enter Dashboard
                    </a>
                  ) : (
                    <a
                      href="/dashboard"
                      className="inline-flex items-center justify-center px-6 py-2.5 rounded-sm bg-primary text-primary-content text-[11px] font-bold uppercase tracking-[0.15em] hover:brightness-110 transition-all w-full sm:w-auto"
                    >
                      Link Account
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Footer info */}
        <motion.div
          variants={sectionVariants}
          className="flex items-center justify-center gap-4 text-base-content/20 font-mono text-[10px] uppercase tracking-[0.3em] pt-4"
        >
          <span className="h-px w-12 bg-current opacity-20" />
          <span>Security Provided by Logto OSS</span>
          <span className="h-px w-12 bg-current opacity-20" />
        </motion.div>
      </div>
    </motion.div>
  )
}

