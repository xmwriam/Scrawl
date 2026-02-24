import { useContext, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { AuthContext } from '../context/AuthContext'

function Signup() {
  const navigate = useNavigate()
  const { signup, googleLogin } = useContext(AuthContext)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      await signup(email, password)
      alert('Account created! Please log in.')
      navigate('/login')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignup = async (credentialResponse) => {
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
      <h1 style={{
        fontSize: 52,
        color: '#2c2c2c',
        letterSpacing: -1,
        margin: 0,
      }}>
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
        <h2 style={{
          fontSize: 24,
          color: '#2c2c2c',
          margin: '0 0 8px 0',
        }}>
          Sign Up
        </h2>

        {error && (
          <div style={{
            padding: 12,
            background: '#ffe6e6',
            color: '#d32f2f',
            borderRadius: 8,
            fontSize: 14,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, color: '#666', fontWeight: 500 }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            style={{
              padding: 10,
              border: '1px solid #ddd',
              borderRadius: 8,
              fontSize: 16,
              fontFamily: 'Georgia, serif',
              outline: 'none',
            }}
            onFocus={(e) => e.target.style.borderColor = '#2c2c2c'}
            onBlur={(e) => e.target.style.borderColor = '#ddd'}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, color: '#666', fontWeight: 500 }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            style={{
              padding: 10,
              border: '1px solid #ddd',
              borderRadius: 8,
              fontSize: 16,
              fontFamily: 'Georgia, serif',
              outline: 'none',
            }}
            onFocus={(e) => e.target.style.borderColor = '#2c2c2c'}
            onBlur={(e) => e.target.style.borderColor = '#ddd'}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, color: '#666', fontWeight: 500 }}>
            Confirm Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
            style={{
              padding: 10,
              border: '1px solid #ddd',
              borderRadius: 8,
              fontSize: 16,
              fontFamily: 'Georgia, serif',
              outline: 'none',
            }}
            onFocus={(e) => e.target.style.borderColor = '#2c2c2c'}
            onBlur={(e) => e.target.style.borderColor = '#ddd'}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            background: '#2c2c2c',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
            fontFamily: 'Georgia, serif',
            marginTop: 8,
          }}
        >
          {loading ? 'Creating account...' : 'Sign Up'}
        </button>

        <div style={{ position: 'relative', margin: '16px 0' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px solid #ddd' }} />
          <div style={{ position: 'relative', textAlign: 'center', background: 'white', padding: '0 8px' }}>
            <span style={{ fontSize: 12, color: '#999' }}>or</span>
          </div>
        </div>

        <GoogleLogin
          onSuccess={handleGoogleSignup}
          onError={() => setError('Google signup failed')}
        />

        <p style={{ margin: 0, textAlign: 'center', fontSize: 14, color: '#666' }}>
          Already have an account?{' '}
          <Link to="/login" style={{
            color: '#2c2c2c',
            textDecoration: 'none',
            fontWeight: 600,
          }}>
            Login
          </Link>
        </p>
      </form>
    </div>
  )
}

export default Signup
