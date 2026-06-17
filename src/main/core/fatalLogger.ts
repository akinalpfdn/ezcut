import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const FATAL_LOG_PATH = join(tmpdir(), 'ezcut-fatal.log')

/** Persists otherwise-invisible startup crashes. In a packaged GUI build the
 * main process has no attached console, so an uncaught error would vanish; this
 * records it to a known-writable location for diagnosis. */
export function installFatalLogger(): void {
  const write = (label: string, error: unknown): void => {
    const stack = error instanceof Error ? (error.stack ?? error.message) : String(error)
    try {
      writeFileSync(FATAL_LOG_PATH, `[${new Date().toISOString()}] ${label}\n${stack}\n`, {
        flag: 'a'
      })
    } catch {
      // Nothing more we can do if even this write fails.
    }
  }

  process.on('uncaughtException', (error) => write('uncaughtException', error))
  process.on('unhandledRejection', (reason) => write('unhandledRejection', reason))
}
