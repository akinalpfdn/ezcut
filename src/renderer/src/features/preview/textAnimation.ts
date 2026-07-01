import type { Easing, TextAnimation, TextLoop } from '@shared'

/** Per-frame animation state for a text overlay. dx/dy are fractions of the frame
 * height (the worker multiplies by height); alpha and scale are multipliers; rotate
 * is extra degrees; blur is a fraction of the font size. */
export interface AnimState {
  alpha: number
  dx: number
  dy: number
  scale: number
  rotate: number
  blur: number
  /** Fraction revealed (0..1) for typewriter/word reveals; 1 = all. */
  reveal: number
  revealMode: 'none' | 'char' | 'word'
}

const NEUTRAL: AnimState = { alpha: 1, dx: 0, dy: 0, scale: 1, rotate: 0, blur: 0, reveal: 1, revealMode: 'none' }
const SLIDE = 0.12 // entry offset as a fraction of the frame height (matches the exporter)

const clamp01 = (p: number): number => Math.max(0, Math.min(1, p))

function easeOut(p: number): number {
  return 1 - Math.pow(1 - p, 3)
}
function easeOutBack(p: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
}
function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
}
function easeOutBounce(x: number): number {
  const n1 = 7.5625
  const d1 = 2.75
  if (x < 1 / d1) return n1 * x * x
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375
  return n1 * (x -= 2.625 / d1) * x + 0.984375
}

/** Applies the chosen easing curve to a 0..1 progress. */
export function applyEasing(easing: Easing, p: number): number {
  switch (easing) {
    case 'linear':
      return p
    case 'easeInOut':
      return easeInOut(p)
    case 'back':
      return easeOutBack(p)
    default:
      return easeOut(p)
  }
}

// State at progress p (0 = fully out/hidden, 1 = fully in place) for one animation.
// `g` is the eased geometric progress; alpha/reveal use the raw p.
function phase(anim: TextAnimation, p: number, easing: Easing): AnimState {
  const g = applyEasing(easing, p)
  switch (anim) {
    case 'fade':
      return { ...NEUTRAL, alpha: p }
    case 'slideUp':
      return { ...NEUTRAL, alpha: p, dy: SLIDE * (1 - g) }
    case 'slideDown':
      return { ...NEUTRAL, alpha: p, dy: -SLIDE * (1 - g) }
    case 'slideLeft':
      return { ...NEUTRAL, alpha: p, dx: SLIDE * (1 - g) }
    case 'slideRight':
      return { ...NEUTRAL, alpha: p, dx: -SLIDE * (1 - g) }
    case 'scale':
      return { ...NEUTRAL, alpha: p, scale: g }
    case 'pop':
      return { ...NEUTRAL, alpha: p, scale: easeOutBack(Math.max(0.0001, p)) }
    case 'bounce':
      // Drops in from above with a bounce settle (own curve, ignores easing).
      return { ...NEUTRAL, alpha: Math.min(1, p * 2), dy: -SLIDE * (1 - easeOutBounce(p)) }
    case 'rise':
      return { ...NEUTRAL, alpha: p, dy: SLIDE * 1.6 * (1 - g) }
    case 'spin':
      return { ...NEUTRAL, alpha: p, scale: g, rotate: -180 * (1 - g) }
    case 'blurIn':
      return { ...NEUTRAL, alpha: p, blur: 0.25 * (1 - g) }
    case 'wave':
      return { ...NEUTRAL, alpha: p, dy: SLIDE * (1 - g), dx: 0.03 * Math.sin(p * Math.PI * 3) * (1 - p) }
    case 'typewriter':
      return { ...NEUTRAL, reveal: p, revealMode: 'char' }
    case 'revealWord':
      return { ...NEUTRAL, reveal: p, revealMode: 'word' }
    default:
      return NEUTRAL
  }
}

interface LoopState {
  alpha: number
  dx: number
  dy: number
  scale: number
  rotate: number
}
const LOOP_NEUTRAL: LoopState = { alpha: 1, dx: 0, dy: 0, scale: 1, rotate: 0 }
const TAU = Math.PI * 2

/** Continuous loop offset at absolute time `t` (seconds into the overlay). */
export function loopState(loop: TextLoop, t: number): LoopState {
  switch (loop) {
    case 'pulse':
      return { ...LOOP_NEUTRAL, scale: 1 + 0.07 * Math.sin((TAU * t) / 0.8) }
    case 'breathe':
      return { ...LOOP_NEUTRAL, scale: 1 + 0.04 * Math.sin((TAU * t) / 2.4) }
    case 'blink':
      return { ...LOOP_NEUTRAL, alpha: Math.sin((TAU * t) / 0.7) > -0.2 ? 1 : 0.15 }
    case 'wiggle':
      return { ...LOOP_NEUTRAL, rotate: 5 * Math.sin((TAU * t) / 0.6) }
    case 'shake':
      return { ...LOOP_NEUTRAL, dx: 0.006 * Math.sin(t * 47), dy: 0.006 * Math.sin(t * 41 + 1) }
    default:
      return LOOP_NEUTRAL
  }
}

/** Resolves the active animation state: the in/out phase combined with the loop. */
export function animState(
  animIn: TextAnimation,
  animOut: TextAnimation,
  inDur: number,
  outDur: number,
  easing: Easing,
  loop: TextLoop,
  elapsed: number,
  remaining: number
): AnimState {
  let s = NEUTRAL
  if (animIn !== 'none' && inDur > 0 && elapsed < inDur) {
    s = phase(animIn, clamp01(elapsed / inDur), easing)
  } else if (animOut !== 'none' && outDur > 0 && remaining < outDur) {
    s = phase(animOut, clamp01(remaining / outDur), easing)
  }
  const l = loopState(loop, Math.max(0, elapsed))
  return {
    alpha: s.alpha * l.alpha,
    dx: s.dx + l.dx,
    dy: s.dy + l.dy,
    scale: s.scale * l.scale,
    rotate: s.rotate + l.rotate,
    blur: s.blur,
    reveal: s.reveal,
    revealMode: s.revealMode
  }
}
