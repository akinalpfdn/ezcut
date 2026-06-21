import { useEffect, useRef } from 'react'
import { useMediaStore } from '../../stores/mediaStore'
import { mediaService } from '../../services/mediaService'

/**
 * Generates waveforms for media that have audio but no waveform yet — items
 * imported before waveform generation existed, or restored from older projects.
 * Each item is requested at most once.
 */
export function useWaveformBackfill(): void {
  const items = useMediaStore((state) => state.items)
  const requested = useRef(new Set<string>())

  useEffect(() => {
    for (const item of items) {
      if (!item.hasAudio || item.waveform || requested.current.has(item.id)) continue
      requested.current.add(item.id)
      void mediaService.generateWaveform(item.path, item.durationSeconds).then((result) => {
        if (result.ok) useMediaStore.getState().setWaveform(item.id, result.value)
        else requested.current.delete(item.id)
      })
    }
  }, [items])
}
