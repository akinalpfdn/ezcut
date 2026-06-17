import type { AppErrorPayload } from '@shared'

/** A localizable, serializable error. Carries an i18n key the renderer resolves,
 * a machine code, and optional raw technical detail for the user-facing reason. */
export class AppError extends Error {
  readonly code: string
  readonly messageKey: string
  readonly params?: Record<string, string | number>
  readonly detail?: string

  constructor(args: {
    code: string
    messageKey: string
    params?: Record<string, string | number>
    detail?: string
    cause?: unknown
  }) {
    super(args.messageKey, args.cause === undefined ? undefined : { cause: args.cause })
    this.name = 'AppError'
    this.code = args.code
    this.messageKey = args.messageKey
    this.params = args.params
    this.detail = args.detail
  }

  toPayload(): AppErrorPayload {
    return {
      code: this.code,
      messageKey: this.messageKey,
      ...(this.params ? { params: this.params } : {}),
      ...(this.detail ? { detail: this.detail } : {})
    }
  }
}
