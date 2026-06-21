import { clipTimelineEnd, getTrackClips } from '@shared'
import { useTimelineStore } from '../../stores/timelineStore'
import { useMediaStore } from '../../stores/mediaStore'
import { useDenoiseStore } from '../../stores/denoiseStore'
import { FALLBACK_FPS } from '../../config/playback'

/**
 * Editor actions shared by the keyboard, toolbar, and context menus so every
 * surface dispatches the same behavior. Each reads the stores at call time.
 */

export function splitSelected(): void {
  const state = useTimelineStore.getState()
  if (state.selectedClipId) state.splitClipAt(state.selectedClipId, state.playheadTime)
}

export function deleteSelected(): void {
  const state = useTimelineStore.getState()
  if (state.selectedClipId) state.deleteClip(state.selectedClipId)
}

export function mergeSelected(): void {
  const state = useTimelineStore.getState()
  if (state.selectedClipId) state.mergeWithNext(state.selectedClipId)
}

export function toggleClipDenoise(clipId: string): void {
  const state = useTimelineStore.getState()
  const clip = state.model.clips[clipId]
  if (!clip) return
  const enabled = !clip.denoise.enabled
  state.setClipDenoise(clipId, { enabled })
  if (enabled) {
    const media = useMediaStore.getState().items.find((item) => item.id === clip.mediaId)
    if (media) useDenoiseStore.getState().ensureProxy(media.path, clip.denoise.strength)
  }
}

export function stepFrames(frames: number): void {
  const state = useTimelineStore.getState()
  const videoTrack = state.model.tracks.find((track) => track.kind === 'video')
  let fps = FALLBACK_FPS
  if (videoTrack) {
    const clip = getTrackClips(state.model, videoTrack.id).find(
      (candidate) =>
        state.playheadTime >= candidate.startOnTimeline && state.playheadTime < clipTimelineEnd(candidate)
    )
    const media = clip ? useMediaStore.getState().items.find((item) => item.id === clip.mediaId) : undefined
    if (media?.fps) fps = media.fps
  }
  state.pause()
  state.setPlayhead(Math.max(0, state.playheadTime + frames / fps))
}
