import { Stage, Layer, Group, Rect, Line, Text, Image as KonvaImage, Circle } from 'react-konva'
import { useRef, useState, useEffect, useContext, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'
import { useSocket } from '../hooks/useSocket'
import { useCanvas, COLORS, FILLS } from '../hooks/useCanvas'
import { useAudio } from '../hooks/useAudio'
import { HexColorPicker } from 'react-colorful'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
// Fixed canvas width — the "page" is always this wide in canvas-space.
// On larger viewports it sits centered; on smaller viewports the stage is
// scaled down so it still fits without any horizontal scrolling.
const CANVAS_W = 1280
// Canvas is infinite downward — CANVAS_H just needs to be large enough that
// the dot-grid background never runs out while scrolling.
const CANVAS_H = 40000
const FIXED_OPACITY = 0.72
const HANDLE_RADIUS = 7

// ── Icons ─────────────────────────────────────────────────────────────────────

const SvgIcon = ({ name, size = 15 }) => {
  const icons = {
    pencil: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
    rect:   'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    circle: 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z',
    arrow:  'M5 12h14M12 5l7 7-7 7',
    line:   'M5 19L19 5',
    text:   'M4 6h16M4 12h8M4 18h12',
    eraser: 'M20 20H7L3 16l10-10 7 7-2.5 2.5M6.5 17.5l5-5',
    mic:    ['M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z','M19 10v2a7 7 0 0 1-14 0v-2','M12 19v4M8 23h8'],
    stop:   'M6 6h12v12H6z',
    sticker:'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
    send:   'M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z',
    undo:   'M3 7v6h6M3 13C5 7.5 10.5 4 17 4a9 9 0 0 1 0 18H13',
    redo:   'M21 7v6h-6M21 13C19 7.5 13.5 4 7 4a9 9 0 0 0 0 18h4',
    plus:   'M12 5v14M5 12h14',
    minus:  'M5 12h14',
    trash:  ['M3 6h18','M19 6l-1 14H6L5 6','M9 6V4h6v2'],
    image:  ['M21 15l-5-5L5 21','M3 3h18v18H3zM8.5 8.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2'],
    // Pan/hand tool icon
    pan:    'M9 11V6a1 1 0 0 1 2 0v3m0 0V5a1 1 0 0 1 2 0v4m0 0V6a1 1 0 0 1 2 0v5m0 0V9a1 1 0 0 1 2 0v7a6 6 0 0 1-6 6H9a5 5 0 0 1-5-5v-3a1 1 0 0 1 2 0',
  }
  const d = icons[name]
  if (!d) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
    </svg>
  )
}

const TBtn = ({ active, onClick, children, title, style = {}, onPointerDown }) => (
  <button
    onClick={onClick}
    onPointerDown={onPointerDown}
    title={title}
    style={{
      padding: '6px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
      background: active ? '#2c2410' : '#f5f0e8',
      color: active ? '#faf6f0' : '#6b5040',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 4, fontWeight: 700, fontSize: 12,
      fontFamily: 'Nunito, sans-serif',
      transition: 'all 0.15s', flexShrink: 0, ...style,
    }}>
    {children}
  </button>
)

const Divider = () => (
  <div style={{ width: 1, height: 22, background: '#e8ddd0', margin: '0 2px', flexShrink: 0 }} />
)

// ── Color Picker Dropdown ─────────────────────────────────────────────────────

const ColorPickerDropdown = ({ label, color, onChange, swatches, showTransparent, onTransparent, onClose }) => (
  <div
    style={{
      position: 'absolute', top: 44, left: '50%', transform: 'translateX(-50%)',
      background: '#fffcf8',
      borderRadius: 12, padding: 12, zIndex: 9999, width: 224,
      boxShadow: '0 6px 24px rgba(44,36,16,0.18)', border: '1px solid #e8ddd0',
    }}
    // Stop clicks inside the picker from bubbling up to the document close handler
    onPointerDown={(e) => e.stopPropagation()}
  >
    <p style={{
      margin: '0 0 8px', fontSize: 10, color: '#b0a090', fontWeight: 700,
      letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: 'Nunito, sans-serif',
    }}>{label}</p>

    <HexColorPicker
      color={color === 'transparent' ? '#fffcf8' : (color || '#2c2410')}
      onChange={onChange}
      style={{ width: '100%', height: 156 }}
    />

    <input
      value={color === 'transparent' ? '' : (color || '')}
      placeholder={showTransparent ? 'transparent' : '#000000'}
      onChange={(e) => {
        const val = e.target.value
        if (val === '' && showTransparent) { onTransparent?.(); return }
        if (/^#[0-9a-fA-F]{0,6}$/.test(val)) onChange(val)
      }}
      style={{
        marginTop: 8, width: '100%', padding: '6px 10px',
        border: '1.5px solid #e8ddd0', borderRadius: 8,
        fontSize: 13, fontFamily: 'Nunito, sans-serif', fontWeight: 700,
        color: '#2c2410', background: '#fffcf8', outline: 'none',
        boxSizing: 'border-box',
      }}
      onFocus={e => e.target.style.borderColor = '#8b5e3c'}
      onBlur={e => e.target.style.borderColor = '#e8ddd0'}
    />

    <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
      {showTransparent && (
        <div
          onClick={onTransparent}
          title="Transparent"
          style={{
            width: 20, height: 20, borderRadius: 4, cursor: 'pointer', flexShrink: 0,
            border: color === 'transparent' ? '2px solid #8b5e3c' : '1.5px solid #e8ddd0',
            background: 'linear-gradient(135deg, #fffcf8 40%, #c8a882 40%, #c8a882 60%, #fffcf8 60%)',
          }}
        />
      )}
      {swatches.filter(c => c !== 'transparent').map(c => (
        <div
          key={c}
          onClick={() => onChange(c)}
          style={{
            width: 20, height: 20, borderRadius: 4, background: c, cursor: 'pointer',
            flexShrink: 0,
            border: color === c ? '2px solid #8b5e3c' : '1.5px solid #e8ddd0',
          }}
        />
      ))}
    </div>
  </div>
)

// ── Main Component ────────────────────────────────────────────────────────────

function Room({ onOpenSidebar, sidebarOpen: sidebarIsOpen }) {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { token, user } = useContext(AuthContext)

  // Camera: only vertical scroll in JS. Horizontal is native CSS overflow.
  const [stageY, setStageY] = useState(0)
  const [scale, setScale] = useState(1)
  // Keep stagePos shape for backward compat with useAudio and other consumers
  const stagePos = { x: 0, y: stageY }
  const [loadedImages, setLoadedImages] = useState({})
  const [textInput, setTextInput] = useState(null)
  // FIX: separate state for each picker so they can independently open/close
  const [showStrokeColorPicker, setShowStrokeColorPicker] = useState(false)
  const [showFillColorPicker, setShowFillColorPicker] = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  const [showShapes, setShowShapes] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [justSent, setJustSent] = useState(false)
  const [hoveredElementId, setHoveredElementId] = useState(null)
  const [lastSeenTime, setLastSeenTime] = useState(null)
  const [playingAudioId, setPlayingAudioId] = useState(null)
  const audioRefs = useRef({})

  // FIX: pan tool state
  const isPanning = useRef(false)
  const panStart = useRef(null)

  // Pinch-to-zoom state
  const lastPinchDistance = useRef(null)
  const touchCount = useRef(0)

  const stageRef = useRef(null)
  const scrollWrapperRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const toolbarRef = useRef(null)

  // Resize state
  const resizingId = useRef(null)
  const resizeStart = useRef(null)

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

  const shapeTools = [
    { id: 'rect',   icon: 'rect',   label: 'Rectangle' },
    { id: 'circle', icon: 'circle', label: 'Circle' },
    { id: 'arrow',  icon: 'arrow',  label: 'Arrow' },
    { id: 'line',   icon: 'line',   label: 'Line' },
  ]
  const isShapeTool = shapeTools.some(s => s.id === tool)
  const activeShape = shapeTools.find(s => s.id === tool)

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getCanvasPos = (clientX, clientY) => {
    const stage = stageRef.current
    const rect = stage.container().getBoundingClientRect()
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top - stageY) / scale,
    }
  }

  const getPointerPosition = () => {
    const pos = stageRef.current.getPointerPosition()
    return { x: pos.x / scale, y: (pos.y - stageY) / scale }
  }

  const getTouchPosition = (touch) => getCanvasPos(touch.clientX, touch.clientY)

  const formatTime = (createdAt) => {
    if (!createdAt) return ''
    const date = new Date(createdAt)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    if (date.toDateString() === today.toDateString()) return `Today ${hh}:${mm}`
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${hh}:${mm}`
    return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')} ${hh}:${mm}`
  }

  const getTooltipText = (el) => {
    const time = formatTime(el.createdAt)
    const who = el.sentByUsername ? `@${el.sentByUsername}` : null
    if (who && time) return `${who} · ${time}`
    return time || ''
  }

  const isUnread = (el) => {
    if (!lastSeenTime || !el.createdAt) return false
    if (el.sentBy === user?.userId) return false
    return new Date(el.createdAt) > lastSeenTime
  }

  const currentStrokeColor = tool === 'text' ? textColor : tool === 'draw' ? drawColor : shapeColor

  // ── Persist element mutations back to DB ──────────────────────────────────
  // FIX: After drag or resize of a sent element, update it in the DB so position/size
  // is preserved on refresh.
  const persistElement = useCallback(async (element) => {
    if (!token) return
    try {
      await fetch(`${BACKEND_URL}/elements/${element.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ data: element }),
      })
    } catch (err) {
      console.error('Failed to persist element:', err)
    }
  }, [token])

  // ── Resize helpers ────────────────────────────────────────────────────────

  const startResize = (el, clientX, clientY) => {
    resizingId.current = el.id
    resizeStart.current = {
      x: clientX,
      y: clientY,
      origWidth: el.width || 170,
      origHeight: el.height || (el.type === 'text' ? el.fontSize * 1.4 : 44),
      origFontSize: el.fontSize || 20,
    }
  }

  const doResize = (clientX, clientY) => {
    if (!resizingId.current || !resizeStart.current) return
    const dx = (clientX - resizeStart.current.x) / scale
    const dy = (clientY - resizeStart.current.y) / scale
    const id = resizingId.current
    setDraftElements(prev => prev.map(el => {
      if (el.id !== id) return el
      if (el.type === 'image') {
        return {
          ...el,
          width: Math.max(40, resizeStart.current.origWidth + dx),
          height: Math.max(40, resizeStart.current.origHeight + dy),
        }
      }
      if (el.type === 'text') {
        const delta = Math.max(dx, dy)
        return {
          ...el,
          fontSize: Math.max(8, Math.round(resizeStart.current.origFontSize + delta * 0.5)),
        }
      }
      if (el.type === 'audio') {
        return {
          ...el,
          width: Math.max(120, resizeStart.current.origWidth + dx),
        }
      }
      return el
    }))
  }

  const endResize = () => {
    if (resizingId.current) {
      // Persist the updated element after resize ends
      const el = draftElements.find(e => e.id === resizingId.current)
      if (el) persistElement(el)
    }
    resizingId.current = null
    resizeStart.current = null
  }

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !token) return
    fetch(`${BACKEND_URL}/rooms/${roomId}/last-seen`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data.last_seen) setLastSeenTime(new Date(data.last_seen)) })
      .catch(() => {})
    fetch(`${BACKEND_URL}/rooms/${roomId}/mark-seen`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      .catch(() => {})
  }, [roomId, token])

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

  useEffect(() => {
    const handleWheel = (e) => {
      if (toolbarRef.current?.contains(e.target)) return
      if (e.ctrlKey || e.metaKey) {
        // Zoom — must preventDefault so browser doesn't zoom the page
        e.preventDefault()
        setScale(prev => Math.min(Math.max(prev * (e.deltaY > 0 ? 0.92 : 1.08), 1.0), 4.0))
        return
      }
      // Horizontal wheel (trackpad swipe or shift+wheel) — let wrapper scroll
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // Don't preventDefault — let the browser scroll the overflow wrapper natively
        return
      }
      // Vertical scroll — handle in JS, prevent default page scroll
      e.preventDefault()
      if (isDrawing.current) return
      setStageY(prev => Math.min(0, prev - e.deltaY))
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [])

  // Global resize mouse/touch tracking
  useEffect(() => {
    const onMove = (e) => {
      if (!resizingId.current) return
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      doResize(clientX, clientY)
    }
    const onUp = () => endResize()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [scale, draftElements])

  useEffect(() => {
    const handleGlobalMove = (e) => {
      const stage = stageRef.current
      if (!stage) return
      const rect = stage.container().getBoundingClientRect()
      const inside = e.clientX >= rect.left && e.clientX <= rect.right &&
                     e.clientY >= rect.top && e.clientY <= rect.bottom
      if (!inside) setHoveredElementId(null)
    }
    window.addEventListener('mousemove', handleGlobalMove)
    return () => window.removeEventListener('mousemove', handleGlobalMove)
  }, [])

  // FIX: Outside-click handler — use pointerdown but ONLY close if the click
  // is truly outside the toolbar. The previous version fired on every click
  // which killed the dropdowns immediately after they opened.
  useEffect(() => {
    const handle = (e) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) {
        setShowStrokeColorPicker(false)
        setShowFillColorPicker(false)
        setShowStickers(false)
        setShowShapes(false)
      }
    }
    document.addEventListener('pointerdown', handle)
    return () => document.removeEventListener('pointerdown', handle)
  }, [])

  useEffect(() => {
    const container = stageRef.current?.container()
    if (!container) return
    const prevent = (e) => e.preventDefault()
    container.addEventListener('contextmenu', prevent)
    return () => container.removeEventListener('contextmenu', prevent)
  }, [])

  useEffect(() => {
    if (textInput && inputRef.current) setTimeout(() => inputRef.current?.focus(), 50)
  }, [textInput])

  // ── Draw events ───────────────────────────────────────────────────────────

  const startDraw = (pos, isBackground, rawClientX, rawClientY) => {
    if (resizingId.current) return
    if (tool === 'pan') {
      isPanning.current = true
      panStart.current = { screenY: rawClientY ?? 0, stageY }
      return
    }
    if (tool === 'text') {
      const sp = stageRef.current.getPointerPosition()
      setTextInput({ screenX: sp?.x || pos.x, screenY: sp?.y || pos.y, canvasX: pos.x, canvasY: pos.y })
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
    if (isShapeTool) {
      if (!isBackground) return
      isDrawing.current = true
      shapeStart.current = pos
      setCurrentShape({ id: Date.now().toString(), type: 'shape', shapeType: tool, x: pos.x, y: pos.y, width: 0, height: 0, x2: pos.x, y2: pos.y, stroke: shapeColor, fill: fillColor, strokeWidth: brushSize })
    }
  }

  const moveDraw = (pos, rawClientX, rawClientY) => {
    if (resizingId.current) return
    if (tool === 'pan' && isPanning.current && panStart.current) {
      if (rawClientY == null) return
      const dy = rawClientY - panStart.current.screenY
      setStageY(Math.min(0, panStart.current.stageY + dy))
      return
    }
    if (!isDrawing.current) return
    if (tool === 'eraser') { eraseAt(pos, scale); return }
    if (tool === 'draw' && currentLine) {
      if (lastPoint.current) {
        const dx = pos.x - lastPoint.current.x
        const dy = pos.y - lastPoint.current.y
        if (Math.sqrt(dx*dx + dy*dy) < 3/scale) return
      }
      lastPoint.current = pos
      setCurrentLine(prev => ({ ...prev, points: [...prev.points, pos.x, pos.y] }))
      return
    }
    if (isShapeTool && currentShape && shapeStart.current) {
      const s = shapeStart.current
      setCurrentShape(prev => ({ ...prev, width: pos.x - s.x, height: pos.y - s.y, x2: pos.x, y2: pos.y }))
    }
  }

  const endDraw = () => {
    if (resizingId.current) return
    // FIX: end pan
    if (tool === 'pan') {
      isPanning.current = false
      panStart.current = null
      return
    }
    if (!isDrawing.current) return
    isDrawing.current = false
    if (tool === 'draw' && currentLine) {
      if (currentLine.points.length >= 4) addDraft(currentLine)
      setCurrentLine(null); lastPoint.current = null; return
    }
    if (isShapeTool && currentShape) {
      if (Math.abs(currentShape.width) > 5 || Math.abs(currentShape.height) > 5) addDraft(currentShape)
      setCurrentShape(null); shapeStart.current = null
    }
  }

  const handleMouseDown = (e) => {
    if (resizingId.current) return
    const isBackground = e.target === e.target.getStage() || e.target.name() === 'background'
    if (isBackground) setSelectedId(null)
    startDraw(getPointerPosition(), isBackground, e.evt.clientX, e.evt.clientY)
  }

  const handleMouseMove = (e) => {
    const target = e.target
    const isBackground = target === target.getStage() || target.name?.() === 'background'
    if (isBackground && !isDrawing.current) setHoveredElementId(null)
    if (!resizingId.current) moveDraw(getPointerPosition(), e.evt.clientX, e.evt.clientY)
  }

  const handleMouseUp = () => { if (!resizingId.current) endDraw() }

  // FIX: Pinch-to-zoom — detect multi-touch and skip drawing
  const getPinchDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const handleTouchStart = (e) => {
    touchCount.current = e.evt.touches.length

    // Two fingers = pinch zoom only, let browser handle everything else
    if (e.evt.touches.length >= 2) {
      isDrawing.current = false
      isPanning.current = false
      lastPinchDistance.current = getPinchDistance(e.evt.touches)
      e.evt.preventDefault()
      return
    }

    if (resizingId.current) return
    const touch = e.evt.touches[0]
    if (!touch) return

    // Only block native scroll when a drawing/pan tool is active.
    // Otherwise let the touch fall through so CSS overflowX scroll works.
    const isActiveTool = ['draw', 'eraser', 'rect', 'circle', 'arrow', 'line', 'text', 'pan'].includes(tool)
    if (isActiveTool) e.evt.preventDefault()

    const pos = getTouchPosition(touch)
    const isBackground = e.target === e.target.getStage() || e.target.name() === 'background'
    if (isBackground) setSelectedId(null)
    startDraw(pos, isBackground, touch.clientX, touch.clientY)
  }

  const handleTouchMove = (e) => {
    if (e.evt.touches.length >= 2) {
      e.evt.preventDefault()
      const newDist = getPinchDistance(e.evt.touches)
      if (lastPinchDistance.current) {
        const ratio = newDist / lastPinchDistance.current
        setScale(prev => Math.min(Math.max(prev * ratio, 1.0), 4.0))
      }
      lastPinchDistance.current = newDist
      return
    }

    if (resizingId.current) return
    if (!isDrawing.current && !isPanning.current) return
    // Only prevent default when we're actively drawing/panning
    e.evt.preventDefault()
    const touch = e.evt.touches[0]
    if (!touch) return
    moveDraw(getTouchPosition(touch), touch.clientX, touch.clientY)
  }

  const handleTouchEnd = (e) => {
    lastPinchDistance.current = null
    touchCount.current = 0
    if (!resizingId.current) endDraw()
  }

  // ── Text ──────────────────────────────────────────────────────────────────

  const commitText = () => {
    const value = inputRef.current?.value?.trim()
    if (value && textInput) {
      addDraft({
        id: Date.now().toString(), type: 'text',
        x: textInput.canvasX, y: textInput.canvasY,
        text: value, fontSize: 20,
        fill: textColor, fontFamily: 'Indie Flower, cursive',
      })
    }
    setTextInput(null)
  }

  // ── Image upload ──────────────────────────────────────────────────────────

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const cx = (CANVAS_W / 2)
      const cy = (window.innerHeight / 2 - stageY) / scale
      addDraft({ id: Date.now().toString(), type: 'image', x: cx - 200, y: cy - 150, width: 400, height: 300, url: data.url })
    } catch (err) { alert(`Upload failed: ${err.message}`) }
    finally { setUploadingImage(false); fileInputRef.current.value = '' }
  }

  // ── Stickers ──────────────────────────────────────────────────────────────

  const stickers = ['😍','🎉','💕','✨','🌟','😂','🔥','💯','🎨','📝','💌','🌹']
  const addSticker = (emoji) => {
    const cx = (CANVAS_W / 2)
    const cy = (window.innerHeight / 2 - stageY) / scale
    addDraft({ id: Date.now().toString(), type: 'text', x: cx, y: cy, text: emoji, fontSize: 48, fill: '#2c2410', fontFamily: 'Arial' })
    setShowStickers(false)
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && textInput) commitText()
    if (e.key === 'Escape') { setTextInput(null); setShowShapes(false) }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !textInput) deleteElement(selectedId)
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo() }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo() }
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  const handleSend = () => {
    if (draftElements.length === 0) return
    setSentElements(prev => [...prev, ...draftElements])
    sendDrafts(draftElements)
    setDraftElements([])
    setJustSent(true)
    setTimeout(() => setJustSent(false), 2000)
  }

  // ── Rough shape rendering ─────────────────────────────────────────────────

  const renderRoughShape = (el, isDraft) => {
    const sets = getRoughSets(el)
    const unread = !isDraft && isUnread(el)
    const isSelected = selectedId === el.id
    const isHovered = hoveredElementId === el.id
    const opacity = isDraft ? 0.65 : FIXED_OPACITY

    const shadowProps = (unread || isSelected)
      ? { shadowColor: '#c8a040', shadowBlur: isSelected ? 16 : 12, shadowOpacity: 0.75 }
      : isHovered
        ? { shadowColor: '#8b5e3c', shadowBlur: 8, shadowOpacity: 0.3 }
        : {}

    const lines = sets.map((set, idx) => {
      const points = opsToPoints(set.ops)
      if (points.length < 4) return null
      return (
        <Line key={`${el.id}-set-${idx}`}
          points={points}
          stroke={set.type === 'fillSketch' ? (el.fill === 'transparent' ? undefined : el.fill) : (el.stroke || '#2c2410')}
          strokeWidth={set.type === 'fillSketch' ? 1 : (el.strokeWidth || 2)}
          opacity={opacity} lineCap="round" lineJoin="round" tension={0}
          listening={idx === 0}
          onClick={idx === 0 ? () => setSelectedId(isSelected ? null : el.id) : undefined}
          onMouseEnter={idx === 0 ? () => setHoveredElementId(el.id) : undefined}
          onMouseLeave={idx === 0 ? () => setHoveredElementId(null) : undefined}
          {...(idx === 0 ? shadowProps : {})}
          draggable={isDraft && idx === 0}
          onDragEnd={isDraft && idx === 0 ? (e) => {
            const dx = e.target.x()
            const dy = e.target.y()
            handleElementDragEnd(el.id, dx, dy)
            e.target.x(0); e.target.y(0)
            // Persist updated shape position
            const updated = {
              ...el,
              x: el.x + dx, y: el.y + dy,
              x2: (el.x2 ?? el.x) + dx, y2: (el.y2 ?? el.y) + dy,
            }
            persistElement(updated)
          } : undefined}
        />
      )
    }).filter(Boolean)

    if (el.shapeType === 'arrow') {
      const angle = Math.atan2(el.y2 - el.y, el.x2 - el.x)
      const hl = 14
      lines.push(
        <Line key={`${el.id}-head`}
          points={[
            el.x2 - hl*Math.cos(angle-Math.PI/7), el.y2 - hl*Math.sin(angle-Math.PI/7),
            el.x2, el.y2,
            el.x2 - hl*Math.cos(angle+Math.PI/7), el.y2 - hl*Math.sin(angle+Math.PI/7),
          ]}
          stroke={el.stroke} strokeWidth={el.strokeWidth || 2}
          opacity={opacity} lineCap="round" lineJoin="round" listening={false}
        />
      )
    }

    const tooltipText = (isHovered || isSelected) ? getTooltipText(el) : ''
    if (tooltipText) {
      const tx = Math.min(el.x, el.x2 ?? el.x)
      const ty = Math.min(el.y, el.y2 ?? el.y) - 22
      lines.push(
        <Text key={`tt-${el.id}`} x={tx} y={ty} text={tooltipText}
          fontSize={11} fill={isSelected ? '#8b5e3c' : '#b0a090'}
          fontFamily="Nunito, sans-serif" listening={false}
        />
      )
    }
    return lines
  }

  // ── Resize handle renderer ────────────────────────────────────────────────

  const renderResizeHandle = (el, x, y) => {
    if (!draftElements.find(d => d.id === el.id)) return null
    if (selectedId !== el.id) return null
    return (
      <Circle
        key={`resize-${el.id}`}
        x={x} y={y}
        radius={HANDLE_RADIUS / scale}
        fill="#8b5e3c"
        stroke="#fffcf8"
        strokeWidth={1.5 / scale}
        listening={true}
        onMouseDown={(e) => {
          e.cancelBubble = true
          startResize(el, e.evt.clientX, e.evt.clientY)
        }}
        onTouchStart={(e) => {
          e.cancelBubble = true
          const t = e.evt.touches[0]
          if (t) startResize(el, t.clientX, t.clientY)
        }}
      />
    )
  }

  // ── Render element ────────────────────────────────────────────────────────

  const renderElement = (el, isDraft = false) => {
    const isSelected = selectedId === el.id
    const isHovered = hoveredElementId === el.id
    const unread = !isDraft && isUnread(el)
    const opacity = el.type === 'image' ? 1 : (isDraft ? 0.65 : FIXED_OPACITY)

    const shadowProps = (unread || isSelected)
      ? { shadowColor: '#c8a040', shadowBlur: isSelected ? 16 : 12, shadowOpacity: 0.75 }
      : (isHovered ? { shadowColor: '#8b5e3c', shadowBlur: 8, shadowOpacity: 0.3 } : {})

    const tooltipText = (isHovered || isSelected) ? getTooltipText(el) : ''
    // For drawings, anchor the tooltip to the first point of the path
    const tooltipX = el.x ?? (el.points?.[0] ?? 0)
    const tooltipY = el.y ?? (el.points?.[1] ?? 0)
    const tooltip = tooltipText ? (
      <Text key={`tt-${el.id}`}
        x={tooltipX}
        y={tooltipY - 22}
        text={tooltipText} fontSize={11}
        fill={isSelected ? '#8b5e3c' : '#b0a090'}
        fontFamily="Nunito, sans-serif" listening={false}
      />
    ) : null

    if (el.type === 'shape') return renderRoughShape(el, isDraft)

    if (el.type === 'drawing') {
      const pts = roughifyPoints(el.points)
      return [
        <Line key={el.id}
          points={pts} stroke={el.stroke || '#2c2410'}
          strokeWidth={el.strokeWidth}
          tension={0.3} lineCap="round" lineJoin="round"
          opacity={opacity}
          onClick={() => setSelectedId(isSelected ? null : el.id)}
          onMouseEnter={() => setHoveredElementId(el.id)}
          onMouseLeave={() => setHoveredElementId(null)}
          draggable={isDraft}
          onDragEnd={isDraft ? (e) => {
            const dx = e.target.x()
            const dy = e.target.y()
            handleElementDragEnd(el.id, dx, dy)
            e.target.x(0); e.target.y(0)
            // Persist updated position
            const updated = { ...el, points: el.points.map((p, i) => i % 2 === 0 ? p + dx : p + dy) }
            persistElement(updated)
          } : undefined}
          {...shadowProps}
        />,
        tooltip,
      ].filter(Boolean)
    }

    if (el.type === 'text') {
      const approxWidth = el.text.length * el.fontSize * 0.6
      const approxHeight = el.fontSize * 1.4
      return [
        <Text key={el.id}
          x={el.x} y={el.y} text={el.text}
          fontSize={el.fontSize} fill={el.fill || '#2c2410'}
          fontFamily={el.fontFamily || 'Indie Flower, cursive'}
          opacity={opacity}
          onClick={() => setSelectedId(isSelected ? null : el.id)}
          onMouseEnter={() => setHoveredElementId(el.id)}
          onMouseLeave={() => setHoveredElementId(null)}
          draggable={isDraft}
          onDragEnd={isDraft ? (e) => {
            const dx = e.target.x() - el.x
            const dy = e.target.y() - el.y
            handleElementDragEnd(el.id, dx, dy)
            e.target.x(el.x); e.target.y(el.y)
            // Persist updated position
            const updated = { ...el, x: el.x + dx, y: el.y + dy }
            persistElement(updated)
          } : undefined}
          {...shadowProps}
        />,
        tooltip,
        isDraft ? renderResizeHandle(el, el.x + approxWidth, el.y + approxHeight) : null,
      ].filter(Boolean)
    }

    if (el.type === 'image' && loadedImages[el.id]) {
      return [
        <KonvaImage key={el.id}
          x={el.x} y={el.y} width={el.width} height={el.height}
          image={loadedImages[el.id]} opacity={1}
          onClick={() => setSelectedId(isSelected ? null : el.id)}
          onMouseEnter={() => setHoveredElementId(el.id)}
          onMouseLeave={() => setHoveredElementId(null)}
          draggable={isDraft}
          onDragEnd={isDraft ? (e) => {
            const newX = e.target.x()
            const newY = e.target.y()
            handleImageDragEnd(el.id, newX, newY)
            // Persist updated position
            const updated = { ...el, x: newX, y: newY }
            persistElement(updated)
          } : undefined}
          {...(isSelected ? { shadowColor: '#c8a040', shadowBlur: 16, shadowOpacity: 0.75 } : {})}
        />,
        tooltip,
        isDraft ? renderResizeHandle(el, el.x + el.width, el.y + el.height) : null,
      ].filter(Boolean)
    }

    if (el.type === 'audio') {
      const w = el.width || 170
      const isPlaying = playingAudioId === el.id
      return [
        <Rect key={`${el.id}-bg`}
          x={el.x} y={el.y} width={w} height={44}
          fill="#fffcf8"
          stroke={isSelected ? '#8b5e3c' : '#e8ddd0'}
          strokeWidth={isSelected ? 2 : 1.5}
          cornerRadius={22} opacity={opacity}
          shadowColor={unread ? '#c8a040' : undefined}
          shadowBlur={unread ? 14 : 0} shadowOpacity={unread ? 0.7 : 0}
          onClick={() => setSelectedId(isSelected ? null : el.id)}
          onMouseEnter={() => setHoveredElementId(el.id)}
          onMouseLeave={() => setHoveredElementId(null)}
          draggable={isDraft}
          onDragEnd={isDraft ? (e) => {
            const newX = e.target.x()
            const newY = e.target.y()
            handleImageDragEnd(el.id, newX, newY)
            const updated = { ...el, x: newX, y: newY }
            persistElement(updated)
          } : undefined}
        />,
        <Text key={`${el.id}-play`}
          x={el.x + 14} y={el.y + 13}
          text={isPlaying ? '⏸' : '▶'}
          fontSize={17} fill="#8b5e3c" listening={true}
          onClick={() => {
            if (!audioRefs.current[el.id]) {
              audioRefs.current[el.id] = new Audio(el.url)
              audioRefs.current[el.id].onended = () => setPlayingAudioId(null)
            }
            const audio = audioRefs.current[el.id]
            if (isPlaying) { audio.pause(); setPlayingAudioId(null) }
            else { audio.play(); setPlayingAudioId(el.id) }
          }}
        />,
        <Text key={`${el.id}-label`}
          x={el.x + 40} y={el.y + 15}
          text={`voice note${el.duration ? ` · ${formatDuration(el.duration)}` : ''}`}
          fontSize={12} fill="#8b5e3c"
          fontFamily="Nunito, sans-serif" listening={false}
        />,
        tooltip,
        isDraft ? renderResizeHandle(el, el.x + w, el.y + 44) : null,
      ].filter(Boolean)
    }

    return null
  }

  // ── Dot grid ──────────────────────────────────────────────────────────────

  const dotGridCanvas = useMemo(() => {
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
  }, [])

  const getCursor = () => {
    if (resizingId.current) return 'nwse-resize'
    if (tool === 'pan') return isPanning.current ? 'grabbing' : 'grab'
    if (tool === 'eraser') return 'cell'
    if (tool === 'text') return 'text'
    return 'crosshair'
  }

  // ── Toolbar toggle helpers (stop propagation to prevent instant close) ─────
  const toggleShapes = (e) => {
    e.stopPropagation()
    setShowShapes(p => !p)
  }
  const toggleStrokeColor = (e) => {
    e.stopPropagation()
    setShowStrokeColorPicker(p => !p)
    setShowFillColorPicker(false)
  }
  const toggleFillColor = (e) => {
    e.stopPropagation()
    setShowFillColorPicker(p => !p)
    setShowStrokeColorPicker(false)
  }
  const toggleStickers = (e) => {
    e.stopPropagation()
    setShowStickers(p => !p)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100vh', cursor: getCursor() }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* ── Toolbar ── */}
      <div ref={toolbarRef} style={{
        position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)',
        zIndex: 100,
        // FIX: constrain width on mobile and allow wrapping
        maxWidth: 'calc(100vw - 16px)',
        width: 'max-content',
      }}>
        <div style={{
          display: 'flex', gap: 3, background: '#fffcf8',
          borderRadius: 14, padding: '5px 8px', alignItems: 'center',
          // FIX: allow wrapping on small screens
          flexWrap: 'wrap',
          boxShadow: '0 2px 16px rgba(44,36,16,0.10), 0 1px 4px rgba(44,36,16,0.06)',
          border: '1px solid #e8ddd0',
        }}>

          {/* Sidebar toggle — always visible in toolbar */}
          {onOpenSidebar && (
            <TBtn
              active={sidebarIsOpen}
              onClick={onOpenSidebar}
              title={sidebarIsOpen ? 'Sidebar open' : 'Open journals'}
              style={{ marginRight: 2 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
            </TBtn>
          )}

          <Divider />

          {/* Pan/scroll tool — no drawing mode */}
          <TBtn active={tool === 'pan'} onClick={() => setTool('pan')} title="Pan / Scroll (no drawing)">
            <SvgIcon name="pan" />
          </TBtn>

          <TBtn active={tool === 'draw'} onClick={() => setTool('draw')} title="Draw">
            <SvgIcon name="pencil" />
          </TBtn>

          {/* Shapes dropdown — FIX: use onPointerDown + stopPropagation */}
          <div style={{ position: 'relative' }}>
            <TBtn
              active={isShapeTool}
              title="Shapes"
              style={{ gap: 4 }}
              onPointerDown={toggleShapes}
              onClick={(e) => e.stopPropagation()}
            >
              <SvgIcon name={activeShape?.icon || 'rect'} />
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M0 2l4 4 4-4z"/></svg>
            </TBtn>
            {showShapes && (
              <div
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute', top: 40, left: '50%', transform: 'translateX(-50%)',
                  background: '#fffcf8', borderRadius: 12, padding: 8,
                  boxShadow: '0 6px 24px rgba(44,36,16,0.12)', border: '1px solid #e8ddd0',
                  display: 'flex', gap: 4, zIndex: 200, whiteSpace: 'nowrap',
                }}>
                {shapeTools.map(s => (
                  <TBtn key={s.id} active={tool === s.id} title={s.label}
                    onClick={() => { setTool(s.id); setShowShapes(false) }}>
                    <SvgIcon name={s.icon} />
                  </TBtn>
                ))}
              </div>
            )}
          </div>

          <TBtn active={tool === 'text'} onClick={() => setTool('text')} title="Text">
            <SvgIcon name="text" />
          </TBtn>

          <TBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} title="Eraser">
            <SvgIcon name="eraser" />
          </TBtn>

          <Divider />

          {/* FIX: Color pickers — each has its own toggle, stopPropagation on open */}
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
            {/* Stroke color */}
            <div style={{ position: 'relative' }}>
              <div
                onPointerDown={toggleStrokeColor}
                title="Stroke color"
                style={{
                  width: 26, height: 26, borderRadius: 7, cursor: 'pointer',
                  background: currentStrokeColor, border: '2px solid #e8ddd0', flexShrink: 0,
                }}
              />
              {showStrokeColorPicker && (
                <ColorPickerDropdown
                  label="stroke"
                  color={currentStrokeColor}
                  onChange={(color) => {
                    if (tool === 'text') setTextColor(color)
                    else if (tool === 'draw') setDrawColor(color)
                    else setShapeColor(color)
                  }}
                  swatches={COLORS}
                  showTransparent={false}
                />
              )}
            </div>

            {/* Fill color — only for rect/circle */}
            {isShapeTool && ['rect','circle'].includes(tool) && (
              <div style={{ position: 'relative' }}>
                <div
                  onPointerDown={toggleFillColor}
                  title="Fill color"
                  style={{
                    width: 26, height: 26, borderRadius: 7, cursor: 'pointer',
                    border: '2px solid #e8ddd0', flexShrink: 0,
                    background: fillColor === 'transparent'
                      ? 'linear-gradient(135deg, #fffcf8 40%, #c8a882 40%, #c8a882 60%, #fffcf8 60%)'
                      : fillColor,
                  }}
                />
                {showFillColorPicker && (
                  <ColorPickerDropdown
                    label="fill"
                    color={fillColor}
                    onChange={setFillColor}
                    swatches={FILLS}
                    showTransparent={true}
                    onTransparent={() => setFillColor('transparent')}
                  />
                )}
              </div>
            )}
          </div>

          {/* Brush size */}
          {['draw','rect','circle','arrow','line'].includes(tool) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <input type="range" min="1" max="15" value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                style={{ width: 52, accentColor: '#8b5e3c' }}
              />
              <span style={{ fontSize: 10, color: '#b0a090', fontWeight: 700, minWidth: 18, fontFamily: 'Nunito, sans-serif' }}>{brushSize}</span>
            </div>
          )}

          <Divider />

          <TBtn onClick={undo} title="Undo ⌘Z" style={{ opacity: undoStack.length === 0 ? 0.4 : 1 }}>
            <SvgIcon name="undo" />
          </TBtn>
          <TBtn onClick={redo} title="Redo ⌘Y" style={{ opacity: redoStack.length === 0 ? 0.4 : 1 }}>
            <SvgIcon name="redo" />
          </TBtn>

          <Divider />

          <TBtn onClick={() => setScale(prev => {
            const next = Math.max(prev * 0.85, 1.0)
            // no position reclamp needed — stageY stays valid
            return next
          })} title="Zoom out">
            <SvgIcon name="minus" />
          </TBtn>
          <span style={{ fontSize: 10, color: '#b0a090', minWidth: 32, textAlign: 'center', fontWeight: 700, fontFamily: 'Nunito, sans-serif', flexShrink: 0 }}>
            {Math.round(scale * 100)}%
          </span>
          <TBtn onClick={() => setScale(prev => {
            const next = Math.min(prev * 1.15, 4.0)
            // no position reclamp needed — stageY stays valid
            return next
          })} title="Zoom in">
            <SvgIcon name="plus" />
          </TBtn>

          <Divider />

          <TBtn onClick={() => fileInputRef.current.click()} title="Upload image" style={{ opacity: uploadingImage ? 0.5 : 1 }}>
            <SvgIcon name="image" />
          </TBtn>

          <TBtn active={isRecording} onClick={isRecording ? stopRecording : startRecording}
            title={isRecording ? 'Stop recording' : 'Record voice note'}
            style={isRecording ? { background: '#c0392b', color: 'white', minWidth: 60 } : {}}>
            <SvgIcon name={isRecording ? 'stop' : 'mic'} />
            {isRecording && <span style={{ fontSize: 10, fontFamily: 'Nunito, sans-serif', fontWeight: 700 }}>{formatDuration(recordingSeconds)}</span>}
          </TBtn>

          {/* Stickers */}
          <div style={{ position: 'relative' }}>
            <TBtn
              active={showStickers}
              title="Stickers"
              onPointerDown={toggleStickers}
              onClick={(e) => e.stopPropagation()}
            >
              <SvgIcon name="sticker" />
            </TBtn>
            {showStickers && (
              <div
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute', top: 40, right: 0, background: '#fffcf8',
                  borderRadius: 12, padding: 8,
                  boxShadow: '0 6px 24px rgba(44,36,16,0.12)', border: '1px solid #e8ddd0',
                  display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 3, width: 140, zIndex: 200,
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

          <Divider />

          {selectedId && draftElements.find(el => el.id === selectedId) && (
            <>
              <TBtn onClick={() => deleteElement(selectedId)} title="Delete" style={{ background: '#f0e0d0', color: '#8b3c3c' }}>
                <SvgIcon name="trash" />
              </TBtn>
              <Divider />
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: partnerOnline ? '#6b8b5e' : '#d0c0b0' }} />
            <span style={{ color: partnerOnline ? '#6b8b5e' : '#c0b0a0', fontWeight: 700, fontSize: 10, fontFamily: 'Nunito, sans-serif' }}>
              {partnerOnline ? 'online' : 'offline'}
            </span>
          </div>

          <Divider />

          <TBtn onClick={handleSend} title="Send"
            style={{
              background: justSent ? '#4a7c4e' : draftElements.length === 0 ? '#f5f0e8' : '#2c2410',
              color: draftElements.length === 0 && !justSent ? '#c0b0a0' : '#faf6f0',
              border: draftElements.length > 0 ? '1.5px solid #2c2410' : '1.5px solid #e8ddd0',
              gap: 5, paddingLeft: 10, paddingRight: 10,
              opacity: draftElements.length === 0 && !justSent ? 0.6 : 1,
            }}>
            {justSent
              ? <span style={{ fontSize: 12, fontFamily: 'Nunito, sans-serif' }}>✓ sent</span>
              : <>
                  <SvgIcon name="send" size={13} />
                  {draftElements.length > 0 && <span style={{ fontSize: 11, fontFamily: 'Nunito, sans-serif', fontWeight: 800 }}>{draftElements.length}</span>}
                </>
            }
          </TBtn>
        </div>
        <style>{`div::-webkit-scrollbar { display: none; }`}</style>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />

      {textInput && (
        <input ref={inputRef} onBlur={commitText} onKeyDown={handleKeyDown}
          style={{
            position: 'absolute', left: textInput.screenX, top: textInput.screenY,
            background: 'transparent', border: 'none',
            borderBottom: '1.5px solid #8b5e3c', outline: 'none',
            fontSize: 20 * scale, fontFamily: 'Indie Flower, cursive',
            color: textColor, minWidth: 120, zIndex: 200,
          }}
        />
      )}

      {/* Horizontal scroll wrapper — CSS handles left/right on narrow screens.
          On desktop (>1280px) the inner div centers. On mobile it scrolls. */}
      <div ref={scrollWrapperRef} style={{
        width: '100%', height: '100vh',
        overflowX: 'auto', overflowY: 'hidden',
        background: '#e8ddd0',
      }}>
        <div style={{
          width: CANVAS_W,
          height: '100vh',
          margin: '0 auto',
          position: 'relative',
          background: '#faf6f0',
          boxShadow: '0 0 60px rgba(44,36,16,0.12)',
        }}>
          <Stage ref={stageRef}
            width={CANVAS_W} height={window.innerHeight}
            style={{ touchAction: 'pan-x' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => setHoveredElementId(null)}
            onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
          >
            <Layer listening={false}>
              {/* Background dots — fillPatternOffset scrolls pattern with camera */}
              <Rect
                name="bg-dots"
                x={0} y={0}
                width={CANVAS_W} height={window.innerHeight}
                fillPatternImage={dotGridCanvas}
                fillPatternOffset={{ x: 0, y: -stageY / scale }}
                fillPatternScale={{ x: scale, y: scale }}
              />
            </Layer>
            <Layer>
              {/* Hit rect for background clicks */}
              <Rect name="background" x={0} y={0} width={CANVAS_W} height={window.innerHeight}
                fill="transparent" listening={true}
              />
              <Group y={stageY} scaleX={scale} scaleY={scale}>
                {sentElements.map(el => renderElement(el, false)).flat().filter(Boolean)}
                {draftElements.map(el => renderElement(el, true)).flat().filter(Boolean)}
                {currentShape && renderRoughShape(currentShape, true)}
                {currentLine && (
                  <Line points={currentLine.points} stroke={currentLine.stroke}
                    strokeWidth={currentLine.strokeWidth}
                    tension={0.3} lineCap="round" lineJoin="round" opacity={0.65}
                  />
                )}
              </Group>
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  )
}

export default Room