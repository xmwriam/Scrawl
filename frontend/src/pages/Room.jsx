import { Stage, Layer, Rect, Line, Text, Image as KonvaImage } from 'react-konva'
import { useRef, useState, useEffect, useContext } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { io } from 'socket.io-client'
import { AuthContext } from '../context/AuthContext'

const CANVAS_WIDTH = window.innerWidth
const CANVAS_HEIGHT = 10000

function Room() {
  const { roomId: paramRoomId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = useContext(AuthContext)
  const socketRef = useRef(null)
  const [roomId, setRoomId] = useState(paramRoomId)
  const [roomCode, setRoomCode] = useState(location.state?.roomCode || '')
  const [showShareModal, setShowShareModal] = useState(false)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })

  // sentElements — locked forever, visible to both people
  const [sentElements, setSentElements] = useState([])
  // draftElements — only visible to you, not yet sent
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
  const [selectedId, setSelectedId] = useState(null) // for glow on click
  const isDrawing = useRef(false)
  const stageRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!roomId || !token) return

    const socket = io('http://localhost:3001')
    socketRef.current = socket

    // Emit join with token
    socket.emit('join-room', roomId, token)

    // Load sent elements when joining
    socket.on('canvas-state', (elements) => {
      setSentElements(elements)
    })

    // Partner sent their drafts — add to our sent elements
    socket.on('elements-received', (elements) => {
      setSentElements(prev => [...prev, ...elements])
    })

    socket.on('partner-joined', () => {
      setPartnerOnline(true)
    })

    socket.on('partner-left', () => {
      setPartnerOnline(false)
    })

    // Handle auth errors
    socket.on('auth-error', (error) => {
      console.error('Auth error:', error)
      alert(error)
      navigate('/')
    })

    // Cleanup on disconnect
    socket.on('disconnect', () => {
      setPartnerOnline(false)
    })

    // Cleanup function
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

  // Load images whenever sent or draft elements change
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
      setStagePos(prev => ({ x: 0, y: prev.y - e.deltaY }))
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

  // Add to draft — save to DB but don't tell partner yet
  const addDraft = (element) => {
    setDraftElements(prev => [...prev, element])
    socketRef.current.emit('save-draft', { roomId, element })
  }

  // Send all drafts to partner at once
  const handleSend = () => {
    if (draftElements.length === 0) return

    // Move drafts to sent
    setSentElements(prev => [...prev, ...draftElements])
    socketRef.current.emit('send-drafts', { roomId, elements: draftElements })
    setDraftElements([])
  }

  const handleMouseDown = (e) => {
    // Clicking background deselects
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
      if (!isBackground) return
      isDrawing.current = true
      const pos = getPointerPosition()
      setCurrentLine({
        id: Date.now().toString(),
        type: 'drawing',
        points: [pos.x, pos.y],
        stroke: drawColor,
        strokeWidth: brushSize,
      })
    }
  }

  const handleMouseMove = () => {
    if (!isDrawing.current || !currentLine) return
    const pos = getPointerPosition()
    setCurrentLine(prev => ({
      ...prev,
      points: [...prev.points, pos.x, pos.y]
    }))
  }

  const handleMouseUp = () => {
    if (!isDrawing.current || !currentLine) return
    isDrawing.current = false
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

  const handleImageDragEnd = (elId, newX, newY, isDraft) => {
    if (isDraft) {
      setDraftElements(prev =>
        prev.map(el => el.id === elId ? { ...el, x: newX, y: newY } : el)
      )
    } else {
      setSentElements(prev =>
        prev.map(el => el.id === elId ? { ...el, x: newX, y: newY } : el)
      )
    }
  }

  const handleElementDragEnd = (elId, deltaX, deltaY, isDraft) => {
    if (isDraft) {
      setDraftElements(prev =>
        prev.map(el => {
          if (el.id === elId) {
            if (el.type === 'drawing') {
              // Offset all points
              return {
                ...el,
                points: el.points.map((p, i) => i % 2 === 0 ? p + deltaX : p + deltaY)
              }
            } else if (el.type === 'text') {
              return { ...el, x: el.x + deltaX, y: el.y + deltaY }
            }
          }
          return el
        })
      )
    } else {
      setSentElements(prev =>
        prev.map(el => {
          if (el.id === elId) {
            if (el.type === 'drawing') {
              return {
                ...el,
                points: el.points.map((p, i) => i % 2 === 0 ? p + deltaX : p + deltaY)
              }
            } else if (el.type === 'text') {
              return { ...el, x: el.x + deltaX, y: el.y + deltaY }
            }
          }
          return el
        })
      )
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitText()
    if (e.key === 'Escape') setTextInput(null)
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch('http://localhost:3001/upload', {
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
    const glowProps = isSelected ? {
      shadowColor: '#f5a623',
      shadowBlur: 16,
      shadowOpacity: 0.9,
    } : {}

    const commonProps = {
      key: el.id,
      // clicking selects the element to show glow
      onClick: () => setSelectedId(isSelected ? null : el.id),
      // draft elements are slightly faded so you know they're not sent yet
      opacity: isDraft ? 0.6 : 1,
      draggable: true,
    }

    if (el.type === 'drawing') {
      return (
        <Line
          {...commonProps}
          points={el.points}
          stroke={el.stroke || '#2c2c2c'}
          strokeWidth={el.strokeWidth}
          tension={0.5}
          lineCap="round"
          lineJoin="round"
          onDragEnd={(e) => {
            const offset = e.target.offset()
            handleElementDragEnd(el.id, offset.x, offset.y, isDraft)
            e.target.offset({ x: 0, y: 0 })
          }}
          {...glowProps}
        />
      )
    }

    if (el.type === 'text') {
      return (
        <Text
          {...commonProps}
          x={el.x}
          y={el.y}
          text={el.text}
          fontSize={el.fontSize}
          fill={el.fill || '#2c2c2c'}
          fontFamily={el.fontFamily}
          onDragEnd={(e) => handleElementDragEnd(el.id, e.target.x() - el.x, e.target.y() - el.y, isDraft)}
          {...glowProps}
        />
      )
    }

    if (el.type === 'image' && loadedImages[el.id]) {
      return (
        <KonvaImage
          {...commonProps}
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          image={loadedImages[el.id]}
          draggable={true}
          onDragEnd={(e) => handleImageDragEnd(el.id, e.target.x(), e.target.y(), isDraft)}
          {...glowProps}
        />
      )
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
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>

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

        {/* Draw Color & Size */}
        {tool === 'draw' && (
          <>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                style={{
                  padding: '6px 12px',
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
                      onClick={() => { setDrawColor(color); setShowColorPicker(false); }}
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

        {/* Text Color */}
        {tool === 'text' && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              style={{
                padding: '6px 12px',
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
                    onClick={() => { setTextColor(color); setShowColorPicker(false); }}
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

        {/* Stickers */}
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
                    transition: 'all 0.2s',
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

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={draftElements.length === 0}
          style={{
            padding: '6px 20px',
            borderRadius: 8,
            border: 'none',
            cursor: draftElements.length === 0 ? 'default' : 'pointer',
            background: draftElements.length === 0 ? '#f0f0f0' : '#2c2c2c',
            color: draftElements.length === 0 ? '#aaa' : 'white',
            fontWeight: 700,
            fontSize: 14,
            transition: 'all 0.2s',
          }}
        >
          send {draftElements.length > 0 ? `(${draftElements.length})` : ''}
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageUpload}
      />

      {/* Floating text input */}
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
            color: '#2c2c2c',
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

          {/* Sent elements — fully opaque, locked forever */}
          {sentElements.map(el => renderElement(el, false))}

          {/* Draft elements — faded, only visible to you */}
          {draftElements.map(el => renderElement(el, true))}

          {/* Line currently being drawn */}
          {currentLine && (
            <Line
              points={currentLine.points}
              stroke={currentLine.stroke}
              strokeWidth={currentLine.strokeWidth}
              tension={0.5}
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