import { Outlet, createRootRoute } from '@tanstack/react-router'
import { MotionConfig } from 'motion/react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export const Route = createRootRoute({
  component: () => (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen relative overflow-x-clip">
        {/* Navigation */}
        <Header />

        {/* Main Content */}
        <main className="relative">
          <Outlet />
        </main>

        {/* Footer */}
        <Footer />
      </div>
    </MotionConfig>
  ),
})
