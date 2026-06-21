import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppErrorPayload } from '@shared'
import { mediaService } from '../../services/mediaService'
import { useMediaStore } from '../../stores/mediaStore'

interface Recorder {
  recording: boolean
  saving: boolean
  elapsedMs: number
  error: AppErrorPayload | null
  start: () => Promise<void>
  stop: () => void
}

const RECORDING_MIME = 'audio/webm;codecs=opus'

/** Records microphone audio with MediaRecorder, then hands the blob to main to
 * persist + import as an audio clip. */
export function useRecorder(): Recorder {
  const addItems = useMediaStore((state) => state.addItems)
  const [recording, setRecording] = useState(false)
  const [saving, setSaving] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState<AppErrorPayload | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  useEffect(() => stopTick, [stopTick])

  const start = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported(RECORDING_MIME) ? RECORDING_MIME : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunksRef.current, { type: mimeType })
        setSaving(true)
        void blob
          .arrayBuffer()
          .then((buffer) => mediaService.saveRecording(buffer, 'webm'))
          .then((result) => {
            if (result.ok) addItems([result.value])
            else setError(result.error)
            setSaving(false)
          })
      }

      recorder.start()
      recorderRef.current = recorder
      setRecording(true)

      const startedAt = Date.now()
      setElapsedMs(0)
      tickRef.current = setInterval(() => setElapsedMs(Date.now() - startedAt), 200)
    } catch (caught) {
      setError({
        code: 'MIC_UNAVAILABLE',
        messageKey: 'errors.micUnavailable',
        detail: caught instanceof Error ? caught.message : String(caught)
      })
    }
  }, [addItems])

  const stop = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    stopTick()
    setElapsedMs(0)
    setRecording(false)
  }, [stopTick])

  return { recording, saving, elapsedMs, error, start, stop }
}
