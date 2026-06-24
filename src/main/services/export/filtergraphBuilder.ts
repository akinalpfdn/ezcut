import {
  clipTimelineDuration,
  getTrackClips,
  getTracksSorted,
  isClipAudible,
  timelineDuration,
  type AudioFx,
  type MediaItem,
  type TimelineModel
} from '@shared'
import { AUDIO_FX_CONFIG } from '../../config/audioFx'

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
}

/** Resolves (generating if needed) the denoised proxy for a source. */
export type ProxyResolver = (mediaPath: string, strength: number) => Promise<string>

/** atempo only accepts 0.5..2.0; chain factors to reach any speed. Returns a
 * filter fragment ending with a comma (or "" for normal speed). */
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
 * Builds an ffmpeg filter_complex that reproduces the timeline: every clip is
 * trimmed, sped, normalized (scale/pad/setsar/fps/format) and positioned at its
 * timeline time (video via overlay on a black base, audio via adelay), then all
 * audio is mixed. Denoised clips draw audio from their proxy.
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

  const parts: string[] = [`color=c=black:s=${width}x${height}:r=${fps}:d=${durationSeconds.toFixed(3)}[base]`]
  const videoSegments: { label: string; start: number; end: number }[] = []
  const audioLabels: string[] = []

  let counter = 0
  for (const track of getTracksSorted(model)) {
    for (const clip of getTrackClips(model, track.id)) {
      const item = mediaById.get(clip.mediaId)
      if (!item) continue
      const speed = clip.speed > 0 ? clip.speed : 1
      const start = clip.startOnTimeline
      const end = start + clipTimelineDuration(clip)
      const index = counter++

      let videoInput: number | null = null
      const isImage = item.kind === 'image'
      if (track.kind === 'video' && (item.hasVideo || isImage)) {
        const label = `v${index}`
        const fit =
          `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
          `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps},format=yuv420p`
        if (isImage) {
          // Loop the still for the clip's span; no trim/speed (it has no source time).
          videoInput = addInput(item.path, ['-loop', '1', '-t', clipTimelineDuration(clip).toFixed(3)])
          parts.push(`[${videoInput}:v]setpts=PTS-STARTPTS+${start}/TB,${fit}[${label}]`)
        } else {
          videoInput = addInput(item.path)
          parts.push(
            `[${videoInput}:v]trim=start=${clip.sourceIn}:end=${clip.sourceOut},` +
              `setpts=(PTS-STARTPTS)/${speed}+${start}/TB,${fit}[${label}]`
          )
        }
        videoSegments.push({ label, start, end })
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
        const fades = audioFadeChain(clip.fadeIn, clip.fadeOut, clipTimelineDuration(clip))
        parts.push(
          `[${audioInput}:a]atrim=start=${clip.sourceIn}:end=${clip.sourceOut},asetpts=PTS-STARTPTS,` +
            `${atempoChain(speed)}${fx}${fades}volume=${clip.volume},adelay=${delayMs}:all=1[${label}]`
        )
        audioLabels.push(label)
      }
    }
  }

  // Overlay each video segment onto the black base at its time.
  let videoLabel = 'base'
  videoSegments.forEach((segment, i) => {
    const out = `vo${i}`
    parts.push(
      `[${videoLabel}][${segment.label}]overlay=enable='between(t,${segment.start.toFixed(3)},${segment.end.toFixed(3)})':eof_action=pass[${out}]`
    )
    videoLabel = out
  })

  let audioLabel: string | null = null
  if (audioLabels.length === 1) {
    audioLabel = audioLabels[0] ?? null
  } else if (audioLabels.length > 1) {
    audioLabel = 'aout'
    parts.push(`${audioLabels.map((label) => `[${label}]`).join('')}amix=inputs=${audioLabels.length}:normalize=0:dropout_transition=0[aout]`)
  }

  return { inputs, filterComplex: parts.join(';'), videoLabel, audioLabel, durationSeconds }
}
