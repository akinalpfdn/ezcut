import os from 'node:os'
import type { ChildProcess } from 'node:child_process'

/** Cap on concurrent heavy ffmpeg jobs (transcodes/decodes), leaving cores for
 * the UI and preview decode. Probe (fast metadata) and the user-initiated export
 * run outside this pool. */
const MAX_CONCURRENT = Math.max(1, Math.floor((os.cpus().length || 4) / 2))

interface JobHandle {
  child: ChildProcess | null
  cancelled: boolean
  started: boolean
  start: () => void
  reject: (error: Error) => void
}

let active = 0
const waiting: JobHandle[] = []
/** tag (e.g. media path) -> in-flight/queued jobs, so they can be cancelled. */
const registry = new Map<string, Set<JobHandle>>()

function unregister(tag: string, handle: JobHandle): void {
  const set = registry.get(tag)
  if (!set) return
  set.delete(handle)
  if (set.size === 0) registry.delete(tag)
}

function runNext(): void {
  waiting.shift()?.start()
}

/**
 * Runs a heavy ffmpeg job under a global concurrency cap (so importing many files
 * doesn't spawn unbounded transcodes). `tag` groups jobs for cancellation; the
 * job reports its spawned child via `onSpawn` so a cancel can kill it.
 */
export function runFfmpegJob<T>(
  tag: string,
  jobFn: (onSpawn: (child: ChildProcess) => void) => Promise<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle: JobHandle = {
      child: null,
      cancelled: false,
      started: false,
      reject,
      start: () => {
        if (handle.cancelled) {
          unregister(tag, handle)
          reject(new Error('ffmpeg job cancelled'))
          runNext()
          return
        }
        handle.started = true
        active += 1
        // Promise.resolve().then(...) so a synchronous throw in jobFn (e.g.
        // resolveFfmpegPath on an unsupported platform) becomes a rejection and
        // still runs the finally cleanup — otherwise active/registry would leak.
        Promise.resolve()
          .then(() =>
            jobFn((child) => {
              handle.child = child
              if (handle.cancelled) child.kill()
            })
          )
          .then(resolve, reject)
          .finally(() => {
            active -= 1
            unregister(tag, handle)
            runNext()
          })
      }
    }

    const set = registry.get(tag) ?? new Set<JobHandle>()
    set.add(handle)
    registry.set(tag, set)

    if (active < MAX_CONCURRENT) handle.start()
    else waiting.push(handle)
  })
}

/** Cancels every job registered under `tag`: kills running children (their job
 * rejects via its own close handler) and drops still-queued jobs. */
export function cancelFfmpegJobs(tag: string): void {
  const set = registry.get(tag)
  if (!set) return
  for (const handle of [...set]) {
    handle.cancelled = true
    if (handle.started) {
      handle.child?.kill()
    } else {
      const index = waiting.indexOf(handle)
      if (index >= 0) waiting.splice(index, 1)
      unregister(tag, handle)
      handle.reject(new Error('ffmpeg job cancelled'))
    }
  }
}
