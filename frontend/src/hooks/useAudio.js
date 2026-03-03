import { useState, useRef } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

export function useAudio(addDraft, stagePos, scale) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach(t => t.stop())
        await uploadAudio(blob)
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingSeconds(0)
      timerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1)
      }, 1000)
    } catch (err) {
      alert('Microphone access denied')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      clearInterval(timerRef.current)
      setRecordingSeconds(0)
    }
  }

  const uploadAudio = async (blob) => {
    try {
      const formData = new FormData()
      formData.append('file', blob, `audio-${Date.now()}.webm`)
      const response = await fetch(`${BACKEND_URL}/upload-audio`, { method: 'POST', body: formData })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      const centerX = (window.innerWidth / 2 - stagePos.x) / scale
      const centerY = (window.innerHeight / 2 - stagePos.y) / scale
      addDraft({
        id: Date.now().toString(),
        type: 'audio',
        x: centerX - 100,
        y: centerY - 30,
        url: data.url,
        duration: recordingSeconds,
      })
    } catch (err) {
      alert(`Audio upload failed: ${err.message}`)
    }
  }

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return { isRecording, recordingSeconds, startRecording, stopRecording, formatDuration }
}