import { ipcMain } from 'electron'
import { AppError } from '../core/AppError'
import { ErrorCodes, ErrorKeys } from '../config/errors'
import { ok, err, type Result } from '@shared'

/**
 * Registers an ipcMain.handle that always resolves to a `Result` — never throws
 * across the bridge. AppErrors keep their localizable payload; anything else
 * collapses to a generic UNKNOWN with technical detail attached.
 */
export function handle<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (...args: TArgs) => Promise<TResult> | TResult
): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<Result<TResult>> => {
    try {
      // IPC args are constrained by the typed preload contract (ElectronAPI),
      // which is the only caller — so the runtime shape matches TArgs.
      return ok(await handler(...(args as TArgs)))
    } catch (caught) {
      if (caught instanceof AppError) return err(caught.toPayload())
      return err({
        code: ErrorCodes.unknown,
        messageKey: ErrorKeys.unknown,
        detail: caught instanceof Error ? caught.message : String(caught)
      })
    }
  })
}
