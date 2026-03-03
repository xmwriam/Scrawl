import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

export function useSocket(roomId, token, navigate) {
  const socketRef = useRef(null)
  const [sentElements, setSentElements] = useState([])
  const [partnerOnline, setPartnerOnline] = useState(false)

  useEffect(() => {
    if (!roomId || !token) return
    const socket = io(BACKEND_URL, { transports: ['polling', 'websocket'] })
    socketRef.current = socket
    socket.emit('join-room', roomId, token)
    socket.on('canvas-state', (elements) => setSentElements(elements))
    socket.on('elements-received', (elements) => setSentElements(prev => [...prev, ...elements]))
    socket.on('partner-joined', () => setPartnerOnline(true))
    socket.on('partner-left', () => setPartnerOnline(false))
    socket.on('auth-error', (error) => { alert(error); navigate('/') })
    socket.on('disconnect', () => setPartnerOnline(false))
    return () => {
      socket.off('canvas-state')
      socket.off('elements-received')
      socket.off('partner-joined')
      socket.off('partner-left')
      socket.off('auth-error')
      socket.off('disconnect')
      socket.disconnect()
    }
  }, [roomId, token, navigate])

  const sendDrafts = (elements) => {
    socketRef.current?.emit('send-drafts', { roomId, elements })
  }

  const saveDraft = (element) => {
    socketRef.current?.emit('save-draft', { roomId, element })
  }

  return { sentElements, setSentElements, partnerOnline, sendDrafts, saveDraft }
}