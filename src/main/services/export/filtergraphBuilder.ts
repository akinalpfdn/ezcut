import {
  clipTimelineDuration,
  getClipTransition,
  getTrackClips,
  getTracksSorted,
  isClipAudible,
  timelineDuration,
  type AudioFx,
  type Clip,
  type MediaItem,
  type TimelineModel,
  type TransitionType
} from '@shared'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AUDIO_FX_CONFIG } from '../../config/audioFx'
import { buildAssDocument } from './assBuilder'

/** Temp .ass filename for an export's text overlays. Exports run one at a time
 * (single ffmpeg child), so a fixed name is safe and lets ffmpeg reference it by
 * basename with cwd set to the temp dir — avoiding Windows filter path escaping. */
const ASS_FILENAME = 'ezcut-subtitles.ass'

/** Each transition type's ffmpeg `xfade` transition name. */
const XFADE_NAMES: Record<TransitionType, string> = {
  crossfade: 'fade',
  slideLeft: 'slideleft',
  slideRight: 'slideright',
  slideUp: 'slideup',
  slideDown: 'slidedown',
  zoomIn: 'zoomin',
  wipeLeft: 'wipeleft',
  wipeRight: 'wiperight',
  wipeUp: 'wipeup',
  wipeDown: 'wipedown',
  circleOpen: 'circleopen',
  circleClose: 'circleclose'
}

export interface ExportInput {
  path: string
  /** Extra ffmpeg flags placed before `-i` (e.g. `-loop 1 -t <dur>` for images). */
  args?: string[]
}

export interface FiltergraphResult {
  inputs: ExportInput[]
  filterComplex: string
  videoLabel: string
  audioLabel: string | null
  durationSeconds: number
  /** ASS subtitle file for text overlays: the caller writes `content` to `path`
   * before running ffmpeg (which references it by basename, cwd = its dir) and
   * deletes it after. Null when there are no text overlays. */
  assFile: { path: string; content: string } | null
}

/** Resolves (generating if needed) the denoised proxy for a source. */
export type ProxyResolver = (mediaPath: string, strength: number) => Promise<string>

/** atempo only accepts 0.5..2.0; chain factors to reach any speed. Returns a
 * filter fragment ending with a comma (or "" for normal speed). Pitch-preserving
 * (tempo change only). */
function atempoChain(speed: number): string {
  if (speed === 1) return ''
  const parts: string[] = []
  let remaining = speed
  while (remaining < 0.5) {
    parts.push('atempo=0.5')
    remaining /= 0.5
  }
  while (remaining > 2) {
    parts.push('atempo=2.0')
    remaining /= 2
  }
  parts.push(`atempo=${remaining.toFixed(4)}`)
  return `${parts.join(',')},`
}

/** Sample rate the non-pitch-preserving path normalizes to, so `asetrate` gives a
 * pitch factor of exactly `speed` regardless of the source's real rate. */
const RESAMPLE_HZ = 48000

/**
 * Per-clip speed change for audio (trailing comma), or "" at 1x. When
 * `preservePitch` is true, uses `atempo` (tempo change, pitch kept — the default).
 * When false, resamples via `asetrate` so the audio pitches up/down with speed
 * (the classic tape effect); the stream is forced to a known rate first so the
 * pitch factor is exactly `speed` no matter the source rate.
 */
export function speedAudioChain(speed: number, preservePitch: boolean): string {
  if (speed === 1) return ''
  if (preservePitch) return atempoChain(speed)
  return `aresample=${RESAMPLE_HZ},asetrate=${Math.round(RESAMPLE_HZ * speed)},aresample=${RESAMPLE_HZ},`
}

/**
 * Per-clip audio cleanup/enhancement fragment (trailing comma), or "" if none.
 * Order: gate → EQ → compressor → loudnorm, so noise is removed first and final
 * loudness normalization sees the processed signal.
 */
export function buildAudioFxChain(fx: AudioFx): string {
  const segments: string[] = []
  if (fx.gate) segments.push(AUDIO_FX_CONFIG.gate)
  if (fx.eq) {
    segments.push(`bass=g=${fx.eqLow}:f=${AUDIO_FX_CONFIG.eq.lowFreq}`)
    segments.push(
      `equalizer=f=${AUDIO_FX_CONFIG.eq.midFreq}:width_type=o:width=${AUDIO_FX_CONFIG.eq.midWidth}:g=${fx.eqMid}`
    )
    segments.push(`treble=g=${fx.eqHigh}:f=${AUDIO_FX_CONFIG.eq.highFreq}`)
  }
  if (fx.compressor) segments.push(AUDIO_FX_CONFIG.compressor)
  if (fx.normalize) segments.push(AUDIO_FX_CONFIG.loudnorm)
  return segments.length > 0 ? `${segments.join(',')},` : ''
}

/** afade fragment (trailing comma) for a clip's edge fades, or "" for none. */
function audioFadeChain(fadeIn: number, fadeOut: number, clipDur: number): string {
  const segments: string[] = []
  const fi = Math.max(0, Math.min(fadeIn, clipDur))
  const fo = Math.max(0, Math.min(fadeOut, clipDur))
  if (fi > 0) segments.push(`afade=t=in:st=0:d=${fi.toFixed(4)}`)
  if (fo > 0) segments.push(`afade=t=out:st=${Math.max(0, clipDur - fo).toFixed(4)}:d=${fo.toFixed(4)}`)
  return segments.length > 0 ? `${segments.join(',')},` : ''
}

/**
 * Builds an ffmpeg filter_complex that reproduces the timeline. Video: each clip is
 * trimmed/sped/normalized into a 0-based stream, then folded into one chain —
 * `xfade` joins clips with a transition, `concat` joins the rest (black fills gaps
 * and pads the ends to the timeline duration). Audio: each clip is positioned with
 * adelay and all are mixed. Denoised clips draw audio from their proxy.
 */
export async function buildFiltergraph(
  model: TimelineModel,
  media: MediaItem[],
  options: { width: number; height: number; fps: number },
  resolveProxy: ProxyResolver
): Promise<FiltergraphResult> {
  const durationSeconds = timelineDuration(model)
  if (durationSeconds <= 0) throw new Error('Timeline is empty')

  const mediaById = new Map(media.map((item) => [item.id, item]))
  const { width, height, fps } = options

  const inputs: ExportInput[] = []
  const addInput = (path: string, args?: string[]): number => inputs.push({ path, args }) - 1

  const parts: string[] = []
  const audioLabels: string[] = []
  const videoStreams: { clip: Clip; label: string; length: number }[] = []

  let chainCounter = 0
  // Black filler of `len` seconds, normalized so it concats/xfades with clip streams.
  const blackLabel = (len: number): string => {
    const out = `blk${chainCounter++}`
    parts.push(`color=c=black:s=${width}x${height}:r=${fps}:d=${len.toFixed(3)},setsar=1,format=yuv420p[${out}]`)
    return out
  }
  const concatTwo = (a: string, b: string): string => {
    const out = `vc${chainCounter++}`
    parts.push(`[${a}][${b}]concat=n=2:v=1:a=0[${out}]`)
    return out
  }
  const xfadeTwo = (a: string, b: string, name: string, dur: number, offset: number): string => {
    const out = `vx${chainCounter++}`
    parts.push(`[${a}][${b}]xfade=transition=${name}:duration=${dur.toFixed(3)}:offset=${offset.toFixed(3)}[${out}]`)
    return out
  }

  // Incoming-clip id -> transition duration, so the audio of the incoming clip can
  // fade in over the overlap (the fade-out half is on the outgoing clip) — an
  // audio crossfade that lines up with the video transition.
  const incomingTransitionDuration = new Map<string, number>()
  for (const track of getTracksSorted(model)) {
    for (const clip of getTrackClips(model, track.id)) {
      const transition = getClipTransition(model, clip)
      if (transition) incomingTransitionDuration.set(transition.next.id, transition.duration)
    }
  }

  let counter = 0
  for (const track of getTracksSorted(model)) {
    for (const clip of getTrackClips(model, track.id)) {
      const item = mediaById.get(clip.mediaId)
      if (!item) continue
      const speed = clip.speed > 0 ? clip.speed : 1
      const start = clip.startOnTimeline
      const length = clipTimelineDuration(clip)
      const index = counter++

      let videoInput: number | null = null
      const isImage = item.kind === 'image'
      if (track.kind === 'video' && (item.hasVideo || isImage)) {
        const label = `v${index}`
        // Normalized, 0-based stream — the chain (below) sequences clips via
        // concat/xfade, so no timeline positioning here. Always yuv420p; xfade blends.
        const prefix = isImage
          ? // Loop the still for the clip's span; no trim/speed (it has no source time).
            `[${(videoInput = addInput(item.path, ['-loop', '1', '-t', length.toFixed(3)]))}:v]setpts=PTS-STARTPTS`
          : `[${(videoInput = addInput(item.path))}:v]trim=start=${clip.sourceIn}:end=${clip.sourceOut},setpts=(PTS-STARTPTS)/${speed}`

        const transformed = clip.scale !== 1 || clip.posX !== 0 || clip.posY !== 0
        if (!transformed) {
          // Contain-fit, centred (the default).
          parts.push(
            `${prefix},scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
              `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps},format=yuv420p[${label}]`
          )
        } else {
          // Scale the contain-fit by clip.scale, then overlay onto a black frame at the
          // pan offset (overlay crops what spills past the frame). Mirrors the preview.
          const scaled = `sc${chainCounter++}`
          const bg = `bg${chainCounter++}`
          parts.push(
            `${prefix},scale=${Math.round(width * clip.scale)}:${Math.round(height * clip.scale)}:` +
              `force_original_aspect_ratio=decrease,setsar=1,fps=${fps},format=yuv420p[${scaled}]`
          )
          parts.push(`color=c=black:s=${width}x${height}:r=${fps}:d=${length.toFixed(3)},format=yuv420p[${bg}]`)
          parts.push(
            `[${bg}][${scaled}]overlay=x=(W-w)/2+(${clip.posX.toFixed(4)})*W:` +
              `y=(H-h)/2+(${clip.posY.toFixed(4)})*H:shortest=1,format=yuv420p[${label}]`
          )
        }
        videoStreams.push({ clip, label, length })
      }

      if (item.hasAudio && isClipAudible(model, clip)) {
        let audioInput: number
        if (clip.denoise.enabled) {
          audioInput = addInput(await resolveProxy(item.path, clip.denoise.strength))
        } else if (videoInput !== null) {
          audioInput = videoInput // reuse the original video input added above
        } else {
          audioInput = addInput(item.path)
        }
        const label = `a${index}`
        const delayMs = Math.round(start * 1000)
        const fx = buildAudioFxChain(clip.audioFx)
        const fades = audioFadeChain(clip.fadeIn, clip.fadeOut, length)
        // Crossfade audio: fade out over an outgoing transition, fade in over an
        // incoming one — the two halves overlap to dissolve the audio with the video.
        const crossOut = getClipTransition(model, clip)?.duration ?? 0
        const crossIn = incomingTransitionDuration.get(clip.id) ?? 0
        const crossFades = audioFadeChain(crossIn, crossOut, length)
        parts.push(
          `[${audioInput}:a]atrim=start=${clip.sourceIn}:end=${clip.sourceOut},asetpts=PTS-STARTPTS,` +
            `${speedAudioChain(speed, clip.preservePitch)}${fx}${fades}${crossFades}volume=${clip.volume},adelay=${delayMs}:all=1[${label}]`
        )
        audioLabels.push(label)
      }
    }
  }

  // Fold the video streams into one chain: xfade where a transition joins two
  // clips, concat (with black filling gaps) otherwise, then black-pad to duration.
  const EPS = 0.001
  let videoLabel: string
  if (videoStreams.length === 0) {
    videoLabel = blackLabel(durationSeconds)
  } else {
    let chain = ''
    let chainLen = 0
    videoStreams.forEach(({ clip, label, length }, i) => {
      if (i === 0) {
        if (clip.startOnTimeline > EPS) {
          chain = concatTwo(blackLabel(clip.startOnTimeline), label)
          chainLen = clip.startOnTimeline + length
        } else {
          chain = label
          chainLen = length
        }
        return
      }
      const prev = videoStreams[i - 1].clip
      const transition = getClipTransition(model, prev)
      if (transition && transition.next.id === clip.id) {
        const offset = Math.max(0, chainLen - transition.duration)
        chain = xfadeTwo(chain, label, XFADE_NAMES[transition.type], transition.duration, offset)
        chainLen = chainLen + length - transition.duration
      } else {
        const gap = clip.startOnTimeline - chainLen
        if (gap > EPS) {
          chain = concatTwo(chain, blackLabel(gap))
          chainLen += gap
        }
        chain = concatTwo(chain, label)
        chainLen += length
      }
    })
    if (chainLen < durationSeconds - EPS) {
      chain = concatTwo(chain, blackLabel(durationSeconds - chainLen))
    }
    videoLabel = chain
  }

  // Text overlays: rendered via libass. Generate an .ass document and burn it in
  // with the `subtitles` filter. The file is referenced by basename (ffmpeg runs
  // with cwd = its dir), so no absolute Windows path enters the filtergraph.
  let assFile: { path: string; content: string } | null = null
  if (model.textOverlays.length > 0) {
    assFile = {
      path: join(tmpdir(), ASS_FILENAME),
      content: buildAssDocument(model.textOverlays, width, height)
    }
    const out = `tx${chainCounter++}`
    parts.push(`[${videoLabel}]subtitles=f='${ASS_FILENAME}'[${out}]`)
    videoLabel = out
  }

  let audioLabel: string | null = null
  if (audioLabels.length === 1) {
    audioLabel = audioLabels[0] ?? null
  } else if (audioLabels.length > 1) {
    audioLabel = 'aout'
    parts.push(`${audioLabels.map((label) => `[${label}]`).join('')}amix=inputs=${audioLabels.length}:normalize=0:dropout_transition=0[aout]`)
  }

  return { inputs, filterComplex: parts.join(';'), videoLabel, audioLabel, durationSeconds, assFile }
}
