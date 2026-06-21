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
    const half = height / 2
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle =
      getComputedStyle(canvas).getPropertyValue('--color-primary').trim() || '#2dd4bf'

    // Dense thin bars (~2px) with max-pooling per bar: reads as a filled waveform
    // envelope rather than a sparse line chart. Silence draws nothing (no baseline).
    const barPitch = 2
    const barCount = Math.max(1, Math.floor(width / barPitch))
    for (let i = 0; i < barCount; i++) {
      const from = Math.floor((i / barCount) * peaks.length)
      const to = Math.max(from + 1, Math.floor(((i + 1) / barCount) * peaks.length))
      let peak = 0
      for (let j = from; j < to && j < peaks.length; j++) {
        if (peaks[j] > peak) peak = peaks[j]
      }
      const amp = peak * half
      if (amp <= 0) continue
      ctx.fillRect(i * barPitch, half - amp, 1.4, Math.max(1, amp * 2))
    }
  }, [peaks])

  return <canvas ref={canvasRef} className={className ? `${styles.canvas} ${className}` : styles.canvas} />
}
