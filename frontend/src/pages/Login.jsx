import { useContext, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { AuthContext } from '../context/AuthContext'

function Login() {
  const navigate = useNavigate()
  const { login, googleLogin } = useContext(AuthContext)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const inputStyle = {
    padding: 10,
    border: '1px solid #ddd',
    borderRadius: 8,
    fontSize: 16,
    fontFamily: 'Georgia, serif',
    outline: 'none',
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async (credentialResponse) => {
    setError('')
    setLoading(true)
    try {
      await googleLogin(credentialResponse)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#faf9f6',
      gap: 24,
      fontFamily: 'Georgia, serif',
    }}>
      <h1 style={{ fontSize: 52, color: '#2c2c2c', letterSpacing: -1, margin: 0 }}>
        scrawl
      </h1>

      <form onSubmit={handleSubmit} style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        width: 320,
        padding: 32,
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      }}>
        <h2 style={{ fontSize: 24, color: '#2c2c2c', margin: '0 0 8px 0' }}>Login</h2>

        {error && (
          <div style={{
            padding: 12, background: '#ffe6e6', color: '#d32f2f',
            borderRadius: 8, fontSize: 14,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, color: '#666', fontWeight: 500 }}>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="@yourname"
            required
            style={inputStyle}
            onFocus={(e) => e.target.style.borderColor = '#2c2c2c'}
            onBlur={(e) => e.target.style.borderColor = '#ddd'}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, color: '#666', fontWeight: 500 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            style={inputStyle}
            onFocus={(e) => e.target.style.borderColor = '#2c2c2c'}
            onBlur={(e) => e.target.style.borderColor = '#ddd'}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12, background: '#2c2c2c', color: 'white', border: 'none',
            borderRadius: 8, fontSize: 16, fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1, fontFamily: 'Georgia, serif', marginTop: 8,
          }}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>

        <div style={{ position: 'relative', margin: '8px 0' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px solid #ddd' }} />
          <div style={{ position: 'relative', textAlign: 'center', background: 'white', padding: '0 8px' }}>
            <span style={{ fontSize: 12, color: '#999' }}>or</span>
          </div>
        </div>

        <GoogleLogin
          onSuccess={handleGoogleLogin}
          onError={() => setError('Google login failed')}
        />

        <p style={{ margin: 0, textAlign: 'center', fontSize: 14, color: '#666' }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ color: '#2c2c2c', textDecoration: 'none', fontWeight: 600 }}>
            Sign up
          </Link>
        </p>
      </form>
    </div>
  )
}

export default Login