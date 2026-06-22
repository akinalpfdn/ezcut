import { z } from 'zod'
import { resolveFfprobePath } from './binaryPaths'
import { runCommand } from './process'
import { parseToolVersion } from './versionParser'
import { FFPROBE_ARGS } from '../../config/ffmpegArgs'
import { AppError } from '../../core/AppError'
import { ErrorCodes, ErrorKeys } from '../../config/errors'
import type { MediaProbeResult, MediaStreamInfo, StreamKind } from '@shared'

// ffprobe emits many more fields than we read; z.object strips the rest. Validates
// that the bits we map are the expected types before mapProbe trusts them.
const ffprobeOutputSchema = z.object({
  streams: z
    .array(
      z.object({
        index: z.number(),
        codec_type: z.string().optional(),
        codec_name: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        r_frame_rate: z.string().optional(),
        sample_rate: z.string().optional(),
        channels: z.number().optional()
      })
    )
    .optional(),
  format: z
    .object({
      format_name: z.string().optional(),
      duration: z.string().optional(),
      size: z.string().optional(),
      bit_rate: z.string().optional()
    })
    .optional()
})

type RawFfprobeOutput = z.infer<typeof ffprobeOutputSchema>

export async function getFfprobeVersion(): Promise<string> {
  const { stdout } = await runCommand(resolveFfprobePath(), FFPROBE_ARGS.version)
  return parseToolVersion(stdout)
}

export async function probeMediaFile(filePath: string): Promise<MediaProbeResult> {
  const { stdout } = await runProbe(filePath)
  const probeParseError = (cause: unknown): AppError =>
    new AppError({
      code: ErrorCodes.probeParseFailed,
      messageKey: ErrorKeys.probeParseFailed,
      params: { path: filePath },
      detail: cause instanceof Error ? cause.message : String(cause),
      cause
    })

  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch (cause) {
    throw probeParseError(cause)
  }
  const result = ffprobeOutputSchema.safeParse(parsed)
  if (!result.success) throw probeParseError(result.error)
  return mapProbe(filePath, result.data)
}

async function runProbe(filePath: string): Promise<{ stdout: string }> {
  try {
    return await runCommand(resolveFfprobePath(), FFPROBE_ARGS.probe(filePath))
  } catch (cause) {
    // A spawn failure is a tooling problem; a non-zero exit means the file is
    // unreadable/unsupported. Keep the former, reframe the latter as probe failure.
    if (cause instanceof AppError && cause.code === ErrorCodes.ffmpegSpawnFailed) throw cause
    throw new AppError({
      code: ErrorCodes.probeFailed,
      messageKey: ErrorKeys.probeFailed,
      params: { path: filePath },
      detail: cause instanceof AppError ? cause.detail : String(cause),
      cause
    })
  }
}

/** ffprobe reports numeric fields as strings and may use "N/A"; coerce to a
 * finite number or undefined so durations/sizes/rates never become NaN. */
function finiteNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseFps(rate?: string): number | undefined {
  if (!rate) return undefined
  const [num, den] = rate.split('/').map(Number)
  if (!num || !den) return undefined
  const fps = num / den
  return Number.isFinite(fps) ? Math.round(fps * 1000) / 1000 : undefined
}

function toStreamKind(codecType?: string): StreamKind {
  if (codecType === 'video' || codecType === 'audio' || codecType === 'subtitle') return codecType
  return 'data'
}

function mapProbe(filePath: string, raw: RawFfprobeOutput): MediaProbeResult {
  const streams: MediaStreamInfo[] = (raw.streams ?? []).map((stream) => {
    const kind = toStreamKind(stream.codec_type)
    const info: MediaStreamInfo = {
      index: stream.index,
      kind,
      codecName: stream.codec_name ?? 'unknown'
    }
    if (kind === 'video') {
      if (stream.width) info.width = stream.width
      if (stream.height) info.height = stream.height
      const fps = parseFps(stream.r_frame_rate)
      if (fps) info.fps = fps
    } else if (kind === 'audio') {
      const sampleRate = finiteNumber(stream.sample_rate)
      if (sampleRate !== undefined) info.sampleRate = sampleRate
      if (stream.channels) info.channels = stream.channels
    }
    return info
  })

  const firstVideo = streams.find((stream) => stream.kind === 'video')
  const result: MediaProbeResult = {
    path: filePath,
    formatName: raw.format?.format_name ?? 'unknown',
    durationSeconds: finiteNumber(raw.format?.duration) ?? 0,
    sizeBytes: finiteNumber(raw.format?.size) ?? 0,
    streams,
    hasVideo: streams.some((stream) => stream.kind === 'video'),
    hasAudio: streams.some((stream) => stream.kind === 'audio')
  }
  const bitRate = finiteNumber(raw.format?.bit_rate)
  if (bitRate !== undefined) result.bitRate = bitRate
  if (firstVideo?.width) result.width = firstVideo.width
  if (firstVideo?.height) result.height = firstVideo.height
  if (firstVideo?.fps) result.fps = firstVideo.fps
  return result
}
