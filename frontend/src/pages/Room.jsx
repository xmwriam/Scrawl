// Limit for max distance from last drawing (in px)
const MAX_DRAW_DISTANCE = 1000;

import { Stage, Layer, Rect, Line, Text, Image as KonvaImage } from 'react-konva'
import { useRef, useState, useEffect, useContext } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { io } from 'socket.io-client'
import { AuthContext } from '../context/AuthContext'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const CANVAS_WIDTH = window.innerWidth
const CANVAS_HEIGHT = 10000

function Room() {
    const [drawWarning, setDrawWarning] = useState("");
  const { roomId: paramRoomId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = useContext(AuthContext)
  const socketRef = useRef(null)
  const roomId = paramRoomId
  const [roomCode, setRoomCode] = useState(location.state?.roomCode || '')
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })

  const [sentElements, setSentElements] = useState([])
  const [draftElements, setDraftElements] = useState([])

  const [currentLine, setCurrentLine] = useState(null)
  const [tool, setTool] = useState('draw')
  const [drawColor, setDrawColor] = useState('#2c2c2c')
  const [brushSize, setBrushSize] = useState(3)
  const [textColor, setTextColor] = useState('#2c2c2c')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  const [textInput, setTextInput] = useState(null)
  const [rejected, setRejected] = useState(false)
  const [partnerOnline, setPartnerOnline] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [loadedImages, setLoadedImages] = useState({})
  const [selectedId, setSelectedId] = useState(null)
  const [hoveredElementId, setHoveredElementId] = useState(null)
  const [justSent, setJustSent] = useState(false)
  const isDrawing = useRef(false)
  const lastPoint = useRef(null)
  const stageRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!roomId || !token) return

    const socket = io(`${BACKEND_URL}`)
    socketRef.current = socket

    socket.emit('join-room', roomId, token)

    socket.on('canvas-state', (elements) => {
      setSentElements(elements)
    })

    socket.on('elements-received', (elements) => {
      setSentElements(prev => [...prev, ...elements])
    })

    socket.on('partner-joined', () => setPartnerOnline(true))
    socket.on('partner-left', () => setPartnerOnline(false))

    socket.on('auth-error', (error) => {
      console.error('Auth error:', error)
      alert(error)
      navigate('/')
    })

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

  useEffect(() => {
    const allElements = [...sentElements, ...draftElements]
    allElements.forEach(el => {
      if (el.type === 'image' && !loadedImages[el.id]) {
        const img = new window.Image()
        img.src = el.url
        img.onload = () => {
          setLoadedImages(prev => ({ ...prev, [el.id]: img }))
        }
      }
    })
  }, [sentElements, draftElements])

  useEffect(() => {
    const handleWheel = (e) => {
      if (isDrawing.current) return
      e.preventDefault()
      setStagePos(prev => {
        const newY = prev.y - e.deltaY
        return { x: 0, y: Math.min(0, newY) }
      })
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [])

  useEffect(() => {
    const container = stageRef.current?.container()
    if (!container) return
    const preventContextMenu = (e) => e.preventDefault()
    container.addEventListener('contextmenu', preventContextMenu)
    return () => container.removeEventListener('contextmenu', preventContextMenu)
  }, [])

  useEffect(() => {
    if (textInput && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [textInput])

  const getPointerPosition = () => {
    const stage = stageRef.current
    const pointerPos = stage.getPointerPosition()
    return {
      x: pointerPos.x - stagePos.x,
      y: pointerPos.y - stagePos.y
    }
  }

  const formatTime = (createdAt) => {
    if (!createdAt) return ''
    const date = new Date(createdAt)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const isToday =
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()

    const isYesterday =
      date.getFullYear() === yesterday.getFullYear() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getDate() === yesterday.getDate()

    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')

    if (isToday) return `Today ${hours}:${minutes}`
    if (isYesterday) return `Yesterday ${hours}:${minutes}`
    return `${day}/${month} ${hours}:${minutes}`
  }

  const getRecencyOpacity = (el) => {
    const allSent = sentElements.filter(e => e.createdAt)
    if (allSent.length === 0) return 1

    const timestamps = allSent.map(e => new Date(e.createdAt).getTime())
    const newest = Math.max(...timestamps)
    const oldest = Math.min(...timestamps)
    const range = newest - oldest

    if (range === 0) return 1

    const elTime = new Date(el.createdAt).getTime()
    const normalized = (elTime - oldest) / range
    return 0.35 + normalized * 0.65
  }

  const addDraft = (element) => {
    const elementWithTime = { ...element, createdAt: new Date().toISOString() }
    setDraftElements(prev => [...prev, elementWithTime])
    socketRef.current.emit('save-draft', { roomId, element: elementWithTime })
  }

  const handleSend = () => {
    if (draftElements.length === 0) return
    setSentElements(prev => [...prev, ...draftElements])
    socketRef.current.emit('send-drafts', { roomId, elements: draftElements })
    setDraftElements([])
    setJustSent(true)
    setTimeout(() => setJustSent(false), 2000)
  }

  const handleMouseDown = (e) => {
    const isBackground =
      e.target === e.target.getStage() || e.target.name() === 'background'

    if (isBackground) setSelectedId(null)

    if (tool === 'text') {
      const stage = stageRef.current
      const pointerPos = stage.getPointerPosition()
      const canvasPos = getPointerPosition()
      setTextInput({
        screenX: pointerPos.x,
        screenY: pointerPos.y,
        canvasX: canvasPos.x,
        canvasY: canvasPos.y,
      })
      return
    }

    if (tool === 'draw') {
      if (!isBackground) return;
      // Find the most recent drawing element
      const allDrawings = [...sentElements, ...draftElements].filter(el => el.type === 'drawing');
      let lastDraw = null;
      if (allDrawings.length > 0) {
        lastDraw = allDrawings.reduce((a, b) => {
          const aTime = new Date(a.createdAt || 0).getTime();
          const bTime = new Date(b.createdAt || 0).getTime();
          return aTime > bTime ? a : b;
        });
      }
      const pos = getPointerPosition();
      if (lastDraw && lastDraw.points && lastDraw.points.length >= 2) {
        const lastX = lastDraw.points[lastDraw.points.length - 2];
        const lastY = lastDraw.points[lastDraw.points.length - 1];
        const dx = pos.x - lastX;
        const dy = pos.y - lastY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > MAX_DRAW_DISTANCE) {
          setDrawWarning(`You can't start drawing more than ${MAX_DRAW_DISTANCE}px from the last drawing.`);
          setTimeout(() => setDrawWarning(""), 2500);
          return;
        }
      }
      isDrawing.current = true;
      lastPoint.current = pos;
      setCurrentLine({
        id: Date.now().toString(),
        type: 'drawing',
        points: [pos.x, pos.y],
        stroke: drawColor,
        strokeWidth: brushSize,
      });
    }
    // Show warning if user tries to draw too far
    // Place this above the Stage component
    {drawWarning && (
      <div style={{
        position: 'fixed',
        top: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#ffefc1',
        color: '#b26a00',
        padding: '10px 24px',
        borderRadius: 10,
        fontWeight: 600,
        fontSize: 16,
        zIndex: 9999,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        {drawWarning}
      </div>
    )}
  }

  const handleMouseMove = () => {
    if (!isDrawing.current || !currentLine) return
    const pos = getPointerPosition()

    // Only add point if moved at least 3px — reduces jaggedness
    if (lastPoint.current) {
      const dx = pos.x - lastPoint.current.x
      const dy = pos.y - lastPoint.current.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 3) return
    }

    lastPoint.current = pos
    setCurrentLine(prev => ({
      ...prev,
      points: [...prev.points, pos.x, pos.y]
    }))
  }

  const handleMouseUp = () => {
    if (!isDrawing.current || !currentLine) return
    isDrawing.current = false
    lastPoint.current = null
    addDraft(currentLine)
    setCurrentLine(null)
  }

  const commitText = () => {
    const value = inputRef.current?.value?.trim()
    if (value && textInput) {
      addDraft({
        id: Date.now().toString(),
        type: 'text',
        x: textInput.canvasX,
        y: textInput.canvasY,
        text: value,
        fontSize: 18,
        fill: textColor,
        fontFamily: 'Georgia, serif',
      })
    }
    setTextInput(null)
  }

  const handleImageDragEnd = (elId, newX, newY) => {
    setDraftElements(prev =>
      prev.map(el => el.id === elId ? { ...el, x: newX, y: newY } : el)
    )
  }

  const handleElementDragEnd = (elId, deltaX, deltaY) => {
    setDraftElements(prev =>
      prev.map(el => {
        if (el.id !== elId) return el
        if (el.type === 'drawing') {
          return {
            ...el,
            points: el.points.map((p, i) => i % 2 === 0 ? p + deltaX : p + deltaY)
          }
        }
        if (el.type === 'text') {
          return { ...el, x: el.x + deltaX, y: el.y + deltaY }
        }
        return el
      })
    )
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitText()
    if (e.key === 'Escape') setTextInput(null)
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !textInput) {
      deleteElement(selectedId)
    }
  }

  const deleteElement = (elementId) => {
    // Only drafts can be deleted — sent elements are locked forever
    const draftIndex = draftElements.findIndex(el => el.id === elementId)
    if (draftIndex !== -1) {
      setDraftElements(prev => prev.filter((_, i) => i !== draftIndex))
      setSelectedId(null)
    }
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(`${BACKEND_URL}/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      const centerX = (window.innerWidth / 2) - stagePos.x
      const centerY = (window.innerHeight / 2) - stagePos.y
      addDraft({
        id: Date.now().toString(),
        type: 'image',
        x: centerX - 200,
        y: centerY - 150,
        width: 400,
        height: 300,
        url: data.url,
      })
    } catch (err) {
      console.error('Image upload failed:', err)
      alert(`Upload failed: ${err.message}`)
    } finally {
      setUploadingImage(false)
      fileInputRef.current.value = ''
    }
  }

  const stickers = ['😍', '🎉', '💕', '✨', '🌟', '😂', '🔥', '💯', '🎨', '📝', '💌', '🌹']

  const addSticker = (emoji) => {
    const centerX = (window.innerWidth / 2) - stagePos.x
    const centerY = (window.innerHeight / 2) - stagePos.y
    addDraft({
      id: Date.now().toString(),
      type: 'text',
      x: centerX,
      y: centerY,
      text: emoji,
      fontSize: 48,
      fill: '#2c2c2c',
      fontFamily: 'Arial',
    })
    setShowStickers(false)
  }

  const copyRoomCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode)
      alert('Room code copied: ' + roomCode)
    }
  }

  const renderElement = (el, isDraft = false) => {
    const isSelected = selectedId === el.id
    const isHovered = hoveredElementId === el.id
    const glowProps = isSelected ? {
      shadowColor: '#f5a623',
      shadowBlur: 16,
      shadowOpacity: 0.9,
    } : {}

    const commonProps = {
      key: el.id,
      onClick: () => setSelectedId(isSelected ? null : el.id),
      opacity: isDraft ? 0.6 : getRecencyOpacity(el),
      draggable: isDraft, // only drafts are draggable
      onMouseEnter: () => setHoveredElementId(el.id),
      onMouseLeave: () => setHoveredElementId(null),
    }

    const timestampElement = isHovered && el.createdAt ? (
      <Text
        key={`timestamp-${el.id}`}
        x={(el.x || el.points?.[0] || 0) + 10}
        y={(el.y || el.points?.[1] || 0) - 30}
        text={formatTime(el.createdAt)}
        fontSize={12}
        fill="#888"
        fontFamily="Arial"
        listening={false}
      />
    ) : null

    if (el.type === 'drawing') {
      return [
        <Line
          {...commonProps}
          points={el.points}
          stroke={el.stroke || '#2c2c2c'}
          strokeWidth={el.strokeWidth}
          tension={0.4}
          lineCap="round"
          lineJoin="round"
          onDragEnd={(e) => {
            const node = e.target
            const dx = node.x()
            const dy = node.y()
            handleElementDragEnd(el.id, dx, dy)
            node.x(0)
            node.y(0)
          }}
          {...glowProps}
        />,
        timestampElement,
      ].filter(Boolean)
    }

    if (el.type === 'text') {
      return [
        <Text
          {...commonProps}
          x={el.x}
          y={el.y}
          text={el.text}
          fontSize={el.fontSize}
          fill={el.fill || '#2c2c2c'}
          fontFamily={el.fontFamily}
          onDragEnd={(e) => {
            handleElementDragEnd(el.id, e.target.x() - el.x, e.target.y() - el.y)
            e.target.x(el.x)
            e.target.y(el.y)
          }}
          {...glowProps}
        />,
        timestampElement,
      ].filter(Boolean)
    }

    if (el.type === 'image' && loadedImages[el.id]) {
      return [
        <KonvaImage
          {...commonProps}
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          image={loadedImages[el.id]}
          onDragEnd={(e) => {
            handleImageDragEnd(el.id, e.target.x(), e.target.y())
          }}
          {...glowProps}
        />,
        timestampElement,
      ].filter(Boolean)
    }

    return null
  }

  if (rejected) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#faf9f6',
        gap: 16,
        fontFamily: 'Georgia, serif',
      }}>
        <h2 style={{ color: '#2c2c2c' }}>this journal is full</h2>
        <p style={{ color: '#888', fontStyle: 'italic' }}>journals are private — just two people</p>
        <button
          onClick={() => navigate('/')}
          style={{
            marginTop: 8,
            padding: '10px 24px',
            borderRadius: 10,
            border: 'none',
            background: '#2c2c2c',
            color: 'white',
            cursor: 'pointer',
            fontSize: 15,
          }}
        >
          create your own →
        </button>
      </div>
    )
  }

  return (
    <div
      style={{ position: 'relative', width: '100vw', height: '100vh' }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >

      {/* Draw distance warning */}
      {drawWarning && (
        <div style={{
          position: 'fixed',
          top: 70,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#ffefc1',
          color: '#b26a00',
          padding: '10px 24px',
          borderRadius: 10,
          fontWeight: 600,
          fontSize: 16,
          zIndex: 9999,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
        }}>
          {drawWarning}
        </div>
      )}

      {/* Toolbar */}
      <div style={{
        position: 'fixed',
        top: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 8,
        background: 'white',
        borderRadius: 12,
        padding: '8px 12px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
        zIndex: 100,
        alignItems: 'center',
        flexWrap: 'wrap',
        maxWidth: '90vw',
      }}>
        <button
          onClick={() => setTool('draw')}
          style={{
            padding: '6px 16px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            background: tool === 'draw' ? '#2c2c2c' : '#f0f0f0',
            color: tool === 'draw' ? 'white' : '#2c2c2c',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ✏️ Draw
        </button>

        {tool === 'draw' && (
          <>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                style={{
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  background: drawColor,
                  width: 40,
                  height: 40,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                }}
                title="Draw color"
              />
              {showColorPicker && (
                <div style={{
                  position: 'absolute',
                  top: 50,
                  left: 0,
                  background: 'white',
                  borderRadius: 8,
                  padding: 8,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 6,
                  zIndex: 200,
                }}>
                  {['#2c2c2c', '#ff6b6b', '#4ecdc4', '#ffe66d', '#ff006e', '#8e44ad', '#2e86ab', '#a23b72'].map(color => (
                    <button
                      key={color}
                      onClick={() => { setDrawColor(color); setShowColorPicker(false) }}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        border: drawColor === color ? '3px solid #2c2c2c' : 'none',
                        background: color,
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#666' }}>
              Size:
              <input
                type="range"
                min="1"
                max="15"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                style={{ width: 80 }}
              />
              <span>{brushSize}px</span>
            </div>

            {selectedId && draftElements.find(el => el.id === selectedId) && (
              <button
                onClick={() => deleteElement(selectedId)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#ff6b6b',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                delete
              </button>
            )}
          </>
        )}

        <button
          onClick={() => setTool('text')}
          style={{
            padding: '6px 16px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            background: tool === 'text' ? '#2c2c2c' : '#f0f0f0',
            color: tool === 'text' ? 'white' : '#2c2c2c',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          T Text
        </button>

        {tool === 'text' && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              style={{
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                background: textColor,
                width: 40,
                height: 40,
                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
              }}
              title="Text color"
            />
            {showColorPicker && (
              <div style={{
                position: 'absolute',
                top: 50,
                left: 0,
                background: 'white',
                borderRadius: 8,
                padding: 8,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 6,
                zIndex: 200,
              }}>
                {['#2c2c2c', '#ff6b6b', '#4ecdc4', '#ffe66d', '#ff006e', '#8e44ad', '#2e86ab', '#a23b72'].map(color => (
                  <button
                    key={color}
                    onClick={() => { setTextColor(color); setShowColorPicker(false) }}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: textColor === color ? '3px solid #2c2c2c' : 'none',
                      background: color,
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => fileInputRef.current.click()}
          disabled={uploadingImage}
          style={{
            padding: '6px 16px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            background: '#f0f0f0',
            color: '#2c2c2c',
            fontWeight: 600,
            fontSize: 14,
            opacity: uploadingImage ? 0.6 : 1,
          }}
        >
          {uploadingImage ? 'uploading...' : '🖼️ Image'}
        </button>

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowStickers(!showStickers)}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: '#f0f0f0',
              color: '#2c2c2c',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            ⭐ Sticker
          </button>
          {showStickers && (
            <div style={{
              position: 'absolute',
              top: 50,
              left: 0,
              background: 'white',
              borderRadius: 8,
              padding: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 6,
              width: 160,
              zIndex: 200,
            }}>
              {stickers.map((emoji, idx) => (
                <button
                  key={idx}
                  onClick={() => addSticker(emoji)}
                  style={{
                    fontSize: 24,
                    border: 'none',
                    background: '#f0f0f0',
                    borderRadius: 6,
                    cursor: 'pointer',
                    padding: 8,
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 24, background: '#e0e0e0', margin: '0 4px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#888' }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: partnerOnline ? '#4caf50' : '#ccc',
          }} />
          {partnerOnline ? 'partner online' : 'waiting for partner'}
        </div>

        <div style={{ width: 1, height: 24, background: '#e0e0e0', margin: '0 4px' }} />

        <button
          onClick={copyRoomCode}
          disabled={!roomCode}
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            border: 'none',
            cursor: roomCode ? 'pointer' : 'not-allowed',
            background: '#f0f0f0',
            color: '#2c2c2c',
            fontSize: 13,
            opacity: roomCode ? 1 : 0.5,
          }}
        >
          🔗 share
        </button>

        <div style={{ width: 1, height: 24, background: '#e0e0e0', margin: '0 4px' }} />

        <button
          onClick={handleSend}
          disabled={draftElements.length === 0}
          style={{
            padding: '6px 20px',
            borderRadius: 8,
            border: 'none',
            cursor: draftElements.length === 0 ? 'default' : 'pointer',
            background: justSent ? '#4caf50' : draftElements.length === 0 ? '#f0f0f0' : '#2c2c2c',
            color: justSent || draftElements.length > 0 ? 'white' : '#aaa',
            fontWeight: 700,
            fontSize: 14,
            transition: 'all 0.3s',
          }}
        >
          {justSent ? '✓ sent' : `send${draftElements.length > 0 ? ` (${draftElements.length})` : ''}`}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageUpload}
      />

      {textInput && (
        <input
          ref={inputRef}
          onBlur={commitText}
          onKeyDown={handleKeyDown}
          style={{
            position: 'absolute',
            left: textInput.screenX,
            top: textInput.screenY,
            background: 'transparent',
            border: 'none',
            borderBottom: '1.5px solid #aaa',
            outline: 'none',
            fontSize: 18,
            fontFamily: 'Georgia, serif',
            color: textColor,
            minWidth: 120,
            zIndex: 200,
          }}
        />
      )}

      <Stage
        ref={stageRef}
        width={CANVAS_WIDTH}
        height={window.innerHeight}
        x={stagePos.x}
        y={stagePos.y}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <Layer>
          <Rect
            name="background"
            x={0}
            y={0}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            fill="#faf9f6"
          />

          {sentElements.map(el => renderElement(el, false)).flat()}
          {draftElements.map(el => renderElement(el, true)).flat()}

          {currentLine && (
            <Line
              points={currentLine.points}
              stroke={currentLine.stroke}
              strokeWidth={currentLine.strokeWidth}
              tension={0.4}
              lineCap="round"
              lineJoin="round"
            />
          )}
        </Layer>
      </Stage>
    </div>
  )
}

export default Room