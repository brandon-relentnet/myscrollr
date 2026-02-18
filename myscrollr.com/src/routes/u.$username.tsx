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
import { usePageMeta } from '@/lib/usePageMeta'

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
  usePageMeta({
    title: `${username} — Scrollr`,
    description: `View ${username}'s Scrollr profile and connected integrations.`,
    canonicalUrl: `https://myscrollr.com/u/${username}`,
  })
  const { isAuthenticated, signIn, getIdTokenClaims, getAccessToken } =
    useScrollrAuth()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
      <div className="min-h-screen text-primary flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="animate-spin h-12 w-12 text-primary mx-auto" />
          <p className="text-xs text-primary/60">Accessing Identity_Logs...</p>
        </div>
      </div>
    )
  }

  // Sign-in prompt for unauthenticated users
  if (username === 'me' && !isAuthenticated) {
    return (
      <div className="min-h-screen text-base-content flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="text-center space-y-6 max-w-md border border-base-300/50 p-12 rounded-xl bg-base-200/50"
        >
          <AlertCircle className="h-16 w-16 text-warning mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Auth Required</h1>
          <p className="text-base-content/60 text-xs leading-loose">
            Identity verification required to access private profile node.
          </p>
          <button
            type="button"
            onClick={() => signIn(`${window.location.origin}/callback`)}
            className="inline-flex items-center justify-center px-8 py-2.5 rounded-lg bg-primary text-primary-content text-[11px] font-semibold hover:brightness-110 transition-[filter] cursor-pointer"
          >
            Sign In
          </button>
        </motion.div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen text-base-content flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="text-center space-y-6 max-w-md border border-base-300/50 p-12 rounded-xl bg-base-200/50"
        >
          <AlertCircle className="h-16 w-16 text-error mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Profile Not Found</h1>
          <p className="text-base-content/60 text-xs leading-loose">
            {error || `Unable to load profile for @${username}.`}
          </p>
        </motion.div>
      </div>
    )
  }

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
          className="bg-base-200/50 border border-base-300/50 rounded-xl p-10 relative overflow-hidden"
        >
          {/* Accent decoration */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full border-l border-b border-primary/10" />

          <div className="flex flex-col md:flex-row items-center md:items-start gap-8 relative z-10 text-center md:text-left">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className="h-28 w-28 rounded-lg bg-primary/8 border border-primary/15 flex items-center justify-center text-4xl font-black text-primary uppercase"
            >
              {profile.username ? profile.username[0] : '?'}
            </motion.div>
            <div className="flex-1 space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-center md:justify-start gap-3">
                  <h1 className="text-4xl font-black tracking-tight">
                    @{profile.username}
                  </h1>
                  <span className="px-3 py-1 bg-success/10 text-success text-[10px] font-bold rounded-lg border border-success/20 flex items-center gap-1.5 uppercase tracking-wide">
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
                <div className="px-3 py-1 bg-base-300/50 border border-base-300/50 rounded-lg text-[10px] font-mono uppercase tracking-wide text-base-content/40">
                  Status: Verified
                </div>
                <div className="px-3 py-1 bg-base-300/50 border border-base-300/50 rounded-lg text-[10px] font-mono uppercase tracking-wide text-base-content/40">
                  Tier: Power_User
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Connected Accounts */}
        <motion.div
          variants={sectionVariants}
          className="bg-base-200/50 border border-base-300/50 rounded-xl p-10"
        >
          <h2 className="text-sm font-bold text-primary mb-8 flex items-center gap-2">
            <LinkIcon size={16} />
            Integration Nodes
          </h2>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between p-6 bg-base-300/50 border border-base-300/50 rounded-xl gap-6 group hover:border-primary/20 transition-colors">
              <div className="flex items-center gap-5">
                <div className="h-10 w-10 rounded-lg bg-secondary/8 flex items-center justify-center text-secondary border border-secondary/15">
                  <span className="text-lg font-black">Y!</span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold tracking-tight">
                    Yahoo Fantasy
                  </p>
                  {profile.connected_yahoo ? (
                    <p className="text-xs text-success flex items-center gap-1.5 font-bold uppercase tracking-wide mt-1">
                      <Check size={14} strokeWidth={3} /> Connection Established
                    </p>
                  ) : (
                    <p className="text-xs text-base-content/30 font-bold uppercase tracking-wide mt-1">
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
                      className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg border border-primary/30 text-primary text-[11px] font-semibold hover:bg-primary hover:text-primary-content transition-colors w-full sm:w-auto"
                    >
                      Enter Dashboard
                    </a>
                  ) : (
                    <a
                      href="/dashboard"
                      className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-primary text-primary-content text-[11px] font-semibold hover:brightness-110 transition-[filter] w-full sm:w-auto"
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
          className="flex items-center justify-center gap-4 text-base-content/20 text-[10px] uppercase tracking-wide pt-4"
        >
          <span className="h-px w-12 bg-current opacity-20" />
          <span>Security Provided by Logto OSS</span>
          <span className="h-px w-12 bg-current opacity-20" />
        </motion.div>
      </div>
    </motion.div>
  )
}
