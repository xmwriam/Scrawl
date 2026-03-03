import { Stage, Layer, Rect, Line, Text, Image as KonvaImage } from 'react-konva'
import { useRef, useState, useEffect, useContext } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'
import { useSocket } from '../hooks/useSocket'
import { useCanvas, COLORS, FILLS } from '../hooks/useCanvas'
import { useAudio } from '../hooks/useAudio'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const CANVAS_WIDTH = window.innerWidth
const CANVAS_HEIGHT = 10000
const FIXED_OPACITY = 0.72

function Room() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { token, user } = useContext(AuthContext)

  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [loadedImages, setLoadedImages] = useState({})
  const [textInput, setTextInput] = useState(null)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [colorPickerTarget, setColorPickerTarget] = useState('stroke')
  const [showStickers, setShowStickers] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [justSent, setJustSent] = useState(false)
  const [hoveredElementId, setHoveredElementId] = useState(null)
  const [lastSeenTime, setLastSeenTime] = useState(null)
  const [playingAudioId, setPlayingAudioId] = useState(null)
  const audioRefs = useRef({})

  const stageRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  const { sentElements, setSentElements, partnerOnline, sendDrafts, saveDraft } = useSocket(roomId, token, navigate)

  const {
    draftElements, setDraftElements,
    currentLine, setCurrentLine,
    currentShape, setCurrentShape,
    tool, setTool,
    drawColor, setDrawColor,
    brushSize, setBrushSize,
    textColor, setTextColor,
    shapeColor, setShapeColor,
    fillColor, setFillColor,
    selectedId, setSelectedId,
    undoStack, redoStack,
    isDrawing, shapeStart, lastPoint,
    addDraft, undo, redo, deleteElement, eraseAt,
    handleElementDragEnd, handleImageDragEnd,
    getRoughSets, opsToPoints, roughifyPoints,
  } = useCanvas(roomId, saveDraft, user)

  const { isRecording, recordingSeconds, startRecording, stopRecording, formatDuration } = useAudio(addDraft, stagePos, scale)

  // ── Last seen ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !token) return
    // Fetch last seen time for this room
    fetch(`${BACKEND_URL}/rooms/${roomId}/last-seen`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.last_seen) setLastSeenTime(new Date(data.last_seen))
      })
      .catch(() => {})

    // Mark as seen now
    fetch(`${BACKEND_URL}/rooms/${roomId}/mark-seen`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    }).catch(() => {})
  }, [roomId, token])

  const isUnread = (el) => {
    if (!lastSeenTime || !el.createdAt) return false
    if (el.sentBy === user?.userId) return false
    return new Date(el.createdAt) > lastSeenTime
  }

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

  // ── Wheel zoom/scroll ────────────────────────────────────────────────────────

  useEffect(() => {
    const handleWheel = (e) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        setScale(prev => Math.min(Math.max(prev * (e.deltaY > 0 ? 0.9 : 1.1), 0.2), 4))
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

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const getPointerPosition = () => {
    const stage = stageRef.current
    const pos = stage.getPointerPosition()
    return {
      x: (pos.x - stagePos.x) / scale,
      y: (pos.y - stagePos.y) / scale,
    }
  }

  const getTouchPosition = (touch) => {
    const stage = stageRef.current
    const rect = stage.container().getBoundingClientRect()
    return {
      x: (touch.clientX - rect.left - stagePos.x) / scale,
      y: (touch.clientY - rect.top - stagePos.y) / scale,
    }
  }

  const formatTime = (createdAt) => {
    if (!createdAt) return ''
    const date = new Date(createdAt)
    const today = new Date()
    const isToday = date.toDateString() === today.toDateString()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    if (isToday) return `Today ${hh}:${mm}`
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${hh}:${mm}`
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')} ${hh}:${mm}`
  }

  // ── Send ─────────────────────────────────────────────────────────────────────

  const handleSend = () => {
    if (draftElements.length === 0) return
    setSentElements(prev => [...prev, ...draftElements])
    sendDrafts(draftElements)
    setDraftElements([])
    setJustSent(true)
    setTimeout(() => setJustSent(false), 2000)
  }

  // ── Mouse events ─────────────────────────────────────────────────────────────

  const handleMouseDown = (e) => {
    const isBackground = e.target === e.target.getStage() || e.target.name() === 'background'
    if (isBackground) setSelectedId(null)
    if (tool === 'select') return
    if (tool === 'text') {
      const pos = stageRef.current.getPointerPosition()
      const canvasPos = getPointerPosition()
      setTextInput({ screenX: pos.x, screenY: pos.y, canvasX: canvasPos.x, canvasY: canvasPos.y })
      return
    }
    if (tool === 'eraser') { isDrawing.current = true; eraseAt(getPointerPosition(), scale); return }
    if (tool === 'draw') {
      if (!isBackground) return
      isDrawing.current = true
      const pos = getPointerPosition()
      lastPoint.current = pos
      setCurrentLine({ id: Date.now().toString(), type: 'drawing', points: [pos.x, pos.y], stroke: drawColor, strokeWidth: brushSize })
      return
    }
    if (['rect', 'circle', 'arrow', 'line'].includes(tool)) {
      if (!isBackground) return
      isDrawing.current = true
      const pos = getPointerPosition()
      shapeStart.current = pos
      setCurrentShape({ id: Date.now().toString(), type: 'shape', shapeType: tool, x: pos.x, y: pos.y, width: 0, height: 0, x2: pos.x, y2: pos.y, stroke: shapeColor, fill: fillColor, strokeWidth: brushSize })
    }
  }

  const handleMouseMove = () => {
    if (!isDrawing.current) return
    const pos = getPointerPosition()
    if (tool === 'eraser') { eraseAt(pos, scale); return }
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
      setCurrentShape(prev => ({ ...prev, width: pos.x - start.x, height: pos.y - start.y, x2: pos.x, y2: pos.y }))
    }
  }

  const handleMouseUp = () => {
    if (!isDrawing.current) return
    isDrawing.current = false
    if (tool === 'draw' && currentLine) {
      if (currentLine.points.length >= 4) addDraft(currentLine)
      setCurrentLine(null); lastPoint.current = null; return
    }
    if (['rect', 'circle', 'arrow', 'line'].includes(tool) && currentShape) {
      if (Math.abs(currentShape.width) > 5 || Math.abs(currentShape.height) > 5) addDraft(currentShape)
      setCurrentShape(null); shapeStart.current = null
    }
  }

  // ── Touch events ─────────────────────────────────────────────────────────────

  const handleTouchStart = (e) => {
    const touch = e.evt.touches[0]
    if (!touch) return
    e.evt.preventDefault()
    const pos = getTouchPosition(touch)
    const isBackground = e.target === e.target.getStage() || e.target.name() === 'background'
    if (isBackground) setSelectedId(null)
    if (tool === 'select') return
    if (tool === 'text') {
      setTextInput({ screenX: touch.clientX, screenY: touch.clientY, canvasX: pos.x, canvasY: pos.y })
      return
    }
    if (tool === 'eraser') { isDrawing.current = true; eraseAt(pos, scale); return }
    if (tool === 'draw') {
      if (!isBackground) return
      isDrawing.current = true
      lastPoint.current = pos
      setCurrentLine({ id: Date.now().toString(), type: 'drawing', points: [pos.x, pos.y], stroke: drawColor, strokeWidth: brushSize })
      return
    }
    if (['rect', 'circle', 'arrow', 'line'].includes(tool)) {
      if (!isBackground) return
      isDrawing.current = true
      shapeStart.current = pos
      setCurrentShape({ id: Date.now().toString(), type: 'shape', shapeType: tool, x: pos.x, y: pos.y, width: 0, height: 0, x2: pos.x, y2: pos.y, stroke: shapeColor, fill: fillColor, strokeWidth: brushSize })
    }
  }

  const handleTouchMove = (e) => {
    if (!isDrawing.current) return
    e.evt.preventDefault()
    const touch = e.evt.touches[0]
    if (!touch) return
    const pos = getTouchPosition(touch)
    if (tool === 'eraser') { eraseAt(pos, scale); return }
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
      setCurrentShape(prev => ({ ...prev, width: pos.x - start.x, height: pos.y - start.y, x2: pos.x, y2: pos.y }))
    }
  }

  const handleTouchEnd = (e) => {
    e.evt.preventDefault()
    handleMouseUp()
  }

  // ── Text ─────────────────────────────────────────────────────────────────────

  const commitText = () => {
    const value = inputRef.current?.value?.trim()
    if (value && textInput) {
      addDraft({ id: Date.now().toString(), type: 'text', x: textInput.canvasX, y: textInput.canvasY, text: value, fontSize: 18, fill: textColor, fontFamily: 'Lora, Georgia, serif' })
    }
    setTextInput(null)
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
      addDraft({ id: Date.now().toString(), type: 'image', x: centerX - 200, y: centerY - 150, width: 400, height: 300, url: data.url })
    } catch (err) { alert(`Upload failed: ${err.message}`) }
    finally { setUploadingImage(false); fileInputRef.current.value = '' }
  }

  // ── Stickers ─────────────────────────────────────────────────────────────────

  const stickers = ['😍', '🎉', '💕', '✨', '🌟', '😂', '🔥', '💯', '🎨', '📝', '💌', '🌹']
  const addSticker = (emoji) => {
    const centerX = (window.innerWidth / 2 - stagePos.x) / scale
    const centerY = (window.innerHeight / 2 - stagePos.y) / scale
    addDraft({ id: Date.now().toString(), type: 'text', x: centerX, y: centerY, text: emoji, fontSize: 48, fill: '#2c2410', fontFamily: 'Arial' })
    setShowStickers(false)
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────────

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && textInput) commitText()
    if (e.key === 'Escape') setTextInput(null)
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !textInput) deleteElement(selectedId)
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo() }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo() }
  }

  // ── Rough shape rendering ────────────────────────────────────────────────────

  const renderRoughShape = (el, isDraft) => {
    const sets = getRoughSets(el)
    const unread = !isDraft && isUnread(el)
    const opacity = isDraft ? 0.65 : FIXED_OPACITY
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
          shadowColor={unread ? '#c8a040' : isSelected ? '#8b5e3c' : undefined}
          shadowBlur={unread ? 18 : isSelected ? 12 : 0}
          shadowOpacity={unread ? 0.7 : isSelected ? 0.6 : 0}
          draggable={isDraft && idx === 0}
          onDragEnd={isDraft && idx === 0 ? (e) => {
            const dx = e.target.x(), dy = e.target.y()
            handleElementDragEnd(el.id, dx, dy)
            e.target.x(0); e.target.y(0)
          } : undefined}
        />
      )
    }).filter(Boolean)

    if (el.shapeType === 'arrow' && lines.length > 0) {
      const angle = Math.atan2(el.y2 - el.y, el.x2 - el.x)
      const headLen = 14
      lines.push(
        <Line key={`${el.id}-arrowhead`}
          points={[
            el.x2 - headLen * Math.cos(angle - Math.PI / 7), el.y2 - headLen * Math.sin(angle - Math.PI / 7),
            el.x2, el.y2,
            el.x2 - headLen * Math.cos(angle + Math.PI / 7), el.y2 - headLen * Math.sin(angle + Math.PI / 7),
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
    const unread = !isDraft && isUnread(el)
    const opacity = isDraft ? 0.65 : FIXED_OPACITY
    const glowProps = unread
      ? { shadowColor: '#c8a040', shadowBlur: 18, shadowOpacity: 0.7 }
      : isSelected
        ? { shadowColor: '#8b5e3c', shadowBlur: 12, shadowOpacity: 0.6 }
        : {}

    const tooltip = isSelected && el.sentByUsername ? (
      <Text
        key={`tooltip-${el.id}`}
        x={(el.x || el.points?.[0] || 0)}
        y={(el.y || el.points?.[1] || 0) - 26}
        text={`@${el.sentByUsername} · ${formatTime(el.createdAt)}`}
        fontSize={11} fill="#8b5e3c"
        fontFamily="Nunito, sans-serif"
        listening={false}
        padding={4}
      />
    ) : isHovered && el.createdAt ? (
      <Text
        key={`ts-${el.id}`}
        x={(el.x || el.points?.[0] || 0)}
        y={(el.y || el.points?.[1] || 0) - 26}
        text={formatTime(el.createdAt)}
        fontSize={11} fill="#b0a090"
        fontFamily="Nunito, sans-serif"
        listening={false}
      />
    ) : null

    if (el.type === 'shape') return renderRoughShape(el, isDraft)

    if (el.type === 'drawing') {
      const pts = roughifyPoints(el.points)
      return [
        <Line key={el.id}
          points={pts}
          stroke={el.stroke || '#2c2410'}
          strokeWidth={el.strokeWidth}
          tension={0.3} lineCap="round" lineJoin="round"
          opacity={opacity}
          onClick={() => setSelectedId(isSelected ? null : el.id)}
          onMouseEnter={() => setHoveredElementId(el.id)}
          onMouseLeave={() => setHoveredElementId(null)}
          draggable={isDraft}
          onDragEnd={isDraft ? (e) => {
            handleElementDragEnd(el.id, e.target.x(), e.target.y())
            e.target.x(0); e.target.y(0)
          } : undefined}
          {...glowProps}
        />,
        tooltip,
      ].filter(Boolean)
    }

    if (el.type === 'text') {
      return [
        <Text key={el.id}
          x={el.x} y={el.y} text={el.text}
          fontSize={el.fontSize} fill={el.fill || '#2c2410'}
          fontFamily={el.fontFamily} opacity={opacity}
          onClick={() => setSelectedId(isSelected ? null : el.id)}
          onMouseEnter={() => setHoveredElementId(el.id)}
          onMouseLeave={() => setHoveredElementId(null)}
          draggable={isDraft}
          onDragEnd={isDraft ? (e) => {
            handleElementDragEnd(el.id, e.target.x() - el.x, e.target.y() - el.y)
            e.target.x(el.x); e.target.y(el.y)
          } : undefined}
          {...glowProps}
        />,
        tooltip,
      ].filter(Boolean)
    }

    if (el.type === 'image' && loadedImages[el.id]) {
      return [
        <KonvaImage key={el.id}
          x={el.x} y={el.y} width={el.width} height={el.height}
          image={loadedImages[el.id]} opacity={opacity}
          onClick={() => setSelectedId(isSelected ? null : el.id)}
          onMouseEnter={() => setHoveredElementId(el.id)}
          onMouseLeave={() => setHoveredElementId(null)}
          draggable={isDraft}
          onDragEnd={isDraft ? (e) => handleImageDragEnd(el.id, e.target.x(), e.target.y()) : undefined}
          {...glowProps}
        />,
        tooltip,
      ].filter(Boolean)
    }

    if (el.type === 'audio') {
      const isPlaying = playingAudioId === el.id
      return [
        <Rect key={`${el.id}-bg`}
          x={el.x} y={el.y} width={160} height={44}
          fill="#fffcf8" stroke="#e8ddd0" strokeWidth={1.5}
          cornerRadius={22} opacity={opacity}
          shadowColor={unread ? '#c8a040' : undefined}
          shadowBlur={unread ? 18 : 0}
          shadowOpacity={unread ? 0.7 : 0}
          onClick={() => setSelectedId(isSelected ? null : el.id)}
          draggable={isDraft}
          onDragEnd={isDraft ? (e) => handleImageDragEnd(el.id, e.target.x(), e.target.y()) : undefined}
        />,
        <Text key={`${el.id}-icon`}
          x={el.x + 14} y={el.y + 13}
          text={isPlaying ? '⏸' : '▶'}
          fontSize={18} fill="#8b5e3c"
          listening={true}
          onClick={() => {
            if (!audioRefs.current[el.id]) {
              audioRefs.current[el.id] = new Audio(el.url)
              audioRefs.current[el.id].onended = () => setPlayingAudioId(null)
            }
            const audio = audioRefs.current[el.id]
            if (isPlaying) {
              audio.pause()
              setPlayingAudioId(null)
            } else {
              audio.play()
              setPlayingAudioId(el.id)
            }
          }}
        />,
        <Text key={`${el.id}-label`}
          x={el.x + 42} y={el.y + 14}
          text={`voice note${el.duration ? ` · ${formatDuration(el.duration)}` : ''}`}
          fontSize={12} fill="#8b5e3c"
          fontFamily="Nunito, sans-serif"
          listening={false}
        />,
        tooltip,
      ].filter(Boolean)
    }

    return null
  }

  // ── Dot grid ─────────────────────────────────────────────────────────────────

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

  const getCursor = () => {
    if (tool === 'eraser') return 'cell'
    if (tool === 'select') return 'default'
    if (tool === 'text') return 'text'
    return 'crosshair'
  }

  const toolButtons = [
    { id: 'select', label: '↖' },
    { id: 'draw', label: '✏' },
    { id: 'rect', label: '▭' },
    { id: 'circle', label: '○' },
    { id: 'arrow', label: '→' },
    { id: 'line', label: '╱' },
    { id: 'text', label: 'T' },
    { id: 'eraser', label: '◻' },
  ]

  const toolLabels = {
    select: 'select', draw: 'draw', rect: 'rect',
    circle: 'circle', arrow: 'arrow', line: 'line',
    text: 'text', eraser: 'erase',
  }

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100vh', cursor: getCursor() }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* ── Toolbar ── */}
      <div style={{
        position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 3, background: '#fffcf8',
        borderRadius: 14, padding: '5px 8px', zIndex: 100,
        alignItems: 'center', flexWrap: 'wrap', maxWidth: '98vw',
        boxShadow: '0 2px 16px rgba(44,36,16,0.10), 0 1px 4px rgba(44,36,16,0.06)',
        border: '1px solid #e8ddd0',
        fontFamily: 'Nunito, sans-serif',
      }}>

        {/* Tool buttons — icon + label on desktop, icon only on mobile */}
        {toolButtons.map(t => (
          <button key={t.id} onClick={() => setTool(t.id)}
            title={toolLabels[t.id]}
            style={{
              padding: '5px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tool === t.id ? '#2c2410' : '#f5f0e8',
              color: tool === t.id ? '#faf6f0' : '#6b5040',
              fontWeight: 700, fontSize: 13,
              minWidth: 32, transition: 'all 0.15s',
            }}
          >
            {t.label}
            <span style={{ display: window.innerWidth < 768 ? 'none' : 'inline', marginLeft: 3, fontSize: 11 }}>
              {toolLabels[t.id]}
            </span>
          </button>
        ))}

        <div style={{ width: 1, height: 22, background: '#e8ddd0', margin: '0 2px' }} />

        {/* Stroke color */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => { setColorPickerTarget('stroke'); setShowColorPicker(p => colorPickerTarget === 'stroke' ? !p : true) }}
            style={{ width: 26, height: 26, borderRadius: 7, cursor: 'pointer', border: '2px solid #e8ddd0', background: tool === 'text' ? textColor : tool === 'draw' ? drawColor : shapeColor }}
          />
          {showColorPicker && colorPickerTarget === 'stroke' && (
            <div style={{
              position: 'absolute', top: 38, left: 0, background: '#fffcf8',
              borderRadius: 12, padding: 10, zIndex: 300, width: 160,
              boxShadow: '0 6px 24px rgba(44,36,16,0.12)', border: '1px solid #e8ddd0',
            }}>
              <p style={{ margin: '0 0 7px', fontSize: 10, color: '#b0a090', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>stroke</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                {COLORS.map(color => (
                  <div key={color}
                    onClick={() => { if (tool === 'text') setTextColor(color); else if (tool === 'draw') setDrawColor(color); else setShapeColor(color); setShowColorPicker(false) }}
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
                width: 26, height: 26, borderRadius: 7, cursor: 'pointer', border: '2px solid #e8ddd0',
                background: fillColor === 'transparent' ? 'linear-gradient(135deg, #fffcf8 40%, #c8a882 40%, #c8a882 60%, #fffcf8 60%)' : fillColor,
              }}
            />
            {showColorPicker && colorPickerTarget === 'fill' && (
              <div style={{
                position: 'absolute', top: 38, left: 0, background: '#fffcf8',
                borderRadius: 12, padding: 10, zIndex: 300, width: 148,
                boxShadow: '0 6px 24px rgba(44,36,16,0.12)', border: '1px solid #e8ddd0',
              }}>
                <p style={{ margin: '0 0 7px', fontSize: 10, color: '#b0a090', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>fill</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  {FILLS.map(color => (
                    <div key={color}
                      onClick={() => { setFillColor(color); setShowColorPicker(false) }}
                      style={{
                        width: 26, height: 26, borderRadius: 5, cursor: 'pointer', border: '1.5px solid #e8ddd0',
                        background: color === 'transparent' ? 'linear-gradient(135deg, #fffcf8 40%, #c8a882 40%, #c8a882 60%, #fffcf8 60%)' : color,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="range" min="1" max="15" value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              style={{ width: 50, accentColor: '#8b5e3c' }}
            />
            <span style={{ fontSize: 10, color: '#b0a090', fontWeight: 700, minWidth: 20 }}>{brushSize}</span>
          </div>
        )}

        <div style={{ width: 1, height: 22, background: '#e8ddd0', margin: '0 2px' }} />

        {/* Undo/Redo */}
        <button onClick={undo} disabled={undoStack.length === 0} title="Undo"
          style={{ padding: '5px 7px', borderRadius: 7, border: 'none', cursor: undoStack.length === 0 ? 'default' : 'pointer', background: '#f5f0e8', color: undoStack.length === 0 ? '#d0c0b0' : '#6b5040', fontWeight: 800, fontSize: 13 }}>↩</button>
        <button onClick={redo} disabled={redoStack.length === 0} title="Redo"
          style={{ padding: '5px 7px', borderRadius: 7, border: 'none', cursor: redoStack.length === 0 ? 'default' : 'pointer', background: '#f5f0e8', color: redoStack.length === 0 ? '#d0c0b0' : '#6b5040', fontWeight: 800, fontSize: 13 }}>↪</button>

        <div style={{ width: 1, height: 22, background: '#e8ddd0', margin: '0 2px' }} />

        {/* Zoom */}
        <button onClick={() => setScale(prev => Math.min(prev * 1.2, 4))}
          style={{ padding: '4px 7px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#f5f0e8', color: '#6b5040', fontWeight: 800, fontSize: 12 }}>+</button>
        <span style={{ fontSize: 10, color: '#b0a090', minWidth: 30, textAlign: 'center', fontWeight: 700 }}>
          {Math.round(scale * 100)}%
        </span>
        <button onClick={() => setScale(prev => Math.max(prev * 0.8, 0.2))}
          style={{ padding: '4px 7px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#f5f0e8', color: '#6b5040', fontWeight: 800, fontSize: 12 }}>−</button>

        <div style={{ width: 1, height: 22, background: '#e8ddd0', margin: '0 2px' }} />

        {/* Image upload */}
        <button onClick={() => fileInputRef.current.click()} disabled={uploadingImage}
          style={{ padding: '5px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#f5f0e8', fontSize: 13, opacity: uploadingImage ? 0.5 : 1 }}>
          🖼️
        </button>

        {/* Audio record */}
        <button
          onClick={isRecording ? stopRecording : startRecording}
          style={{
            padding: '5px 8px', borderRadius: 7, border: 'none', cursor: 'pointer',
            background: isRecording ? '#c0392b' : '#f5f0e8',
            color: isRecording ? 'white' : '#6b5040',
            fontSize: 13, fontWeight: 700, minWidth: isRecording ? 56 : 32,
            transition: 'all 0.2s',
          }}
          title={isRecording ? 'Stop recording' : 'Record voice note'}
        >
          {isRecording ? `⏹ ${formatDuration(recordingSeconds)}` : '🎙️'}
        </button>

        {/* Stickers */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowStickers(!showStickers)}
            style={{ padding: '5px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', background: showStickers ? '#2c2410' : '#f5f0e8', fontSize: 13, color: showStickers ? '#faf6f0' : 'inherit' }}>
            ✦
          </button>
          {showStickers && (
            <div style={{
              position: 'absolute', top: 40, right: 0, background: '#fffcf8',
              borderRadius: 12, padding: 8,
              boxShadow: '0 6px 24px rgba(44,36,16,0.12)', border: '1px solid #e8ddd0',
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, width: 140, zIndex: 200,
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

        {/* Delete */}
        {selectedId && draftElements.find(el => el.id === selectedId) && (
          <button onClick={() => deleteElement(selectedId)}
            style={{ padding: '5px 9px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#f0e0d0', color: '#8b3c3c', fontWeight: 800, fontSize: 12 }}>
            del
          </button>
        )}

        <div style={{ width: 1, height: 22, background: '#e8ddd0', margin: '0 2px' }} />

        {/* Partner status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: partnerOnline ? '#6b8b5e' : '#d0c0b0' }} />
          <span style={{ color: partnerOnline ? '#6b8b5e' : '#c0b0a0', fontWeight: 700, fontSize: 10 }}>
            {partnerOnline ? 'online' : 'offline'}
          </span>
        </div>

        <div style={{ width: 1, height: 22, background: '#e8ddd0', margin: '0 2px' }} />

        {/* Send */}
        <button onClick={handleSend} disabled={draftElements.length === 0}
          style={{
            padding: '5px 12px', borderRadius: 8,
            border: draftElements.length > 0 ? '1.5px solid #2c2410' : '1.5px solid #e8ddd0',
            cursor: draftElements.length === 0 ? 'default' : 'pointer',
            background: justSent ? '#4a7c4e' : draftElements.length === 0 ? '#f5f0e8' : '#2c2410',
            color: draftElements.length === 0 && !justSent ? '#c0b0a0' : '#faf6f0',
            fontWeight: 800, fontSize: 12, transition: 'all 0.3s', letterSpacing: 0.3,
          }}
        >
          {justSent ? '✓ sent' : `send${draftElements.length > 0 ? ` (${draftElements.length})` : ''}`}
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />

      {textInput && (
        <input ref={inputRef} onBlur={commitText} onKeyDown={handleKeyDown}
          style={{
            position: 'absolute', left: textInput.screenX, top: textInput.screenY,
            background: 'transparent', border: 'none',
            borderBottom: '1.5px solid #8b5e3c', outline: 'none',
            fontSize: 18 * scale, fontFamily: 'Lora, Georgia, serif',
            color: textColor, minWidth: 120, zIndex: 200,
          }}
        />
      )}

      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        x={stagePos.x} y={stagePos.y}
        scaleX={scale} scaleY={scale}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Layer>
          <Rect name="background" x={0} y={0}
            width={CANVAS_WIDTH / scale + 200} height={CANVAS_HEIGHT}
            fillPatternImage={dotGridCanvas}
          />
          {sentElements.map(el => renderElement(el, false)).flat().filter(Boolean)}
          {draftElements.map(el => renderElement(el, true)).flat().filter(Boolean)}
          {currentShape && renderRoughShape(currentShape, true)}
          {currentLine && (
            <Line points={currentLine.points} stroke={currentLine.stroke}
              strokeWidth={currentLine.strokeWidth}
              tension={0.3} lineCap="round" lineJoin="round" opacity={0.65}
            />
          )}
        </Layer>
      </Stage>
    </div>
  )
}

export default Room