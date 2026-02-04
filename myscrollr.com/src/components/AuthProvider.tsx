import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  login: () => void
  logout: () => void
  user: User | null
}

interface User {
  email?: string
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const API_URL = import.meta.env.VITE_API_URL || 'https://api.myscrollr.relentnet.dev'

// Debug helper
function debug(msg: string, data?: unknown) {
  console.log(`[Auth] ${msg}`, data ?? '')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)

  const checkAuth = useCallback(async () => {
    debug('Checking auth status...')
    try {
      debug(`Fetching ${API_URL}/auth/status`)
      const response = await fetch(`${API_URL}/auth/status`, {
        credentials: 'include',
      })
      debug(`Response status: ${response.status}`)

      const data = await response.json()
      debug('Response data:', data)

      if (data.status === 'authenticated') {
        debug('User is authenticated')
        setIsAuthenticated(true)
        setUser({ email: data.email })
      } else {
        debug('User is NOT authenticated')
        setIsAuthenticated(false)
        setUser(null)
      }
    } catch (error) {
      debug('Error checking auth:', error)
      setIsAuthenticated(false)
      setUser(null)
    } finally {
      setIsLoading(false)
      debug('Auth check complete, isLoading=false')
    }
  }, [])

  useEffect(() => {
    debug('AuthProvider mounted, checking auth')
    checkAuth()
  }, [checkAuth])

  const login = () => {
    const redirectParam = encodeURIComponent(window.location.origin)
    const loginUrl = `${API_URL}/login?redirect=${redirectParam}`
    debug('Login clicked, redirecting to:', loginUrl)
    window.location.href = loginUrl
  }

  const logout = () => {
    const redirectParam = encodeURIComponent(window.location.origin)
    const logoutUrl = `${API_URL}/logout?redirect=${redirectParam}`
    debug('Logout clicked, redirecting to:', logoutUrl)
    window.location.href = logoutUrl
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout, user }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
