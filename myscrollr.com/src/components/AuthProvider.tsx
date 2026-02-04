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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/health`)
      if (response.ok) {
        const data = await response.json()
        // Check for access token cookie - the API sets it on login
        setIsAuthenticated(true)
        setUser({ email: (data as { email?: string })?.email })
      } else {
        setIsAuthenticated(false)
        setUser(null)
      }
    } catch {
      setIsAuthenticated(false)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const login = () => {
    // Pass current origin as redirect so auth flow returns to the right domain
    const redirectParam = encodeURIComponent(window.location.origin)
    window.location.href = `${API_URL}/login?redirect=${redirectParam}`
  }

  const logout = () => {
    // Pass current origin as redirect so logout returns to the right domain
    const redirectParam = encodeURIComponent(window.location.origin)
    window.location.href = `${API_URL}/logout?redirect=${redirectParam}`
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
