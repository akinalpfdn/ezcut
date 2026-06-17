import { useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaStore } from '../../stores/mediaStore'
import { useMediaImport } from '../../hooks/useMediaImport'
import { mediaService } from '../../services/mediaService'
import { Button } from '../../components/Button/Button'
import { ErrorNotice } from '../../components/ErrorNotice'
import { MediaCard } from './MediaCard'
import styles from './MediaBin.module.css'

export function MediaBin() {
  const { t } = useTranslation()
  const items = useMediaStore((state) => state.items)
  const selectedId = useMediaStore((state) => state.selectedId)
  const select = useMediaStore((state) => state.select)
  const removeItem = useMediaStore((state) => state.removeItem)
  const { importing, errors, importViaDialog, importPaths } = useMediaImport()
  const [dragOver, setDragOver] = useState(false)

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragOver(false)
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => mediaService.getPathForFile(file))
      .filter((path) => path.length > 0)
    void importPaths(paths)
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragOver(true)
  }

  return (
    <section
      className={styles.bin}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>{t('media.binTitle')}</h2>
        <Button onClick={() => void importViaDialog()} disabled={importing}>
          {importing ? t('media.importing') : t('media.import')}
        </Button>
      </header>

      {errors.length > 0 ? (
        <div className={styles.errors}>
          {errors.map((error, index) => (
            <ErrorNotice key={`${error.code}-${index}`} error={error} />
          ))}
        </div>
      ) : null}

      <div className={dragOver ? `${styles.body} ${styles.dragOver}` : styles.body}>
        {items.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{t('media.emptyTitle')}</p>
            <p className={styles.emptyHint}>{t('media.emptyHint')}</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {items.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                onSelect={() => select(item.id)}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
