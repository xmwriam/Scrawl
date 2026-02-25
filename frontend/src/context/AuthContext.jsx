import { createContext, useState, useEffect } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
export const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  // Load from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')
    if (savedToken && savedUser) {
      setToken(savedToken)
      setUser(JSON.parse(savedUser))
    }
    setLoading(false)
  }, [])

  const signup = async (email, password) => {
    const response = await fetch(`${BACKEND_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)

    // Don't auto-login on signup - just return success
    return data
  }

  const login = async (email, password) => {
    const response = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)

    setToken(data.token)
    setUser({ userId: data.userId, email: data.email })
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify({ userId: data.userId, email: data.email }))
    return data
  }

  const googleLogin = async (credentialResponse) => {
    const response = await fetch(`${BACKEND_URL}/auth/google-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: credentialResponse.credential })
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)

    setToken(data.token)
    setUser({ userId: data.userId, email: data.email })
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify({ userId: data.userId, email: data.email }))
    return data
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, signup, login, googleLogin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
