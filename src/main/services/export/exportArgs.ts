import type { ExportRequest } from '@shared'
import { CONTAINER_PROFILES, QUALITY_CRF } from '../../config/export'
import type { FiltergraphResult } from './filtergraphBuilder'

/** Assembles the ffmpeg argument list for an export from the filtergraph + the
 * container/quality profile. Kept out of runExport so the orchestration (spawn,
 * progress, cancellation) stays separate from the (long) arg construction. */
export function buildExportArgs(
  graph: FiltergraphResult,
  options: ExportRequest['options'],
  outputPath: string
): string[] {
  const profile = CONTAINER_PROFILES[options.container]
  const isVp9 = profile.videoCodec.includes('vp9')
  // webm is always VP9; mp4/mov honor the codec choice (H.265 ≈ half the size).
  const useH265 = !isVp9 && options.codec === 'h265'
  const videoCodec = isVp9 ? profile.videoCodec : useH265 ? 'libx265' : 'libx264'
  const crf = isVp9
    ? QUALITY_CRF[options.quality].vp9
    : useH265
      ? QUALITY_CRF[options.quality].x265
      : QUALITY_CRF[options.quality].x264

  const args: string[] = ['-y']
  for (const input of graph.inputs) {
    if (input.args) args.push(...input.args)
    args.push('-i', input.path)
  }
  args.push('-filter_complex', graph.filterComplex)
  args.push('-map', `[${graph.videoLabel}]`)
  if (graph.audioLabel) args.push('-map', `[${graph.audioLabel}]`)
  args.push('-c:v', videoCodec, '-crf', String(crf), '-pix_fmt', 'yuv420p')
  if (videoCodec === 'libx264' || videoCodec === 'libx265') args.push('-preset', 'medium')
  // hvc1 tag so HEVC mp4/mov plays in QuickTime / Windows / Apple devices.
  if (useH265) args.push('-tag:v', 'hvc1')
  if (graph.audioLabel) args.push('-c:a', profile.audioCodec)
  args.push('-t', graph.durationSeconds.toFixed(3), outputPath)
  return args
}
