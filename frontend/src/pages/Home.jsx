import { useNavigate } from 'react-router-dom'
import { useContext, useState } from 'react'
import { AuthContext } from '../context/AuthContext'

function Home() {
  const navigate = useNavigate()
  const { user, token, logout } = useContext(AuthContext)
  const [roomCode, setRoomCode] = useState('')
  const [showJoinForm, setShowJoinForm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const createJournal = async () => {
    try {
      setLoading(true)
      setError('')

      const response = await fetch('http://localhost:3001/rooms/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      navigate(`/room/${data.roomId}`, { state: { roomCode: data.roomCode } })
    } catch (err) {
      setError(err.message)
      alert('Failed to create journal: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const joinJournal = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Call backend to verify room and add user
      const response = await fetch('http://localhost:3001/rooms/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ roomCode })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      navigate(`/room/${data.roomId}`)
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
      position: 'relative',
    }}>
      {/* Logout button */}
      <button
        onClick={logout}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          padding: '8px 16px',
          fontSize: 14,
          borderRadius: 8,
          border: 'none',
          background: '#f0f0f0',
          color: '#2c2c2c',
          cursor: 'pointer',
          fontFamily: 'Georgia, serif',
        }}
      >
        Logout
      </button>

      <h1 style={{
        fontSize: 52,
        fontFamily: 'Georgia, serif',
        color: '#2c2c2c',
        letterSpacing: -1,
        margin: 0,
      }}>
        scrawl
      </h1>
      <p style={{
        fontSize: 16,
        color: '#888',
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
        margin: 0,
      }}>
        a shared journal for two
      </p>

      {user && (
        <p style={{
          fontSize: 13,
          color: '#999',
          fontFamily: 'Georgia, serif',
        }}>
          logged in as <strong>{user.email}</strong>
        </p>
      )}

      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        <button
          onClick={createJournal}
          disabled={loading}
          style={{
            padding: '12px 32px',
            fontSize: 16,
            borderRadius: 12,
            border: 'none',
            background: '#2c2c2c',
            color: 'white',
            cursor: loading ? 'default' : 'pointer',
            fontFamily: 'Georgia, serif',
            fontWeight: 600,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'creating...' : 'create a new journal →'}
        </button>

        <button
          onClick={() => setShowJoinForm(!showJoinForm)}
          style={{
            padding: '12px 32px',
            fontSize: 16,
            borderRadius: 12,
            border: '2px solid #2c2c2c',
            background: 'transparent',
            color: '#2c2c2c',
            cursor: 'pointer',
            fontFamily: 'Georgia, serif',
            fontWeight: 600,
          }}
        >
          join a journal
        </button>
      </div>

      {showJoinForm && (
        <form onSubmit={joinJournal} style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          width: 300,
          padding: 24,
          background: 'white',
          borderRadius: 12,
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          marginTop: 16,
        }}>
          <label style={{
            fontSize: 14,
            color: '#666',
            fontWeight: 500,
            fontFamily: 'Georgia, serif',
          }}>
            Enter room code:
          </label>

          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="e.g. k7x2mq"
            required
            style={{
              padding: 12,
              border: '1px solid #ddd',
              borderRadius: 8,
              fontSize: 16,
              fontFamily: 'monospace',
              outline: 'none',
              textAlign: 'center',
              letterSpacing: 2,
            }}
            onFocus={(e) => e.target.style.borderColor = '#2c2c2c'}
            onBlur={(e) => e.target.style.borderColor = '#ddd'}
          />

          {error && (
            <div style={{
              padding: 10,
              background: '#ffe6e6',
              color: '#d32f2f',
              borderRadius: 8,
              fontSize: 13,
              textAlign: 'center',
            }}>
              {error}
            </div>
          )}

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
            }}
          >
            {loading ? 'Joining...' : 'Join'}
          </button>
        </form>
      )}
    </div>
  )
}

export default Home