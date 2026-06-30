import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HexColorInput, HexColorPicker } from 'react-colorful'
import styles from './ColorField.module.css'

// Last-used colours, shared across every picker for the session.
let recentColors: string[] = []

interface EyeDropperCtor {
  new (): { open: () => Promise<{ sRGBHex: string }> }
}
const eyeDropper = (window as { EyeDropper?: EyeDropperCtor }).EyeDropper

interface ColorFieldProps {
  value: string
  onChange: (hex: string) => void
}

/** Production-grade colour control: a swatch button that opens a popover with a
 * saturation/hue picker, hex input, eyedropper, and recent colours. The popover is
 * portaled to the body so the scrolling inspector panel can't clip it. */
export function ColorField({ value, onChange }: ColorFieldProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const swatchRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const close = (): void => {
    setOpen(false)
    const c = value.toLowerCase()
    recentColors = [c, ...recentColors.filter((x) => x !== c)].slice(0, 8)
  }

  useEffect(() => {
    if (!open) return
    const rect = swatchRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 232) })
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (popRef.current?.contains(target) || swatchRef.current?.contains(target)) return
      close()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
    // close() reads `value`; re-binding each render keeps it current.
  })

  const pickFromScreen = async (): Promise<void> => {
    if (!eyeDropper) return
    try {
      const result = await new eyeDropper().open()
      onChange(result.sRGBHex)
    } catch {
      // user cancelled
    }
  }

  return (
    <>
      <button
        ref={swatchRef}
        type="button"
        className={styles.swatch}
        // Dynamic colour swatch — the one legitimate inline-style case.
        style={{ backgroundColor: value }}
        aria-label={value}
        onClick={() => setOpen((o) => !o)}
      />
      {open
        ? createPortal(
            <div ref={popRef} className={styles.popover} style={{ top: pos.top, left: pos.left }}>
              <HexColorPicker color={value} onChange={onChange} />
              <div className={styles.row}>
                <span className={styles.hash}>#</span>
                <HexColorInput className={styles.hex} color={value} onChange={onChange} />
                {eyeDropper ? (
                  <button type="button" className={styles.icon} title="Eyedropper" onClick={() => void pickFromScreen()}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m2 22 1-1h3l9-9" />
                      <path d="M3 21v-3l9-9" />
                      <path d="m15 6 3.4-3.4a2.1 2.1 0 0 1 3 3L21 6l-3-3" />
                      <path d="m18 9 .4.4a2.1 2.1 0 0 1 0 3L15 16l-3-3 3.4-3.4a2.1 2.1 0 0 1 3 0Z" />
                    </svg>
                  </button>
                ) : null}
              </div>
              {recentColors.length > 0 ? (
                <div className={styles.recents}>
                  {recentColors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={styles.recent}
                      style={{ backgroundColor: c }}
                      aria-label={c}
                      onClick={() => onChange(c)}
                    />
                  ))}
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
