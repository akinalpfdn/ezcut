import { z } from 'zod'
import { DEFAULT_AUDIO_FX, type AppSettings, type ProjectFile } from '@shared'

// Schemas for persisted JSON (settings, project, autosave). These files can be
// hand-edited, corrupted, or written by an older version, so they're validated on
// load rather than trusted via an `as` cast — an invalid file is rejected and the
// caller falls back gracefully instead of loading malformed data downstream.

const denoiseSchema = z.object({
  enabled: z.boolean(),
  strength: z.number()
})

const audioFxSchema = z.object({
  normalize: z.boolean(),
  gate: z.boolean(),
  compressor: z.boolean(),
  eq: z.boolean(),
  eqLow: z.number(),
  eqMid: z.number(),
  eqHigh: z.number()
})

const clipSchema = z.object({
  id: z.string(),
  mediaId: z.string(),
  trackId: z.string(),
  startOnTimeline: z.number(),
  sourceIn: z.number(),
  sourceOut: z.number(),
  speed: z.number(),
  volume: z.number(),
  // Defaulted so projects predating fades/mute still load.
  fadeIn: z.number().default(0),
  fadeOut: z.number().default(0),
  muted: z.boolean().default(false),
  denoise: denoiseSchema,
  audioFx: audioFxSchema.default(DEFAULT_AUDIO_FX),
  transitionOut: z
    .object({
      type: z.enum([
        'crossfade',
        'slideLeft',
        'slideRight',
        'slideUp',
        'slideDown',
        'zoomIn',
        'wipeLeft',
        'wipeRight',
        'wipeUp',
        'wipeDown',
        'circleOpen',
        'circleClose'
      ]),
      duration: z.number()
    })
    .optional()
})

const trackSchema = z.object({
  id: z.string(),
  kind: z.enum(['video', 'audio']),
  index: z.number(),
  label: z.string(),
  muted: z.boolean().default(false),
  solo: z.boolean().default(false)
})

const waveformSchema = z.object({
  peaks: z.array(z.number()),
  bucketCount: z.number()
})

const mediaItemSchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  kind: z.enum(['video', 'audio', 'image']),
  durationSeconds: z.number(),
  sizeBytes: z.number(),
  hasVideo: z.boolean(),
  hasAudio: z.boolean(),
  width: z.number().optional(),
  height: z.number().optional(),
  fps: z.number().optional(),
  thumbnailPath: z.string().optional(),
  waveform: waveformSchema.optional(),
  needsProxy: z.boolean().optional()
})

const textOverlaySchema = z.object({
  id: z.string(),
  text: z.string(),
  start: z.number(),
  duration: z.number(),
  x: z.number(),
  y: z.number(),
  fontSize: z.number(),
  color: z.string(),
  fillType: z.enum(['solid', 'linear', 'radial']).default('solid'),
  gradientFrom: z.string().default('#ff5e62'),
  gradientTo: z.string().default('#ff9966'),
  gradientAngle: z.number().default(0),
  // Defaulted so overlays from pre-TX3 projects still load.
  background: z.boolean().default(false),
  fontFamily: z.string().default('sans'),
  align: z.enum(['left', 'center', 'right']).default('center'),
  // Rich styling (Phase 28) — all defaulted so pre-TX5 projects still load.
  // Bold defaults true: pre-TX5 text always rendered bold.
  bold: z.boolean().default(true),
  italic: z.boolean().default(false),
  outlineColor: z.string().default('#000000'),
  outlineWidth: z.number().default(0),
  boxColor: z.string().default('#000000'),
  boxOpacity: z.number().default(0.5),
  boxRadius: z.number().default(0),
  boxPadding: z.number().default(0.25),
  opacity: z.number().default(1),
  rotation: z.number().default(0),
  glow: z.boolean().default(false),
  glowColor: z.string().default('#00e5ff'),
  glowStrength: z.number().default(0.5),
  // Animations (Phase 30 + typewriter)
  animationIn: z
    .enum(['none', 'fade', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'scale', 'pop', 'typewriter'])
    .default('none'),
  animationOut: z
    .enum(['none', 'fade', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'scale', 'pop', 'typewriter'])
    .default('none'),
  animInDuration: z.number().default(0.4),
  animOutDuration: z.number().default(0.4)
})

const projectFileSchema = z.object({
  version: z.number(),
  model: z.object({
    tracks: z.array(trackSchema),
    clips: z.record(z.string(), clipSchema),
    // Older projects predate these; defaults keep them loadable.
    markers: z.array(z.number()).default([]),
    textOverlays: z.array(textOverlaySchema).default([])
  }),
  media: z.array(mediaItemSchema)
})

const appSettingsSchema = z.object({
  // Keys are KeymapAction values; the renderer merges over DEFAULT_KEYMAP (and
  // App.tsx guards a missing keymap), so a partial/absent/extra keymap is fine —
  // validate only the string->string shape when present.
  keymap: z.record(z.string(), z.string()).optional(),
  language: z.string().optional()
})

/** Validates a parsed project file; returns null if the shape is invalid. */
export function parseProjectFile(value: unknown): ProjectFile | null {
  const result = projectFileSchema.safeParse(value)
  return result.success ? result.data : null
}

/** Validates parsed settings; returns null if the shape is invalid. */
export function parseAppSettings(value: unknown): AppSettings | null {
  const result = appSettingsSchema.safeParse(value)
  // keymap validates as Record<string,string>; the renderer merges it over the
  // full default keymap, so the structural check is sufficient here.
  return result.success ? (result.data as AppSettings) : null
}
