import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { adminLogin, adminLogout, adminMe } from '../api/admin'

/**
 * React "context" lets a value be read by any component in the tree without
 * passing it down through every layer as props. Here it holds the signed-in
 * admin, so the layout, topbar and pages can all reach it.
 *
 * Pattern: <AuthProvider> supplies the value, and the useAuth() hook reads it.
 */
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null)
  const [checking, setChecking] = useState(true)

  // Ask the server who we are. The answer comes from the httpOnly cookie,
  // so a page refresh keeps the session without storing anything in JS.
  const refresh = useCallback(async () => {
    try {
      setAdmin(await adminMe())
    } catch {
      setAdmin(null)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = useCallback(async (username, password) => {
    const user = await adminLogin(username, password)
    setAdmin(user)
    return user
  }, [])

  const logout = useCallback(async () => {
    try {
      await adminLogout()
    } finally {
      setAdmin(null)
    }
  }, [])

  // useMemo keeps this object identity stable between renders, so consumers
  // don't re-render just because AuthProvider did.
  const value = useMemo(
    () => ({ admin, checking, login, logout, refresh }),
    [admin, checking, login, logout, refresh]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
