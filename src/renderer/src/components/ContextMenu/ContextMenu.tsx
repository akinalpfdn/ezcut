import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import styles from './ContextMenu.module.css'

export interface ContextMenuItem {
  label: string
  hint?: string
  disabled?: boolean
  onSelect: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointerDown(event: PointerEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return createPortal(
    <div ref={ref} className={styles.menu} style={{ left: x, top: y }} role="menu">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={styles.item}
          disabled={item.disabled}
          onClick={() => {
            item.onSelect()
            onClose()
          }}
        >
          <span className={styles.label}>{item.label}</span>
          {item.hint ? <span className={styles.hint}>{item.hint}</span> : null}
        </button>
      ))}
    </div>,
    document.body
  )
}
