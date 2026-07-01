import { NumberField } from './NumberField'
import styles from './SpeedField.module.css'

interface SpeedFieldProps {
  value: number
  onChange: (speed: number) => void
  min?: number
  max?: number
}

/** Rounds to 2 decimals (the speed precision the UI exposes). */
const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Speed control: a logarithmic slider paired with a direct number input. Log
 * scaling means equal slider travel is an equal *ratio*, so fine values near 1×
 * (1.05, 1.1…) are as reachable as large ones (9.1, 15×) — a linear 0.1–20 slider
 * would cram everything below 2× into a few pixels. The number input allows exact
 * entry for values that are fiddly to hit on the slider.
 */
export function SpeedField({ value, onChange, min = 0.1, max = 20 }: SpeedFieldProps) {
  const logRange = Math.log(max / min)
  const speedToPos = (s: number): number => Math.log(Math.min(max, Math.max(min, s)) / min) / logRange
  const posToSpeed = (p: number): number => min * Math.exp(p * logRange)
  const clamp = (s: number): number => round2(Math.min(max, Math.max(min, s)))

  return (
    <div className={styles.wrap}>
      <input
        type="range"
        className={styles.slider}
        min={0}
        max={1}
        step={0.001}
        value={speedToPos(value)}
        onChange={(event) => onChange(clamp(posToSpeed(Number(event.target.value))))}
      />
      <NumberField
        className={styles.input}
        min={min}
        max={max}
        step={0.1}
        value={round2(value)}
        onCommit={(next) => onChange(clamp(next))}
      />
      <span className={styles.suffix}>×</span>
    </div>
  )
}
