function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

/**
 * Formats a time in seconds. With fps, returns SMPTE-style HH:MM:SS:FF;
 * otherwise MM:SS.mmm (used for audio, which has no frame grid).
 */
export function formatTimecode(seconds: number, fps?: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const whole = Math.floor(safe)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const secs = whole % 60

  if (fps && fps > 0) {
    const frames = Math.min(Math.floor((safe - whole) * fps), Math.round(fps) - 1)
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}:${pad(frames)}`
  }

  const millis = Math.floor((safe - whole) * 1000)
  return `${pad(minutes)}:${pad(secs)}.${pad(millis, 3)}`
}
