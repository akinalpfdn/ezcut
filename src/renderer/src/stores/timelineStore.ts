import { create } from 'zustand'
import {
  canMerge,
  clipTimelineDuration,
  clipTimelineEnd,
  DEFAULT_AUDIO_FX,
  getTrackClips,
  resolveNonOverlappingStart,
  splitPoint,
  type AudioFx,
  type Clip,
  type DenoiseSettings,
  type TimelineModel
} from '@shared'
import {
  addClipCommand,
  addTrackCommand,
  closeGapsCommand,
  mergeClipsCommand,
  moveClipCommand,
  removeClipCommand,
  removeClipsCommand,
  sequenceCommand,
  setClipPropertyCommand,
  setMarkersCommand,
  setTrackPropertyCommand,
  splitClipCommand,
  trimClipCommand,
  type ClipPlacement,
  type ClipShift,
  type ClipTrim,
  type Command
} from '../features/timeline/commands'
import { MERGE_TOLERANCE_SECONDS, TIMELINE_CONFIG } from '../config/timeline'

function uuid(): string {
  return crypto.randomUUID()
}

function createInitialModel(): TimelineModel {
  return {
    tracks: [
      { id: uuid(), kind: 'video', index: 0, label: 'V1', muted: false, solo: false },
      { id: uuid(), kind: 'audio', index: 1, label: 'A1', muted: false, solo: false }
    ],
    clips: {},
    markers: []
  }
}

function clampSelection(selectedId: string | null, model: TimelineModel): string | null {
  return selectedId && model.clips[selectedId] ? selectedId : null
}

interface TimelineState {
  model: TimelineModel
  undoStack: Command[]
  redoStack: Command[]
  selectedClipId: string | null
  pxPerSec: number
  pinPlayhead: boolean

  execute: (command: Command) => void
  undo: () => void
  redo: () => void
  loadModel: (model: TimelineModel) => void

  addClipFromMedia: (
    mediaId: string,
    trackId: string,
    startOnTimeline: number,
    sourceDuration: number
  ) => void
  /** Inserts a fully-specified clip (paste/duplicate), resolving overlap. Returns its id. */
  addClip: (clip: Omit<Clip, 'id'>) => string
  duplicateClip: (clipId: string) => void
  rippleDeleteClip: (clipId: string) => void
  toggleMarker: (time: number, thresholdSeconds: number) => void
  moveClip: (clipId: string, placement: ClipPlacement) => void
  trimClip: (clipId: string, trim: ClipTrim) => void
  splitClipAt: (clipId: string, timelineTime: number) => void
  mergeWithNext: (clipId: string) => boolean
  deleteClip: (clipId: string) => void
  removeClipsByMedia: (mediaId: string) => void
  closeGaps: () => void
  addAudioTrack: () => void
  setClipSpeed: (clipId: string, speed: number) => void
  setClipVolume: (clipId: string, volume: number) => void
  setClipFade: (clipId: string, fade: { fadeIn?: number; fadeOut?: number }) => void
  toggleClipMute: (clipId: string) => void
  toggleTrackMute: (trackId: string) => void
  toggleTrackSolo: (trackId: string) => void
  setClipDenoise: (clipId: string, denoise: Partial<DenoiseSettings>) => void
  setClipAudioFx: (clipId: string, fx: Partial<AudioFx>) => void

  selectClip: (clipId: string | null) => void
  setPxPerSec: (pxPerSec: number) => void
  zoomIn: () => void
  zoomOut: () => void
  togglePinPlayhead: () => void
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  model: createInitialModel(),
  undoStack: [],
  redoStack: [],
  selectedClipId: null,
  pxPerSec: TIMELINE_CONFIG.defaultPxPerSec,
  pinPlayhead: false,

  execute: (command) =>
    set((state) => ({
      model: command.apply(state.model),
      undoStack: [...state.undoStack, command],
      redoStack: []
    })),

  undo: () =>
    set((state) => {
      const command = state.undoStack[state.undoStack.length - 1]
      if (!command) return {}
      const model = command.invert(state.model)
      return {
        model,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, command],
        selectedClipId: clampSelection(state.selectedClipId, model)
      }
    }),

  redo: () =>
    set((state) => {
      const command = state.redoStack[state.redoStack.length - 1]
      if (!command) return {}
      const model = command.apply(state.model)
      return {
        model,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, command],
        selectedClipId: clampSelection(state.selectedClipId, model)
      }
    }),

  loadModel: (model) =>
    set({
      model,
      undoStack: [],
      redoStack: [],
      selectedClipId: null
    }),

  addClipFromMedia: (mediaId, trackId, startOnTimeline, sourceDuration) => {
    const start = resolveNonOverlappingStart(get().model, trackId, Math.max(0, startOnTimeline), sourceDuration)
    const clip: Clip = {
      id: uuid(),
      mediaId,
      trackId,
      startOnTimeline: start,
      sourceIn: 0,
      sourceOut: sourceDuration,
      speed: 1,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      muted: false,
      denoise: { enabled: false, strength: 0.5 },
      audioFx: DEFAULT_AUDIO_FX
    }
    get().execute(addClipCommand(clip))
    set({ selectedClipId: clip.id })
  },

  addClip: (clip) => {
    const id = uuid()
    const duration = clipTimelineDuration({ ...clip, id })
    const start = resolveNonOverlappingStart(
      get().model,
      clip.trackId,
      Math.max(0, clip.startOnTimeline),
      duration
    )
    const full: Clip = { ...clip, id, startOnTimeline: start }
    get().execute(addClipCommand(full))
    set({ selectedClipId: id })
    return id
  },

  duplicateClip: (clipId) => {
    const clip = get().model.clips[clipId]
    if (!clip) return
    const { id: _id, ...rest } = clip
    get().addClip({ ...rest, startOnTimeline: clipTimelineEnd(clip) })
  },

  rippleDeleteClip: (clipId) => {
    const model = get().model
    const clip = model.clips[clipId]
    if (!clip) return
    const duration = clipTimelineDuration(clip)
    const shifts: ClipShift[] = getTrackClips(model, clip.trackId)
      .filter((candidate) => candidate.id !== clipId && candidate.startOnTimeline > clip.startOnTimeline)
      .map((candidate) => ({
        clipId: candidate.id,
        from: candidate.startOnTimeline,
        to: Math.max(0, candidate.startOnTimeline - duration)
      }))
    const command =
      shifts.length > 0
        ? sequenceCommand([removeClipCommand(clip), closeGapsCommand(shifts)])
        : removeClipCommand(clip)
    get().execute(command)
    if (get().selectedClipId === clipId) set({ selectedClipId: null })
  },

  toggleMarker: (time, thresholdSeconds) => {
    const markers = get().model.markers
    const near = markers.find((marker) => Math.abs(marker - time) <= thresholdSeconds)
    const next =
      near !== undefined
        ? markers.filter((marker) => marker !== near)
        : [...markers, time].sort((a, b) => a - b)
    get().execute(setMarkersCommand(markers, next))
  },

  moveClip: (clipId, placement) => {
    const clip = get().model.clips[clipId]
    if (!clip) return
    const resolvedStart = resolveNonOverlappingStart(
      get().model,
      placement.trackId,
      placement.startOnTimeline,
      clipTimelineDuration(clip),
      clipId
    )
    const before: ClipPlacement = { trackId: clip.trackId, startOnTimeline: clip.startOnTimeline }
    const after: ClipPlacement = { trackId: placement.trackId, startOnTimeline: resolvedStart }
    if (before.trackId === after.trackId && before.startOnTimeline === after.startOnTimeline) return
    get().execute(moveClipCommand(clipId, before, after))
  },

  trimClip: (clipId, trim) => {
    const clip = get().model.clips[clipId]
    if (!clip) return
    const before: ClipTrim = {
      sourceIn: clip.sourceIn,
      sourceOut: clip.sourceOut,
      startOnTimeline: clip.startOnTimeline
    }
    if (
      before.sourceIn === trim.sourceIn &&
      before.sourceOut === trim.sourceOut &&
      before.startOnTimeline === trim.startOnTimeline
    ) {
      return
    }
    get().execute(trimClipCommand(clipId, before, trim))
  },

  splitClipAt: (clipId, timelineTime) => {
    const clip = get().model.clips[clipId]
    if (!clip) return
    const split = splitPoint(clip, timelineTime, TIMELINE_CONFIG.minClipDuration)
    if (!split) return
    // The cut edges get no fade (fade-out belongs to the real clip end, fade-in
    // to the real start); the outer edges keep theirs.
    const left: Clip = { ...clip, id: uuid(), sourceOut: split.sourceSplit, fadeOut: 0 }
    const right: Clip = {
      ...clip,
      id: uuid(),
      sourceIn: split.sourceSplit,
      startOnTimeline: clip.startOnTimeline + split.localSeconds,
      fadeIn: 0
    }
    get().execute(splitClipCommand(clip, left, right))
    set({ selectedClipId: left.id })
  },

  mergeWithNext: (clipId) => {
    const model = get().model
    const clip = model.clips[clipId]
    if (!clip) return false
    const next = getTrackClips(model, clip.trackId).find(
      (candidate) => candidate.startOnTimeline > clip.startOnTimeline
    )
    if (!next || !canMerge(clip, next, MERGE_TOLERANCE_SECONDS)) return false

    const merged: Clip = { ...clip, id: uuid(), sourceOut: next.sourceOut }
    get().execute(mergeClipsCommand(clip, next, merged))
    set({ selectedClipId: merged.id })
    return true
  },

  deleteClip: (clipId) => {
    const clip = get().model.clips[clipId]
    if (!clip) return
    get().execute(removeClipCommand(clip))
    if (get().selectedClipId === clipId) set({ selectedClipId: null })
  },

  removeClipsByMedia: (mediaId) => {
    const clips = Object.values(get().model.clips).filter((clip) => clip.mediaId === mediaId)
    if (clips.length === 0) return
    get().execute(removeClipsCommand(clips))
    const selected = get().selectedClipId
    if (selected && clips.some((clip) => clip.id === selected)) set({ selectedClipId: null })
  },

  closeGaps: () => {
    const { model } = get()
    const shifts: ClipShift[] = []
    for (const track of model.tracks) {
      let cursor = 0
      for (const clip of getTrackClips(model, track.id)) {
        if (clip.startOnTimeline !== cursor) {
          shifts.push({ clipId: clip.id, from: clip.startOnTimeline, to: cursor })
        }
        cursor += clipTimelineDuration(clip)
      }
    }
    if (shifts.length > 0) get().execute(closeGapsCommand(shifts))
  },

  addAudioTrack: () => {
    const { model } = get()
    const audioCount = model.tracks.filter((track) => track.kind === 'audio').length
    const maxIndex = model.tracks.reduce((max, track) => Math.max(max, track.index), -1)
    get().execute(
      addTrackCommand({
        id: uuid(),
        kind: 'audio',
        index: maxIndex + 1,
        label: `A${audioCount + 1}`,
        muted: false,
        solo: false
      })
    )
  },

  setClipSpeed: (clipId, speed) => {
    const clip = get().model.clips[clipId]
    if (!clip || speed <= 0 || speed === clip.speed) return
    get().execute(setClipPropertyCommand(clipId, { speed: clip.speed }, { speed }))
  },

  setClipVolume: (clipId, volume) => {
    const clip = get().model.clips[clipId]
    if (!clip || volume === clip.volume) return
    get().execute(setClipPropertyCommand(clipId, { volume: clip.volume }, { volume }))
  },

  setClipFade: (clipId, fade) => {
    const clip = get().model.clips[clipId]
    if (!clip) return
    const before: Partial<Clip> = {}
    const after: Partial<Clip> = {}
    if (fade.fadeIn !== undefined && fade.fadeIn !== clip.fadeIn) {
      before.fadeIn = clip.fadeIn
      after.fadeIn = Math.max(0, fade.fadeIn)
    }
    if (fade.fadeOut !== undefined && fade.fadeOut !== clip.fadeOut) {
      before.fadeOut = clip.fadeOut
      after.fadeOut = Math.max(0, fade.fadeOut)
    }
    if (Object.keys(after).length === 0) return
    get().execute(setClipPropertyCommand(clipId, before, after))
  },

  toggleClipMute: (clipId) => {
    const clip = get().model.clips[clipId]
    if (!clip) return
    get().execute(setClipPropertyCommand(clipId, { muted: clip.muted }, { muted: !clip.muted }))
  },

  toggleTrackMute: (trackId) => {
    const track = get().model.tracks.find((candidate) => candidate.id === trackId)
    if (!track) return
    get().execute(setTrackPropertyCommand(trackId, { muted: track.muted }, { muted: !track.muted }))
  },

  toggleTrackSolo: (trackId) => {
    const track = get().model.tracks.find((candidate) => candidate.id === trackId)
    if (!track) return
    get().execute(setTrackPropertyCommand(trackId, { solo: track.solo }, { solo: !track.solo }))
  },

  setClipDenoise: (clipId, denoise) => {
    const clip = get().model.clips[clipId]
    if (!clip) return
    const next = { ...clip.denoise, ...denoise }
    if (next.enabled === clip.denoise.enabled && next.strength === clip.denoise.strength) return
    get().execute(setClipPropertyCommand(clipId, { denoise: clip.denoise }, { denoise: next }))
  },

  setClipAudioFx: (clipId, fx) => {
    const clip = get().model.clips[clipId]
    if (!clip) return
    const next = { ...clip.audioFx, ...fx }
    get().execute(setClipPropertyCommand(clipId, { audioFx: clip.audioFx }, { audioFx: next }))
  },

  selectClip: (clipId) => set({ selectedClipId: clipId }),
  setPxPerSec: (pxPerSec) =>
    set({
      pxPerSec: Math.min(Math.max(pxPerSec, TIMELINE_CONFIG.minPxPerSec), TIMELINE_CONFIG.maxPxPerSec)
    }),
  zoomIn: () => get().setPxPerSec(get().pxPerSec * TIMELINE_CONFIG.zoomFactor),
  zoomOut: () => get().setPxPerSec(get().pxPerSec / TIMELINE_CONFIG.zoomFactor),
  togglePinPlayhead: () => set((state) => ({ pinPlayhead: !state.pinPlayhead }))
}))
