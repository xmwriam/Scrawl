import { Stage, Layer, Rect, Line, Text, Image as KonvaImage } from 'react-konva'
import { useRef, useState, useEffect, useContext, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { AuthContext } from '../context/AuthContext'
import rough from 'roughjs'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const CANVAS_WIDTH = window.innerWidth
const CANVAS_HEIGHT = 10000

const ROUGH_OPTIONS = {
  roughness: 2,
  strokeWidth: 1.5,
  bowing: 1.5,
}

const COLORS = [
  '#2c2410', '#8b5e3c', '#6b4a35', '#4a3728',
  '#c0392b', '#8b3c5e', '#3c5e8b', '#4a6b3c',
  '#c8a040', '#7c6b3c', '#3c7c6b', '#8b7c3c'
]

const FILLS = [
  'transparent', '#fffcf8',
  '#f5e6d0', '#e0d0b8',
  '#ffd0c8', '#d0e8d0',
  '#c8d8f0', '#f0d8e8'
]

function Room() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { token } = useContext(AuthContext)
  const socketRef = useRef(null)

  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [sentElements, setSentElements] = useState([])
  const [draftElements, setDraftElements] = useState([])
  const [currentLine, setCurrentLine] = useState(null)
  const [currentShape, setCurrentShape] = useState(null)

  const [tool, setTool] = useState('draw')
  const [drawColor, setDrawColor] = useState('#2c2410')
  const [brushSize, setBrushSize] = useState(3)
  const [textColor, setTextColor] = useState('#2c2410')
  const [shapeColor, setShapeColor] = useState('#2c2410')
  const [fillColor, setFillColor] = useState('transparent')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [colorPickerTarget, setColorPickerTarget] = useState('stroke')

  const [showStickers, setShowStickers] = useState(false)
  const [textInput, setTextInput] = useState(null)
  const [partnerOnline, setPartnerOnline] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [loadedImages, setLoadedImages] = useState({})
  const [selectedId, setSelectedId] = useState(null)
  const [hoveredElementId, setHoveredElementId] = useState(null)
  const [justSent, setJustSent] = useState(false)

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

  // ── Wheel ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleWheel = (e) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
        setScale(prev => Math.min(Math.max(prev * zoomFactor, 0.2), 4))
      } else {
        if (isDrawing.current) return
        setStagePos(prev => ({ x: 0, y: Math.min(0, prev.y - e.deltaY) }))
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

  // ── Text focus ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (textInput && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [textInput])

  // ── Rough.js setup ───────────────────────────────────────────────────────────

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
      if (['text', 'shape', 'image'].includes(el.type)) {
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

    if (tool === 'eraser') { eraseAt(pos); return }

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
        x2: pos.x, y2: pos.y,
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
        fontFamily: 'Lora, Georgia, serif',
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
    if (draftElements.find(el => el.id === elementId)) {
      setDraftElements(prev => prev.filter(el => el.id !== elementId))
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
    addDraft({
      id: Date.now().toString(), type: 'text',
      x: centerX, y: centerY,
      text: emoji, fontSize: 48,
      fill: '#2c2410', fontFamily: 'Arial',
    })
    setShowStickers(false)
  }

  // ── Rough.js rendering ───────────────────────────────────────────────────────

  const getRoughSets = (el) => {
    const key = `${el.id}-${el.x}-${el.y}-${el.width}-${el.height}-${el.x2}-${el.y2}-${el.stroke}-${el.fill}-${el.strokeWidth}`
    if (roughCache.current[key]) return roughCache.current[key]

    const rc = roughCanvasRef.current
    if (!rc) return []

    const opts = {
      ...ROUGH_OPTIONS,
      stroke: el.stroke || '#2c2410',
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
    const result = (drawable.sets || []).map(set => ({ type: set.type, ops: set.ops, stroke: el.stroke, fill: el.fill, strokeWidth: el.strokeWidth }))
    roughCache.current[key] = result
    return result
  }

  const opsToPoints = (ops) => {
    const points = []
    let cx = 0, cy = 0
    ops.forEach(op => {
      if (op.op === 'move') { cx = op.data[0]; cy = op.data[1] }
      else if (op.op === 'lineTo') {
        points.push(cx, cy, op.data[0], op.data[1])
        cx = op.data[0]; cy = op.data[1]
      } else if (op.op === 'bcurveTo') {
        const steps = 12
        let x0 = cx, y0 = cy
        for (let t = 1; t <= steps; t++) {
          const s = t / steps, b = 1 - s
          const nx = b*b*b*x0 + 3*b*b*s*op.data[0] + 3*b*s*s*op.data[2] + s*s*s*op.data[4]
          const ny = b*b*b*y0 + 3*b*b*s*op.data[1] + 3*b*s*s*op.data[3] + s*s*s*op.data[5]
          points.push(x0, y0, nx, ny)
          x0 = nx; y0 = ny
        }
        cx = op.data[4]; cy = op.data[5]
      }
    })
    return points
  }

  // Convert freehand points into a rough-looking line by adding slight wobble
  const roughifyPoints = (points) => {
    if (points.length < 4) return points
    const result = []
    for (let i = 0; i < points.length - 2; i += 2) {
      result.push(points[i], points[i + 1])
      if (i + 2 < points.length) {
        const wobble = 0.8
        result.push(
          (points[i] + points[i + 2]) / 2 + (Math.random() - 0.5) * wobble,
          (points[i + 1] + points[i + 3]) / 2 + (Math.random() - 0.5) * wobble
        )
      }
    }
    result.push(points[points.length - 2], points[points.length - 1])
    return result
  }

  const renderRoughShape = (el, isDraft) => {
    const sets = getRoughSets(el)
    const opacity = isDraft ? 0.65 : getRecencyOpacity(el)
    const isSelected = selectedId === el.id

    const lines = sets.map((set, idx) => {
      const points = opsToPoints(set.ops)
      if (points.length < 4) return null
      return (
        <Line
          key={`${el.id}-set-${idx}`}
          points={points}
          stroke={set.type === 'fillSketch' ? (el.fill === 'transparent' ? undefined : el.fill) : (el.stroke || '#2c2410')}
          strokeWidth={set.type === 'fillSketch' ? 1 : (el.strokeWidth || 2)}
          opacity={opacity}
          lineCap="round" lineJoin="round" tension={0}
          listening={idx === 0}
          onClick={idx === 0 ? () => setSelectedId(isSelected ? null : el.id) : undefined}
          shadowColor={isSelected ? '#8b5e3c' : undefined}
          shadowBlur={isSelected ? 12 : 0}
          shadowOpacity={isSelected ? 0.6 : 0}
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
      const headLen = 14
      lines.push(
        <Line
          key={`${el.id}-arrowhead`}
          points={[
            el.x2 - headLen * Math.cos(angle - Math.PI / 7),
            el.y2 - headLen * Math.sin(angle - Math.PI / 7),
            el.x2, el.y2,
            el.x2 - headLen * Math.cos(angle + Math.PI / 7),
            el.y2 - headLen * Math.sin(angle + Math.PI / 7),
          ]}
          stroke={el.stroke} strokeWidth={el.strokeWidth || 2}
          opacity={opacity} lineCap="round" lineJoin="round" listening={false}
        />
      )
    }

    return lines
  }

  // ── Render element ───────────────────────────────────────────────────────────

  const renderElement = (el, isDraft = false) => {
    const isSelected = selectedId === el.id
    const isHovered = hoveredElementId === el.id
    const opacity = isDraft ? 0.65 : getRecencyOpacity(el)
    const glowProps = isSelected ? { shadowColor: '#8b5e3c', shadowBlur: 12, shadowOpacity: 0.6 } : {}

    const commonDragProps = isDraft ? {
      draggable: true,
      onMouseEnter: () => setHoveredElementId(el.id),
      onMouseLeave: () => setHoveredElementId(null),
    } : {
      onMouseEnter: () => setHoveredElementId(el.id),
      onMouseLeave: () => setHoveredElementId(null),
    }

    const timestamp = isHovered && el.createdAt ? (
      <Text
        key={`ts-${el.id}`}
        x={(el.x || el.points?.[0] || 0) + 8}
        y={(el.y || el.points?.[1] || 0) - 28}
        text={formatTime(el.createdAt)}
        fontSize={11} fill="#b0a090"
        fontFamily="Nunito, sans-serif" listening={false}
      />
    ) : null

    if (el.type === 'shape') return renderRoughShape(el, isDraft)

    if (el.type === 'drawing') {
      // Use stored rough points if available, otherwise roughify on the fly
      const pts = el.roughPoints || roughifyPoints(el.points)
      return [
        <Line
          key={el.id}
          points={pts}
          stroke={el.stroke || '#2c2410'}
          strokeWidth={el.strokeWidth}
          tension={0.3} lineCap="round" lineJoin="round"
          opacity={opacity}
          onClick={() => setSelectedId(isSelected ? null : el.id)}
          {...commonDragProps}
          onDragEnd={isDraft ? (e) => {
            const dx = e.target.x(), dy = e.target.y()
            handleElementDragEnd(el.id, dx, dy)
            e.target.x(0); e.target.y(0)
          } : undefined}
          {...glowProps}
        />,
        timestamp,
      ].filter(Boolean)
    }

    if (el.type === 'text') {
      return [
        <Text
          key={el.id}
          x={el.x} y={el.y} text={el.text}
          fontSize={el.fontSize} fill={el.fill || '#2c2410'}
          fontFamily={el.fontFamily}
          opacity={opacity}
          onClick={() => setSelectedId(isSelected ? null : el.id)}
          {...commonDragProps}
          onDragEnd={isDraft ? (e) => {
            handleElementDragEnd(el.id, e.target.x() - el.x, e.target.y() - el.y)
            e.target.x(el.x); e.target.y(el.y)
          } : undefined}
          {...glowProps}
        />,
        timestamp,
      ].filter(Boolean)
    }

    if (el.type === 'image' && loadedImages[el.id]) {
      return [
        <KonvaImage
          key={el.id}
          x={el.x} y={el.y} width={el.width} height={el.height}
          image={loadedImages[el.id]}
          opacity={opacity}
          onClick={() => setSelectedId(isSelected ? null : el.id)}
          {...commonDragProps}
          onDragEnd={isDraft ? (e) => handleImageDragEnd(el.id, e.target.x(), e.target.y()) : undefined}
          {...glowProps}
        />,
        timestamp,
      ].filter(Boolean)
    }

    return null
  }

  // ── Cursor ───────────────────────────────────────────────────────────────────

  const getCursor = () => {
    if (tool === 'eraser') return 'cell'
    if (tool === 'select') return 'default'
    if (tool === 'text') return 'text'
    return 'crosshair'
  }

  // ── Dot grid background canvas ───────────────────────────────────────────────

  const dotGridCanvas = (() => {
    const c = document.createElement('canvas')
    c.width = 24; c.height = 24
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#faf6f0'
    ctx.fillRect(0, 0, 24, 24)
    ctx.beginPath()
    ctx.arc(12, 12, 1.2, 0, Math.PI * 2)
    ctx.fillStyle = '#c8b89a'
    ctx.fill()
    return c
  })()

  // ── Tool buttons ─────────────────────────────────────────────────────────────

  const toolButtons = [
    { id: 'select', label: '↖ select' },
    { id: 'draw', label: '✏ draw' },
    { id: 'rect', label: '▭ rect' },
    { id: 'circle', label: '○ circle' },
    { id: 'arrow', label: '→ arrow' },
    { id: 'line', label: '╱ line' },
    { id: 'text', label: 'T text' },
    { id: 'eraser', label: '◻ erase' },
  ]

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100vh', cursor: getCursor() }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >

      {/* ── Toolbar ── */}
      <div style={{
        position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 3, background: '#fffcf8',
        borderRadius: 14, padding: '6px 10px', zIndex: 100,
        alignItems: 'center', flexWrap: 'wrap', maxWidth: '95vw',
        fontFamily: 'Nunito, sans-serif',
        boxShadow: '0 2px 16px rgba(44,36,16,0.10), 0 1px 4px rgba(44,36,16,0.06)',
        border: '1px solid #e8ddd0',
      }}>

        {toolButtons.map(t => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            style={{
              padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tool === t.id ? '#2c2410' : '#f5f0e8',
              color: tool === t.id ? '#faf6f0' : '#6b5040',
              fontWeight: 700, fontSize: 12, fontFamily: 'Nunito, sans-serif',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}

        <div style={{ width: 1, height: 22, background: '#e8ddd0', margin: '0 2px' }} />

        {/* Stroke color */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => { setColorPickerTarget('stroke'); setShowColorPicker(p => colorPickerTarget === 'stroke' ? !p : true) }}
            style={{
              width: 26, height: 26, borderRadius: 7, cursor: 'pointer',
              background: tool === 'text' ? textColor : (tool === 'draw' ? drawColor : shapeColor),
              border: '2px solid #e8ddd0',
            }}
            title="Stroke color"
          />
          {showColorPicker && colorPickerTarget === 'stroke' && (
            <div style={{
              position: 'absolute', top: 38, left: 0, background: '#fffcf8',
              borderRadius: 12, padding: 10, zIndex: 300, width: 160,
              boxShadow: '0 6px 24px rgba(44,36,16,0.12)',
              border: '1px solid #e8ddd0',
            }}>
              <p style={{ margin: '0 0 7px', fontSize: 10, color: '#b0a090', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: 'Nunito, sans-serif' }}>stroke</p>
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
                    style={{ width: 20, height: 20, borderRadius: 5, cursor: 'pointer', background: color, border: '1.5px solid #e8ddd0' }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Fill color */}
        {['rect', 'circle'].includes(tool) && (
          <div style={{ position: 'relative' }}>
            <div
              onClick={() => { setColorPickerTarget('fill'); setShowColorPicker(p => colorPickerTarget === 'fill' ? !p : true) }}
              style={{
                width: 26, height: 26, borderRadius: 7, cursor: 'pointer',
                background: fillColor === 'transparent'
                  ? 'linear-gradient(135deg, #fffcf8 40%, #c8a882 40%, #c8a882 60%, #fffcf8 60%)'
                  : fillColor,
                border: '2px solid #e8ddd0',
              }}
              title="Fill color"
            />
            {showColorPicker && colorPickerTarget === 'fill' && (
              <div style={{
                position: 'absolute', top: 38, left: 0, background: '#fffcf8',
                borderRadius: 12, padding: 10, zIndex: 300, width: 148,
                boxShadow: '0 6px 24px rgba(44,36,16,0.12)',
                border: '1px solid #e8ddd0',
              }}>
                <p style={{ margin: '0 0 7px', fontSize: 10, color: '#b0a090', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: 'Nunito, sans-serif' }}>fill</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  {FILLS.map(color => (
                    <div
                      key={color}
                      onClick={() => { setFillColor(color); setShowColorPicker(false) }}
                      style={{
                        width: 26, height: 26, borderRadius: 5, cursor: 'pointer',
                        background: color === 'transparent'
                          ? 'linear-gradient(135deg, #fffcf8 40%, #c8a882 40%, #c8a882 60%, #fffcf8 60%)'
                          : color,
                        border: '1.5px solid #e8ddd0',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <input
              type="range" min="1" max="15" value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              style={{ width: 55, accentColor: '#8b5e3c' }}
            />
            <span style={{ fontSize: 11, color: '#b0a090', fontWeight: 700, minWidth: 24, fontFamily: 'Nunito, sans-serif' }}>{brushSize}</span>
          </div>
        )}

        <div style={{ width: 1, height: 22, background: '#e8ddd0', margin: '0 2px' }} />

        {/* Undo / Redo */}
        <button onClick={undo} disabled={undoStack.length === 0}
          style={{
            padding: '5px 8px', borderRadius: 7, border: 'none',
            cursor: undoStack.length === 0 ? 'default' : 'pointer',
            background: '#f5f0e8',
            color: undoStack.length === 0 ? '#d0c0b0' : '#6b5040',
            fontWeight: 800, fontSize: 14,
          }} title="Undo (⌘Z)">↩</button>
        <button onClick={redo} disabled={redoStack.length === 0}
          style={{
            padding: '5px 8px', borderRadius: 7, border: 'none',
            cursor: redoStack.length === 0 ? 'default' : 'pointer',
            background: '#f5f0e8',
            color: redoStack.length === 0 ? '#d0c0b0' : '#6b5040',
            fontWeight: 800, fontSize: 14,
          }} title="Redo (⌘Y)">↪</button>

        <div style={{ width: 1, height: 22, background: '#e8ddd0', margin: '0 2px' }} />

        {/* Zoom */}
        <button onClick={() => setScale(prev => Math.min(prev * 1.2, 4))}
          style={{ padding: '4px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#f5f0e8', color: '#6b5040', fontWeight: 800, fontSize: 13 }}>+</button>
        <span style={{ fontSize: 11, color: '#b0a090', minWidth: 34, textAlign: 'center', fontWeight: 700, fontFamily: 'Nunito, sans-serif' }}>
          {Math.round(scale * 100)}%
        </span>
        <button onClick={() => setScale(prev => Math.max(prev * 0.8, 0.2))}
          style={{ padding: '4px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#f5f0e8', color: '#6b5040', fontWeight: 800, fontSize: 13 }}>−</button>

        <div style={{ width: 1, height: 22, background: '#e8ddd0', margin: '0 2px' }} />

        {/* Image */}
        <button onClick={() => fileInputRef.current.click()} disabled={uploadingImage}
          style={{ padding: '5px 9px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#f5f0e8', fontSize: 14, opacity: uploadingImage ? 0.5 : 1 }}>
          🖼️
        </button>

        {/* Stickers */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowStickers(!showStickers)}
            style={{ padding: '5px 9px', borderRadius: 7, border: 'none', cursor: 'pointer', background: showStickers ? '#2c2410' : '#f5f0e8', fontSize: 14, color: showStickers ? '#faf6f0' : 'inherit' }}>
            ✦
          </button>
          {showStickers && (
            <div style={{
              position: 'absolute', top: 42, right: 0, background: '#fffcf8',
              borderRadius: 12, padding: 8,
              boxShadow: '0 6px 24px rgba(44,36,16,0.12)',
              border: '1px solid #e8ddd0',
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, width: 144, zIndex: 200,
            }}>
              {stickers.map((emoji, idx) => (
                <button key={idx} onClick={() => addSticker(emoji)}
                  style={{ fontSize: 20, border: 'none', background: '#f5f0e8', borderRadius: 7, cursor: 'pointer', padding: 5 }}>
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 22, background: '#e8ddd0', margin: '0 2px' }} />

        {/* Delete selected */}
        {selectedId && draftElements.find(el => el.id === selectedId) && (
          <button onClick={() => deleteElement(selectedId)}
            style={{
              padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: '#f0e0d0', color: '#8b3c3c',
              fontWeight: 800, fontSize: 12, fontFamily: 'Nunito, sans-serif',
            }}>
            delete
          </button>
        )}

        <div style={{ width: 1, height: 22, background: '#e8ddd0', margin: '0 2px' }} />

        {/* Partner status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: partnerOnline ? '#6b8b5e' : '#d0c0b0',
          }} />
          <span style={{ color: partnerOnline ? '#6b8b5e' : '#c0b0a0', fontWeight: 700, fontFamily: 'Nunito, sans-serif', fontSize: 11 }}>
            {partnerOnline ? 'online' : 'offline'}
          </span>
        </div>

        <div style={{ width: 1, height: 22, background: '#e8ddd0', margin: '0 2px' }} />

        {/* Send */}
        <button
          onClick={handleSend} disabled={draftElements.length === 0}
          style={{
            padding: '5px 14px', borderRadius: 8,
            border: draftElements.length > 0 ? '1.5px solid #2c2410' : '1.5px solid #e8ddd0',
            cursor: draftElements.length === 0 ? 'default' : 'pointer',
            background: justSent ? '#4a7c4e' : draftElements.length === 0 ? '#f5f0e8' : '#2c2410',
            color: draftElements.length === 0 && !justSent ? '#c0b0a0' : '#faf6f0',
            fontWeight: 800, fontSize: 12, transition: 'all 0.3s',
            fontFamily: 'Nunito, sans-serif', letterSpacing: 0.3,
          }}
        >
          {justSent ? '✓ sent' : `send${draftElements.length > 0 ? ` (${draftElements.length})` : ''}`}
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />

      {/* Text input overlay */}
      {textInput && (
        <input
          ref={inputRef}
          onBlur={commitText}
          onKeyDown={handleKeyDown}
          style={{
            position: 'absolute',
            left: textInput.screenX, top: textInput.screenY,
            background: 'transparent', border: 'none',
            borderBottom: '1.5px solid #8b5e3c', outline: 'none',
            fontSize: 18 * scale,
            fontFamily: 'Lora, Georgia, serif',
            color: textColor, minWidth: 120, zIndex: 200,
          }}
        />
      )}

      {/* Canvas */}
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
          {/* Dot grid background */}
          <Rect
            name="background"
            x={0} y={0}
            width={CANVAS_WIDTH / scale + 200}
            height={CANVAS_HEIGHT}
            fillPatternImage={dotGridCanvas}
          />

          {sentElements.map(el => renderElement(el, false)).flat().filter(Boolean)}
          {draftElements.map(el => renderElement(el, true)).flat().filter(Boolean)}

          {/* Current shape preview */}
          {currentShape && renderRoughShape(currentShape, true)}

          {/* Current freehand line preview */}
          {currentLine && (
            <Line
              points={currentLine.points}
              stroke={currentLine.stroke}
              strokeWidth={currentLine.strokeWidth}
              tension={0.3} lineCap="round" lineJoin="round"
              opacity={0.65}
            />
          )}
        </Layer>
      </Stage>
    </div>
  )
}

export default Room