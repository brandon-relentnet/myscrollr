import { Link } from '@tanstack/react-router'
import ScrollrSVG from '@/components/ScrollrSVG'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="bg-base-200/50 border-t border-base-300 pb-12 relative overflow-hidden">
      {/* Background Pattern */}
      <div
        className="absolute inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: `
               linear-gradient(rgba(191, 255, 0, 0.5) 1px, transparent 1px),
               linear-gradient(90deg, rgba(191, 255, 0, 0.5) 1px, transparent 1px)
             `,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="container relative z-10 flex flex-col gap-14 px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-12 text-center lg:grid-cols-2 lg:items-start lg:text-left">
          {/* Left Column: Brand Info */}
          <div className="flex flex-col items-center gap-3 lg:items-start">
            <div className="flex items-center gap-3 lg:flex-row">
              <div className="relative">
                <ScrollrSVG className="size-12" />
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
              </div>
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.25em] font-bold text-primary">
                  Scrollr
                </p>
                <p className="text-lg font-semibold text-base-content">
                  Customizable Data Ticker
                </p>
              </div>
            </div>
            <p className="max-w-sm text-sm text-base-content/60 mt-4 mx-auto lg:mx-0 leading-relaxed">
              Pin live sports scores, crypto prices, and custom feeds over any
              tab. Stop alt-tabbing. Stay in your flow.
            </p>
          </div>

          {/* Right Column: Navigation */}
          <div className="flex justify-center lg:justify-end">
            <nav>
              <p className="text-xs font-mono uppercase tracking-[0.25em] font-bold text-primary w-fit mx-auto lg:mx-0">
                Navigation
              </p>
              <ul className="mt-5 space-y-2 text-sm text-base-content/65">
                <li>
                  <Link
                    to="/"
                    className="inline-flex items-center gap-1.5 transition hover:text-primary group uppercase font-bold tracking-widest text-[10px]"
                  >
                    <span className="w-1 h-1 rounded-full bg-primary/0 group-hover:bg-primary transition-all" />
                    Home
                  </Link>
                </li>
                <li>
                  <a
                    href="https://chromewebstore.google.com/detail/scrollr/pjeafpgbpfbcaddipkcbacohhbfakclb"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 transition hover:text-primary group uppercase font-bold tracking-widest text-[10px]"
                  >
                    <span className="w-1 h-1 rounded-full bg-primary/0 group-hover:bg-primary transition-all" />
                    Chrome Web Store
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        {/* Decorative Line */}
        <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

        <div className="flex flex-col gap-2 text-sm text-base-content/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Scrollr.</p>
          <p className="flex items-center gap-1">
            Keep the data
            <span className="font-mono text-primary animate-pulse">
              scrolling
            </span>
          </p>
        </div>
      </div>
    </footer>
  )
}
