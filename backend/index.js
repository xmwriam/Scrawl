require('dotenv').config()
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const multer = require('multer')
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