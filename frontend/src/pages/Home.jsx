import { useContext, useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'
import Room from './Room'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

function Home() {
  const { user, token, logout } = useContext(AuthContext)
  const navigate = useNavigate()
  const { roomId } = useParams()

  const [conversations, setConversations] = useState([])
  const [partnerNames, setPartnerNames] = useState({})
  const [loadingRooms, setLoadingRooms] = useState(true)

  // new chat
  const [showNewChat, setShowNewChat] = useState(false)
  const [newChatTab, setNewChatTab] = useState('direct') // 'direct' | 'group'
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  // group creation
  const [groupName, setGroupName] = useState('')
  const [groupMemberQuery, setGroupMemberQuery] = useState('')
  const [groupMemberResults, setGroupMemberResults] = useState([])
  const [groupMembers, setGroupMembers] = useState([]) // {id, username}
  const [searchingGroupMember, setSearchingGroupMember] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)

  // Load rooms
  useEffect(() => {
    if (!token) return
    fetch(`${BACKEND_URL}/rooms/mine`, {
      headers: { Authorization: `Bearer ${token}` }
    })
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

  // Search users for direct chat
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    const timeout = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(
          `${BACKEND_URL}/users/search?username=${encodeURIComponent(searchQuery)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const data = await res.json()
        setSearchResults(Array.isArray(data) ? data : [])
      } catch (e) {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchQuery, token])

  // Search users for group member add
  useEffect(() => {
    if (!groupMemberQuery.trim()) { setGroupMemberResults([]); return }
    const timeout = setTimeout(async () => {
      setSearchingGroupMember(true)
      try {
        const res = await fetch(
          `${BACKEND_URL}/users/search?username=${encodeURIComponent(groupMemberQuery)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const data = await res.json()
        // Filter out already added members
        const filtered = Array.isArray(data)
          ? data.filter(u => !groupMembers.find(m => m.id === u.id))
          : []
        setGroupMemberResults(filtered)
      } catch (e) {
        setGroupMemberResults([])
      } finally {
        setSearchingGroupMember(false)
      }
    }, 300)
    return () => clearTimeout(timeout)
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
      setShowNewChat(false)
      setSearchQuery('')
      setConversations(prev => {
        if (prev.find(r => r.id === data.roomId)) return prev
        return [{ id: data.roomId, room_code: data.roomCode, created_at: new Date().toISOString(), room_type: 'direct' }, ...prev]
      })
      setPartnerNames(prev => ({ ...prev, [data.roomId]: otherUser.username }))
      navigate(`/room/${data.roomId}`)
    } catch (err) {
      alert(err.message)
    }
  }

  const addGroupMember = (u) => {
    setGroupMembers(prev => [...prev, { id: u.id, username: u.username }])
    setGroupMemberQuery('')
    setGroupMemberResults([])
  }

  const removeGroupMember = (id) => {
    setGroupMembers(prev => prev.filter(m => m.id !== id))
  }

  const createGroup = async () => {
    if (!groupName.trim()) { alert('Enter a group name'); return }
    if (groupMembers.length === 0) { alert('Add at least one member'); return }
    setCreatingGroup(true)
    try {
      const res = await fetch(`${BACKEND_URL}/groups/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: groupName.trim(),
          memberUsernames: groupMembers.map(m => m.username)
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowNewChat(false)
      setGroupName('')
      setGroupMembers([])
      setConversations(prev => [
        { id: data.roomId, room_code: data.roomCode, created_at: new Date().toISOString(), room_type: 'group', room_name: data.name },
        ...prev
      ])
      setPartnerNames(prev => ({ ...prev, [data.roomId]: data.name }))
      navigate(`/room/${data.roomId}`)
    } catch (err) {
      alert(err.message)
    } finally {
      setCreatingGroup(false)
    }
  }

  const openRoom = (id) => navigate(`/room/${id}`)

  const resetNewChat = () => {
    setShowNewChat(false)
    setSearchQuery('')
    setSearchResults([])
    setGroupName('')
    setGroupMembers([])
    setGroupMemberQuery('')
    setGroupMemberResults([])
    setNewChatTab('direct')
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Georgia, serif', background: '#faf9f6' }}>

      {/* ── Sidebar ── */}
      <div style={{
        width: 280, minWidth: 280, height: '100vh',
        background: 'white', borderRight: '1px solid #ede8e0',
        display: 'flex', flexDirection: 'column', zIndex: 10,
      }}>

        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #ede8e0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <h1 style={{ fontSize: 28, color: '#2c2c2c', letterSpacing: -1, margin: 0, fontFamily: 'Georgia, serif' }}>
              scrawl
            </h1>
            <button
              onClick={logout}
              style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: 'none', background: '#f0f0f0', color: '#888', cursor: 'pointer' }}
            >
              logout
            </button>
          </div>
          {user && (
            <p style={{ margin: 0, fontSize: 13, color: '#b0a89a' }}>
              @{user.username || user.email}
            </p>
          )}
        </div>

        {/* New chat button */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #ede8e0' }}>
          <button
            onClick={() => showNewChat ? resetNewChat() : setShowNewChat(true)}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
              background: showNewChat ? '#2c2c2c' : '#f5f2ee',
              color: showNewChat ? 'white' : '#2c2c2c',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'Georgia, serif', transition: 'all 0.2s',
            }}
          >
            {showNewChat ? '✕ cancel' : '✎ new journal'}
          </button>

          {showNewChat && (
            <div style={{ marginTop: 10 }}>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {['direct', 'group'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setNewChatTab(tab)}
                    style={{
                      flex: 1, padding: '6px 0', borderRadius: 8, border: 'none',
                      background: newChatTab === tab ? '#2c2c2c' : '#f0f0f0',
                      color: newChatTab === tab ? 'white' : '#666',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      fontFamily: 'Georgia, serif',
                    }}
                  >
                    {tab === 'direct' ? '👤 direct' : '👥 group'}
                  </button>
                ))}
              </div>

              {/* Direct chat search */}
              {newChatTab === 'direct' && (
                <>
                  <input
                    autoFocus
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="search @username"
                    style={{
                      width: '100%', padding: '8px 12px', border: '1.5px solid #e0dbd4',
                      borderRadius: 8, fontSize: 14, fontFamily: 'Georgia, serif',
                      outline: 'none', background: '#faf9f6', boxSizing: 'border-box',
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#2c2c2c'}
                    onBlur={(e) => e.target.style.borderColor = '#e0dbd4'}
                  />
                  {searching && (
                    <p style={{ fontSize: 12, color: '#aaa', margin: '8px 0 0', textAlign: 'center' }}>searching...</p>
                  )}
                  {!searching && searchResults.length > 0 && (
                    <div style={{ marginTop: 6, border: '1px solid #ede8e0', borderRadius: 8, overflow: 'hidden', background: 'white' }}>
                      {searchResults.map(u => (
                        <div
                          key={u.id}
                          onClick={() => startDirectChat(u)}
                          style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f5f2ee', fontSize: 14, color: '#2c2c2c' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#faf9f6'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                        >
                          <strong>@{u.username}</strong>
                          <span style={{ color: '#aaa', marginLeft: 8, fontSize: 12 }}>{u.email}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {!searching && searchQuery.length > 0 && searchResults.length === 0 && (
                    <p style={{ fontSize: 12, color: '#aaa', margin: '8px 0 0', textAlign: 'center' }}>no users found</p>
                  )}
                </>
              )}

              {/* Group creation */}
              {newChatTab === 'group' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="group name"
                    style={{
                      width: '100%', padding: '8px 12px', border: '1.5px solid #e0dbd4',
                      borderRadius: 8, fontSize: 14, fontFamily: 'Georgia, serif',
                      outline: 'none', background: '#faf9f6', boxSizing: 'border-box',
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#2c2c2c'}
                    onBlur={(e) => e.target.style.borderColor = '#e0dbd4'}
                  />

                  {/* Added members */}
                  {groupMembers.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {groupMembers.map(m => (
                        <div
                          key={m.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '3px 8px', background: '#f0f0f0',
                            borderRadius: 20, fontSize: 12, color: '#2c2c2c',
                          }}
                        >
                          @{m.username}
                          <span
                            onClick={() => removeGroupMember(m.id)}
                            style={{ cursor: 'pointer', color: '#aaa', marginLeft: 2, fontWeight: 700 }}
                          >
                            ×
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Search members */}
                  <input
                    type="text"
                    value={groupMemberQuery}
                    onChange={(e) => setGroupMemberQuery(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="add members by @username"
                    style={{
                      width: '100%', padding: '8px 12px', border: '1.5px solid #e0dbd4',
                      borderRadius: 8, fontSize: 14, fontFamily: 'Georgia, serif',
                      outline: 'none', background: '#faf9f6', boxSizing: 'border-box',
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#2c2c2c'}
                    onBlur={(e) => e.target.style.borderColor = '#e0dbd4'}
                  />

                  {searchingGroupMember && (
                    <p style={{ fontSize: 12, color: '#aaa', margin: 0, textAlign: 'center' }}>searching...</p>
                  )}
                  {!searchingGroupMember && groupMemberResults.length > 0 && (
                    <div style={{ border: '1px solid #ede8e0', borderRadius: 8, overflow: 'hidden', background: 'white' }}>
                      {groupMemberResults.map(u => (
                        <div
                          key={u.id}
                          onClick={() => addGroupMember(u)}
                          style={{ padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid #f5f2ee', fontSize: 13 }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#faf9f6'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                        >
                          <strong>@{u.username}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={createGroup}
                    disabled={creatingGroup}
                    style={{
                      padding: '10px 0', borderRadius: 10, border: 'none',
                      background: '#2c2c2c', color: 'white',
                      fontSize: 14, fontWeight: 600, cursor: creatingGroup ? 'default' : 'pointer',
                      fontFamily: 'Georgia, serif', opacity: creatingGroup ? 0.6 : 1,
                    }}
                  >
                    {creatingGroup ? 'creating...' : 'create group →'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingRooms ? (
            <p style={{ fontSize: 13, color: '#aaa', textAlign: 'center', marginTop: 24 }}>loading...</p>
          ) : conversations.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: '#c8c2ba', fontStyle: 'italic', margin: 0 }}>no journals yet</p>
              <p style={{ fontSize: 12, color: '#d4cfc9', margin: '8px 0 0' }}>start one by searching for a friend</p>
            </div>
          ) : (
            conversations.filter(Boolean).map((room) => {
              const isGroup = room.room_type === 'group'
              const displayName = partnerNames[room.id] || (isGroup ? 'Group' : 'loading...')
              const avatar = isGroup ? '👥' : (partnerNames[room.id] ? partnerNames[room.id][0].toUpperCase() : '✎')
              const isActive = roomId === room.id

              return (
                <div
                  key={room.id}
                  onClick={() => openRoom(room.id)}
                  style={{
                    padding: '14px 20px', cursor: 'pointer',
                    borderBottom: '1px solid #f5f2ee',
                    background: isActive ? '#f5f2ee' : 'white',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#faf9f6' }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'white' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: isActive ? '#2c2c2c' : '#ede8e0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: isGroup ? 20 : 16, fontWeight: 600, flexShrink: 0,
                      color: isActive ? 'white' : '#888',
                      fontFamily: 'Georgia, serif', transition: 'all 0.2s',
                    }}>
                      {avatar}
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#2c2c2c' }}>
                        {isGroup ? displayName : `@${displayName}`}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: '#b0a89a', marginTop: 2 }}>
                        {isGroup ? 'group journal' : new Date(room.created_at).toLocaleDateString()}
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
      <div style={{ flex: 1, height: '100vh', overflow: 'hidden' }}>
        {roomId ? (
          <Room key={roomId} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 48, margin: 0 }}>✎</p>
              <p style={{ fontSize: 16, color: '#c8c2ba', fontStyle: 'italic', marginTop: 12 }}>
                select a journal or start a new one
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

export default Home