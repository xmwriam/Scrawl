require('dotenv').config()
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const multer = require('multer')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
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

io.on('connection', (socket) => {
  console.log('connected:', socket.id)

  socket.on('join-room', async (roomId) => {
    if (!rooms[roomId]) {
      rooms[roomId] = { members: [] }
    }

    const room = rooms[roomId]

    if (room.members.includes(socket.id)) return

    if (room.members.length >= 2) {
      socket.emit('room-full')
      return
    }

    room.members.push(socket.id)
    socket.join(roomId)
    socket.data.roomId = roomId

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

    if (room.members.length === 2) {
      socket.to(roomId).emit('partner-joined')
      socket.emit('partner-joined')
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
    console.log(`${socket.id} left room ${roomId}`)
    socket.to(roomId).emit('partner-left')
  })
})

server.listen(3001, () => {
  console.log('Scrawl server running on http://localhost:3001')
})