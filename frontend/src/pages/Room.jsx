import { Stage, Layer, Rect, Line, Text } from 'react-konva'
import { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'

const CANVAS_WIDTH = window.innerWidth
const CANVAS_HEIGHT = 10000

function Room() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const socketRef = useRef(null)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [elements, setElements] = useState([])
  const [currentLine, setCurrentLine] = useState(null)
  const [otherLine, setOtherLine] = useState(null)
  const [tool, setTool] = useState('draw')
  const [textInput, setTextInput] = useState(null)
  const [rejected, setRejected] = useState(false)
  const [partnerOnline, setPartnerOnline] = useState(false)
  const isDrawing = useRef(false)
  const stageRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    socketRef.current = io('http://localhost:3001')
    const socket = socketRef.current

    socket.emit('join-room', roomId)

    socket.on('canvas-state', (savedElements) => {
      setElements(savedElements)
    })

    socket.on('element-added', (element) => {
      setElements(prev => [...prev, element])
    })

    socket.on('drawing-in-progress', (line) => {
      setOtherLine(line)
    })

    socket.on('room-full', () => {
      setRejected(true)
    })

    socket.on('partner-joined', () => setPartnerOnline(true))
    socket.on('partner-left', () => setPartnerOnline(false))

    return () => {
      socket.disconnect()
    }
  }, [roomId])

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

  const handleMouseDown = (e) => {
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
      const isBackground =
        e.target === e.target.getStage() || e.target.name() === 'background'
      if (!isBackground) return
      isDrawing.current = true
      const pos = getPointerPosition()
      setCurrentLine({
        id: Date.now().toString(),
        type: 'drawing',
        points: [pos.x, pos.y],
        stroke: '#2c2c2c',
        strokeWidth: 3,
      })
    }
  }

  const handleMouseMove = () => {
    if (!isDrawing.current || !currentLine) return
    const pos = getPointerPosition()
    const updatedLine = {
      ...currentLine,
      points: [...currentLine.points, pos.x, pos.y]
    }
    setCurrentLine(updatedLine)
    socketRef.current.emit('drawing-in-progress', { roomId, line: updatedLine })
  }

  const handleMouseUp = () => {
    if (!isDrawing.current || !currentLine) return
    isDrawing.current = false
    setElements(prev => [...prev, currentLine])
    socketRef.current.emit('add-element', { roomId, element: currentLine })
    setCurrentLine(null)
    setOtherLine(null)
  }

  const commitText = () => {
    const value = inputRef.current?.value?.trim()
    if (value && textInput) {
      const newElement = {
        id: Date.now().toString(),
        type: 'text',
        x: textInput.canvasX,
        y: textInput.canvasY,
        text: value,
        fontSize: 18,
        fill: '#2c2c2c',
        fontFamily: 'Georgia, serif',
      }
      setElements(prev => [...prev, newElement])
      socketRef.current.emit('add-element', { roomId, element: newElement })
    }
    setTextInput(null)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitText()
    if (e.key === 'Escape') setTextInput(null)
  }

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
  }

  const renderElement = (el) => {
    if (el.type === 'drawing') {
      return (
        <Line
          key={el.id}
          points={el.points}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
          tension={0.5}
          lineCap="round"
          lineJoin="round"
        />
      )
    }
    if (el.type === 'text') {
      return (
        <Text
          key={el.id}
          x={el.x}
          y={el.y}
          text={el.text}
          fontSize={el.fontSize}
          fill={el.fill}
          fontFamily={el.fontFamily}
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
          onClick={copyLink}
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            background: '#f0f0f0',
            color: '#2c2c2c',
            fontSize: 13,
          }}
        >
          🔗 share
        </button>
      </div>

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
          {elements.map(el => renderElement(el))}
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
          {otherLine && (
            <Line
              points={otherLine.points}
              stroke="#e07a5f"
              strokeWidth={otherLine.strokeWidth}
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