import { Link, useLocation } from '@tanstack/react-router'
import {
  ChevronRight,
  Eye,
  House,
  LayoutDashboard,
  LogOut,
  Menu,
  Puzzle,
  UserCircle,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLogto } from '@logto/react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import type { IdTokenClaims } from '@logto/react'
import ScrollrSVG from '@/components/ScrollrSVG'
import { API_BASE } from '@/api/client'

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const { signIn, signOut, isAuthenticated, isLoading, getIdTokenClaims } =
    useLogto()
  const [userClaims, setUserClaims] = useState<IdTokenClaims>()

  const [viewerCount, setViewerCount] = useState<number | null>(null)
  const viewerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (isAuthenticated) {
      getIdTokenClaims().then(setUserClaims)
    } else {
      setUserClaims(undefined)
    }
  }, [isAuthenticated, getIdTokenClaims])

  // Poll active viewer count every 15s
  useEffect(() => {
    const fetchCount = () => {
      fetch(`${API_BASE}/events/count`)
        .then((r) => r.json())
        .then((d) => setViewerCount(d.count))
        .catch(() => {})
    }
    fetchCount()
    viewerIntervalRef.current = setInterval(fetchCount, 15000)
    return () => {
      if (viewerIntervalRef.current) clearInterval(viewerIntervalRef.current)
    }
  }, [])

  const handleSignIn = () => {
    signIn(`${window.location.origin}/callback`)
  }

  const handleSignOut = () => {
    signOut(`${window.location.origin}`)
  }

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-base-100/80 backdrop-blur-2xl border-b border-base-300/50 px-5 py-4 h-20">
        {/* Brand */}
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative flex items-center justify-center rounded-sm border border-base-300/50 bg-base-200/50 p-2.5 transition-all hover:scale-105 transition-spring group-hover:border-primary/30 group-hover:shadow-[0_0_20px_rgba(191,255,0,0.1)]">
              <ScrollrSVG className="size-8" />
              {/* Online indicator */}
              <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-xl tracking-tight uppercase font-display">
                Scrollr
              </span>
              <span className="text-[9px] font-mono text-primary/50 uppercase tracking-[0.15em]">
                Always Visible
              </span>
            </div>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <LayoutGroup id="header-nav">
          <nav className="hidden lg:flex items-center gap-1">
            <NavLink to="/" activeOn="/">
              <House size={14} />
              Home
            </NavLink>

            <NavLink to="/integrations" activeOn="/integrations">
              <Puzzle size={14} />
              Integrations
            </NavLink>

            {isAuthenticated && (
              <>
                <NavLink to="/dashboard" activeOn="/dashboard">
                  <LayoutDashboard size={14} />
                  Dashboard
                </NavLink>

                <NavLink to="/account" activeOn="/account">
                  <UserCircle size={14} />
                  {userClaims?.username || userClaims?.name || 'Account'}
                </NavLink>
              </>
            )}
          </nav>
        </LayoutGroup>

        {/* Auth Section */}
        <div className="hidden lg:flex items-center gap-4">
          {/* Viewer count — always visible */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm bg-primary/8 border border-primary/15"
            title="Users online"
          >
            <Eye size={12} className="text-primary/60" />
            <span className="text-[11px] font-bold font-mono text-primary/80 tabular-nums">
              {viewerCount ?? '—'}
            </span>
            <span className="text-[9px] font-mono text-primary/40 uppercase">
              online
            </span>
          </div>

          <div className="h-8 w-px bg-base-300/50" />

          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary/40 animate-pulse" />
              <span className="text-xs font-mono uppercase tracking-wider text-base-content/30">
                Initializing
              </span>
            </div>
          ) : isAuthenticated ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider border border-error/30 text-error/80 hover:bg-error/10 hover:border-error/50 transition-all rounded-sm cursor-pointer"
            >
              <LogOut size={14} />
              Sign Out
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSignIn}
              className="btn btn-primary btn-sm flex items-center gap-2"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-content opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary-content" />
              </span>
              Sign In
            </motion.button>
          )}
        </div>

        {/* Mobile Menu Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(true)}
          className="lg:hidden flex items-center justify-center p-3 rounded-sm border border-base-300/50 bg-base-200/50 hover:bg-base-200 hover:border-primary/30 transition-all cursor-pointer"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </motion.button>
      </header>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Mobile Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden pointer-events-auto"
            />

            {/* Mobile Drawer */}
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-80 bg-base-200/95 backdrop-blur-2xl z-50 lg:hidden flex flex-col"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-5 py-5 border-b border-base-300/50">
                <div className="flex items-center gap-3">
                  <ScrollrSVG className="size-8" />
                  <div className="flex flex-col">
                    <span className="font-bold text-lg uppercase tracking-tight">
                      Scrollr
                    </span>
                    <span className="text-[8px] font-mono text-primary/50 uppercase tracking-[0.15em]">
                      Always Visible
                    </span>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-sm hover:bg-base-300 transition-colors cursor-pointer"
                  aria-label="Close menu"
                >
                  <X size={20} />
                </motion.button>
              </div>

              {/* Navigation Links */}
              <nav className="flex-1 px-4 py-6 space-y-1">
                <MobileNavLink
                  to="/"
                  icon={<ChevronRight size={18} />}
                  onClick={() => setIsOpen(false)}
                >
                  Home
                </MobileNavLink>

                <MobileNavLink
                  to="/integrations"
                  icon={<ChevronRight size={18} />}
                  onClick={() => setIsOpen(false)}
                >
                  Integrations
                </MobileNavLink>

                {isAuthenticated && (
                  <>
                    <MobileNavLink
                      to="/dashboard"
                      icon={<ChevronRight size={18} />}
                      onClick={() => setIsOpen(false)}
                    >
                      Dashboard
                    </MobileNavLink>

                    <MobileNavLink
                      to="/account"
                      icon={<ChevronRight size={18} />}
                      onClick={() => setIsOpen(false)}
                    >
                      {userClaims?.username || userClaims?.name || 'Account'}
                    </MobileNavLink>
                  </>
                )}
              </nav>

              {/* Drawer Footer */}
              <div className="px-5 py-5 border-t border-base-300/50 space-y-3">
                {/* Viewer count — always visible */}
                <div
                  className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-sm bg-primary/8 border border-primary/15"
                  title="Users online"
                >
                  <Eye size={12} className="text-primary/60" />
                  <span className="text-[11px] font-bold font-mono text-primary/80 tabular-nums">
                    {viewerCount ?? '—'}
                  </span>
                  <span className="text-[9px] font-mono text-primary/40 uppercase">
                    online
                  </span>
                </div>

                {isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-3">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs font-mono uppercase tracking-wider text-base-content/40">
                      Loading...
                    </span>
                  </div>
                ) : isAuthenticated ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      handleSignOut()
                      setIsOpen(false)
                    }}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold uppercase tracking-wider border border-error/30 text-error/80 hover:bg-error/10 hover:border-error/50 transition-all rounded-sm cursor-pointer"
                  >
                    <LogOut size={16} />
                    Sign Out
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      handleSignIn()
                      setIsOpen(false)
                    }}
                    className="w-full btn btn-primary flex items-center justify-center gap-2"
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-content opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-content" />
                    </span>
                    Sign In
                  </motion.button>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

function NavLink({
  to,
  children,
  activeOn,
}: {
  to: string
  children: React.ReactNode
  activeOn?: string
}) {
  const location = useLocation()

  // For demo purposes, check if current path matches
  const isActive = location.pathname === activeOn

  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all rounded-sm relative ${
        isActive
          ? 'text-primary bg-primary/10'
          : 'text-base-content/50 hover:text-base-content hover:bg-base-200/50'
      }`}
    >
      {children}
      {isActive && (
        <motion.div
          layoutId="nav-indicator"
          className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          style={{ originY: '100%' }}
        />
      )}
    </Link>
  )
}

function MobileNavLink({
  to,
  children,
  icon,
  onClick,
}: {
  to: string
  children: React.ReactNode
  icon?: React.ReactNode
  onClick?: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center justify-between px-4 py-4 text-sm font-bold uppercase tracking-wider text-base-content/60 hover:text-primary hover:bg-base-300/50 transition-all rounded-sm group cursor-pointer"
    >
      <span className="flex items-center gap-3">
        <span className="text-primary/0 group-hover:text-primary/60 transition-colors">
          {icon}
        </span>
        {children}
      </span>
      <ChevronRight
        size={14}
        className="opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1"
      />
    </Link>
  )
}
