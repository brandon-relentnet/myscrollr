import { Outlet, Link, createRootRoute } from '@tanstack/react-router'
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
      <p className="text-sm font-semibold text-indigo-400">404</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
        Page not found
      </h1>
      <p className="mt-4 text-base text-muted-foreground max-w-md">
        Sorry, we couldn't find the page you're looking for. It may have been
        moved or doesn't exist.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          to="/"
          className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 transition-colors"
        >
          Go home
        </Link>
        <Link
          to="/status"
          className="rounded-lg px-5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-muted transition-colors"
        >
          Check status
        </Link>
      </div>
    </div>
  )
}

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
  notFoundComponent: NotFound,
  errorComponent: RootErrorComponent,
})
