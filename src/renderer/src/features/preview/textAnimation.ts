import type { TextAnimation } from '@shared'

/** Per-frame animation state for a text overlay. dx/dy are fractions of the frame
 * height (the worker multiplies by height); alpha and scale are multipliers. */
export interface AnimState {
  alpha: number
  dx: number
  dy: number
  scale: number
  /** Fraction of the text revealed (typewriter); 1 = all. */
  reveal: number
}

const NEUTRAL: AnimState = { alpha: 1, dx: 0, dy: 0, scale: 1, reveal: 1 }
const SLIDE = 0.12 // entry offset as a fraction of the frame height (matches the exporter)

function easeOut(p: number): number {
  return 1 - Math.pow(1 - p, 3)
}

function easeOutBack(p: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
}

// State at progress p (0 = fully out/hidden, 1 = fully in place) for one animation.
function phase(anim: TextAnimation, p: number): AnimState {
  const e = easeOut(p)
  switch (anim) {
    case 'fade':
      return { alpha: p, dx: 0, dy: 0, scale: 1, reveal: 1 }
    case 'slideUp':
      return { alpha: p, dx: 0, dy: SLIDE * (1 - e), scale: 1, reveal: 1 }
    case 'slideDown':
      return { alpha: p, dx: 0, dy: -SLIDE * (1 - e), scale: 1, reveal: 1 }
    case 'slideLeft':
      return { alpha: p, dx: SLIDE * (1 - e), dy: 0, scale: 1, reveal: 1 }
    case 'slideRight':
      return { alpha: p, dx: -SLIDE * (1 - e), dy: 0, scale: 1, reveal: 1 }
    case 'scale':
      return { alpha: p, dx: 0, dy: 0, scale: e, reveal: 1 }
    case 'pop':
      return { alpha: p, dx: 0, dy: 0, scale: easeOutBack(Math.max(0.0001, p)), reveal: 1 }
    case 'typewriter':
      return { alpha: 1, dx: 0, dy: 0, scale: 1, reveal: p }
    default:
      return NEUTRAL
  }
}

/** Resolves the active animation state from how far the playhead is into the overlay. */
export function animState(
  animIn: TextAnimation,
  animOut: TextAnimation,
  inDur: number,
  outDur: number,
  elapsed: number,
  remaining: number
): AnimState {
  if (animIn !== 'none' && inDur > 0 && elapsed < inDur) {
    return phase(animIn, Math.max(0, Math.min(1, elapsed / inDur)))
  }
  if (animOut !== 'none' && outDur > 0 && remaining < outDur) {
    return phase(animOut, Math.max(0, Math.min(1, remaining / outDur)))
  }
  return NEUTRAL
}
