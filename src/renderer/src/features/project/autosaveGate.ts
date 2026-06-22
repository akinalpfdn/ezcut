/**
 * Guards autosave until the initial session restore has run, so the empty
 * startup state never overwrites a saved autosave before it loads. Once open,
 * autosaving the empty state is allowed (e.g. after deleting all media).
 */
let ready = false

export const autosaveGate = {
  get ready(): boolean {
    return ready
  },
  open(): void {
    ready = true
  }
}
