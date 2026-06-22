import { describe, expect, it } from 'vitest'
import type { MediaItem } from '@shared'
import { previewNeedsProxy, PREVIEW_PROXY_MAX_WIDTH } from './proxyPolicy'

function makeMedia(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'm1',
    path: 'C:/videos/clip.mp4',
    name: 'clip.mp4',
    kind: 'video',
    durationSeconds: 30,
    sizeBytes: 1000,
    hasVideo: true,
    hasAudio: true,
    width: 1920,
    height: 1080,
    ...overrides
  }
}

describe('previewNeedsProxy', () => {
  it('should be true when the main process already flagged it', () => {
    expect(previewNeedsProxy(makeMedia({ needsProxy: true, width: 640 }))).toBe(true)
  })

  it('should be false for audio-only media', () => {
    expect(previewNeedsProxy(makeMedia({ hasVideo: false, width: undefined }))).toBe(false)
  })

  it('should be true for video wider than the proxy threshold', () => {
    expect(previewNeedsProxy(makeMedia({ width: PREVIEW_PROXY_MAX_WIDTH + 1 }))).toBe(true)
  })

  it('should be false for video at or below the proxy threshold', () => {
    expect(previewNeedsProxy(makeMedia({ width: PREVIEW_PROXY_MAX_WIDTH }))).toBe(false)
  })

  it('should be false when width is unknown and not otherwise flagged', () => {
    expect(previewNeedsProxy(makeMedia({ width: undefined }))).toBe(false)
  })
})
