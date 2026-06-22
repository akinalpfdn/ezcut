import { describe, expect, it } from 'vitest'
import {
  clipTimelineDuration,
  clipTimelineEnd,
  getTrackClips,
  getTracksSorted,
  nextClipStart,
  previousClipEnd,
  resolveNonOverlappingStart,
  timelineDuration,
  timelineTimeToSource
} from './model'
import type { Clip, TimelineModel } from './types'

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
    denoise: { enabled: false, strength: 0.5 },
    ...overrides
  }
}

function makeModel(clips: Clip[]): TimelineModel {
  return {
    tracks: [
      { id: 't-video', kind: 'video', index: 0, label: 'V1' },
      { id: 't-audio', kind: 'audio', index: 1, label: 'A1' }
    ],
    clips: Object.fromEntries(clips.map((clip) => [clip.id, clip]))
  }
}

describe('clipTimelineDuration', () => {
  it('should equal the source length at 1x speed', () => {
    expect(clipTimelineDuration(makeClip({ sourceIn: 2, sourceOut: 12 }))).toBe(10)
  })

  it('should shrink the timeline length when sped up', () => {
    expect(clipTimelineDuration(makeClip({ sourceIn: 0, sourceOut: 10, speed: 2 }))).toBe(5)
  })

  it('should treat a non-positive speed as 1x', () => {
    expect(clipTimelineDuration(makeClip({ sourceOut: 10, speed: 0 }))).toBe(10)
  })

  it('should never be negative when out precedes in', () => {
    expect(clipTimelineDuration(makeClip({ sourceIn: 5, sourceOut: 1 }))).toBe(0)
  })
})

describe('clipTimelineEnd', () => {
  it('should be the start plus the timeline duration', () => {
    expect(clipTimelineEnd(makeClip({ startOnTimeline: 3, sourceOut: 10, speed: 2 }))).toBe(8)
  })
})

describe('timelineTimeToSource', () => {
  it('should map a timeline time to source time accounting for speed and in-point', () => {
    const clip = makeClip({ startOnTimeline: 4, sourceIn: 2, speed: 2 })
    expect(timelineTimeToSource(clip, 7)).toBe(2 + (7 - 4) * 2)
  })

  it('should round-trip with clipTimelineEnd at 1x', () => {
    const clip = makeClip({ startOnTimeline: 5, sourceIn: 1, sourceOut: 9 })
    expect(timelineTimeToSource(clip, clipTimelineEnd(clip))).toBe(clip.sourceOut)
  })
})

describe('timelineDuration', () => {
  it('should be zero for an empty timeline', () => {
    expect(timelineDuration(makeModel([]))).toBe(0)
  })

  it('should be the latest clip end across tracks', () => {
    const model = makeModel([
      makeClip({ id: 'a', startOnTimeline: 0, sourceOut: 5 }),
      makeClip({ id: 'b', trackId: 't-audio', startOnTimeline: 8, sourceOut: 4 })
    ])
    expect(timelineDuration(model)).toBe(12)
  })
})

describe('getTrackClips', () => {
  it('should return only the track clips, ordered by start', () => {
    const model = makeModel([
      makeClip({ id: 'a', startOnTimeline: 6 }),
      makeClip({ id: 'b', startOnTimeline: 1 }),
      makeClip({ id: 'x', trackId: 't-audio', startOnTimeline: 0 })
    ])
    expect(getTrackClips(model, 't-video').map((clip) => clip.id)).toEqual(['b', 'a'])
  })
})

describe('getTracksSorted', () => {
  it('should order tracks by index', () => {
    const model: TimelineModel = {
      tracks: [
        { id: 'a', kind: 'audio', index: 2, label: 'A1' },
        { id: 'v', kind: 'video', index: 0, label: 'V1' }
      ],
      clips: {}
    }
    expect(getTracksSorted(model).map((track) => track.id)).toEqual(['v', 'a'])
  })
})

describe('resolveNonOverlappingStart', () => {
  it('should keep the desired start when the track is empty', () => {
    expect(resolveNonOverlappingStart(makeModel([]), 't-video', 3, 5)).toBe(3)
  })

  it('should push a colliding drop to the end of the clip it hits', () => {
    const model = makeModel([makeClip({ id: 'a', startOnTimeline: 0, sourceOut: 10 })])
    // desired start 4 overlaps [0,10) -> pushed to 10
    expect(resolveNonOverlappingStart(model, 't-video', 4, 5)).toBe(10)
  })

  it('should fit into a gap large enough between two clips', () => {
    const model = makeModel([
      makeClip({ id: 'a', startOnTimeline: 0, sourceOut: 5 }),
      makeClip({ id: 'b', startOnTimeline: 10, sourceOut: 5 })
    ])
    expect(resolveNonOverlappingStart(model, 't-video', 6, 2)).toBe(6)
  })

  it('should ignore the excluded clip (moving a clip over its own slot)', () => {
    const model = makeModel([makeClip({ id: 'a', startOnTimeline: 0, sourceOut: 10 })])
    expect(resolveNonOverlappingStart(model, 't-video', 2, 3, 'a')).toBe(2)
  })

  it('should never return a negative start', () => {
    expect(resolveNonOverlappingStart(makeModel([]), 't-video', -5, 2)).toBe(0)
  })
})

describe('previousClipEnd', () => {
  it('should return 0 when nothing precedes the reference', () => {
    const model = makeModel([makeClip({ id: 'a', startOnTimeline: 5, sourceOut: 5 })])
    expect(previousClipEnd(model, 't-video', 2)).toBe(0)
  })

  it('should return the end of the nearest clip to the left', () => {
    const model = makeModel([
      makeClip({ id: 'a', startOnTimeline: 0, sourceOut: 5 }),
      makeClip({ id: 'b', startOnTimeline: 10, sourceOut: 5 })
    ])
    expect(previousClipEnd(model, 't-video', 12)).toBe(15)
  })
})

describe('nextClipStart', () => {
  it('should return Infinity when nothing follows the reference', () => {
    const model = makeModel([makeClip({ id: 'a', startOnTimeline: 0, sourceOut: 5 })])
    expect(nextClipStart(model, 't-video', 6)).toBe(Number.POSITIVE_INFINITY)
  })

  it('should return the start of the nearest clip to the right', () => {
    const model = makeModel([
      makeClip({ id: 'a', startOnTimeline: 0, sourceOut: 5 }),
      makeClip({ id: 'b', startOnTimeline: 10, sourceOut: 5 })
    ])
    expect(nextClipStart(model, 't-video', 2)).toBe(10)
  })
})
