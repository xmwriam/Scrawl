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

  const inputStyle = {
    width: '100%', padding: '11px 14px',
    border: '1.5px solid #e8ddd0', borderRadius: 10,
    fontSize: 15, outline: 'none',
    fontFamily: 'Nunito, sans-serif', fontWeight: 600,
    background: '#fffcf8', color: '#2c2410',
    transition: 'border-color 0.2s',
  }

  return (
    <div style={{
      display: 'flex', height: '100vh',
      fontFamily: 'Lora, Georgia, serif',
      background: '#faf6f0',
    }}>
      {/* Left — decorative panel */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(160deg, #2c2410 0%, #4a3728 60%, #6b4c35 100%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 56, position: 'relative', overflow: 'hidden',
      }}>
        {/* Paper texture lines */}
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: 0, right: 0,
            top: 60 + i * 44,
            height: 1,
            background: 'rgba(255,255,255,0.04)',
          }} />
        ))}
        {/* Margin line */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: 72, width: 1,
          background: 'rgba(210,140,100,0.2)',
        }} />

        <div style={{ position: 'relative', textAlign: 'left', width: '100%', maxWidth: 340 }}>
          <div style={{
            fontFamily: 'Lora, Georgia, serif',
            fontSize: 11, fontWeight: 400, fontStyle: 'italic',
            color: 'rgba(210,180,150,0.6)',
            letterSpacing: 3, marginBottom: 20, textTransform: 'uppercase',
          }}>
            a shared journal
          </div>
          <h1 style={{
            fontSize: 80, fontWeight: 700,
            color: '#faf6f0', letterSpacing: -2,
            margin: 0, lineHeight: 0.9,
            fontFamily: 'Lora, Georgia, serif',
          }}>
            scrawl
          </h1>
          <div style={{
            width: 48, height: 2,
            background: 'rgba(210,140,100,0.6)',
            margin: '24px 0',
          }} />
          <p style={{
            fontSize: 16, color: 'rgba(250,246,240,0.65)',
            fontStyle: 'italic', lineHeight: 1.7,
            fontFamily: 'Lora, Georgia, serif',
          }}>
            "a canvas for the things<br />you feel"
          </p>

          <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { symbol: '✒', text: 'draw anything' },
              { symbol: '✦', text: 'write everything' },
              { symbol: '◎', text: 'send when ready' },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                color: 'rgba(250,246,240,0.5)',
                fontSize: 14, fontStyle: 'italic',
                fontFamily: 'Lora, Georgia, serif',
              }}>
                <span style={{ fontSize: 16, opacity: 0.7 }}>{item.symbol}</span>
                {item.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div style={{
        width: 460,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '48px 44px',
        background: '#fffcf8',
        borderLeft: '1px solid #e8ddd0',
        overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 340 }}>
          <h2 style={{
            fontSize: 28, fontWeight: 700, color: '#2c2410',
            fontFamily: 'Lora, Georgia, serif',
            marginBottom: 6,
          }}>
            welcome back
          </h2>
          <p style={{
            fontSize: 14, color: '#a09080', marginBottom: 32,
            fontFamily: 'Nunito, sans-serif', fontWeight: 600,
          }}>
            no account?{' '}
            <Link to="/signup" style={{ color: '#8b5e3c', fontWeight: 700, textDecoration: 'none' }}>
              sign up
            </Link>
          </p>

          {error && (
            <div style={{
              padding: '11px 14px', background: '#fff0ec',
              color: '#c0392b', borderRadius: 10, fontSize: 13,
              fontWeight: 600, marginBottom: 20, border: '1px solid #fad4cc',
              fontFamily: 'Nunito, sans-serif',
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{
                fontSize: 11, fontWeight: 700, color: '#b0a090',
                display: 'block', marginBottom: 6, letterSpacing: 1.5,
                textTransform: 'uppercase', fontFamily: 'Nunito, sans-serif',
              }}>
                Username
              </label>
              <input
                type="text" value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="@yourname" required style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = '#8b5e3c'}
                onBlur={(e) => e.target.style.borderColor = '#e8ddd0'}
              />
            </div>

            <div>
              <label style={{
                fontSize: 11, fontWeight: 700, color: '#b0a090',
                display: 'block', marginBottom: 6, letterSpacing: 1.5,
                textTransform: 'uppercase', fontFamily: 'Nunito, sans-serif',
              }}>
                Password
              </label>
              <input
                type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = '#8b5e3c'}
                onBlur={(e) => e.target.style.borderColor = '#e8ddd0'}
              />
            </div>

            <button
              onClick={handleSubmit} disabled={loading}
              style={{
                width: '100%', padding: '13px 0',
                background: loading ? '#c4a882' : '#2c2410',
                color: '#faf6f0', border: 'none', borderRadius: 10,
                fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
                fontFamily: 'Nunito, sans-serif',
                transition: 'all 0.2s', marginTop: 4,
                letterSpacing: 0.3,
              }}
              onMouseEnter={(e) => { if (!loading) e.target.style.background = '#4a3728' }}
              onMouseLeave={(e) => { if (!loading) e.target.style.background = '#2c2410' }}
            >
              {loading ? 'signing in...' : 'sign in →'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: '#e8ddd0' }} />
              <span style={{ fontSize: 11, color: '#c0b0a0', fontWeight: 700, fontFamily: 'Nunito, sans-serif', letterSpacing: 1 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: '#e8ddd0' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GoogleLogin onSuccess={handleGoogleLogin} onError={() => setError('Google login failed')} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login