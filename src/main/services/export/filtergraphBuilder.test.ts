import { describe, expect, it } from 'vitest'
import { DEFAULT_AUDIO_FX, type MediaItem, type TimelineModel } from '@shared'
import { buildAudioFxChain, buildFiltergraph } from './filtergraphBuilder'

function imageModel(): TimelineModel {
  return {
    tracks: [{ id: 'v', kind: 'video', index: 0, label: 'V1', muted: false, solo: false }],
    clips: {
      c1: {
        id: 'c1',
        mediaId: 'img',
        trackId: 'v',
        startOnTimeline: 2,
        sourceIn: 0,
        sourceOut: 5,
        speed: 1,
        volume: 1,
        fadeIn: 0,
        fadeOut: 0,
        muted: false,
        denoise: { enabled: false, strength: 0.5 },
        audioFx: DEFAULT_AUDIO_FX
      }
    },
    markers: []
  }
}

const imageMedia: MediaItem[] = [
  {
    id: 'img',
    path: '/x/pic.png',
    name: 'pic.png',
    kind: 'image',
    durationSeconds: 5,
    sizeBytes: 100,
    hasVideo: false,
    hasAudio: false,
    width: 800,
    height: 600
  }
]

function videoClip(id: string, mediaId: string, start: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    mediaId,
    trackId: 'v',
    startOnTimeline: start,
    sourceIn: 0,
    sourceOut: 3,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    muted: false,
    denoise: { enabled: false, strength: 0.5 },
    audioFx: DEFAULT_AUDIO_FX,
    ...extra
  }
}

const crossfadeModel: TimelineModel = {
  tracks: [{ id: 'v', kind: 'video', index: 0, label: 'V1', muted: false, solo: false }],
  clips: {
    // 'a' ends at 3 and 'b' starts at 2 → they overlap by 1s (the crossfade).
    a: videoClip('a', 'va', 0, { transitionOut: { type: 'crossfade', duration: 1 } }),
    b: videoClip('b', 'vb', 2)
  },
  markers: []
}

const videoMedia: MediaItem[] = [
  { id: 'va', path: '/a.mp4', name: 'a', kind: 'video', durationSeconds: 3, sizeBytes: 1, hasVideo: true, hasAudio: false, width: 1920, height: 1080 },
  { id: 'vb', path: '/b.mp4', name: 'b', kind: 'video', durationSeconds: 3, sizeBytes: 1, hasVideo: true, hasAudio: false, width: 1920, height: 1080 }
]

describe('buildAudioFxChain', () => {
  it('should return empty when no effect is enabled', () => {
    expect(buildAudioFxChain(DEFAULT_AUDIO_FX)).toBe('')
  })

  it('should chain gate -> eq -> compressor -> loudnorm with a trailing comma', () => {
    const chain = buildAudioFxChain({
      ...DEFAULT_AUDIO_FX,
      normalize: true,
      gate: true,
      compressor: true,
      eq: true,
      eqLow: 2,
      eqMid: -1,
      eqHigh: 3
    })
    expect(chain.endsWith(',')).toBe(true)
    expect(chain.indexOf('agate')).toBeLessThan(chain.indexOf('bass'))
    expect(chain.indexOf('bass')).toBeLessThan(chain.indexOf('acompressor'))
    expect(chain.indexOf('acompressor')).toBeLessThan(chain.indexOf('loudnorm'))
    expect(chain).toContain('bass=g=2')
    expect(chain).toContain('treble=g=3')
  })

  it('should include only the enabled effects', () => {
    const chain = buildAudioFxChain({ ...DEFAULT_AUDIO_FX, normalize: true })
    expect(chain).toContain('loudnorm')
    expect(chain).not.toContain('agate')
    expect(chain).not.toContain('acompressor')
  })
})

describe('buildFiltergraph (images)', () => {
  it('should add a looped image input and overlay it without trimming or audio', async () => {
    const graph = await buildFiltergraph(
      imageModel(),
      imageMedia,
      { width: 1280, height: 720, fps: 30 },
      async () => ''
    )
    expect(graph.inputs).toHaveLength(1)
    expect(graph.inputs[0].path).toBe('/x/pic.png')
    expect(graph.inputs[0].args).toEqual(['-loop', '1', '-t', '5.000'])
    expect(graph.audioLabel).toBeNull()
    expect(graph.filterComplex).toContain('overlay')
    expect(graph.filterComplex).not.toContain('trim=')
  })
})

describe('buildFiltergraph (crossfade)', () => {
  it('should fade the incoming clip alpha in over the overlap', async () => {
    const graph = await buildFiltergraph(
      crossfadeModel,
      videoMedia,
      { width: 1280, height: 720, fps: 30 },
      async () => ''
    )
    // Incoming clip 'b' (starts at 2) gets an alpha channel + alpha fade over [2,3].
    expect(graph.filterComplex).toContain('format=yuva420p')
    expect(graph.filterComplex).toContain('fade=t=in:st=2.000:d=1.000:alpha=1')
  })
})
