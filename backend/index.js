require('dotenv').config()
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const multer = require('multer')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const { OAuth2Client } = require('google-auth-library')
const { createClient } = require('@supabase/supabase-js')

const app = express()
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173'
}))
app.use(express.json())

const upload = multer({ storage: multer.memoryStorage() })
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
})

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
const SALT_ROUNDS = 10
const rooms = {}

// ─── Upload ───────────────────────────────────────────────────────────────────

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file
    const fileName = `${Date.now()}-${file.originalname}`
    const { error } = await supabaseAdmin.storage
      .from('images')
      .upload(fileName, file.buffer, { contentType: file.mimetype })
    if (error) throw error
    const { data } = supabaseAdmin.storage.from('images').getPublicUrl(fileName)
    res.json({ url: data.publicUrl })
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── Auth ─────────────────────────────────────────────────────────────────────

app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, username } = req.body
    if (!email || !password || !username)
      return res.status(400).json({ error: 'Email, password and username required' })

    const { data: existingUsername } = await supabase
      .from('users').select('id').eq('username', username).single()
    if (existingUsername)
      return res.status(400).json({ error: 'Username already taken' })

    const { data: existingEmail } = await supabase
      .from('users').select('id').eq('email', email).single()
    if (existingEmail)
      return res.status(400).json({ error: 'Email already registered' })

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    const { data: user, error } = await supabase
      .from('users')
      .insert({ email, password_hash: passwordHash, username })
      .select().single()
    if (error) throw error

    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      process.env.JWT_SECRET, { expiresIn: '30d' }
    )
    res.json({ token, userId: user.id, email: user.email, username: user.username })
  } catch (err) {
    console.error('Signup error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' })

    const { data: user, error } = await supabase
      .from('users').select('*').eq('username', username.toLowerCase()).single()
    if (error || !user)
      return res.status(401).json({ error: 'Invalid username or password' })

    const isValid = await bcrypt.compare(password, user.password_hash)
    if (!isValid)
      return res.status(401).json({ error: 'Invalid username or password' })

    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      process.env.JWT_SECRET, { expiresIn: '30d' }
    )
    res.json({ token, userId: user.id, email: user.email, username: user.username })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/auth/google-login', async (req, res) => {
  try {
    const { token } = req.body
    if (!token) return res.status(400).json({ error: 'Google token required' })

    const ticket = await googleClient.verifyIdToken({
      idToken: token, audience: process.env.GOOGLE_CLIENT_ID
    })
    const payload = ticket.getPayload()
    const email = payload.email
    if (!email) return res.status(400).json({ error: 'Email not provided by Google' })

    let { data: user, error } = await supabase
      .from('users').select('*').eq('email', email).single()

    if (error && error.code === 'PGRST116') {
      const baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '')
      let username = baseUsername
      let suffix = 1
      while (true) {
        const { data: taken } = await supabase
          .from('users').select('id').eq('username', username).single()
        if (!taken) break
        username = `${baseUsername}${suffix++}`
      }
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({ email, password_hash: 'google_oauth', username })
        .select().single()
      if (insertError) throw insertError
      user = newUser
    } else if (error) {
      throw error
    }

    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      process.env.JWT_SECRET, { expiresIn: '30d' }
    )
    res.json({ token: jwtToken, userId: user.id, email: user.email, username: user.username })
  } catch (err) {
    console.error('Google login error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── Middleware ───────────────────────────────────────────────────────────────

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Token required' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// ─── Users ────────────────────────────────────────────────────────────────────

app.get('/users/search', verifyToken, async (req, res) => {
  try {
    const { username } = req.query
    if (!username) return res.status(400).json({ error: 'Username required' })
    const { data, error } = await supabase
      .from('users')
      .select('id, email, username')
      .ilike('username', `%${username}%`)
      .neq('id', req.user.userId)
      .limit(10)
    if (error) throw error
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Rooms ────────────────────────────────────────────────────────────────────

app.get('/rooms/mine', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const { data, error } = await supabase
      .from('room_members')
      .select(`room_id, rooms(id, room_code, created_at, owner_id, room_type, room_name, group_id)`)
      .eq('user_id', userId)
    if (error) throw error

    const roomList = data
      .map(d => d.rooms)
      .filter(Boolean)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    res.json(roomList)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/rooms/create-with-user', verifyToken, async (req, res) => {
  try {
    const { targetUserId } = req.body
    const userId = req.user.userId
    if (!targetUserId) return res.status(400).json({ error: 'Target user required' })
    if (targetUserId === userId) return res.status(400).json({ error: "Can't start a journal with yourself" })

    // Check if direct room already exists between these two
    const { data: myRooms } = await supabase
      .from('room_members').select('room_id').eq('user_id', userId)

    if (myRooms && myRooms.length > 0) {
      const myRoomIds = myRooms.map(r => r.room_id)
      const { data: shared } = await supabase
        .from('room_members').select('room_id')
        .eq('user_id', targetUserId).in('room_id', myRoomIds)

      if (shared && shared.length > 0) {
        // Make sure it's a direct room not a group
        const { data: existingRoom } = await supabase
          .from('rooms').select('*')
          .eq('id', shared[0].room_id)
          .eq('room_type', 'direct')
          .single()
        if (existingRoom) {
          return res.json({ roomId: existingRoom.id, roomCode: existingRoom.room_code })
        }
      }
    }

    let roomCode
    let roomExists = true
    while (roomExists) {
      roomCode = Math.random().toString(36).substring(2, 8).toUpperCase()
      const { data } = await supabase
        .from('rooms').select('id').eq('room_code', roomCode).single()
      roomExists = !!data
    }

    const { data: room, error } = await supabase
      .from('rooms')
      .insert({ room_code: roomCode, owner_id: userId, room_type: 'direct' })
      .select().single()
    if (error) throw error

    await supabase.from('room_members').insert([
      { room_id: room.id, user_id: userId },
      { room_id: room.id, user_id: targetUserId },
    ])

    res.json({ roomId: room.id, roomCode: room.room_code })
  } catch (err) {
    console.error('Create with user error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/rooms/:roomId/partner', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params
    const userId = req.user.userId
    const { data: members, error } = await supabase
      .from('room_members')
      .select('user_id, users(id, username, email)')
      .eq('room_id', roomId)
    if (error) throw error
    const partner = members.map(m => m.users).find(u => u.id !== userId)
    res.json(partner || null)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/rooms/:roomId/members', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params
    const { data: members, error } = await supabase
      .from('room_members')
      .select('user_id, users(id, username, email)')
      .eq('room_id', roomId)
    if (error) throw error
    res.json(members.map(m => m.users).filter(Boolean))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Groups ───────────────────────────────────────────────────────────────────

app.post('/groups/create', verifyToken, async (req, res) => {
  try {
    const { name, memberUsernames } = req.body
    const userId = req.user.userId

    if (!name || !name.trim())
      return res.status(400).json({ error: 'Group name required' })
    if (!memberUsernames || memberUsernames.length === 0)
      return res.status(400).json({ error: 'Add at least one member' })

    // Create the group
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .insert({ name: name.trim(), created_by: userId })
      .select().single()
    if (groupError) throw groupError

    // Look up member user IDs from usernames
    const { data: memberUsers, error: usersError } = await supabase
      .from('users')
      .select('id, username')
      .in('username', memberUsernames)
    if (usersError) throw usersError

    const notFound = memberUsernames.filter(
      u => !memberUsers.find(mu => mu.username === u)
    )
    if (notFound.length > 0)
      return res.status(400).json({ error: `Users not found: ${notFound.join(', ')}` })

    // Generate unique room code
    let roomCode
    let roomExists = true
    while (roomExists) {
      roomCode = Math.random().toString(36).substring(2, 8).toUpperCase()
      const { data } = await supabase
        .from('rooms').select('id').eq('room_code', roomCode).single()
      roomExists = !!data
    }

    // Create a room for this group
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({
        room_code: roomCode,
        owner_id: userId,
        room_type: 'group',
        room_name: name.trim(),
        group_id: group.id,
      })
      .select().single()
    if (roomError) throw roomError

    // Add creator + all members to room_members and group_members
    const allUserIds = [userId, ...memberUsers.map(u => u.id)]
    const uniqueUserIds = [...new Set(allUserIds)]

    await supabase.from('room_members').insert(
      uniqueUserIds.map(uid => ({ room_id: room.id, user_id: uid }))
    )
    await supabase.from('group_members').insert(
      uniqueUserIds.map(uid => ({ group_id: group.id, user_id: uid }))
    )

    res.json({ roomId: room.id, roomCode: room.room_code, groupId: group.id, name: group.name })
  } catch (err) {
    console.error('Create group error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/groups/:groupId/members', verifyToken, async (req, res) => {
  try {
    const { groupId } = req.params
    const { data, error } = await supabase
      .from('group_members')
      .select('user_id, users(id, username, email)')
      .eq('group_id', groupId)
    if (error) throw error
    res.json(data.map(d => d.users).filter(Boolean))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Socket.io ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('connected:', socket.id)

  socket.on('join-room', async (roomId, token) => {
    try {
      if (!token) { socket.emit('auth-error', 'Token required'); return }

      let userId
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        userId = decoded.userId
      } catch (err) {
        socket.emit('auth-error', 'Invalid token'); return
      }

      const { data: membership, error: memberError } = await supabase
        .from('room_members').select('*')
        .eq('room_id', roomId).eq('user_id', userId).single()
      if (memberError || !membership) {
        socket.emit('auth-error', 'Not a member of this room'); return
      }

      if (!rooms[roomId]) rooms[roomId] = { members: [], users: {} }
      const room = rooms[roomId]
      if (room.members.includes(socket.id)) return

      room.members.push(socket.id)
      room.users[socket.id] = userId
      socket.join(roomId)
      socket.data.roomId = roomId
      socket.data.userId = userId

      const { data, error } = await supabase
        .from('elements').select('*')
        .eq('room_id', roomId).eq('sent', true)
        .order('created_at', { ascending: true })

      socket.emit('canvas-state', error ? [] : data.map(row => row.data))

      const onlineCount = room.members.length
      if (onlineCount >= 2) io.to(roomId).emit('partner-joined')
    } catch (err) {
      socket.emit('auth-error', err.message)
    }
  })

  socket.on('save-draft', async ({ roomId, element }) => {
    await supabase.from('elements').insert({
      id: element.id, room_id: roomId,
      type: element.type, data: element, sent: false,
    })
  })

  socket.on('send-drafts', async ({ roomId, elements }) => {
    const ids = elements.map(el => el.id)
    await supabase.from('elements').update({ sent: true }).in('id', ids)
    socket.to(roomId).emit('elements-received', elements)
  })

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId
    if (!roomId || !rooms[roomId]) return
    rooms[roomId].members = rooms[roomId].members.filter(id => id !== socket.id)
    socket.to(roomId).emit('partner-left')
    if (rooms[roomId].members.length === 0) delete rooms[roomId]
  })
})

// ─── Start ────────────────────────────────────────────────────────────────────

server.listen(3001, () => console.log('Scrawl server running on http://localhost:3001'))