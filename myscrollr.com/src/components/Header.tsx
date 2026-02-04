import { Link, useLocation } from '@tanstack/react-router'
import { useState } from 'react'
import { Home, Menu, X, User, LogOut } from 'lucide-react'
import { useLogto } from '@logto/react'

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const { signIn, signOut, isAuthenticated, isLoading } = useLogto()
  const location = useLocation()

  const isActive = (path: string) => location.pathname === path

  const handleSignIn = () => {
    signIn(`${window.location.origin}/callback`)
  }

  const handleSignOut = () => {
    signOut(`${window.location.origin}`)
  }

  return (
    <>
      <header className="p-4 flex items-center justify-between bg-gray-900 text-white shadow-lg sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsOpen(true)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
          <Link to="/">
            <h1 className="text-xl font-bold text-indigo-400">Scrollr</h1>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {isLoading ? (
            <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse" />
          ) : isAuthenticated ? (
            <>
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-400">
                <User size={16} />
                <span>User</span>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors text-sm font-medium"
              >
                <LogOut size={18} />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </>
          ) : (
            <button
              onClick={handleSignIn}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors text-sm font-medium"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-gray-900 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-xl font-bold">Navigation</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            className={`flex items-center gap-3 p-3 rounded-lg transition-colors mb-2 ${
              isActive('/')
                ? 'bg-indigo-600'
                : 'hover:bg-gray-800'
            }`}
          >
            <Home size={20} />
            <span className="font-medium">Dashboard</span>
          </Link>

          {isAuthenticated && (
            <Link
              to="/dashboard"
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 p-3 rounded-lg transition-colors mb-2 ${
                isActive('/dashboard')
                  ? 'bg-indigo-600'
                  : 'hover:bg-gray-800'
              }`}
            >
              <span className="text-lg font-medium">📊</span>
              <span className="font-medium">My Dashboard</span>
            </Link>
          )}
        </nav>

        <div className="p-4 border-t border-gray-800">
          {isLoading ? (
            <div className="h-10 bg-gray-800 rounded-lg animate-pulse" />
          ) : isAuthenticated ? (
            <button
              onClick={() => {
                handleSignOut()
                setIsOpen(false)
              }}
              className="w-full flex items-center justify-center gap-2 p-3 bg-red-600 hover:bg-red-700 rounded-lg transition-colors font-medium"
            >
              <LogOut size={20} />
              Sign Out
            </button>
          ) : (
            <button
              onClick={() => {
                handleSignIn()
                setIsOpen(false)
              }}
              className="w-full p-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors font-medium"
            >
              Sign In
            </button>
          )}
        </div>
      </aside>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
