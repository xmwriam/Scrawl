const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')

const app = express()
app.use(cors())

const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
})

const rooms = {}

io.on('connection', (socket) => {
  console.log('connected:', socket.id)

  socket.on('join-room', (roomId) => {
    if (!rooms[roomId]) {
      rooms[roomId] = { members: [], elements: [] }
    }

    const room = rooms[roomId]

    // Don't count the same socket twice
    if (room.members.includes(socket.id)) return

    // Block if full
    if (room.members.length >= 2) {
      socket.emit('room-full')
      return
    }

    room.members.push(socket.id)
    socket.join(roomId)
    socket.data.roomId = roomId

    console.log(`${socket.id} joined room ${roomId} (${room.members.length}/2)`)

    socket.emit('canvas-state', room.elements)

    if (room.members.length === 2) {
      socket.to(roomId).emit('partner-joined')
      socket.emit('partner-joined') // tell the first person too
    }
  })

  socket.on('add-element', ({ roomId, element }) => {
    if (!rooms[roomId]) return
    rooms[roomId].elements.push(element)
    socket.to(roomId).emit('element-added', element)
  })

  socket.on('drawing-in-progress', ({ roomId, line }) => {
    socket.to(roomId).emit('drawing-in-progress', line)
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