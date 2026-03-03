import { createContext, useState, useEffect } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
export const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedToken = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')
    if (savedToken && savedUser) {
      setToken(savedToken)
      setUser(JSON.parse(savedUser))
    }
    setLoading(false)
  }, [])

  const saveAuth = (data) => {
    const userData = { userId: data.userId, email: data.email, username: data.username }
    setToken(data.token)
    setUser(userData)
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(userData))
  }

  const signup = async (email, password, username) => {
    const response = await fetch(`${BACKEND_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username })
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    return data
  }

const login = async (username, password) => {
  const response = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error)
  saveAuth(data)
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
    saveAuth(data)
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