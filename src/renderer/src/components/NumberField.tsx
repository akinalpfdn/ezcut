import { useEffect, useRef, useState } from 'react'

interface NumberFieldProps {
  value: number
  onCommit: (value: number) => void
  className?: string
  step?: number
  min?: number
}

/**
 * Controlled numeric input you can actually clear and retype. A plain controlled
 * `<input type="number" value={n}>` snaps an emptied field straight back to its
 * value, so the leading 0 can't be deleted. This keeps a local string while the
 * field is focused (empty allowed), commits any valid number as you type, and
 * resyncs to the canonical value on blur.
 */
export function NumberField({ value, onCommit, className, step, min }: NumberFieldProps) {
  const [text, setText] = useState(String(value))
  const focused = useRef(false)

  // Reflect external changes (different clip selected, undo) only when not editing.
  useEffect(() => {
    if (!focused.current) setText(String(value))
  }, [value])

  return (
    <input
      type="number"
      className={className}
      step={step}
      min={min}
      value={text}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
        setText(String(value))
      }}
      onChange={(event) => {
        const next = event.target.value
        setText(next)
        if (next !== '') {
          const parsed = Number(next)
          if (Number.isFinite(parsed)) onCommit(parsed)
        }
      }}
    />
  )
}
