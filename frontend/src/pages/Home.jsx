import { useNavigate } from 'react-router-dom'

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8) // e.g. "k7x2mq"
}

function Home() {
  const navigate = useNavigate()

  const createJournal = () => {
    const roomId = generateRoomId()
    navigate(`/room/${roomId}`)
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
    }}>
      <h1 style={{
        fontSize: 52,
        fontFamily: 'Georgia, serif',
        color: '#2c2c2c',
        letterSpacing: -1,
      }}>
        scrawl
      </h1>
      <p style={{
        fontSize: 16,
        color: '#888',
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
      }}>
        a shared journal for two
      </p>
      <button
        onClick={createJournal}
        style={{
          marginTop: 16,
          padding: '12px 32px',
          fontSize: 16,
          borderRadius: 12,
          border: 'none',
          background: '#2c2c2c',
          color: 'white',
          cursor: 'pointer',
          fontFamily: 'Georgia, serif',
        }}
      >
        create a new journal →
      </button>
    </div>
  )
}

export default Home