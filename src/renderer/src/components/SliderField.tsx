import styles from './SliderField.module.css'

interface SliderFieldProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}

/** A range slider with a numeric readout, for bounded params (opacity, strength…). */
export function SliderField({ value, onChange, min = 0, max = 100, step = 1 }: SliderFieldProps) {
  return (
    <div className={styles.wrap}>
      <input
        type="range"
        className={styles.slider}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className={styles.value}>{Math.round(value)}</span>
    </div>
  )
}
