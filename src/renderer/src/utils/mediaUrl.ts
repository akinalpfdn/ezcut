/** Builds an `ezmedia://` URL the custom protocol resolves back to a local file.
 * The whole path is percent-encoded so the URL parser never splits on slashes. */
export function toMediaUrl(absolutePath: string): string {
  return `ezmedia://media/${encodeURIComponent(absolutePath)}`
}
