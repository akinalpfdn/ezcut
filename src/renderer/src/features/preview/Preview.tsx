import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useTimelineStore } from '../../stores/timelineStore'
import { useCanvasCompositor } from './webcodecs/useCanvasCompositor'
import { useTimelineAudio } from './audio/useTimelineAudio'
import { Transport } from './Transport'
import { ClipInspector } from './ClipInspector'
import { TextInspector } from './TextInspector'
import styles from './Preview.module.css'

export function Preview() {
  const { t } = useTranslation()
  const hasClips = useTimelineStore((state) => Object.keys(state.model.clips).length > 0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Video is composited on the canvas (WebCodecs); audio is the master clock
  // (Web Audio) that the canvas follows. No media elements.
  useCanvasCompositor(canvasRef)
  useTimelineAudio()

  return (
    <div className={styles.preview}>
      <div className={styles.stage}>
        <canvas ref={canvasRef} className={styles.canvas} />
        {!hasClips ? <div className={styles.empty}>{t('preview.empty')}</div> : null}
      </div>
      <ClipInspector />
      <TextInspector />
      <Transport />
    </div>
  )
}
