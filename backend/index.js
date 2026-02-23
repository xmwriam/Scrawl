const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')

const app = express()
app.use(cors())

const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173', // your React app's address
    methods: ['GET', 'POST']
  }
})

// Each room stores its elements here (in memory for now)
const rooms = {}

io.on('connection', (socket) => {
  console.log('a user connected:', socket.id)

  // User joins a room
  socket.on('join-room', (roomId) => {
    socket.join(roomId)
    console.log(`${socket.id} joined room ${roomId}`)

    // Send them everything already on the canvas
    if (rooms[roomId]) {
      socket.emit('canvas-state', rooms[roomId])
    } else {
      rooms[roomId] = []
    }
  })

  // User added a new element (text or drawing)
  socket.on('add-element', ({ roomId, element }) => {
    if (!rooms[roomId]) rooms[roomId] = []
    rooms[roomId].push(element)

    // Forward to everyone else in the room
    socket.to(roomId).emit('element-added', element)
  })

  // User is currently drawing (in-progress line)
  socket.on('drawing-in-progress', ({ roomId, line }) => {
    // Forward to everyone else — don't save, it's not committed yet
    socket.to(roomId).emit('drawing-in-progress', line)
  })

  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id)
  })
})

server.listen(3001, () => {
  console.log('Scrawl server running on http://localhost:3001')
})