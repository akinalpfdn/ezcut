import { create } from 'zustand'
import {
  clipTimelineDuration,
  clipTimelineEnd,
  getTrackClips,
  type Clip,
  type TimelineModel
} from '@shared'
import {
  addClipCommand,
  addTrackCommand,
  mergeClipsCommand,
  moveClipCommand,
  removeClipCommand,
  setClipPropertyCommand,
  splitClipCommand,
  trimClipCommand,
  type ClipPlacement,
  type ClipTrim,
  type Command
} from '../features/timeline/commands'
import { MERGE_TOLERANCE_SECONDS, TIMELINE_CONFIG } from '../config/timeline'
import { DEFAULT_MASTER_VOLUME } from '../config/playback'

function uuid(): string {
  return crypto.randomUUID()
}

function createInitialModel(): TimelineModel {
  return {
    tracks: [
      { id: uuid(), kind: 'video', index: 0, label: 'V1' },
      { id: uuid(), kind: 'audio', index: 1, label: 'A1' }
    ],
    clips: {}
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
  playheadTime: number
  pxPerSec: number
  isPlaying: boolean
  masterVolume: number

  execute: (command: Command) => void
  undo: () => void
  redo: () => void

  addClipFromMedia: (
    mediaId: string,
    trackId: string,
    startOnTimeline: number,
    sourceDuration: number
  ) => void
  moveClip: (clipId: string, placement: ClipPlacement) => void
  trimClip: (clipId: string, trim: ClipTrim) => void
  splitClipAt: (clipId: string, timelineTime: number) => void
  mergeWithNext: (clipId: string) => boolean
  deleteClip: (clipId: string) => void
  addAudioTrack: () => void
  setClipSpeed: (clipId: string, speed: number) => void
  setClipVolume: (clipId: string, volume: number) => void

  selectClip: (clipId: string | null) => void
  setPlayhead: (time: number) => void
  setPxPerSec: (pxPerSec: number) => void
  zoomIn: () => void
  zoomOut: () => void

  play: () => void
  pause: () => void
  togglePlay: () => void
  setMasterVolume: (volume: number) => void
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  model: createInitialModel(),
  undoStack: [],
  redoStack: [],
  selectedClipId: null,
  playheadTime: 0,
  pxPerSec: TIMELINE_CONFIG.defaultPxPerSec,
  isPlaying: false,
  masterVolume: DEFAULT_MASTER_VOLUME,

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

  addClipFromMedia: (mediaId, trackId, startOnTimeline, sourceDuration) => {
    const clip: Clip = {
      id: uuid(),
      mediaId,
      trackId,
      startOnTimeline: Math.max(0, startOnTimeline),
      sourceIn: 0,
      sourceOut: sourceDuration,
      speed: 1,
      volume: 1,
      denoise: { enabled: false, strength: 0.5 }
    }
    get().execute(addClipCommand(clip))
    set({ selectedClipId: clip.id })
  },

  moveClip: (clipId, placement) => {
    const clip = get().model.clips[clipId]
    if (!clip) return
    const before: ClipPlacement = { trackId: clip.trackId, startOnTimeline: clip.startOnTimeline }
    if (before.trackId === placement.trackId && before.startOnTimeline === placement.startOnTimeline) return
    get().execute(moveClipCommand(clipId, before, placement))
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
    const local = timelineTime - clip.startOnTimeline
    const duration = clipTimelineDuration(clip)
    if (local <= TIMELINE_CONFIG.minClipDuration || local >= duration - TIMELINE_CONFIG.minClipDuration) {
      return
    }
    const sourceSplit = clip.sourceIn + local * clip.speed
    const left: Clip = { ...clip, id: uuid(), sourceOut: sourceSplit }
    const right: Clip = {
      ...clip,
      id: uuid(),
      sourceIn: sourceSplit,
      startOnTimeline: clip.startOnTimeline + local
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
    if (!next || next.mediaId !== clip.mediaId || next.speed !== clip.speed) return false

    const contiguousOnTimeline = Math.abs(next.startOnTimeline - clipTimelineEnd(clip)) <= MERGE_TOLERANCE_SECONDS
    const contiguousInSource = Math.abs(next.sourceIn - clip.sourceOut) <= MERGE_TOLERANCE_SECONDS
    if (!contiguousOnTimeline || !contiguousInSource) return false

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

  addAudioTrack: () => {
    const { model } = get()
    const audioCount = model.tracks.filter((track) => track.kind === 'audio').length
    const maxIndex = model.tracks.reduce((max, track) => Math.max(max, track.index), -1)
    get().execute(
      addTrackCommand({
        id: uuid(),
        kind: 'audio',
        index: maxIndex + 1,
        label: `A${audioCount + 1}`
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

  selectClip: (clipId) => set({ selectedClipId: clipId }),
  setPlayhead: (time) => set({ playheadTime: Math.max(0, time) }),
  setPxPerSec: (pxPerSec) =>
    set({
      pxPerSec: Math.min(Math.max(pxPerSec, TIMELINE_CONFIG.minPxPerSec), TIMELINE_CONFIG.maxPxPerSec)
    }),
  zoomIn: () => get().setPxPerSec(get().pxPerSec * TIMELINE_CONFIG.zoomFactor),
  zoomOut: () => get().setPxPerSec(get().pxPerSec / TIMELINE_CONFIG.zoomFactor),

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setMasterVolume: (volume) => set({ masterVolume: Math.min(Math.max(volume, 0), 1) })
}))
