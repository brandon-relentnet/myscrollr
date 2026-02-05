import { Outlet, createRootRoute } from '@tanstack/react-router'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { Analytics } from '@vercel/analytics/react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { CommandBackground } from '@/components/CommandBackground'

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen relative">
      <CommandBackground />
      <SpeedInsights />
      <Analytics />
      <Header />
      <main className="relative z-10">
        <Outlet />
      </main>
      <Footer />
    </div>
  ),
})