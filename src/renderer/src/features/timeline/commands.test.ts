import { describe, expect, it } from 'vitest'
import { DEFAULT_AUDIO_FX } from '@shared'
import type { Clip, TimelineModel, Track } from '@shared'
import {
  addClipCommand,
  addTrackCommand,
  closeGapsCommand,
  mergeClipsCommand,
  moveClipCommand,
  removeClipCommand,
  removeClipsCommand,
  sequenceCommand,
  setClipPropertyCommand,
  setMarkersCommand,
  setTrackPropertyCommand,
  splitClipCommand,
  trimClipCommand
} from './commands'

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'c1',
    mediaId: 'm1',
    trackId: 't-video',
    startOnTimeline: 0,
    sourceIn: 0,
    sourceOut: 10,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    muted: false,
    denoise: { enabled: false, strength: 0.5 },
    audioFx: DEFAULT_AUDIO_FX,
    ...overrides
  }
}

function makeModel(clips: Clip[], tracks?: Track[]): TimelineModel {
  return {
    tracks: tracks ?? [{ id: 't-video', kind: 'video', index: 0, label: 'V1', muted: false, solo: false }],
    clips: Object.fromEntries(clips.map((clip) => [clip.id, clip])),
    markers: []
  }
}

describe('addClipCommand', () => {
  it('should add the clip on apply and remove it on invert', () => {
    const base = makeModel([])
    const clip = makeClip()
    const applied = addClipCommand(clip).apply(base)
    expect(applied.clips[clip.id]).toEqual(clip)
    expect(addClipCommand(clip).invert(applied)).toEqual(base)
  })

  it('should not mutate the input model', () => {
    const base = makeModel([])
    addClipCommand(makeClip()).apply(base)
    expect(Object.keys(base.clips)).toHaveLength(0)
  })
})

describe('removeClipCommand', () => {
  it('should remove on apply and restore on invert', () => {
    const clip = makeClip()
    const base = makeModel([clip])
    const command = removeClipCommand(clip)
    const applied = command.apply(base)
    expect(applied.clips[clip.id]).toBeUndefined()
    expect(command.invert(applied)).toEqual(base)
  })
})

describe('removeClipsCommand', () => {
  it('should remove all given clips and restore them on invert', () => {
    const a = makeClip({ id: 'a' })
    const b = makeClip({ id: 'b', startOnTimeline: 10 })
    const keep = makeClip({ id: 'keep', startOnTimeline: 20 })
    const base = makeModel([a, b, keep])
    const command = removeClipsCommand([a, b])
    const applied = command.apply(base)
    expect(Object.keys(applied.clips)).toEqual(['keep'])
    expect(command.invert(applied)).toEqual(base)
  })
})

describe('moveClipCommand', () => {
  it('should apply the new placement and revert to the old', () => {
    const clip = makeClip({ startOnTimeline: 0, trackId: 't-video' })
    const base = makeModel([clip])
    const command = moveClipCommand(
      clip.id,
      { trackId: 't-video', startOnTimeline: 0 },
      { trackId: 't-video', startOnTimeline: 7 }
    )
    const applied = command.apply(base)
    expect(applied.clips[clip.id].startOnTimeline).toBe(7)
    expect(command.invert(applied)).toEqual(base)
  })
})

describe('trimClipCommand', () => {
  it('should apply new trim and revert to the old', () => {
    const clip = makeClip({ sourceIn: 0, sourceOut: 10, startOnTimeline: 0 })
    const base = makeModel([clip])
    const command = trimClipCommand(
      clip.id,
      { sourceIn: 0, sourceOut: 10, startOnTimeline: 0 },
      { sourceIn: 2, sourceOut: 8, startOnTimeline: 2 }
    )
    const applied = command.apply(base)
    expect(applied.clips[clip.id]).toMatchObject({ sourceIn: 2, sourceOut: 8, startOnTimeline: 2 })
    expect(command.invert(applied)).toEqual(base)
  })
})

describe('splitClipCommand', () => {
  it('should replace the original with two clips and restore it on invert', () => {
    const original = makeClip({ id: 'orig', sourceIn: 0, sourceOut: 10, startOnTimeline: 0 })
    const left = makeClip({ id: 'l', sourceIn: 0, sourceOut: 4, startOnTimeline: 0 })
    const right = makeClip({ id: 'r', sourceIn: 4, sourceOut: 10, startOnTimeline: 4 })
    const base = makeModel([original])
    const command = splitClipCommand(original, left, right)
    const applied = command.apply(base)
    expect(Object.keys(applied.clips).sort()).toEqual(['l', 'r'])
    expect(command.invert(applied)).toEqual(base)
  })
})

describe('mergeClipsCommand', () => {
  it('should replace two clips with the merged one and restore both on invert', () => {
    const first = makeClip({ id: 'f', sourceIn: 0, sourceOut: 5, startOnTimeline: 0 })
    const second = makeClip({ id: 's', sourceIn: 5, sourceOut: 10, startOnTimeline: 5 })
    const merged = makeClip({ id: 'm', sourceIn: 0, sourceOut: 10, startOnTimeline: 0 })
    const base = makeModel([first, second])
    const command = mergeClipsCommand(first, second, merged)
    const applied = command.apply(base)
    expect(Object.keys(applied.clips)).toEqual(['m'])
    expect(command.invert(applied)).toEqual(base)
  })
})

describe('addTrackCommand', () => {
  it('should add the track on apply and remove it on invert', () => {
    const base = makeModel([])
    const track: Track = { id: 't-audio', kind: 'audio', index: 1, label: 'A1', muted: false, solo: false }
    const command = addTrackCommand(track)
    const applied = command.apply(base)
    expect(applied.tracks).toContainEqual(track)
    expect(command.invert(applied)).toEqual(base)
  })
})

describe('setClipPropertyCommand', () => {
  it('should apply the new property and revert to the old', () => {
    const clip = makeClip({ volume: 1 })
    const base = makeModel([clip])
    const command = setClipPropertyCommand(clip.id, { volume: 1 }, { volume: 0.3 })
    const applied = command.apply(base)
    expect(applied.clips[clip.id].volume).toBe(0.3)
    expect(command.invert(applied)).toEqual(base)
  })
})

describe('closeGapsCommand', () => {
  it('should move clips to their target starts and revert on invert', () => {
    const a = makeClip({ id: 'a', startOnTimeline: 3, sourceOut: 5 })
    const b = makeClip({ id: 'b', startOnTimeline: 12, sourceOut: 5 })
    const base = makeModel([a, b])
    const command = closeGapsCommand([
      { clipId: 'a', from: 3, to: 0 },
      { clipId: 'b', from: 12, to: 5 }
    ])
    const applied = command.apply(base)
    expect(applied.clips.a.startOnTimeline).toBe(0)
    expect(applied.clips.b.startOnTimeline).toBe(5)
    expect(command.invert(applied)).toEqual(base)
  })
})

describe('sequenceCommand', () => {
  it('should apply commands in order and invert them in reverse (ripple delete)', () => {
    const target = makeClip({ id: 'x', startOnTimeline: 0, sourceOut: 5 })
    const later = makeClip({ id: 'y', startOnTimeline: 5, sourceOut: 5 })
    const base = makeModel([target, later])
    // Ripple delete: remove 'x', then pull 'y' left into the freed 5s.
    const command = sequenceCommand([
      removeClipCommand(target),
      closeGapsCommand([{ clipId: 'y', from: 5, to: 0 }])
    ])
    const applied = command.apply(base)
    expect(applied.clips.x).toBeUndefined()
    expect(applied.clips.y.startOnTimeline).toBe(0)
    expect(command.invert(applied)).toEqual(base)
  })
})

describe('setMarkersCommand', () => {
  it('should set markers and restore the previous list on invert', () => {
    const base = makeModel([])
    const command = setMarkersCommand([], [2, 5])
    const applied = command.apply(base)
    expect(applied.markers).toEqual([2, 5])
    expect(command.invert(applied)).toEqual(base)
  })
})

describe('setTrackPropertyCommand', () => {
  it('should set a track property and restore it on invert', () => {
    const base = makeModel([])
    const command = setTrackPropertyCommand('t-video', { muted: false }, { muted: true })
    const applied = command.apply(base)
    expect(applied.tracks.find((track) => track.id === 't-video')?.muted).toBe(true)
    expect(command.invert(applied)).toEqual(base)
  })
})
