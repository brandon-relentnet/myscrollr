import {
  Link,
  Outlet,
  createRootRoute,
  useLocation,
} from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { MotionConfig } from 'motion/react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

function RootErrorComponent({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-32 text-center">
      <p className="text-sm font-semibold text-error">Error</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
        Something went wrong
      </h1>
      <p className="mt-4 text-base text-base-content/60 max-w-md">
        An unexpected error occurred. Please try refreshing the page.
      </p>
      {import.meta.env.DEV && (
        <pre className="mt-6 max-w-lg text-left text-xs text-error/80 bg-error/5 p-4 rounded-lg overflow-auto border border-error/20">
          {error.message}
        </pre>
      )}
      <div className="mt-8 flex gap-4">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-content shadow-sm hover:brightness-110 transition-[filter] cursor-pointer"
        >
          Refresh page
        </button>
        <Link
          to="/"
          className="rounded-lg px-5 py-2.5 text-sm font-semibold ring-1 ring-base-300 hover:bg-base-200 transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-32 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight text-base-content sm:text-5xl">
        Page not found
      </h1>
      <p className="mt-4 text-base text-base-content/70 max-w-md">
        Sorry, we couldn&rsquo;t find the page you&rsquo;re looking for. It may
        have been moved or doesn&rsquo;t exist.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          to="/"
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-content shadow-sm hover:brightness-110 transition-[filter] cursor-pointer"
        >
          Go home
        </Link>
        <Link
          to="/status"
          className="rounded-lg px-5 py-2.5 text-sm font-semibold text-base-content ring-1 ring-base-300 hover:bg-base-200 transition-colors"
        >
          Check status
        </Link>
      </div>
    </div>
  )
}

function RootLayout() {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const isFirstRender = useRef(true)

  // Move focus to <main> on route change (skip the initial load)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    // Slight delay so the new route content is rendered
    requestAnimationFrame(() => {
      mainRef.current?.focus({ preventScroll: false })
    })
  }, [pathname])

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen relative overflow-x-clip">
        {/* Skip to main content — first focusable element */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:text-primary-content focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg"
        >
          Skip to main content
        </a>

        {/* Navigation */}
        <Header />

        {/* Main Content */}
        <main
          ref={mainRef}
          id="main-content"
          className="relative"
          tabIndex={-1}
        >
          <Outlet />
        </main>

        {/* Footer */}
        <Footer />
      </div>
    </MotionConfig>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: RootErrorComponent,
})
