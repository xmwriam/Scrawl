import { Stage, Layer, Rect, Line, Text } from 'react-konva'
import { useRef, useState, useEffect } from 'react'
import { io } from 'socket.io-client'

const CANVAS_WIDTH = window.innerWidth
const CANVAS_HEIGHT = 10000
const ROOM_ID = 'test-room' // hardcoded for now, we'll make this dynamic later

// Connect to our backend server
const socket = io('http://localhost:3001')

function App() {
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [elements, setElements] = useState([])
  const [currentLine, setCurrentLine] = useState(null)
  const [otherLine, setOtherLine] = useState(null) // the other person's in-progress line
  const [tool, setTool] = useState('draw')
  const [textInput, setTextInput] = useState(null)
  const isDrawing = useRef(false)
  const stageRef = useRef(null)
  const inputRef = useRef(null)

  // Join room and set up socket listeners
  useEffect(() => {
    socket.emit('join-room', ROOM_ID)

    // Server sends us the full canvas when we join
    socket.on('canvas-state', (savedElements) => {
      setElements(savedElements)
    })

    // Someone else added an element
    socket.on('element-added', (element) => {
      setElements(prev => [...prev, element])
    })

    // Someone else is drawing right now
    socket.on('drawing-in-progress', (line) => {
      setOtherLine(line)
    })

    return () => {
      socket.off('canvas-state')
      socket.off('element-added')
      socket.off('drawing-in-progress')
    }
  }, [])

  // Wheel scroll
  useEffect(() => {
    const handleWheel = (e) => {
      if (isDrawing.current) return
      e.preventDefault()
      setStagePos(prev => ({
        x: 0,
        y: prev.y - e.deltaY
      }))
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [])

  // Prevent context menu
  useEffect(() => {
    const container = stageRef.current?.container()
    if (!container) return
    const preventContextMenu = (e) => e.preventDefault()
    container.addEventListener('contextmenu', preventContextMenu)
    return () => container.removeEventListener('contextmenu', preventContextMenu)
  }, [])

  // Focus text input
  useEffect(() => {
    if (textInput && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
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

    // Broadcast in-progress line to the other person
    socket.emit('drawing-in-progress', { roomId: ROOM_ID, line: updatedLine })
  }

  const handleMouseUp = () => {
    if (!isDrawing.current || !currentLine) return
    isDrawing.current = false

    // Commit the line
    setElements(prev => [...prev, currentLine])

    // Tell the server — it will save it and forward to the other person
    socket.emit('add-element', { roomId: ROOM_ID, element: currentLine })

    setCurrentLine(null)
    setOtherLine(null) // clear their preview of our in-progress line
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
      socket.emit('add-element', { roomId: ROOM_ID, element: newElement })
    }
    setTextInput(null)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitText()
    if (e.key === 'Escape') setTextInput(null)
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

      {/* Canvas */}
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

          {/* Committed elements */}
          {elements.map(el => renderElement(el))}

          {/* Your in-progress line */}
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

          {/* Other person's in-progress line */}
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

export default App