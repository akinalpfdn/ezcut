import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaStore } from '../../../stores/mediaStore'
import { toMediaUrl } from '../../../utils/mediaUrl'
import { formatDuration } from '../../../utils/format'
import { Button } from '../../../components/Button/Button'
import { useWebCodecsPlayer } from './useWebCodecsPlayer'
import styles from './WebCodecsLab.module.css'

interface WebCodecsLabProps {
  onClose: () => void
}

/** Phase 8 foundation test surface: plays the selected video clip through the
 * WebCodecs → canvas pipeline (video only; audio lands in Phase 10). */
export function WebCodecsLab({ onClose }: WebCodecsLabProps) {
  const { t } = useTranslation()
  const selected = useMediaStore(
    (state) =>
      state.items.find((item) => item.id === state.selectedId && item.kind === 'video') ?? null
  )
  const fileUrl = selected ? toMediaUrl(selected.path) : null
  const player = useWebCodecsPlayer(fileUrl)
  const [playing, setPlaying] = useState(false)

  function togglePlay(): void {
    if (playing) {
      player.pause()
      setPlaying(false)
    } else {
      player.play()
      setPlaying(true)
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>{t('webcodecs.title')}</h2>
          <button type="button" className={styles.close} aria-label={t('webcodecs.close')} onClick={onClose}>
            ×
          </button>
        </header>

        {!selected ? (
          <p className={styles.hint}>{t('webcodecs.selectVideo')}</p>
        ) : (
          <>
            <div className={styles.stage}>
              <canvas ref={player.canvasRef} className={styles.canvas} />
              {player.error ? <p className={styles.error}>{player.error}</p> : null}
              {!player.ready && !player.error ? <p className={styles.loading}>{t('webcodecs.loading')}</p> : null}
            </div>

            <div className={styles.transport}>
              <Button onClick={togglePlay} disabled={!player.ready}>
                {playing ? t('transport.pause') : t('transport.play')}
              </Button>
              <span className={styles.time}>
                {formatDuration(player.currentTime)} / {formatDuration(player.duration)}
              </span>
              <input
                className={styles.scrub}
                type="range"
                min={0}
                max={player.duration || 0}
                step={0.01}
                value={Math.min(player.currentTime, player.duration || 0)}
                disabled={!player.ready}
                onChange={(event) => player.seek(Number(event.target.value))}
                aria-label={t('transport.seek')}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
