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
    markers: [],
    textOverlays: []
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

function transitionModel(type: string): TimelineModel {
  return {
    tracks: [{ id: 'v', kind: 'video', index: 0, label: 'V1', muted: false, solo: false }],
    clips: {
      // 'a' ends at 3 and 'b' starts at 2 → they overlap by 1s (the transition).
      a: videoClip('a', 'va', 0, { transitionOut: { type, duration: 1 } }),
      b: videoClip('b', 'vb', 2)
    },
    markers: [],
    textOverlays: []
  }
}

const crossfadeModel = transitionModel('crossfade')

const videoMedia: MediaItem[] = [
  { id: 'va', path: '/a.mp4', name: 'a', kind: 'video', durationSeconds: 3, sizeBytes: 1, hasVideo: true, hasAudio: false, width: 1920, height: 1080 },
  { id: 'vb', path: '/b.mp4', name: 'b', kind: 'video', durationSeconds: 3, sizeBytes: 1, hasVideo: true, hasAudio: false, width: 1920, height: 1080 }
]

const avMedia: MediaItem[] = [
  { id: 'va', path: '/a.mp4', name: 'a', kind: 'video', durationSeconds: 3, sizeBytes: 1, hasVideo: true, hasAudio: true, width: 1920, height: 1080 },
  { id: 'vb', path: '/b.mp4', name: 'b', kind: 'video', durationSeconds: 3, sizeBytes: 1, hasVideo: true, hasAudio: true, width: 1920, height: 1080 }
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
    // Image starts at 2s → leading black is concatenated before it; no trim on the still.
    expect(graph.filterComplex).toContain('concat')
    expect(graph.filterComplex).not.toContain('trim=')
  })
})

describe('buildFiltergraph (transitions via xfade)', () => {
  it('should xfade the two clips with the right offset for a crossfade', async () => {
    const graph = await buildFiltergraph(
      crossfadeModel,
      videoMedia,
      { width: 1280, height: 720, fps: 30 },
      async () => ''
    )
    // 'a' (0..3) then 'b' overlap 1s → xfade 'fade' starting at offset 3-1 = 2.
    expect(graph.filterComplex).toContain('xfade=transition=fade:duration=1.000:offset=2.000')
  })

  it('should map a slide to its xfade transition name', async () => {
    const graph = await buildFiltergraph(
      transitionModel('slideLeft'),
      videoMedia,
      { width: 1280, height: 720, fps: 30 },
      async () => ''
    )
    expect(graph.filterComplex).toContain('xfade=transition=slideleft:duration=1.000:offset=2.000')
  })

  it('should crossfade the audio across a transition', async () => {
    const graph = await buildFiltergraph(
      transitionModel('crossfade'),
      avMedia,
      { width: 1280, height: 720, fps: 30 },
      async () => ''
    )
    // Incoming 'b' fades its audio in over [0,1]; outgoing 'a' fades out over its last 1s.
    expect(graph.filterComplex).toContain('afade=t=in:st=0:d=1.0000')
    expect(graph.filterComplex).toContain('afade=t=out:st=2.0000:d=1.0000')
  })

  it('should concat adjacent clips with no transition (no xfade)', async () => {
    const model = transitionModel('crossfade')
    // Drop the transition + place 'b' adjacent at 3.
    delete (model.clips.a as { transitionOut?: unknown }).transitionOut
    model.clips.b.startOnTimeline = 3
    const graph = await buildFiltergraph(model, videoMedia, { width: 1280, height: 720, fps: 30 }, async () => '')
    expect(graph.filterComplex).toContain('concat')
    expect(graph.filterComplex).not.toContain('xfade')
  })
})

function textModel(text: string): TimelineModel {
  const model = imageModel()
  model.textOverlays = [
    {
      id: 't1',
      text,
      start: 0,
      duration: 5,
      x: 0.5,
      y: 0.5,
      fontSize: 0.1,
      color: '#ffffff',
      background: false,
      fontFamily: 'sans',
      align: 'center',
      bold: true,
      italic: false,
      outlineColor: '#000000',
      outlineWidth: 0,
      boxColor: '#000000',
      boxOpacity: 0.5,
      boxRadius: 0,
      boxPadding: 0.25,
      opacity: 1,
      rotation: 0,
      animationIn: 'none',
      animationOut: 'none',
      animInDuration: 0.4,
      animOutDuration: 0.4
    }
  ]
  return model
}

const render = { width: 1280, height: 720, fps: 30 }

describe('buildFiltergraph (text overlays via ASS)', () => {
  it('should burn in an ASS subtitle file when there are overlays', async () => {
    const graph = await buildFiltergraph(textModel('Hello'), imageMedia, render, async () => '')
    expect(graph.filterComplex).toContain("subtitles=f='ezcut-subtitles.ass'")
    expect(graph.assFile).not.toBeNull()
    expect(graph.assFile?.content).toContain('Dialogue:')
    // Referenced by basename so the export can run with cwd = the temp dir.
    expect(graph.assFile?.path.endsWith('ezcut-subtitles.ass')).toBe(true)
  })

  it('should not produce an ASS file when there are no overlays', async () => {
    const graph = await buildFiltergraph(imageModel(), imageMedia, render, async () => '')
    expect(graph.assFile).toBeNull()
    expect(graph.filterComplex).not.toContain('subtitles=')
  })
})
