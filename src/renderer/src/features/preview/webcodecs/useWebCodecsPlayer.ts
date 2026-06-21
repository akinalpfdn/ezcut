import { useEffect, useRef, useState } from 'react'
import { WebCodecsClipPlayer } from './clipPlayer'

interface WebCodecsPlayerState {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  ready: boolean
  duration: number
  currentTime: number
  error: string | null
  play: () => void
  pause: () => void
  seek: (seconds: number) => void
}

export function useWebCodecsPlayer(fileUrl: string | null): WebCodecsPlayerState {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const playerRef = useRef<WebCodecsClipPlayer | null>(null)
  const [ready, setReady] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !fileUrl) return
    setReady(false)
    setError(null)
    setCurrentTime(0)

    let disposed = false
    const player = new WebCodecsClipPlayer(canvas)
    player.onTime = (seconds) => setCurrentTime(seconds)
    playerRef.current = player

    player
      .load(fileUrl)
      .then(() => {
        if (disposed) return
        setDuration(player.durationSeconds)
        setReady(true)
      })
      .catch((caught) => {
        if (!disposed) setError(caught instanceof Error ? caught.message : String(caught))
      })

    return () => {
      disposed = true
      player.dispose()
      playerRef.current = null
    }
  }, [fileUrl])

  return {
    canvasRef,
    ready,
    duration,
    currentTime,
    error,
    play: () => playerRef.current?.play(),
    pause: () => playerRef.current?.pause(),
    seek: (seconds) => playerRef.current?.seek(seconds)
  }
}
