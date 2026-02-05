import { Link } from '@tanstack/react-router'
import { Menu, X, LogOut, LayoutDashboard, UserCircle } from 'lucide-react'
import { useState } from 'react'
import { useLogto } from '@logto/react'
import ScrollrSVG from './ScrollrSVG'

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const { signIn, signOut, isAuthenticated, isLoading } = useLogto()

  const handleSignIn = () => {
    signIn(`${window.location.origin}/callback`)
  }

  const handleSignOut = () => {
    signOut(`${window.location.origin}`)
  }

  return (
    <>
      <header className="top-0 left-0 z-100 fixed flex justify-between items-center bg-base-100/80 backdrop-blur-xl border-b border-base-300 p-4 px-6 w-full h-20">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="flex items-center justify-center rounded-lg border border-base-300 bg-base-200/80 p-2 shadow-sm group-hover:border-primary/30 transition-all">
              <ScrollrSVG className="size-8" />
            </div>
            <span className="font-bold text-xl tracking-tight uppercase">
              Scrollr
            </span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-6">
          <Link
            to="/"
            className="text-sm font-bold uppercase tracking-widest text-base-content/60 hover:text-primary transition-colors"
          >
            Home
          </Link>
          
          {isAuthenticated && (
            <Link
              to="/dashboard"
              className="text-sm font-bold uppercase tracking-widest text-base-content/60 hover:text-primary transition-colors flex items-center gap-2"
            >
              <LayoutDashboard size={16} />
              Terminal
            </Link>
          )}

          <div className="h-6 w-px bg-base-300" />

          {isLoading ? (
            <div className="w-24 h-9 bg-base-200 animate-pulse rounded-sm" />
          ) : isAuthenticated ? (
            <div className="flex items-center gap-4">
              <Link
                to="/account"
                className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-base-content/60 hover:text-primary transition-colors"
              >
                <UserCircle size={18} />
                Hub
              </Link>
              <button
                onClick={handleSignOut}
                className="btn btn-outline border-error/30 text-error hover:bg-error hover:text-white btn-sm"
              >
                <LogOut size={16} className="mr-2" />
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={handleSignIn}
              className="btn btn-primary btn-sm"
            >
              Sign In
            </button>
          )}
        </nav>

        {/* Menu button for small screens */}
        <button
          onClick={() => setIsOpen(true)}
          className="lg:hidden hover:bg-base-200 ml-4 p-2.5 rounded-lg transition-colors cursor-pointer border border-base-300"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
      </header>

      {/* Overlay only on small screens */}
      <div
        onClick={() => setIsOpen(false)}
        className={`bg-black/40 backdrop-blur-sm transition-opacity duration-250 fixed inset-0 h-full w-full z-25 lg:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      
      {/* Aside drawer only for small screens */}
      <aside
        className={`fixed top-0 right-0 h-full w-80 bg-base-200 shadow-2xl backdrop-blur-xl z-150 transform transition-transform duration-300 ease-in-out flex flex-col lg:hidden ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex justify-between items-center p-4 border-b border-base-300">
          <h2 className="font-bold text-lg uppercase tracking-widest">Navigation</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="hover:bg-base-300 p-2 rounded-lg transition-colors cursor-pointer"
            aria-label="Close menu"
          >
            <X size={22} />
          </button>
        </div>
        <nav className="flex-1 p-6 flex flex-col gap-4">
          <Link
            to="/"
            className="text-lg font-bold uppercase tracking-widest text-base-content hover:text-primary transition-colors"
            onClick={() => setIsOpen(false)}
          >
            Home
          </Link>
          
          {isAuthenticated && (
            <>
              <Link
                to="/dashboard"
                className="text-lg font-bold uppercase tracking-widest text-base-content hover:text-primary transition-colors flex items-center gap-3"
                onClick={() => setIsOpen(false)}
              >
                <LayoutDashboard size={20} />
                Terminal
              </Link>
              <Link
                to="/account"
                className="text-lg font-bold uppercase tracking-widest text-base-content hover:text-primary transition-colors flex items-center gap-3"
                onClick={() => setIsOpen(false)}
              >
                <UserCircle size={20} />
                Hub
              </Link>
            </>
          )}

          <div className="h-px bg-base-300 my-2" />

          {isLoading ? (
            <div className="h-12 bg-base-300 animate-pulse rounded-sm" />
          ) : isAuthenticated ? (
            <button
              onClick={() => {
                handleSignOut()
                setIsOpen(false)
              }}
              className="btn btn-outline border-error/30 text-error hover:bg-error hover:text-white"
            >
              <LogOut size={20} className="mr-2" />
              Sign Out
            </button>
          ) : (
            <button
              onClick={() => {
                handleSignIn()
                setIsOpen(false)
              }}
              className="btn btn-primary"
            >
              Sign In
            </button>
          )}
        </nav>
      </aside>
    </>
  )
}
