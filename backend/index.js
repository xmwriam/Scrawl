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
app.use(cors())
app.use(express.json())

const upload = multer({ storage: multer.memoryStorage() })
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
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

    const { data } = supabaseAdmin.storage
      .from('images')
      .getPublicUrl(fileName)

    res.json({ url: data.publicUrl })
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ error: err.message })
  }
})

// User Signup
app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    // Check if user already exists
    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single()

    if (existing) {
      return res.status(400).json({ error: 'Email already registered' })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    // Create user
    const { data: user, error } = await supabase
      .from('users')
      .insert({ email, password_hash: passwordHash })
      .select()
      .single()

    if (error) throw error

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )

    res.json({ token, userId: user.id, email: user.email })
  } catch (err) {
    console.error('Signup error:', err)
    res.status(500).json({ error: err.message })
  }
})

// User Login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    // Find user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single()

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Check password
    const isValid = await bcrypt.compare(password, user.password_hash)
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )

    res.json({ token, userId: user.id, email: user.email })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Google OAuth Login
app.post('/auth/google-login', async (req, res) => {
  try {
    const { token } = req.body
    if (!token) {
      return res.status(400).json({ error: 'Google token required' })
    }

    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    })

    const payload = ticket.getPayload()
    const email = payload.email
    const googleId = payload.sub

    if (!email) {
      return res.status(400).json({ error: 'Email not provided by Google' })
    }

    // Find or create user
    let { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single()

    if (error && error.code === 'PGRST116') {
      // User doesn't exist, create new one
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({ email, password_hash: 'google_oauth' })
        .select()
        .single()

      if (insertError) throw insertError
      user = newUser
    } else if (error) {
      throw error
    }

    // Generate JWT token
    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )

    res.json({ token: jwtToken, userId: user.id, email: user.email })
  } catch (err) {
    console.error('Google login error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Middleware to verify JWT
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

// Create new room
app.post('/rooms/create', verifyToken, async (req, res) => {
  console.log('rooms/create hit, user:', req.user) 
  try {
    const userId = req.user.userId
    console.log('userId:', userId) 

    // Generate unique room code
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

    // Create room
    const { data: room, error } = await supabase
      .from('rooms')
      .insert({ room_code: roomCode, owner_id: userId })
      .select()
      .single()

    if (error) throw error

    // Add owner to room_members
    await supabase
      .from('room_members')
      .insert({ room_id: room.id, user_id: userId })

    res.json({ roomId: room.id, roomCode: room.room_code })
  } catch (err) {
    console.error('Create room error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Join existing room
app.post('/rooms/join', verifyToken, async (req, res) => {
  try {
    const { roomCode } = req.body
    const userId = req.user.userId

    if (!roomCode) return res.status(400).json({ error: 'Room code required' })

    // Find room by code
    const { data: room, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_code', roomCode.toUpperCase())
      .single()

    if (error || !room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    // Check if room already has 2 members (1-on-1)
    const { data: members, error: memberError } = await supabase
      .from('room_members')
      .select('id')
      .eq('room_id', room.id)

    if (memberError) throw memberError

    if (members.length >= 2) {
      return res.status(400).json({ error: 'Room is full (max 2 members)' })
    }

    // Check if user already in room
    const { data: existing } = await supabase
      .from('room_members')
      .select('id')
      .eq('room_id', room.id)
      .eq('user_id', userId)
      .single()

    if (existing) {
      return res.status(400).json({ error: 'Already joined this room' })
    }

    // Add user to room_members
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

io.on('connection', (socket) => {
  console.log('connected:', socket.id)

  socket.on('join-room', async (roomId, token) => {
    try {
      // Verify JWT token
      if (!token) {
        socket.emit('auth-error', 'Token required')
        return
      }

      let userId
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        userId = decoded.userId
      } catch (err) {
        socket.emit('auth-error', 'Invalid token')
        return
      }

      // Verify user is a member of this room
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

      // Initialize room tracking if needed
      if (!rooms[roomId]) {
        rooms[roomId] = { members: [], users: {} }
      }

      const room = rooms[roomId]

      // If socket already connected, skip
      if (room.members.includes(socket.id)) return

      // Add socket to room tracking
      room.members.push(socket.id)
      room.users[socket.id] = userId
      socket.join(roomId)
      socket.data.roomId = roomId
      socket.data.userId = userId

      console.log(`${socket.id} joined room ${roomId} (${room.members.length}/2)`)

      // Load only SENT elements from the database
      const { data, error } = await supabase
        .from('elements')
        .select('*')
        .eq('room_id', roomId)
        .eq('sent', true) // only load committed elements
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error loading canvas:', error)
        socket.emit('canvas-state', [])
      } else {
        socket.emit('canvas-state', data.map(row => row.data))
      }

      // If second user joined, notify both
      if (room.members.length === 2) {
        io.to(roomId).emit('partner-joined')
      }
    } catch (err) {
      console.error('Join room error:', err)
      socket.emit('auth-error', err.message)
    }
  })

  // Save draft element to DB (not sent yet — only visible to sender)
  socket.on('save-draft', async ({ roomId, element }) => {
    await supabase
      .from('elements')
      .insert({
        id: element.id,
        room_id: roomId,
        type: element.type,
        data: element,
        sent: false, // draft, not yet sent
      })
  })

  // Send all drafts — mark them as sent and broadcast to partner
  socket.on('send-drafts', async ({ roomId, elements }) => {
    // Mark all these elements as sent in DB
    const ids = elements.map(el => el.id)

    await supabase
      .from('elements')
      .update({ sent: true })
      .in('id', ids)

    // Broadcast all sent elements to partner at once
    socket.to(roomId).emit('elements-received', elements)
  })

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId
    if (!roomId || !rooms[roomId]) return
    
    rooms[roomId].members = rooms[roomId].members.filter(id => id !== socket.id)
    console.log(`${socket.id} left room ${roomId} (${rooms[roomId].members.length}/2)`)
    
    // Notify remaining partner
    socket.to(roomId).emit('partner-left')
    
    // Clean up empty rooms
    if (rooms[roomId].members.length === 0) {
      delete rooms[roomId]
    }
  })
})

server.listen(3001, () => {
  console.log('Scrawl server running on http://localhost:3001')
})