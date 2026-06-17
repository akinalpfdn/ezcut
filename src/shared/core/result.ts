/**
 * Cross-process result + error contract.
 *
 * Main-process IPC handlers never throw across the bridge. They return a
 * discriminated `Result<T>` so the renderer must explicitly handle failure.
 * Errors carry an i18n `messageKey` (localized in the renderer, never in main)
 * plus a machine `code` and optional technical `detail` for surfacing a real
 * reason to the user instead of a generic "something went wrong".
 */

export interface AppErrorPayload {
  code: string
  messageKey: string
  params?: Record<string, string | number>
  /** Raw technical detail (e.g. ffmpeg stderr). Surfaced as expandable detail. */
  detail?: string
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AppErrorPayload }

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function err<T = never>(error: AppErrorPayload): Result<T> {
  return { ok: false, error }
}
