import { useEffect, useRef } from 'react'
import styles from './Waveform.module.css'

interface WaveformProps {
  peaks: number[]
  className?: string
}

export function Waveform({ peaks, className }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    ctx.scale(dpr, dpr)

    const { width, height } = rect
    const mid = height / 2
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle =
      getComputedStyle(canvas).getPropertyValue('--color-primary').trim() || '#2dd4bf'

    const barCount = Math.min(peaks.length, Math.max(1, Math.floor(width / 2)))
    const step = peaks.length / barCount
    const barWidth = width / barCount
    for (let i = 0; i < barCount; i++) {
      const peak = peaks[Math.floor(i * step)] ?? 0
      const barHeight = Math.max(1, peak * height)
      ctx.fillRect(i * barWidth, mid - barHeight / 2, Math.max(1, barWidth - 1), barHeight)
    }
  }, [peaks])

  return <canvas ref={canvasRef} className={className ? `${styles.canvas} ${className}` : styles.canvas} />
}
