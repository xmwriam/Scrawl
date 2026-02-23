import { Stage, Layer, Rect, Line, Text } from 'react-konva'
import { useRef, useState, useEffect } from 'react'

const CANVAS_WIDTH = window.innerWidth
const CANVAS_HEIGHT = 10000

function App() {
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [elements, setElements] = useState([])
  const [currentLine, setCurrentLine] = useState(null)
  const [tool, setTool] = useState('draw') // 'draw' or 'text'
  const [textInput, setTextInput] = useState(null) // { x, y, canvasX, canvasY }
  const isDrawing = useRef(false)
  const stageRef = useRef(null)
  const inputRef = useRef(null)

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

  // Focus the input whenever it appears
  useEffect(() => {
    if (textInput && inputRef.current) {
      inputRef.current.focus()
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
  const isBackground =
    e.target === e.target.getStage() || e.target.name() === 'background'

  if (tool === 'text') {
    console.log('text block reached')  // add this
    const stage = stageRef.current
    const pointerPos = stage.getPointerPosition()
    console.log('pointerPos:', pointerPos)  // add this
    const canvasPos = getPointerPosition()
    console.log('textInput being set:', { screenX: pointerPos.x, screenY: pointerPos.y })  // add this

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
      stroke: '#2c2c2c',
      strokeWidth: 3,
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
    setElements(prev => [...prev, currentLine])
    setCurrentLine(null)
  }

  const commitText = () => {
    const value = inputRef.current?.value?.trim()
    if (value && textInput) {
      setElements(prev => [...prev, {
        id: Date.now().toString(),
        type: 'text',
        x: textInput.canvasX,
        y: textInput.canvasY,
        text: value,
        fontSize: 18,
        fill: '#2c2c2c',
        fontFamily: 'Georgia, serif',
      }])
    }
    setTextInput(null)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitText()
    if (e.key === 'Escape') setTextInput(null)
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

      {/* Floating HTML input for text entry */}
      {textInput && (
        <input
          ref={inputRef}
          onBlur={commitText}
          onKeyDown={handleKeyDown}
          style={{
            position: 'fixed',
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

          {elements.map(el => {
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
          })}

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

export default App