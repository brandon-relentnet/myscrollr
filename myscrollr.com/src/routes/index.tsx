import { createFileRoute } from '@tanstack/react-router'
import { useLogto, type IdTokenClaims } from '@logto/react'
import { useEffect, useState } from 'react'
import { ArrowRight, TrendingUp, Trophy, BarChart3, User } from 'lucide-react'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const { isAuthenticated, isLoading, signIn, getIdTokenClaims } = useLogto()
  const [userClaims, setUserClaims] = useState<IdTokenClaims>()

  useEffect(() => {
    if (isAuthenticated) {
      getIdTokenClaims().then(setUserClaims)
    }
  }, [isAuthenticated, getIdTokenClaims])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500" />
      </div>
    )
  }

  if (isAuthenticated) {
    return <AuthenticatedHome user={userClaims} />
  }

  const handleSignIn = () => {
    signIn(`${window.location.origin}/callback`)
  }

  return <PublicHome onLogin={handleSignIn} />
}

function PublicHome({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-20">
          <h1 className="text-6xl font-bold mb-6">
            All your <span className="text-indigo-500">data</span>, <br />
            one dashboard
          </h1>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
            Track finance, sports, and fantasy leagues in real-time.
            Connect your accounts and stay ahead.
          </p>
          <button
            onClick={onLogin}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 px-8 rounded-xl transition-all shadow-lg shadow-indigo-500/25"
          >
            Get Started
            <ArrowRight size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<TrendingUp className="text-green-400" />}
            title="Real-time Finance"
            description="Stock and crypto prices from Finnhub with live updates"
          />
          <FeatureCard
            icon={<Trophy className="text-orange-400" />}
            title="Sports Scores"
            description="Live scores across NFL, NBA, NHL, and more"
          />
          <FeatureCard
            icon={<BarChart3 className="text-blue-400" />}
            title="Fantasy Integration"
            description="Connect Yahoo Fantasy Sports for complete insights"
          />
        </div>
      </div>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl hover:border-gray-700 transition-colors">
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  )
}

function AuthenticatedHome({ user }: { user?: IdTokenClaims }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Welcome back!</h1>
            <p className="text-gray-400 mt-2">Your personalized dashboard is ready.</p>
          </div>
          {user && (
            <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2">
              <User size={18} className="text-gray-400" />
              <div className="text-sm">
                <div className="font-medium">{user.name || user.email}</div>
                {user.email && user.name && (
                  <div className="text-gray-500 text-xs">{user.email}</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <DashboardCard title="Finance" link="/dashboard?tab=finance" />
          <DashboardCard title="Sports" link="/dashboard?tab=sports" />
          <DashboardCard title="Fantasy" link="/dashboard?tab=fantasy" />
        </div>
      </div>
    </div>
  )
}

function DashboardCard({ title, link }: { title: string; link: string }) {
  return (
    <a
      href={link}
      className="block bg-gray-900 border border-gray-800 p-8 rounded-2xl hover:border-indigo-500 transition-all group"
    >
      <h3 className="text-xl font-semibold group-hover:text-indigo-400 transition-colors">
        {title}
      </h3>
      <p className="text-gray-400 mt-2 text-sm">View your {title.toLowerCase()} data →</p>
    </a>
  )
}
