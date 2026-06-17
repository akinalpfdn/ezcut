import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaStore, selectSelectedItem } from '../../stores/mediaStore'
import { Waveform } from '../mediaBin/Waveform'
import { Transport } from './Transport'
import { usePreviewEngine } from './usePreviewEngine'
import styles from './Preview.module.css'

export function Preview() {
  const { t } = useTranslation()
  const item = useMediaStore(selectSelectedItem)
  const videoRef = useRef<HTMLVideoElement>(null)
  const engine = usePreviewEngine(videoRef, item)
  const showVideo = item?.kind === 'video'

  return (
    <div className={styles.preview}>
      <div className={styles.stage}>
        {/* One element drives both video and audio clips; crossOrigin lets the
            Web Audio graph read ezmedia:// audio without CORS tainting. It stays
            mounted (so audio keeps playing) but is hidden for audio / empty. */}
        <video
          ref={videoRef}
          className={showVideo ? styles.video : styles.videoHidden}
          playsInline
          crossOrigin="anonymous"
        />
        {item && item.kind === 'audio' ? (
          <div className={styles.audioOverlay}>
            {item.waveform ? <Waveform peaks={item.waveform.peaks} className={styles.audioWave} /> : null}
            <span className={styles.audioName}>{item.name}</span>
          </div>
        ) : null}
        {!item ? <div className={styles.empty}>{t('preview.empty')}</div> : null}
      </div>
      {item ? <Transport engine={engine} item={item} /> : null}
    </div>
  )
}
