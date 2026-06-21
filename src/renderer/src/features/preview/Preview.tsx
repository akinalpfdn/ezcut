import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useTimelineStore } from '../../stores/timelineStore'
import { denoiseElementKey, useTimelinePlayback, videoSlotBKey } from './useTimelinePlayback'
import { useCanvasCompositor } from './webcodecs/useCanvasCompositor'
import { Transport } from './Transport'
import { ClipInspector } from './ClipInspector'
import styles from './Preview.module.css'

export function Preview() {
  const { t } = useTranslation()
  const tracks = useTimelineStore((state) => state.model.tracks)
  const hasClips = useTimelineStore((state) => Object.keys(state.model.clips).length > 0)
  const { registerElement } = useTimelinePlayback()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useCanvasCompositor(canvasRef)

  const videoTrack = tracks.find((track) => track.kind === 'video')
  const audioTracks = tracks.filter((track) => track.kind === 'audio')

  return (
    <div className={styles.preview}>
      <div className={styles.stage}>
        {/* WebCodecs-composited video, layered over the (now audio-only) element
            slots which remain for sound until the Phase 10 audio engine. */}
        <canvas ref={canvasRef} className={styles.canvas} />
        {videoTrack ? (
          <>
            <video
              key={videoTrack.id}
              ref={(element) => registerElement(videoTrack.id, element)}
              className={styles.video}
              playsInline
              crossOrigin="anonymous"
            />
            <video
              key={videoSlotBKey(videoTrack.id)}
              ref={(element) => registerElement(videoSlotBKey(videoTrack.id), element)}
              className={styles.video}
              playsInline
              crossOrigin="anonymous"
            />
            <audio
              key={denoiseElementKey(videoTrack.id)}
              ref={(element) => registerElement(denoiseElementKey(videoTrack.id), element)}
              crossOrigin="anonymous"
              hidden
            />
          </>
        ) : null}
        {audioTracks.map((track) => (
          <audio
            key={track.id}
            ref={(element) => registerElement(track.id, element)}
            crossOrigin="anonymous"
            hidden
          />
        ))}
        {!hasClips ? <div className={styles.empty}>{t('preview.empty')}</div> : null}
      </div>
      <ClipInspector />
      <Transport />
    </div>
  )
}
