import { resolveFfprobePath } from './binaryPaths'
import { runCommand } from './process'
import { parseToolVersion } from './versionParser'
import { FFPROBE_ARGS } from '../../config/ffmpegArgs'
import { AppError } from '../../core/AppError'
import { ErrorCodes, ErrorKeys } from '../../config/errors'
import type { MediaProbeResult, MediaStreamInfo, StreamKind } from '@shared'

interface RawFfprobeStream {
  index: number
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  r_frame_rate?: string
  sample_rate?: string
  channels?: number
}

interface RawFfprobeFormat {
  format_name?: string
  duration?: string
  size?: string
  bit_rate?: string
}

interface RawFfprobeOutput {
  streams?: RawFfprobeStream[]
  format?: RawFfprobeFormat
}

export async function getFfprobeVersion(): Promise<string> {
  const { stdout } = await runCommand(resolveFfprobePath(), FFPROBE_ARGS.version)
  return parseToolVersion(stdout)
}

export async function probeMediaFile(filePath: string): Promise<MediaProbeResult> {
  const { stdout } = await runProbe(filePath)
  let raw: RawFfprobeOutput
  try {
    raw = JSON.parse(stdout) as RawFfprobeOutput
  } catch (cause) {
    throw new AppError({
      code: ErrorCodes.probeParseFailed,
      messageKey: ErrorKeys.probeParseFailed,
      params: { path: filePath },
      detail: cause instanceof Error ? cause.message : String(cause),
      cause
    })
  }
  return mapProbe(filePath, raw)
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
      if (stream.sample_rate) info.sampleRate = Number(stream.sample_rate)
      if (stream.channels) info.channels = stream.channels
    }
    return info
  })

  const firstVideo = streams.find((stream) => stream.kind === 'video')
  const result: MediaProbeResult = {
    path: filePath,
    formatName: raw.format?.format_name ?? 'unknown',
    durationSeconds: raw.format?.duration ? Number(raw.format.duration) : 0,
    sizeBytes: raw.format?.size ? Number(raw.format.size) : 0,
    streams,
    hasVideo: streams.some((stream) => stream.kind === 'video'),
    hasAudio: streams.some((stream) => stream.kind === 'audio')
  }
  if (raw.format?.bit_rate) result.bitRate = Number(raw.format.bit_rate)
  if (firstVideo?.width) result.width = firstVideo.width
  if (firstVideo?.height) result.height = firstVideo.height
  if (firstVideo?.fps) result.fps = firstVideo.fps
  return result
}
