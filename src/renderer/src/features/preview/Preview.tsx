import { useTranslation } from 'react-i18next'
import { useTimelineStore } from '../../stores/timelineStore'
import { useTimelinePlayback } from './useTimelinePlayback'
import { Transport } from './Transport'
import { ClipInspector } from './ClipInspector'
import styles from './Preview.module.css'

export function Preview() {
  const { t } = useTranslation()
  const tracks = useTimelineStore((state) => state.model.tracks)
  const hasClips = useTimelineStore((state) => Object.keys(state.model.clips).length > 0)
  const { registerElement } = useTimelinePlayback()

  const videoTrack = tracks.find((track) => track.kind === 'video')
  const audioTracks = tracks.filter((track) => track.kind === 'audio')

  return (
    <div className={styles.preview}>
      <div className={styles.stage}>
        {videoTrack ? (
          <video
            key={videoTrack.id}
            ref={(element) => registerElement(videoTrack.id, element)}
            className={hasClips ? styles.video : styles.videoHidden}
            playsInline
            crossOrigin="anonymous"
          />
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
