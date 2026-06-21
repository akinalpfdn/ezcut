import type { TimelineModel } from '../timeline/types'
import type { MediaItem } from '../media/types'

export const PROJECT_FILE_VERSION = 1
export const PROJECT_FILE_EXTENSION = 'ezcut'

/** Serialized project: the edit model plus the media it references. */
export interface ProjectFile {
  version: number
  model: TimelineModel
  media: MediaItem[]
}
