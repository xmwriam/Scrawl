import { Stage, Layer, Rect, Line, Text, Image as KonvaImage, Circle, Arrow, Transformer } from 'react-konva'
import { useRef, useState, useEffect, useContext, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { io } from 'socket.io-client'
import { AuthContext } from '../context/AuthContext'
import rough from 'roughjs'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const CANVAS_WIDTH = window.innerWidth
const CANVAS_HEIGHT = 10000

const ROUGH_OPTIONS = {
  roughness: 1.5,
  strokeWidth: 2,
  bowing: 1,
}

function Room() {
  const { roomId: paramRoomId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = useContext(AuthContext)
  const socketRef = useRef(null)
  const roomId = paramRoomId

  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [sentElements, setSentElements] = useState([])
  const [draftElements, setDraftElements] = useState([])
  const [currentLine, setCurrentLine] = useState(null)
  const [currentShape, setCurrentShape] = useState(null)

  const [tool, setTool] = useState('draw')
  const [drawColor, setDrawColor] = useState('#2c2c2c')
  const [brushSize, setBrushSize] = useState(3)
  const [textColor, setTextColor] = useState('#2c2c2c')
  const [shapeColor, setShapeColor] = useState('#2c2c2c')
  const [fillColor, setFillColor] = useState('transparent')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [colorPickerTarget, setColorPickerTarget] = useState('stroke') // 'stroke' | 'fill'

  const [showStickers, setShowStickers] = useState(false)
  const [textInput, setTextInput] = useState(null)
  const [partnerOnline, setPartnerOnline] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [loadedImages, setLoadedImages] = useState({})
  const [selectedId, setSelectedId] = useState(null)
  const [hoveredElementId, setHoveredElementId] = useState(null)
  const [justSent, setJustSent] = useState(false)
  const [drawWarning, setDrawWarning] = useState('')

  // Undo/redo stacks
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])

  const isDrawing = useRef(false)
  const shapeStart = useRef(null)
  const lastPoint = useRef(null)
  const stageRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const roughCanvasRef = useRef(null)
  const roughCache = useRef({})

  // ── Socket ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !token) return
    const socket = io(BACKEND_URL)
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

  // ── Image loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    const allElements = [...sentElements, ...draftElements]
    allElements.forEach(el => {
      if (el.type === 'image' && !loadedImages[el.id]) {
        const img = new window.Image()
        img.src = el.url
        img.onload = () => setLoadedImages(prev => ({ ...prev, [el.id]: img }))
      }
    })
  }, [sentElements, draftElements])

  // ── Wheel / scroll ───────────────────────────────────────────────────────────

  useEffect(() => {
    const handleWheel = (e) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
        setScale(prev => Math.min(Math.max(prev * zoomFactor, 0.2), 4))
      } else {
        // Scroll
        if (isDrawing.current) return
        setStagePos(prev => ({
          x: 0,
          y: Math.min(0, prev.y - e.deltaY)
        }))
      }
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [])

  // ── Context menu ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const container = stageRef.current?.container()
    if (!container) return
    const prevent = (e) => e.preventDefault()
    container.addEventListener('contextmenu', prevent)
    return () => container.removeEventListener('contextmenu', prevent)
  }, [])

  // ── Text input focus ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (textInput && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [textInput])

  // ── Rough.js canvas setup ────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = document.createElement('canvas')
    roughCanvasRef.current = rough.canvas(canvas)
  }, [])

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const getPointerPosition = () => {
    const stage = stageRef.current
    const pointerPos = stage.getPointerPosition()
    return {
      x: (pointerPos.x - stagePos.x) / scale,
      y: (pointerPos.y - stagePos.y) / scale,
    }
  }

  const formatTime = (createdAt) => {
    if (!createdAt) return ''
    const date = new Date(createdAt)
    const today = new Date()
    const isToday = date.toDateString() === today.toDateString()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = date.toDateString() === yesterday.toDateString()
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const mo = String(date.getMonth() + 1).padStart(2, '0')
    if (isToday) return `Today ${hh}:${mm}`
    if (isYesterday) return `Yesterday ${hh}:${mm}`
    return `${dd}/${mo} ${hh}:${mm}`
  }

  const getRecencyOpacity = (el) => {
    const allSent = sentElements.filter(e => e.createdAt)
    if (allSent.length === 0) return 1
    const timestamps = allSent.map(e => new Date(e.createdAt).getTime())
    const newest = Math.max(...timestamps)
    const oldest = Math.min(...timestamps)
    const range = newest - oldest
    if (range === 0) return 1
    const normalized = (new Date(el.createdAt).getTime() - oldest) / range
    return 0.35 + normalized * 0.65
  }

  // ── Draft management ─────────────────────────────────────────────────────────

  const addDraft = (element) => {
    const el = { ...element, createdAt: new Date().toISOString() }
    setUndoStack(prev => [...prev, { type: 'add', elementId: el.id }])
    setRedoStack([])
    setDraftElements(prev => [...prev, el])
    socketRef.current?.emit('save-draft', { roomId, element: el })
  }

  const handleSend = () => {
    if (draftElements.length === 0) return
    setSentElements(prev => [...prev, ...draftElements])
    socketRef.current?.emit('send-drafts', { roomId, elements: draftElements })
    setDraftElements([])
    setUndoStack([])
    setRedoStack([])
    setJustSent(true)
    setTimeout(() => setJustSent(false), 2000)
  }

  // ── Undo / Redo ──────────────────────────────────────────────────────────────

  const undo = useCallback(() => {
    if (undoStack.length === 0) return
    const last = undoStack[undoStack.length - 1]
    setUndoStack(prev => prev.slice(0, -1))
    if (last.type === 'add') {
      const el = draftElements.find(e => e.id === last.elementId)
      if (el) {
        setRedoStack(prev => [...prev, { type: 'add', element: el }])
        setDraftElements(prev => prev.filter(e => e.id !== last.elementId))
      }
    }
  }, [undoStack, draftElements])

  const redo = useCallback(() => {
    if (redoStack.length === 0) return
    const last = redoStack[redoStack.length - 1]
    setRedoStack(prev => prev.slice(0, -1))
    if (last.type === 'add') {
      setUndoStack(prev => [...prev, { type: 'add', elementId: last.element.id }])
      setDraftElements(prev => [...prev, last.element])
    }
  }, [redoStack])

  // ── Erase ────────────────────────────────────────────────────────────────────

  const eraseAt = (pos) => {
    const eraseRadius = 20 / scale
    setDraftElements(prev => prev.filter(el => {
      if (el.type === 'drawing') {
        for (let i = 0; i < el.points.length - 1; i += 2) {
          const dx = el.points[i] - pos.x
          const dy = el.points[i + 1] - pos.y
          if (Math.sqrt(dx * dx + dy * dy) < eraseRadius) return false
        }
      }
      if (el.type === 'text' || el.type === 'shape' || el.type === 'image') {
        const dx = (el.x || 0) - pos.x
        const dy = (el.y || 0) - pos.y
        if (Math.sqrt(dx * dx + dy * dy) < eraseRadius * 3) return false
      }
      return true
    }))
  }

  // ── Mouse events ─────────────────────────────────────────────────────────────

  const handleMouseDown = (e) => {
    const isBackground = e.target === e.target.getStage() || e.target.name() === 'background'
    if (isBackground) setSelectedId(null)

    if (tool === 'select') return

    if (tool === 'text') {
      const stage = stageRef.current
      const pointerPos = stage.getPointerPosition()
      const canvasPos = getPointerPosition()
      setTextInput({ screenX: pointerPos.x, screenY: pointerPos.y, canvasX: canvasPos.x, canvasY: canvasPos.y })
      return
    }

    if (tool === 'eraser') {
      isDrawing.current = true
      eraseAt(getPointerPosition())
      return
    }

    if (tool === 'draw') {
      if (!isBackground) return
      isDrawing.current = true
      const pos = getPointerPosition()
      lastPoint.current = pos
      setCurrentLine({
        id: Date.now().toString(),
        type: 'drawing',
        points: [pos.x, pos.y],
        stroke: drawColor,
        strokeWidth: brushSize,
      })
      return
    }

    // Shape tools
    if (['rect', 'circle', 'arrow', 'line'].includes(tool)) {
      if (!isBackground) return
      isDrawing.current = true
      const pos = getPointerPosition()
      shapeStart.current = pos
      setCurrentShape({
        id: Date.now().toString(),
        type: 'shape',
        shapeType: tool,
        x: pos.x, y: pos.y,
        width: 0, height: 0,
        x2: pos.x, y2: pos.y,
        stroke: shapeColor,
        fill: fillColor,
        strokeWidth: brushSize,
      })
    }
  }

  const handleMouseMove = () => {
    if (!isDrawing.current) return
    const pos = getPointerPosition()

    if (tool === 'eraser') {
      eraseAt(pos)
      return
    }

    if (tool === 'draw' && currentLine) {
      if (lastPoint.current) {
        const dx = pos.x - lastPoint.current.x
        const dy = pos.y - lastPoint.current.y
        if (Math.sqrt(dx * dx + dy * dy) < 3 / scale) return
      }
      lastPoint.current = pos
      setCurrentLine(prev => ({ ...prev, points: [...prev.points, pos.x, pos.y] }))
      return
    }

    if (['rect', 'circle', 'arrow', 'line'].includes(tool) && currentShape && shapeStart.current) {
      const start = shapeStart.current
      setCurrentShape(prev => ({
        ...prev,
        width: pos.x - start.x,
        height: pos.y - start.y,
        x2: pos.x,
        y2: pos.y,
      }))
    }
  }

  const handleMouseUp = () => {
    if (!isDrawing.current) return
    isDrawing.current = false

    if (tool === 'draw' && currentLine) {
      if (currentLine.points.length >= 4) addDraft(currentLine)
      setCurrentLine(null)
      lastPoint.current = null
      return
    }

    if (['rect', 'circle', 'arrow', 'line'].includes(tool) && currentShape) {
      const w = Math.abs(currentShape.width)
      const h = Math.abs(currentShape.height)
      if (w > 5 || h > 5) addDraft(currentShape)
      setCurrentShape(null)
      shapeStart.current = null
    }
  }

  // ── Text ─────────────────────────────────────────────────────────────────────

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

  // ── Drag ─────────────────────────────────────────────────────────────────────

  const handleImageDragEnd = (elId, newX, newY) => {
    setDraftElements(prev => prev.map(el => el.id === elId ? { ...el, x: newX, y: newY } : el))
  }

  const handleElementDragEnd = (elId, deltaX, deltaY) => {
    setDraftElements(prev => prev.map(el => {
      if (el.id !== elId) return el
      if (el.type === 'drawing') {
        return { ...el, points: el.points.map((p, i) => i % 2 === 0 ? p + deltaX : p + deltaY) }
      }
      if (el.type === 'text' || el.type === 'shape') {
        return { ...el, x: el.x + deltaX, y: el.y + deltaY }
      }
      return el
    }))
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  const deleteElement = (elementId) => {
    const idx = draftElements.findIndex(el => el.id === elementId)
    if (idx !== -1) {
      setDraftElements(prev => prev.filter((_, i) => i !== idx))
      setSelectedId(null)
    }
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────────

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && textInput) commitText()
    if (e.key === 'Escape') setTextInput(null)
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !textInput) deleteElement(selectedId)
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo() }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo() }
  }

  // ── Image upload ─────────────────────────────────────────────────────────────

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: formData })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      const centerX = (window.innerWidth / 2 - stagePos.x) / scale
      const centerY = (window.innerHeight / 2 - stagePos.y) / scale
      addDraft({
        id: Date.now().toString(), type: 'image',
        x: centerX - 200, y: centerY - 150,
        width: 400, height: 300, url: data.url,
      })
    } catch (err) {
      alert(`Upload failed: ${err.message}`)
    } finally {
      setUploadingImage(false)
      fileInputRef.current.value = ''
    }
  }

  // ── Stickers ─────────────────────────────────────────────────────────────────

  const stickers = ['😍', '🎉', '💕', '✨', '🌟', '😂', '🔥', '💯', '🎨', '📝', '💌', '🌹']

  const addSticker = (emoji) => {
    const centerX = (window.innerWidth / 2 - stagePos.x) / scale
    const centerY = (window.innerHeight / 2 - stagePos.y) / scale
    addDraft({ id: Date.now().toString(), type: 'text', x: centerX, y: centerY, text: emoji, fontSize: 48, fill: '#2c2c2c', fontFamily: 'Arial' })
    setShowStickers(false)
  }

  // ── Rough shape rendering ────────────────────────────────────────────────────

  const getRoughPoints = (el) => {
    const key = `${el.id}-${el.x}-${el.y}-${el.width}-${el.height}-${el.x2}-${el.y2}-${el.stroke}-${el.fill}`
    if (roughCache.current[key]) return roughCache.current[key]

    const rc = roughCanvasRef.current
    if (!rc) return []

    const opts = {
      ...ROUGH_OPTIONS,
      stroke: el.stroke || '#2c2c2c',
      fill: el.fill === 'transparent' ? undefined : el.fill,
      strokeWidth: el.strokeWidth || 2,
    }

    let drawable
    const x = el.x, y = el.y
    const w = el.width || 0, h = el.height || 0

    if (el.shapeType === 'rect') {
      const rx = w < 0 ? x + w : x
      const ry = h < 0 ? y + h : y
      drawable = rc.generator.rectangle(rx, ry, Math.abs(w), Math.abs(h), opts)
    } else if (el.shapeType === 'circle') {
      drawable = rc.generator.ellipse(x + w / 2, y + h / 2, Math.abs(w), Math.abs(h), opts)
    } else if (el.shapeType === 'line') {
      drawable = rc.generator.line(x, y, el.x2, el.y2, opts)
    } else if (el.shapeType === 'arrow') {
      drawable = rc.generator.line(x, y, el.x2, el.y2, opts)
    }

    if (!drawable) return []

    const sets = drawable.sets || []
    const result = sets.map(set => ({
      type: set.type,
      ops: set.ops,
      stroke: el.stroke,
      fill: el.fill,
      strokeWidth: el.strokeWidth,
    }))

    roughCache.current[key] = result
    return result
  }

  // Render a rough shape as Konva Lines
  const renderRoughShape = (el, isDraft) => {
    const sets = getRoughPoints(el)
    const opacity = isDraft ? 0.6 : getRecencyOpacity(el)
    const isSelected = selectedId === el.id

    const lines = sets.map((set, idx) => {
      const points = []
      let cx = 0, cy = 0
      set.ops.forEach(op => {
        if (op.op === 'move') { cx = op.data[0]; cy = op.data[1] }
        else if (op.op === 'lineTo') {
          points.push(cx, cy, op.data[0], op.data[1])
          cx = op.data[0]; cy = op.data[1]
        } else if (op.op === 'bcurveTo') {
          // Approximate bezier with line segments
          const steps = 10
          let x0 = cx, y0 = cy
          for (let t = 1; t <= steps; t++) {
            const s = t / steps
            const s2 = s * s, s3 = s2 * s
            const b = 1 - s
            const b2 = b * b, b3 = b2 * b
            const nx = b3 * x0 + 3 * b2 * s * op.data[0] + 3 * b * s2 * op.data[2] + s3 * op.data[4]
            const ny = b3 * y0 + 3 * b2 * s * op.data[1] + 3 * b * s2 * op.data[3] + s3 * op.data[5]
            points.push(x0, y0, nx, ny)
            x0 = nx; y0 = ny
          }
          cx = op.data[4]; cy = op.data[5]
        }
      })

      if (points.length < 4) return null

      return (
        <Line
          key={`${el.id}-set-${idx}`}
          points={points}
          stroke={set.type === 'fillSketch' ? (el.fill === 'transparent' ? undefined : el.fill) : el.stroke}
          strokeWidth={set.type === 'fillSketch' ? 1 : (el.strokeWidth || 2)}
          opacity={opacity}
          lineCap="round"
          lineJoin="round"
          tension={0}
          listening={idx === 0}
          onClick={idx === 0 ? () => setSelectedId(isSelected ? null : el.id) : undefined}
          shadowColor={isSelected ? '#f5a623' : undefined}
          shadowBlur={isSelected ? 16 : 0}
          shadowOpacity={isSelected ? 0.9 : 0}
          draggable={isDraft && idx === 0}
          onDragEnd={isDraft && idx === 0 ? (e) => {
            const dx = e.target.x(), dy = e.target.y()
            handleElementDragEnd(el.id, dx, dy)
            e.target.x(0); e.target.y(0)
          } : undefined}
        />
      )
    }).filter(Boolean)

    // Arrow head
    if (el.shapeType === 'arrow' && lines.length > 0) {
      const angle = Math.atan2(el.y2 - el.y, el.x2 - el.x)
      const headLen = 15
      const points = [
        el.x2 - headLen * Math.cos(angle - Math.PI / 7),
        el.y2 - headLen * Math.sin(angle - Math.PI / 7),
        el.x2, el.y2,
        el.x2 - headLen * Math.cos(angle + Math.PI / 7),
        el.y2 - headLen * Math.sin(angle + Math.PI / 7),
      ]
      lines.push(
        <Line
          key={`${el.id}-arrow-head`}
          points={points}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth || 2}
          opacity={opacity}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      )
    }

    return lines
  }

  // ── Render element ───────────────────────────────────────────────────────────

  const renderElement = (el, isDraft = false) => {
    const isSelected = selectedId === el.id
    const isHovered = hoveredElementId === el.id
    const glowProps = isSelected ? { shadowColor: '#f5a623', shadowBlur: 16, shadowOpacity: 0.9 } : {}

    const commonProps = {
      key: el.id,
      onClick: () => setSelectedId(isSelected ? null : el.id),
      opacity: isDraft ? 0.6 : getRecencyOpacity(el),
      draggable: isDraft,
      onMouseEnter: () => setHoveredElementId(el.id),
      onMouseLeave: () => setHoveredElementId(null),
    }

    const timestamp = isHovered && el.createdAt ? (
      <Text
        key={`ts-${el.id}`}
        x={(el.x || el.points?.[0] || 0) + 10}
        y={(el.y || el.points?.[1] || 0) - 30}
        text={formatTime(el.createdAt)}
        fontSize={12} fill="#888" fontFamily="Arial" listening={false}
      />
    ) : null

    if (el.type === 'shape') {
      return renderRoughShape(el, isDraft)
    }

    if (el.type === 'drawing') {
      return [
        <Line
          {...commonProps}
          points={el.points}
          stroke={el.stroke || '#2c2c2c'}
          strokeWidth={el.strokeWidth}
          tension={0.4} lineCap="round" lineJoin="round"
          onDragEnd={(e) => {
            const dx = e.target.x(), dy = e.target.y()
            handleElementDragEnd(el.id, dx, dy)
            e.target.x(0); e.target.y(0)
          }}
          {...glowProps}
        />,
        timestamp,
      ].filter(Boolean)
    }

    if (el.type === 'text') {
      return [
        <Text
          {...commonProps}
          x={el.x} y={el.y} text={el.text}
          fontSize={el.fontSize} fill={el.fill || '#2c2c2c'} fontFamily={el.fontFamily}
          onDragEnd={(e) => {
            handleElementDragEnd(el.id, e.target.x() - el.x, e.target.y() - el.y)
            e.target.x(el.x); e.target.y(el.y)
          }}
          {...glowProps}
        />,
        timestamp,
      ].filter(Boolean)
    }

    if (el.type === 'image' && loadedImages[el.id]) {
      return [
        <KonvaImage
          {...commonProps}
          x={el.x} y={el.y} width={el.width} height={el.height}
          image={loadedImages[el.id]}
          onDragEnd={(e) => handleImageDragEnd(el.id, e.target.x(), e.target.y())}
          {...glowProps}
        />,
        timestamp,
      ].filter(Boolean)
    }

    return null
  }

  // ── Preview shapes ───────────────────────────────────────────────────────────

  const renderCurrentShape = () => {
    if (!currentShape) return null
    return renderRoughShape(currentShape, true)
  }

  // ── Cursor ───────────────────────────────────────────────────────────────────

  const getCursor = () => {
    if (tool === 'eraser') return 'cell'
    if (tool === 'select') return 'default'
    if (tool === 'text') return 'text'
    if (['rect', 'circle', 'arrow', 'line'].includes(tool)) return 'crosshair'
    return 'crosshair'
  }

  // ── Color palette ────────────────────────────────────────────────────────────

  const COLORS = ['#2c2c2c', '#ffffff', '#ff6b6b', '#4ecdc4', '#ffe66d', '#ff006e', '#8e44ad', '#2e86ab', '#a23b72', '#f18f01', '#c73e1d', '#3b1f2b']
  const FILLS = ['transparent', '#ffffff', '#ff6b6b55', '#4ecdc455', '#ffe66d55', '#ff006e55', '#8e44ad55', '#2e86ab55']

  const toolButtons = [
    { id: 'select', label: '↖ select' },
    { id: 'draw', label: '✏️ draw' },
    { id: 'rect', label: '▭ rect' },
    { id: 'circle', label: '○ circle' },
    { id: 'arrow', label: '→ arrow' },
    { id: 'line', label: '╱ line' },
    { id: 'text', label: 'T text' },
    { id: 'eraser', label: '◻ erase' },
  ]

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100vh', cursor: getCursor() }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >

      {drawWarning && (
        <div style={{
          position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#ffefc1', color: '#b26a00', padding: '10px 24px',
          borderRadius: 10, fontWeight: 600, fontSize: 15, zIndex: 9999,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontFamily: 'Georgia, serif',
        }}>
          {drawWarning}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{
        position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 4, background: 'white', borderRadius: 14,
        padding: '6px 10px', boxShadow: '0 2px 16px rgba(0,0,0,0.1)',
        zIndex: 100, alignItems: 'center', flexWrap: 'wrap', maxWidth: '95vw',
        fontFamily: 'Georgia, serif',
      }}>

        {/* Tool buttons */}
        {toolButtons.map(t => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            style={{
              padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tool === t.id ? '#2c2c2c' : '#f5f2ee',
              color: tool === t.id ? 'white' : '#2c2c2c',
              fontWeight: 600, fontSize: 13, fontFamily: 'Georgia, serif',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}

        <div style={{ width: 1, height: 24, background: '#e0dbd4', margin: '0 2px' }} />

        {/* Stroke color */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => { setColorPickerTarget('stroke'); setShowColorPicker(p => colorPickerTarget === 'stroke' ? !p : true) }}
            style={{
              width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
              background: tool === 'text' ? textColor : (tool === 'draw' ? drawColor : shapeColor),
              border: '2px solid #e0dbd4', boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
            title="Stroke color"
          />
          {showColorPicker && colorPickerTarget === 'stroke' && (
            <div style={{
              position: 'absolute', top: 40, left: 0, background: 'white',
              borderRadius: 10, padding: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              display: 'flex', flexDirection: 'column', gap: 6, zIndex: 300, width: 160,
            }}>
              <p style={{ margin: 0, fontSize: 11, color: '#aaa', fontFamily: 'Georgia, serif' }}>stroke</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                {COLORS.map(color => (
                  <div
                    key={color}
                    onClick={() => {
                      if (tool === 'text') setTextColor(color)
                      else if (tool === 'draw') setDrawColor(color)
                      else setShapeColor(color)
                      setShowColorPicker(false)
                    }}
                    style={{
                      width: 20, height: 20, borderRadius: 4, cursor: 'pointer',
                      background: color, border: '1.5px solid #e0dbd4',
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Fill color (shapes only) */}
        {['rect', 'circle'].includes(tool) && (
          <div style={{ position: 'relative' }}>
            <div
              onClick={() => { setColorPickerTarget('fill'); setShowColorPicker(p => colorPickerTarget === 'fill' ? !p : true) }}
              style={{
                width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
                background: fillColor === 'transparent'
                  ? 'linear-gradient(135deg, white 40%, #ff6b6b 40%, #ff6b6b 60%, white 60%)'
                  : fillColor,
                border: '2px solid #e0dbd4',
              }}
              title="Fill color"
            />
            {showColorPicker && colorPickerTarget === 'fill' && (
              <div style={{
                position: 'absolute', top: 40, left: 0, background: 'white',
                borderRadius: 10, padding: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                display: 'flex', flexDirection: 'column', gap: 6, zIndex: 300, width: 160,
              }}>
                <p style={{ margin: 0, fontSize: 11, color: '#aaa', fontFamily: 'Georgia, serif' }}>fill</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  {FILLS.map(color => (
                    <div
                      key={color}
                      onClick={() => { setFillColor(color); setShowColorPicker(false) }}
                      style={{
                        width: 28, height: 28, borderRadius: 4, cursor: 'pointer',
                        background: color === 'transparent'
                          ? 'linear-gradient(135deg, white 40%, #ff6b6b 40%, #ff6b6b 60%, white 60%)'
                          : color,
                        border: '1.5px solid #e0dbd4',
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Brush size */}
        {['draw', 'rect', 'circle', 'arrow', 'line'].includes(tool) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888' }}>
            <input
              type="range" min="1" max="15" value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              style={{ width: 60 }}
            />
            <span style={{ fontSize: 11, color: '#aaa' }}>{brushSize}px</span>
          </div>
        )}

        <div style={{ width: 1, height: 24, background: '#e0dbd4', margin: '0 2px' }} />

        {/* Undo / Redo */}
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          style={{
            padding: '5px 10px', borderRadius: 8, border: 'none', cursor: undoStack.length === 0 ? 'default' : 'pointer',
            background: '#f5f2ee', color: undoStack.length === 0 ? '#ccc' : '#2c2c2c',
            fontWeight: 600, fontSize: 13,
          }}
          title="Undo (⌘Z)"
        >
          ↩
        </button>
        <button
          onClick={redo}
          disabled={redoStack.length === 0}
          style={{
            padding: '5px 10px', borderRadius: 8, border: 'none', cursor: redoStack.length === 0 ? 'default' : 'pointer',
            background: '#f5f2ee', color: redoStack.length === 0 ? '#ccc' : '#2c2c2c',
            fontWeight: 600, fontSize: 13,
          }}
          title="Redo (⌘Y)"
        >
          ↪
        </button>

        <div style={{ width: 1, height: 24, background: '#e0dbd4', margin: '0 2px' }} />

        {/* Zoom */}
        <button
          onClick={() => setScale(prev => Math.min(prev * 1.2, 4))}
          style={{ padding: '5px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#f5f2ee', fontSize: 13 }}
        >+</button>
        <span style={{ fontSize: 12, color: '#888', minWidth: 36, textAlign: 'center' }}>
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale(prev => Math.max(prev * 0.8, 0.2))}
          style={{ padding: '5px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#f5f2ee', fontSize: 13 }}
        >−</button>

        <div style={{ width: 1, height: 24, background: '#e0dbd4', margin: '0 2px' }} />

        {/* Image */}
        <button
          onClick={() => fileInputRef.current.click()}
          disabled={uploadingImage}
          style={{
            padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: '#f5f2ee', color: '#2c2c2c', fontWeight: 600, fontSize: 13,
            opacity: uploadingImage ? 0.6 : 1,
          }}
        >
          {uploadingImage ? '...' : '🖼️'}
        </button>

        {/* Stickers */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowStickers(!showStickers)}
            style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#f5f2ee', fontSize: 13 }}
          >
            ⭐
          </button>
          {showStickers && (
            <div style={{
              position: 'absolute', top: 44, right: 0, background: 'white',
              borderRadius: 10, padding: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, width: 148, zIndex: 200,
            }}>
              {stickers.map((emoji, idx) => (
                <button
                  key={idx}
                  onClick={() => addSticker(emoji)}
                  style={{ fontSize: 22, border: 'none', background: '#f5f2ee', borderRadius: 6, cursor: 'pointer', padding: 6 }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 24, background: '#e0dbd4', margin: '0 2px' }} />

        {/* Delete selected */}
        {selectedId && draftElements.find(el => el.id === selectedId) && (
          <button
            onClick={() => deleteElement(selectedId)}
            style={{
              padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: '#ff6b6b', color: 'white', fontWeight: 600, fontSize: 13,
            }}
          >
            delete
          </button>
        )}

        <div style={{ width: 1, height: 24, background: '#e0dbd4', margin: '0 2px' }} />

        {/* Partner status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#888' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: partnerOnline ? '#4caf50' : '#ccc' }} />
          {partnerOnline ? 'online' : 'offline'}
        </div>

        <div style={{ width: 1, height: 24, background: '#e0dbd4', margin: '0 2px' }} />

        {/* Send */}
        <button
          onClick={handleSend}
          disabled={draftElements.length === 0}
          style={{
            padding: '5px 16px', borderRadius: 8, border: 'none',
            cursor: draftElements.length === 0 ? 'default' : 'pointer',
            background: justSent ? '#4caf50' : draftElements.length === 0 ? '#f0f0f0' : '#2c2c2c',
            color: justSent || draftElements.length > 0 ? 'white' : '#aaa',
            fontWeight: 700, fontSize: 13, transition: 'all 0.3s', fontFamily: 'Georgia, serif',
          }}
        >
          {justSent ? '✓ sent' : `send${draftElements.length > 0 ? ` (${draftElements.length})` : ''}`}
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />

      {textInput && (
        <input
          ref={inputRef}
          onBlur={commitText}
          onKeyDown={handleKeyDown}
          style={{
            position: 'absolute',
            left: textInput.screenX, top: textInput.screenY,
            background: 'transparent', border: 'none',
            borderBottom: '1.5px solid #aaa', outline: 'none',
            fontSize: 18 * scale, fontFamily: 'Georgia, serif',
            color: textColor, minWidth: 120, zIndex: 200,
          }}
        />
      )}

      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <Layer>
          <Rect
            name="background"
            x={0} y={0}
            width={CANVAS_WIDTH / scale}
            height={CANVAS_HEIGHT}
            fill="#faf9f6"
          />

          {sentElements.map(el => renderElement(el, false)).flat().filter(Boolean)}
          {draftElements.map(el => renderElement(el, true)).flat().filter(Boolean)}
          {renderCurrentShape()}

          {currentLine && (
            <Line
              points={currentLine.points}
              stroke={currentLine.stroke}
              strokeWidth={currentLine.strokeWidth}
              tension={0.4} lineCap="round" lineJoin="round"
            />
          )}
        </Layer>
      </Stage>
    </div>
  )
}

export default Room