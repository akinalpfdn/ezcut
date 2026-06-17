import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { extname } from 'node:path'

export const MEDIA_PROTOCOL = 'ezmedia'

/** Files the renderer is permitted to load through the protocol. Populated as
 * media is imported, so the renderer can only stream what it actually imported. */
const allowedFiles = new Set<string>()

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png'
}

export function allowMediaFile(absolutePath: string): void {
  allowedFiles.add(absolutePath)
}

/** Must run before app `ready`. Privileged + corsEnabled so the scheme can stream
 * media and satisfy crossOrigin requests (needed for the Web Audio graph). */
export function registerMediaProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_PROTOCOL,
      privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true }
    }
  ])
}

function toWebStream(filePath: string, start: number, end: number): ReadableStream<Uint8Array> {
  // Node's stream/web ReadableStream is structurally the Response body type but
  // declared as a distinct nominal type; the cast bridges the two.
  return Readable.toWeb(createReadStream(filePath, { start, end })) as unknown as ReadableStream<Uint8Array>
}

/**
 * Must run after app `ready`. Serves allow-listed local files with explicit HTTP
 * Range handling (206 Partial Content + Accept-Ranges) so `<video>`/`<audio>`
 * report the media as seekable — Electron's default protocol response does not,
 * which silently breaks seeking. Adds a permissive CORS header so crossOrigin
 * media elements can feed the Web Audio graph without tainting.
 */
export function registerMediaProtocolHandler(): void {
  protocol.handle(MEDIA_PROTOCOL, async (request) => {
    const filePath = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''))
    if (!allowedFiles.has(filePath)) return new Response(null, { status: 403 })

    let size: number
    try {
      size = (await stat(filePath)).size
    } catch {
      return new Response(null, { status: 404 })
    }

    const contentType = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    const baseHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType
    }

    const rangeHeader = request.headers.get('range')
    const match = rangeHeader ? /bytes=(\d*)-(\d*)/.exec(rangeHeader) : null
    if (match) {
      const start = match[1] ? Number(match[1]) : 0
      const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
      if (start > end || start >= size) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
      }
      return new Response(toWebStream(filePath, start, end), {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Content-Length': String(end - start + 1)
        }
      })
    }

    return new Response(toWebStream(filePath, 0, size - 1), {
      status: 200,
      headers: { ...baseHeaders, 'Content-Length': String(size) }
    })
  })
}
