import { describe, expect, it } from 'vitest'
import { animState, applyEasing, loopState } from './textAnimation'

describe('applyEasing', () => {
  it('should be identity for linear', () => {
    expect(applyEasing('linear', 0.3)).toBeCloseTo(0.3)
  })

  it('should ease out faster than linear early on', () => {
    expect(applyEasing('easeOut', 0.5)).toBeGreaterThan(0.5)
  })

  it('should overshoot past 1 for back near the end', () => {
    expect(applyEasing('back', 0.8)).toBeGreaterThan(1)
  })
})

describe('loopState', () => {
  it('should be neutral for none', () => {
    expect(loopState('none', 3)).toEqual({ alpha: 1, dx: 0, dy: 0, scale: 1, rotate: 0 })
  })

  it('should peak the pulse scale a quarter period in', () => {
    // period 0.8s → quarter at 0.2s → sin = 1 → scale 1.07
    expect(loopState('pulse', 0.2).scale).toBeCloseTo(1.07, 5)
    expect(loopState('pulse', 0).scale).toBeCloseTo(1, 5)
  })

  it('should oscillate rotation for wiggle', () => {
    expect(loopState('wiggle', 0.15).rotate).toBeCloseTo(5, 5) // quarter of 0.6s
  })
})

describe('animState', () => {
  it('should be neutral outside any in/out window with no loop', () => {
    const s = animState('fade', 'none', 0.4, 0.4, 'easeOut', 'none', 1.0, 2.0)
    expect(s).toMatchObject({ alpha: 1, dx: 0, dy: 0, scale: 1, rotate: 0, blur: 0, reveal: 1 })
  })

  it('should fade in linearly by alpha during the in window', () => {
    const s = animState('fade', 'none', 0.4, 0.4, 'easeOut', 'none', 0.2, 5)
    expect(s.alpha).toBeCloseTo(0.5, 5)
  })

  it('should mark the reveal mode for typewriter and revealWord', () => {
    expect(animState('typewriter', 'none', 0.4, 0.4, 'linear', 'none', 0.2, 5).revealMode).toBe('char')
    expect(animState('revealWord', 'none', 0.4, 0.4, 'linear', 'none', 0.2, 5).revealMode).toBe('word')
  })

  it('should apply a negative rotation while spinning in', () => {
    const s = animState('spin', 'none', 0.4, 0.4, 'linear', 'none', 0.0, 5)
    expect(s.rotate).toBeLessThan(0)
    expect(s.scale).toBeLessThan(1)
  })

  it('should multiply in-scale by the loop scale when both are active', () => {
    // in-scale at elapsed 0 → scale ~0; loop pulse contributes a multiplier
    const withLoop = animState('scale', 'none', 0.4, 0.4, 'linear', 'pulse', 0.2, 5)
    const noLoop = animState('scale', 'none', 0.4, 0.4, 'linear', 'none', 0.2, 5)
    expect(withLoop.scale).toBeCloseTo(noLoop.scale * loopState('pulse', 0.2).scale, 5)
  })
})
