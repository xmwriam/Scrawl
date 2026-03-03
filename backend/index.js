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

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
const SALT_ROUNDS = 10
const rooms = {}

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

// Signup
app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, username } = req.body
    if (!email || !password || !username) {
      return res.status(400).json({ error: 'Email, password and username required' })
    }

    // Check username taken
    const { data: existingUsername } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single()
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already taken' })
    }

    // Check email taken
    const { data: existingEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single()
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered' })
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    const { data: user, error } = await supabase
      .from('users')
      .insert({ email, password_hash: passwordHash, username })
      .select()
      .single()
    if (error) throw error

    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
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
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' })
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username.toLowerCase())
      .single()

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid username or password' })
    }

    const isValid = await bcrypt.compare(password, user.password_hash)
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password' })
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )
    res.json({ token, userId: user.id, email: user.email, username: user.username })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Google Login
app.post('/auth/google-login', async (req, res) => {
  try {
    const { token } = req.body
    if (!token) return res.status(400).json({ error: 'Google token required' })

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    })
    const payload = ticket.getPayload()
    const email = payload.email
    if (!email) return res.status(400).json({ error: 'Email not provided by Google' })

    let { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single()

    if (error && error.code === 'PGRST116') {
      // Auto-generate a username from email for Google users
      const baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '')
      let username = baseUsername
      let suffix = 1
      while (true) {
        const { data: taken } = await supabase
          .from('users')
          .select('id')
          .eq('username', username)
          .single()
        if (!taken) break
        username = `${baseUsername}${suffix++}`
      }

      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({ email, password_hash: 'google_oauth', username })
        .select()
        .single()
      if (insertError) throw insertError
      user = newUser
    } else if (error) {
      throw error
    }

    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )
    res.json({ token: jwtToken, userId: user.id, email: user.email, username: user.username })
  } catch (err) {
    console.error('Google login error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Verify JWT middleware
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

// Search users by username
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

// Create room
app.post('/rooms/create', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId
    let roomCode
    let roomExists = true
    while (roomExists) {
      roomCode = Math.random().toString(36).substring(2, 8).toUpperCase()
      const { data } = await supabase
        .from('rooms')
        .select('id')
        .eq('room_code', roomCode)
        .single()
      roomExists = !!data
    }

    const { data: room, error } = await supabase
      .from('rooms')
      .insert({ room_code: roomCode, owner_id: userId })
      .select()
      .single()
    if (error) throw error

    await supabase
      .from('room_members')
      .insert({ room_id: room.id, user_id: userId })

    res.json({ roomId: room.id, roomCode: room.room_code })
  } catch (err) {
    console.error('Create room error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Join room
app.post('/rooms/join', verifyToken, async (req, res) => {
  try {
    const { roomCode } = req.body
    const userId = req.user.userId
    if (!roomCode) return res.status(400).json({ error: 'Room code required' })

    const { data: room, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_code', roomCode.toUpperCase())
      .single()
    if (error || !room) return res.status(404).json({ error: 'Room not found' })

    const { data: members, error: memberError } = await supabase
      .from('room_members')
      .select('id')
      .eq('room_id', room.id)
    if (memberError) throw memberError
    if (members.length >= 2) return res.status(400).json({ error: 'Room is full' })

    const { data: existing } = await supabase
      .from('room_members')
      .select('id')
      .eq('room_id', room.id)
      .eq('user_id', userId)
      .single()
    if (existing) return res.status(400).json({ error: 'Already joined this room' })

    const { error: joinError } = await supabase
      .from('room_members')
      .insert({ room_id: room.id, user_id: userId })
    if (joinError) throw joinError

    res.json({ roomId: room.id, roomCode: room.room_code })
  } catch (err) {
    console.error('Join room error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Get my rooms
app.get('/rooms/mine', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const { data, error } = await supabase
      .from('room_members')
      .select('room_id, rooms(id, room_code, created_at)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data.map(d => d.rooms))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

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
        socket.emit('auth-error', 'Invalid token')
        return
      }

      const { data: membership, error: memberError } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .single()
      if (memberError || !membership) {
        socket.emit('auth-error', 'Not a member of this room')
        return
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
        .from('elements')
        .select('*')
        .eq('room_id', roomId)
        .eq('sent', true)
        .order('created_at', { ascending: true })

      socket.emit('canvas-state', error ? [] : data.map(row => row.data))
      if (room.members.length === 2) io.to(roomId).emit('partner-joined')
    } catch (err) {
      socket.emit('auth-error', err.message)
    }
  })

  socket.on('save-draft', async ({ roomId, element }) => {
    await supabase.from('elements').insert({
      id: element.id,
      room_id: roomId,
      type: element.type,
      data: element,
      sent: false,
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

server.listen(3001, () => console.log('Scrawl server running on http://localhost:3001'))