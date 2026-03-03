import { useState, useRef, useCallback, useEffect } from 'react'
import rough from 'roughjs'

export const ROUGH_OPTIONS = {
  roughness: 2,
  strokeWidth: 1.5,
  bowing: 1.5,
}

export const COLORS = [
  '#2c2410', '#8b5e3c', '#6b4a35', '#4a3728',
  '#c0392b', '#8b3c5e', '#3c5e8b', '#4a6b3c',
  '#c8a040', '#7c6b3c', '#3c7c6b', '#8b7c3c'
]

export const FILLS = [
  'transparent', '#fffcf8',
  '#f5e6d0', '#e0d0b8',
  '#ffd0c8', '#d0e8d0',
  '#c8d8f0', '#f0d8e8'
]

export function useCanvas(roomId, saveDraft, user) {
  const [draftElements, setDraftElements] = useState([])
  const [currentLine, setCurrentLine] = useState(null)
  const [currentShape, setCurrentShape] = useState(null)
  const [tool, setTool] = useState('draw')
  const [drawColor, setDrawColor] = useState('#2c2410')
  const [brushSize, setBrushSize] = useState(3)
  const [textColor, setTextColor] = useState('#2c2410')
  const [shapeColor, setShapeColor] = useState('#2c2410')
  const [fillColor, setFillColor] = useState('transparent')
  const [selectedId, setSelectedId] = useState(null)
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])

  const isDrawing = useRef(false)
  const shapeStart = useRef(null)
  const lastPoint = useRef(null)
  const roughCanvasRef = useRef(null)
  const roughCache = useRef({})

  useEffect(() => {
    const canvas = document.createElement('canvas')
    roughCanvasRef.current = rough.canvas(canvas)
  }, [])

  const addDraft = useCallback((element) => {
    const el = {
      ...element,
      createdAt: new Date().toISOString(),
      sentBy: user?.userId,
      sentByUsername: user?.username,
    }
    setUndoStack(prev => [...prev, { type: 'add', elementId: el.id }])
    setRedoStack([])
    setDraftElements(prev => [...prev, el])
    saveDraft(el)
  }, [roomId, saveDraft, user])

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

  const deleteElement = (elementId) => {
    if (draftElements.find(el => el.id === elementId)) {
      setDraftElements(prev => prev.filter(el => el.id !== elementId))
      setSelectedId(null)
    }
  }

  const eraseAt = (pos, scale) => {
    const eraseRadius = 20 / scale
    setDraftElements(prev => prev.filter(el => {
      if (el.type === 'drawing') {
        for (let i = 0; i < el.points.length - 1; i += 2) {
          const dx = el.points[i] - pos.x
          const dy = el.points[i + 1] - pos.y
          if (Math.sqrt(dx * dx + dy * dy) < eraseRadius) return false
        }
      }
      if (['text', 'shape', 'image', 'audio'].includes(el.type)) {
        const dx = (el.x || 0) - pos.x
        const dy = (el.y || 0) - pos.y
        if (Math.sqrt(dx * dx + dy * dy) < eraseRadius * 3) return false
      }
      return true
    }))
  }

  const handleElementDragEnd = (elId, deltaX, deltaY) => {
    setDraftElements(prev => prev.map(el => {
      if (el.id !== elId) return el
      if (el.type === 'drawing') {
        return { ...el, points: el.points.map((p, i) => i % 2 === 0 ? p + deltaX : p + deltaY) }
      }
      return { ...el, x: (el.x || 0) + deltaX, y: (el.y || 0) + deltaY }
    }))
  }

  const handleImageDragEnd = (elId, newX, newY) => {
    setDraftElements(prev => prev.map(el => el.id === elId ? { ...el, x: newX, y: newY } : el))
  }

  // Rough shape generation
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
    const x = el.x, y = el.y, w = el.width || 0, h = el.height || 0
    if (el.shapeType === 'rect') {
      drawable = rc.generator.rectangle(w < 0 ? x + w : x, h < 0 ? y + h : y, Math.abs(w), Math.abs(h), opts)
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

  const roughifyPoints = (points) => {
    if (points.length < 4) return points
    const result = []
    for (let i = 0; i < points.length - 2; i += 2) {
      result.push(points[i], points[i + 1])
      if (i + 2 < points.length) {
        result.push(
          (points[i] + points[i + 2]) / 2 + (Math.random() - 0.5) * 0.8,
          (points[i + 1] + points[i + 3]) / 2 + (Math.random() - 0.5) * 0.8
        )
      }
    }
    result.push(points[points.length - 2], points[points.length - 1])
    return result
  }

  return {
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
  }
}