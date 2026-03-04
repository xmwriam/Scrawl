import { useState, useRef, useCallback, useEffect } from 'react'
import { useContext } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'
import Room from './Room'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

const AVATAR_COLORS = [
  '#8b5e3c', '#6b7c4a', '#4a6b7c', '#7c4a6b',
  '#5e6b3c', '#3c5e6b', '#6b4a5e', '#7c6b3c',
]

const getAvatarColor = (str) => {
  if (!str) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function Home() {
  const { user, token, logout } = useContext(AuthContext)
  const navigate = useNavigate()
  const { roomId } = useParams()

  const [conversations, setConversations] = useState([])
  const [partnerNames, setPartnerNames] = useState({})
  const [loadingRooms, setLoadingRooms] = useState(true)
  const [showNewChat, setShowNewChat] = useState(false)
  const [newChatTab, setNewChatTab] = useState('direct')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupMemberQuery, setGroupMemberQuery] = useState('')
  const [groupMemberResults, setGroupMemberResults] = useState([])
  const [groupMembers, setGroupMembers] = useState([])
  const [searchingGroupMember, setSearchingGroupMember] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  // FIX: Track previous roomId so we only close on navigation, not on first load
  const prevRoomId = useRef(roomId)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // FIX: Only close sidebar when roomId actually changes (user tapped a conversation)
  // not on first mount, so the sidebar stays put until user navigates.
  useEffect(() => {
    if (isMobile && roomId && roomId !== prevRoomId.current) {
      setSidebarOpen(false)
    }
    prevRoomId.current = roomId
  }, [roomId, isMobile])

  useEffect(() => {
    if (!token) return
    fetch(`${BACKEND_URL}/rooms/mine`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(async (data) => {
        if (Array.isArray(data)) {
          setConversations(data)
          const names = {}
          await Promise.all(data.filter(Boolean).map(async (room) => {
            try {
              if (room.room_type === 'group') {
                names[room.id] = room.room_name || 'Group'
              } else {
                const res = await fetch(`${BACKEND_URL}/rooms/${room.id}/partner`, {
                  headers: { Authorization: `Bearer ${token}` }
                })
                const partner = await res.json()
                if (partner) names[room.id] = partner.username || partner.email
              }
            } catch (e) {}
          }))
          setPartnerNames(names)
        }
        setLoadingRooms(false)
      })
      .catch(() => setLoadingRooms(false))
  }, [token])

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(
          `${BACKEND_URL}/users/search?username=${encodeURIComponent(searchQuery)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const data = await res.json()
        setSearchResults(Array.isArray(data) ? data : [])
      } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery, token])

  useEffect(() => {
    if (!groupMemberQuery.trim()) { setGroupMemberResults([]); return }
    const t = setTimeout(async () => {
      setSearchingGroupMember(true)
      try {
        const res = await fetch(
          `${BACKEND_URL}/users/search?username=${encodeURIComponent(groupMemberQuery)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const data = await res.json()
        const filtered = Array.isArray(data)
          ? data.filter(u => !groupMembers.find(m => m.id === u.id))
          : []
        setGroupMemberResults(filtered)
      } catch { setGroupMemberResults([]) }
      finally { setSearchingGroupMember(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [groupMemberQuery, token, groupMembers])

  const startDirectChat = async (otherUser) => {
    try {
      const res = await fetch(`${BACKEND_URL}/rooms/create-with-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetUserId: otherUser.id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      resetNewChat()
      setConversations(prev => {
        if (prev.find(r => r.id === data.roomId)) return prev
        return [{ id: data.roomId, room_code: data.roomCode, created_at: new Date().toISOString(), room_type: 'direct' }, ...prev]
      })
      setPartnerNames(prev => ({ ...prev, [data.roomId]: otherUser.username }))
      navigate(`/room/${data.roomId}`)
    } catch (err) { alert(err.message) }
  }

  const addGroupMember = (u) => {
    setGroupMembers(prev => [...prev, { id: u.id, username: u.username }])
    setGroupMemberQuery('')
    setGroupMemberResults([])
  }

  const createGroup = async () => {
    if (!groupName.trim()) { alert('Enter a group name'); return }
    if (groupMembers.length === 0) { alert('Add at least one member'); return }
    setCreatingGroup(true)
    try {
      const res = await fetch(`${BACKEND_URL}/groups/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: groupName.trim(), memberUsernames: groupMembers.map(m => m.username) })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      resetNewChat()
      setConversations(prev => [
        { id: data.roomId, room_code: data.roomCode, created_at: new Date().toISOString(), room_type: 'group', room_name: data.name },
        ...prev
      ])
      setPartnerNames(prev => ({ ...prev, [data.roomId]: data.name }))
      navigate(`/room/${data.roomId}`)
    } catch (err) { alert(err.message) }
    finally { setCreatingGroup(false) }
  }

  const resetNewChat = () => {
    setShowNewChat(false)
    setSearchQuery(''); setSearchResults([])
    setGroupName(''); setGroupMembers([])
    setGroupMemberQuery(''); setGroupMemberResults([])
    setNewChatTab('direct')
  }

  const inputStyle = {
    width: '100%', padding: '8px 12px',
    border: '1.5px solid #e8ddd0', borderRadius: 8,
    fontSize: 13, outline: 'none',
    fontFamily: 'Nunito, sans-serif', fontWeight: 600,
    background: '#fffcf8', color: '#2c2410',
    transition: 'border-color 0.2s', boxSizing: 'border-box',
  }

  return (
    <div style={{
      display: 'flex', height: '100vh',
      fontFamily: 'Lora, Georgia, serif',
      background: '#faf6f0',
      position: 'relative',
      // FIX: prevent any overflow from the sidebar slide animation causing a horizontal scrollbar
      overflow: 'hidden',
    }}>

      {/* ── Mobile overlay — clicking it closes the sidebar ── */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(44,36,16,0.35)',
            zIndex: 40,
            // FIX: use pointer events so the overlay intercepts all taps
            touchAction: 'none',
          }}
        />
      )}

      {/* ── Mobile hamburger ── */}
      {isMobile && (
        <button
          // FIX: use onPointerDown so it fires before the overlay pointerdown
          onPointerDown={(e) => {
            e.stopPropagation()
            setSidebarOpen(p => !p)
          }}
          style={{
            position: 'fixed', top: 12, left: 12, zIndex: 60,
            width: 38, height: 38, borderRadius: 10,
            border: '1px solid #e8ddd0', background: '#fffcf8',
            cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(44,36,16,0.08)',
          }}
        >
          {sidebarOpen ? '✕' : '☰'}
        </button>
      )}

      {/* ── Sidebar ── */}
      <div
        // FIX: stop taps inside sidebar from bubbling to the overlay
        onPointerDown={(e) => isMobile && e.stopPropagation()}
        style={{
          width: isMobile ? Math.min(300, window.innerWidth * 0.82) : 280,
          minWidth: isMobile ? 'unset' : 280,
          height: '100vh',
          background: '#fffcf8',
          borderRight: '1px solid #e8ddd0',
          display: 'flex',
          flexDirection: 'column',
          position: isMobile ? 'fixed' : 'relative',
          left: 0, top: 0, zIndex: 50,
          transform: isMobile && !sidebarOpen ? 'translateX(-100%)' : 'translateX(0)',
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: isMobile && sidebarOpen ? '4px 0 32px rgba(44,36,16,0.18)' : 'none',
          willChange: 'transform',
        }}>

        {/* Header */}
        <div style={{
          padding: '22px 20px 18px',
          borderBottom: '1px solid #e8ddd0',
          background: '#fffcf8',
          position: 'relative',
          // FIX: leave space for hamburger button on mobile
          paddingLeft: isMobile ? 56 : 20,
        }}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              position: 'absolute', left: 0, right: 0,
              bottom: 18 + i * 14, height: '0.5px',
              background: 'rgba(180,160,130,0.12)',
              pointerEvents: 'none',
            }} />
          ))}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <h1 style={{
              fontSize: 26, fontWeight: 700, color: '#2c2410',
              letterSpacing: -0.5, margin: 0,
              fontFamily: 'Lora, Georgia, serif',
            }}>
              scrawl
            </h1>
            <button
              onClick={logout}
              style={{
                padding: '4px 10px', fontSize: 11, borderRadius: 6,
                border: '1px solid #e0d5c5', background: 'transparent',
                color: '#b0a090', cursor: 'pointer',
                fontFamily: 'Nunito, sans-serif', fontWeight: 700,
              }}
            >
              logout
            </button>
          </div>
          {user && (
            <p style={{
              margin: 0, fontSize: 12, color: '#a09080',
              fontStyle: 'italic', fontFamily: 'Lora, Georgia, serif',
            }}>
              @{user.username || user.email}
            </p>
          )}
        </div>

        {/* New chat */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #ede5d8' }}>
          <button
            onClick={() => showNewChat ? resetNewChat() : setShowNewChat(true)}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 8,
              border: showNewChat ? '1px solid #c0b0a0' : '1.5px solid #2c2410',
              background: showNewChat ? '#f5f0e8' : '#2c2410',
              color: showNewChat ? '#8b7b6b' : '#faf6f0',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'Nunito, sans-serif', transition: 'all 0.2s',
              letterSpacing: 0.3,
            }}
          >
            {showNewChat ? '✕ cancel' : '✒ new journal'}
          </button>

          {showNewChat && (
            <div style={{ marginTop: 10 }}>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {['direct', 'group'].map(tab => (
                  <button key={tab} onClick={() => setNewChatTab(tab)}
                    style={{
                      flex: 1, padding: '6px 0', borderRadius: 7,
                      border: '1px solid #e8ddd0',
                      background: newChatTab === tab ? '#2c2410' : '#fffcf8',
                      color: newChatTab === tab ? '#faf6f0' : '#8b7b6b',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'Nunito, sans-serif',
                    }}
                  >
                    {tab === 'direct' ? '◎ direct' : '◈ group'}
                  </button>
                ))}
              </div>

              {newChatTab === 'direct' && (
                <>
                  <input
                    autoFocus type="text" value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="search @username..."
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderColor = '#8b5e3c'}
                    onBlur={(e) => e.target.style.borderColor = '#e8ddd0'}
                  />
                  {searching && (
                    <p style={{ fontSize: 12, color: '#c0b0a0', margin: '6px 0 0', textAlign: 'center', fontFamily: 'Nunito, sans-serif', fontStyle: 'italic' }}>
                      searching...
                    </p>
                  )}
                  {!searching && searchResults.length > 0 && (
                    <div style={{ marginTop: 6, borderRadius: 8, overflow: 'hidden', border: '1px solid #e8ddd0', background: '#fffcf8' }}>
                      {searchResults.map(u => (
                        <div key={u.id} onClick={() => startDirectChat(u)}
                          style={{
                            padding: '9px 12px', cursor: 'pointer',
                            borderBottom: '1px solid #f0e8dc',
                            display: 'flex', alignItems: 'center', gap: 8,
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#faf6f0'}
                          onMouseLeave={(e) => e.currentTarget.style.background = '#fffcf8'}
                        >
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: getAvatarColor(u.username),
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 800, color: '#faf6f0',
                            fontFamily: 'Nunito, sans-serif',
                          }}>
                            {u.username[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#2c2410', fontSize: 13, fontFamily: 'Nunito, sans-serif' }}>
                              @{u.username}
                            </div>
                            <div style={{ fontSize: 11, color: '#b0a090', fontFamily: 'Nunito, sans-serif' }}>{u.email}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!searching && searchQuery.length > 0 && searchResults.length === 0 && (
                    <p style={{ fontSize: 12, color: '#c0b0a0', margin: '6px 0 0', textAlign: 'center', fontFamily: 'Nunito, sans-serif', fontStyle: 'italic' }}>
                      no users found
                    </p>
                  )}
                </>
              )}

              {newChatTab === 'group' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="text" value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="journal name..."
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderColor = '#8b5e3c'}
                    onBlur={(e) => e.target.style.borderColor = '#e8ddd0'}
                  />

                  {groupMembers.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {groupMembers.map(m => (
                        <div key={m.id} style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '3px 8px 3px 6px',
                          background: getAvatarColor(m.username),
                          borderRadius: 20, fontSize: 11, color: '#faf6f0',
                          fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                        }}>
                          @{m.username}
                          <span
                            onClick={() => setGroupMembers(p => p.filter(x => x.id !== m.id))}
                            style={{ cursor: 'pointer', opacity: 0.7, marginLeft: 2 }}
                          >×</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <input
                    type="text" value={groupMemberQuery}
                    onChange={(e) => setGroupMemberQuery(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="add @username..."
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderColor = '#8b5e3c'}
                    onBlur={(e) => e.target.style.borderColor = '#e8ddd0'}
                  />

                  {!searchingGroupMember && groupMemberResults.length > 0 && (
                    <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e8ddd0', background: '#fffcf8' }}>
                      {groupMemberResults.map(u => (
                        <div key={u.id} onClick={() => addGroupMember(u)}
                          style={{
                            padding: '8px 12px', cursor: 'pointer',
                            borderBottom: '1px solid #f0e8dc', fontSize: 13,
                            display: 'flex', alignItems: 'center', gap: 8,
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#faf6f0'}
                          onMouseLeave={(e) => e.currentTarget.style.background = '#fffcf8'}
                        >
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: getAvatarColor(u.username),
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800, color: '#faf6f0',
                            fontFamily: 'Nunito, sans-serif',
                          }}>
                            {u.username[0].toUpperCase()}
                          </div>
                          <span style={{ fontWeight: 700, color: '#2c2410', fontFamily: 'Nunito, sans-serif' }}>@{u.username}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={createGroup} disabled={creatingGroup}
                    style={{
                      padding: '9px 0', borderRadius: 8,
                      border: '1.5px solid #2c2410',
                      background: creatingGroup ? '#f5f0e8' : '#2c2410',
                      color: creatingGroup ? '#8b7b6b' : '#faf6f0',
                      fontSize: 13, fontWeight: 700,
                      cursor: creatingGroup ? 'default' : 'pointer',
                      fontFamily: 'Nunito, sans-serif',
                    }}
                  >
                    {creatingGroup ? 'creating...' : 'create journal →'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingRooms ? (
            <p style={{ fontSize: 13, color: '#c0b0a0', textAlign: 'center', marginTop: 24, fontStyle: 'italic', fontFamily: 'Lora, Georgia, serif' }}>
              loading journals...
            </p>
          ) : conversations.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <p style={{ fontSize: 32, margin: 0 }}>✒</p>
              <p style={{ fontSize: 14, color: '#c0b0a0', marginTop: 12, fontStyle: 'italic', fontFamily: 'Lora, Georgia, serif' }}>
                no journals yet
              </p>
              <p style={{ fontSize: 12, color: '#d0c0b0', marginTop: 6, fontFamily: 'Nunito, sans-serif', fontWeight: 600 }}>
                start one with a friend above
              </p>
            </div>
          ) : (
            conversations.filter(Boolean).map((room) => {
              const isGroup = room.room_type === 'group'
              const displayName = partnerNames[room.id] || (isGroup ? 'Group' : '...')
              const isActive = roomId === room.id
              const avatarColor = getAvatarColor(displayName)

              return (
                <div
                  key={room.id}
                  onClick={() => navigate(`/room/${room.id}`)}
                  style={{
                    padding: '13px 18px', cursor: 'pointer',
                    borderBottom: '1px solid #f0e8dc',
                    background: isActive ? '#f5efe6' : '#fffcf8',
                    borderLeft: isActive ? '3px solid #8b5e3c' : '3px solid transparent',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#faf6f0' }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = '#fffcf8' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%',
                      background: isGroup ? '#4a3728' : avatarColor,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: isGroup ? 16 : 14, fontWeight: 800,
                      color: '#faf6f0', flexShrink: 0,
                      fontFamily: 'Nunito, sans-serif',
                      border: isActive ? '2px solid #8b5e3c' : '2px solid transparent',
                      transition: 'all 0.2s',
                    }}>
                      {isGroup ? '◈' : displayName[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        margin: 0, fontSize: 14, fontWeight: 600,
                        color: '#2c2410', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontFamily: 'Lora, Georgia, serif',
                      }}>
                        {isGroup ? displayName : `@${displayName}`}
                      </p>
                      <p style={{
                        margin: 0, fontSize: 11, color: '#b0a090',
                        marginTop: 2, fontStyle: 'italic',
                        fontFamily: 'Lora, Georgia, serif',
                      }}>
                        {isGroup ? 'shared journal' : new Date(room.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{
        flex: 1,
        height: '100vh',
        overflow: 'hidden',
      }}>
        {roomId ? (
          <Room key={roomId} />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', background: '#faf6f0',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: 'radial-gradient(circle, #c8b89a 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              opacity: 0.4,
            }} />
            <div style={{ textAlign: 'center', position: 'relative' }}>
              {isMobile && (
                <p style={{ fontSize: 12, color: '#b0a090', marginBottom: 16, fontFamily: 'Nunito, sans-serif', fontWeight: 600 }}>
                  tap ☰ to open your journals
                </p>
              )}
              <div style={{ fontSize: 52, marginBottom: 16, opacity: 0.3 }}>✒</div>
              <h2 style={{
                fontSize: 22, fontWeight: 700, color: '#6b5040',
                fontFamily: 'Lora, Georgia, serif', margin: 0, fontStyle: 'italic',
              }}>
                open a journal
              </h2>
              <p style={{
                fontSize: 14, color: '#b0a090', marginTop: 8,
                fontFamily: 'Lora, Georgia, serif', fontStyle: 'italic',
              }}>
                or begin a new one with a friend
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Home