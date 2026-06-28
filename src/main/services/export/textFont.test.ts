import { describe, expect, it } from 'vitest'
import { escapeDrawtextPath } from './textFont'

describe('escapeDrawtextPath', () => {
  it('should forward-slash and single-quote a Windows path for drawtext', () => {
    expect(escapeDrawtextPath('C:\\Windows\\Fonts\\arialbd.ttf')).toBe("'C:/Windows/Fonts/arialbd.ttf'")
  })

  it('should single-quote a posix path', () => {
    expect(escapeDrawtextPath('/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf')).toBe(
      "'/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf'"
    )
  })
})
