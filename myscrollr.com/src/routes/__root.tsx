import { Outlet, createRootRoute } from '@tanstack/react-router'
import { MotionConfig } from 'motion/react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { CommandBackground } from '@/components/CommandBackground'

export const Route = createRootRoute({
  component: () => (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen relative overflow-x-clip">
        {/* Particle Background */}
        <CommandBackground />

        {/* Global Background Glows */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute top-1/4 left-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-0 w-[400px] h-[400px] bg-info/5 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 left-1/3 w-[300px] h-[300px] bg-secondary/3 rounded-full blur-[80px]" />
        </div>

        {/* Scanline Effect - Optional: Remove if too distracting */}
        <div className="scanlines pointer-events-none" />

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
