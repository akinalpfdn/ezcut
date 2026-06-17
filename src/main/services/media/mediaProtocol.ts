import { protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'

export const MEDIA_PROTOCOL = 'ezmedia'

/** Files the renderer is permitted to load through the protocol. Populated as
 * media is imported, so the renderer can only stream what it actually imported. */
const allowedFiles = new Set<string>()

export function allowMediaFile(absolutePath: string): void {
  allowedFiles.add(absolutePath)
}

/** Must run before app `ready`. Marks the scheme as privileged so it can stream
 * media (range requests) into <video>/<audio> and be treated as a secure origin. */
export function registerMediaProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_PROTOCOL,
      // corsEnabled lets crossOrigin="anonymous" media elements issue CORS
      // requests to this scheme; Chromium otherwise blocks CORS for custom schemes.
      privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true }
    }
  ])
}

/** Must run after app `ready`. Serves allow-listed local files. */
export function registerMediaProtocolHandler(): void {
  protocol.handle(MEDIA_PROTOCOL, async (request) => {
    const filePath = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''))
    if (!allowedFiles.has(filePath)) {
      return new Response(null, { status: 403 })
    }
    // Forward Range (and other) request headers so <video> gets proper 206
    // partial responses for streaming and seeking.
    const response = await net.fetch(pathToFileURL(filePath).toString(), {
      headers: request.headers
    })
    // crossOrigin="anonymous" media elements need an explicit CORS grant, or the
    // Web Audio MediaElementSource taints and outputs silence.
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  })
}
