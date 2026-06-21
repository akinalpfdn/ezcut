import {
  clipTimelineDuration,
  getTrackClips,
  getTracksSorted,
  timelineDuration,
  type MediaItem,
  type TimelineModel
} from '@shared'

export interface FiltergraphResult {
  inputs: string[]
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

  const inputs: string[] = []
  const addInput = (path: string): number => inputs.push(path) - 1

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

      if (track.kind === 'video' && item.hasVideo) {
        const vIdx = addInput(item.path)
        const label = `v${index}`
        parts.push(
          `[${vIdx}:v]trim=start=${clip.sourceIn}:end=${clip.sourceOut},` +
            `setpts=(PTS-STARTPTS)/${speed}+${start}/TB,` +
            `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
            `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps},format=yuv420p[${label}]`
        )
        videoSegments.push({ label, start, end })
      }

      if (item.hasAudio) {
        let audioInput: number
        if (clip.denoise.enabled) {
          audioInput = addInput(await resolveProxy(item.path, clip.denoise.strength))
        } else if (track.kind === 'video' && item.hasVideo) {
          audioInput = inputs.length - 1 // reuse the original video input just added
        } else {
          audioInput = addInput(item.path)
        }
        const label = `a${index}`
        const delayMs = Math.round(start * 1000)
        parts.push(
          `[${audioInput}:a]atrim=start=${clip.sourceIn}:end=${clip.sourceOut},asetpts=PTS-STARTPTS,` +
            `${atempoChain(speed)}volume=${clip.volume},adelay=${delayMs}:all=1[${label}]`
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
