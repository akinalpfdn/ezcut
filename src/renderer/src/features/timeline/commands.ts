import type { Clip, TimelineModel, Track } from '@shared'

/** An undoable edit. apply/invert are pure and exact inverses, so redo === apply
 * and the same command can round-trip through the undo/redo stacks. */
export interface Command {
  apply(model: TimelineModel): TimelineModel
  invert(model: TimelineModel): TimelineModel
}

// --- immutable model helpers ---

function withClip(model: TimelineModel, clip: Clip): TimelineModel {
  return { ...model, clips: { ...model.clips, [clip.id]: clip } }
}

function withoutClip(model: TimelineModel, clipId: string): TimelineModel {
  const clips = { ...model.clips }
  delete clips[clipId]
  return { ...model, clips }
}

function patchClip(model: TimelineModel, clipId: string, patch: Partial<Clip>): TimelineModel {
  const existing = model.clips[clipId]
  if (!existing) return model
  return { ...model, clips: { ...model.clips, [clipId]: { ...existing, ...patch } } }
}

function withTrack(model: TimelineModel, track: Track): TimelineModel {
  return { ...model, tracks: [...model.tracks, track] }
}

function patchTrack(model: TimelineModel, trackId: string, patch: Partial<Track>): TimelineModel {
  return {
    ...model,
    tracks: model.tracks.map((track) => (track.id === trackId ? { ...track, ...patch } : track))
  }
}

function withoutTrack(model: TimelineModel, trackId: string): TimelineModel {
  return { ...model, tracks: model.tracks.filter((track) => track.id !== trackId) }
}

// --- command factories ---

export interface ClipPlacement {
  trackId: string
  startOnTimeline: number
}

export interface ClipTrim {
  sourceIn: number
  sourceOut: number
  startOnTimeline: number
}

export function addClipCommand(clip: Clip): Command {
  return {
    apply: (model) => withClip(model, clip),
    invert: (model) => withoutClip(model, clip.id)
  }
}

export function removeClipCommand(clip: Clip): Command {
  return {
    apply: (model) => withoutClip(model, clip.id),
    invert: (model) => withClip(model, clip)
  }
}

/** Removes many clips at once (e.g. when their source media is deleted). */
export function removeClipsCommand(clips: Clip[]): Command {
  return {
    apply: (model) => clips.reduce((next, clip) => withoutClip(next, clip.id), model),
    invert: (model) => clips.reduce((next, clip) => withClip(next, clip), model)
  }
}

export function moveClipCommand(clipId: string, before: ClipPlacement, after: ClipPlacement): Command {
  return {
    apply: (model) => patchClip(model, clipId, after),
    invert: (model) => patchClip(model, clipId, before)
  }
}

export function trimClipCommand(clipId: string, before: ClipTrim, after: ClipTrim): Command {
  return {
    apply: (model) => patchClip(model, clipId, after),
    invert: (model) => patchClip(model, clipId, before)
  }
}

export function splitClipCommand(original: Clip, left: Clip, right: Clip): Command {
  return {
    apply: (model) => withClip(withClip(withoutClip(model, original.id), left), right),
    invert: (model) => withClip(withoutClip(withoutClip(model, left.id), right.id), original)
  }
}

export function mergeClipsCommand(first: Clip, second: Clip, merged: Clip): Command {
  return {
    apply: (model) => withClip(withoutClip(withoutClip(model, first.id), second.id), merged),
    invert: (model) => withClip(withClip(withoutClip(model, merged.id), first), second)
  }
}

export function addTrackCommand(track: Track): Command {
  return {
    apply: (model) => withTrack(model, track),
    invert: (model) => withoutTrack(model, track.id)
  }
}

/** Generic clip-property edit (e.g. speed, volume). */
export function setClipPropertyCommand(clipId: string, before: Partial<Clip>, after: Partial<Clip>): Command {
  return {
    apply: (model) => patchClip(model, clipId, after),
    invert: (model) => patchClip(model, clipId, before)
  }
}

/** Generic track-property edit (e.g. mute, solo). */
export function setTrackPropertyCommand(trackId: string, before: Partial<Track>, after: Partial<Track>): Command {
  return {
    apply: (model) => patchTrack(model, trackId, after),
    invert: (model) => patchTrack(model, trackId, before)
  }
}

export interface ClipShift {
  clipId: string
  from: number
  to: number
}

/** Repositions many clips at once (e.g. closing gaps) as one undoable edit. */
export function closeGapsCommand(shifts: ClipShift[]): Command {
  return {
    apply: (model) => shifts.reduce((next, s) => patchClip(next, s.clipId, { startOnTimeline: s.to }), model),
    invert: (model) => shifts.reduce((next, s) => patchClip(next, s.clipId, { startOnTimeline: s.from }), model)
  }
}

/** Replaces the timeline's markers (add/remove) as one undoable edit. */
export function setMarkersCommand(before: number[], after: number[]): Command {
  return {
    apply: (model) => ({ ...model, markers: after }),
    invert: (model) => ({ ...model, markers: before })
  }
}

/** Runs several commands as one undoable step (apply forward, invert in reverse). */
export function sequenceCommand(commands: Command[]): Command {
  return {
    apply: (model) => commands.reduce((next, command) => command.apply(next), model),
    invert: (model) => [...commands].reverse().reduce((next, command) => command.invert(next), model)
  }
}
