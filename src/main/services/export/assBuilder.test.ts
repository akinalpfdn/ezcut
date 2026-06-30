import { describe, expect, it } from 'vitest'
import type { TextOverlay } from '@shared'
import { assAlpha, assColor, assColorLerp, assTime, buildAssDocument, escapeAssText } from './assBuilder'

function overlay(extra: Partial<TextOverlay> = {}): TextOverlay {
  return {
    id: 't1',
    text: 'Hello',
    start: 0,
    duration: 5,
    x: 0.5,
    y: 0.5,
    fontSize: 0.1,
    color: '#ffffff',
    fillType: 'solid',
    gradientFrom: '#ff0000',
    gradientTo: '#0000ff',
    gradientAngle: 0,
    background: false,
    fontFamily: 'mono',
    align: 'center',
    bold: true,
    italic: false,
    effect: 'none',
    effectColor: '#000000',
    effectIntensity: 0.5,
    effectDirection: 135,
    boxColor: '#000000',
    boxOpacity: 0.5,
    boxRadius: 0,
    boxPadding: 0.25,
    opacity: 1,
    rotation: 0,
    animationIn: 'none',
    animationOut: 'none',
    animInDuration: 0.4,
    animOutDuration: 0.4,
    ...extra
  }
}

describe('assTime', () => {
  it('should format seconds as H:MM:SS.cs', () => {
    expect(assTime(0)).toBe('0:00:00.00')
    expect(assTime(5)).toBe('0:00:05.00')
    expect(assTime(65.5)).toBe('0:01:05.50')
    expect(assTime(3661.23)).toBe('1:01:01.23')
  })
})

describe('assColor', () => {
  it('should convert #RRGGBB to ASS &HBBGGRR&', () => {
    expect(assColor('#ffffff')).toBe('&HFFFFFF&')
    expect(assColor('#ff0000')).toBe('&H0000FF&') // red → BGR
    expect(assColor('#00ff00')).toBe('&H00FF00&')
    expect(assColor('#123456')).toBe('&H563412&')
  })
})

describe('escapeAssText', () => {
  it('should turn newlines into hard breaks', () => {
    expect(escapeAssText('a\nb')).toBe('a\\Nb')
  })

  it('should neutralise override braces and backslashes', () => {
    expect(escapeAssText('a{b}c')).toBe('a(b)c')
    expect(escapeAssText('a\\b')).toBe('a/b')
  })
})

describe('buildAssDocument', () => {
  it('should embed the export size as PlayRes', () => {
    const doc = buildAssDocument([overlay()], 1920, 1080)
    expect(doc).toContain('PlayResX: 1920')
    expect(doc).toContain('PlayResY: 1080')
  })

  it('should emit one Dialogue with the right timing', () => {
    const doc = buildAssDocument([overlay({ start: 2, duration: 3 })], 1280, 720)
    expect(doc).toContain(',0:00:02.00,0:00:05.00,')
  })

  it('should hard-break multi-line text with \\N', () => {
    const doc = buildAssDocument([overlay({ text: 'Line A\nLine B' })], 1280, 720)
    expect(doc).toContain('Line A\\NLine B')
  })

  it('should map alignment to the ASS numpad anchor', () => {
    expect(buildAssDocument([overlay({ align: 'left' })], 1280, 720)).toContain('\\an4')
    expect(buildAssDocument([overlay({ align: 'center' })], 1280, 720)).toContain('\\an5')
    expect(buildAssDocument([overlay({ align: 'right' })], 1280, 720)).toContain('\\an6')
  })

  it('should position by PlayRes pixels and set the font/size/colour', () => {
    const doc = buildAssDocument([overlay({ x: 0.5, y: 0.25, fontSize: 0.1, color: '#ff0000' })], 1280, 720)
    expect(doc).toContain('\\pos(640,180)') // 0.5*1280, 0.25*720
    expect(doc).toContain('\\fs72') // 0.1*720
    expect(doc).toContain('\\fnmonospace')
    expect(doc).toContain('\\1c&H0000FF&')
  })

  it('should use the Box style with padding when background is on, else Plain', () => {
    const boxed = buildAssDocument([overlay({ background: true })], 1280, 720)
    expect(boxed).toContain(',Box,')
    expect(boxed).toContain('\\bord18') // 0.25 * (0.1*720=72) = 18
    const plain = buildAssDocument([overlay({ background: false })], 1280, 720)
    expect(plain).toContain(',Plain,')
    expect(plain).toContain('\\bord0')
  })

  it('should fill the box via the outline channel (libass BorderStyle=3)', () => {
    const doc = buildAssDocument([overlay({ background: true, boxColor: '#00ff00', boxOpacity: 0.5 })], 1280, 720)
    const box = doc.split('\n').find((line) => line.includes(',Box,')) ?? ''
    expect(box).toContain('\\3c&H00FF00&')
    expect(box).toContain('\\3a&H80&')
  })

  it('should map bold and italic', () => {
    expect(buildAssDocument([overlay({ bold: true, italic: true })], 1280, 720)).toContain('\\b1\\i1')
    expect(buildAssDocument([overlay({ bold: false, italic: false })], 1280, 720)).toContain('\\b0\\i0')
  })

  it('should map text opacity to inverted ASS alpha', () => {
    // opacity 1 → fully opaque (alpha 00)
    expect(buildAssDocument([overlay({ opacity: 1 })], 1280, 720)).toContain('\\1a&H00&')
    // opacity 0.5 → alpha ~80
    expect(buildAssDocument([overlay({ opacity: 0.5 })], 1280, 720)).toContain('\\1a&H80&')
  })

  it('should emit an outline effect with colour', () => {
    const doc = buildAssDocument([overlay({ effect: 'outline', effectColor: '#ff0000', effectIntensity: 0.5 })], 1280, 720)
    expect(doc).toContain('\\3c&H0000FF&') // red → BGR
    expect(doc).toMatch(/\\bord\d/)
  })

  it('should layer a box behind the text when background is on', () => {
    const doc = buildAssDocument([overlay({ background: true })], 1280, 720)
    const dialogues = doc.split('\n').filter((line) => line.startsWith('Dialogue:'))
    expect(dialogues).toHaveLength(2)
    expect(dialogues[0]).toContain(',Box,') // box behind (layer 0), invisible text
    expect(dialogues[0]).toContain('\\1a&HFF&')
    expect(dialogues[1]).toContain(',Plain,') // text on top (layer 2)
  })

  it('should burn offset copies for echo and glitch effects', () => {
    const echo = buildAssDocument([overlay({ effect: 'echo' })], 1280, 720)
    expect(echo.split('\n').filter((l) => l.startsWith('Dialogue:'))).toHaveLength(3) // 2 echoes + main
    const glitch = buildAssDocument([overlay({ effect: 'glitch' })], 1280, 720)
    const lines = glitch.split('\n').filter((l) => l.startsWith('Dialogue:'))
    expect(lines).toHaveLength(3)
    expect(glitch).toContain('\\1c&H3C00FF&') // red split copy
    expect(glitch).toContain('\\1c&HFFE600&') // cyan split copy
  })

  it('should make the fill transparent for a hollow effect', () => {
    const doc = buildAssDocument([overlay({ effect: 'hollow' })], 1280, 720)
    const main = doc.split('\n').filter((l) => l.startsWith('Dialogue:')).at(-1) ?? ''
    expect(main).toContain('\\1a&HFF&') // invisible fill
    expect(main).toMatch(/\\bord\d/) // outline shows
  })

  it('should rotate clockwise via negated ASS angle', () => {
    expect(buildAssDocument([overlay({ rotation: 30 })], 1280, 720)).toContain('\\frz-30')
    expect(buildAssDocument([overlay({ rotation: 0 })], 1280, 720)).not.toContain('\\frz')
  })
})

describe('buildAssDocument gradient', () => {
  it('should interpolate colour per character for a gradient fill', () => {
    const doc = buildAssDocument(
      [overlay({ text: 'AB', fillType: 'linear', gradientFrom: '#ff0000', gradientTo: '#0000ff' })],
      1280,
      720
    )
    // First char = from (red → &H0000FF&), last char = to (blue → &HFF0000&).
    expect(doc).toContain('{\\1c&H0000FF&}A')
    expect(doc).toContain('{\\1c&HFF0000&}B')
  })
})

describe('assColorLerp', () => {
  it('should return the endpoints at t=0 and t=1', () => {
    expect(assColorLerp('#ff0000', '#0000ff', 0)).toBe('&H0000FF&')
    expect(assColorLerp('#ff0000', '#0000ff', 1)).toBe('&HFF0000&')
  })
})

describe('buildAssDocument animations', () => {
  it('should add a fade for fade in/out', () => {
    const doc = buildAssDocument([overlay({ animationIn: 'fade', animationOut: 'fade', animInDuration: 0.4, animOutDuration: 0.3 })], 1280, 720)
    expect(doc).toContain('\\fad(400,300)')
  })

  it('should slide in with \\move replacing \\pos', () => {
    const doc = buildAssDocument([overlay({ animationIn: 'slideUp', animInDuration: 0.5 })], 1280, 720)
    expect(doc).not.toContain('\\pos(')
    // starts below (y + 0.12*720 = +86) and moves to the anchor over 500ms
    expect(doc).toContain('\\move(640,446,640,360,0,500)')
  })

  it('should scale in via \\t and a zero base scale', () => {
    const doc = buildAssDocument([overlay({ animationIn: 'scale', animInDuration: 0.4 })], 1280, 720)
    expect(doc).toContain('\\fscx0\\fscy0')
    expect(doc).toContain('\\t(0,400,\\fscx100\\fscy100)')
  })

  it('should scale out via \\t near the end', () => {
    const doc = buildAssDocument([overlay({ duration: 5, animationOut: 'pop', animOutDuration: 0.4 })], 1280, 720)
    expect(doc).toContain('\\t(4600,5000,\\fscx0\\fscy0)')
  })

  it('should render a neon effect as a blurred coloured outline', () => {
    const doc = buildAssDocument([overlay({ effect: 'neon', effectColor: '#00e5ff' })], 1280, 720)
    expect(doc).toContain('\\blur')
    expect(doc).toContain('\\3c&HFFE500&') // #00e5ff → BGR
  })

  it('should reveal text per character for a typewriter in-animation', () => {
    const doc = buildAssDocument([overlay({ text: 'Hi', animationIn: 'typewriter', animInDuration: 0.4 })], 1280, 720)
    expect(doc).toContain('{\\alpha&HFF&\\t(0,1,\\alpha&H00&)}H')
    expect(doc).toContain('{\\alpha&HFF&\\t(200,201,\\alpha&H00&)}i') // 2nd of 2 chars at 0.5*400
  })

  it('should leave a static overlay with plain \\pos and no animation tags', () => {
    const doc = buildAssDocument([overlay()], 1280, 720)
    expect(doc).toContain('\\pos(640,360)')
    expect(doc).not.toContain('\\fad(')
    expect(doc).not.toContain('\\move(')
    expect(doc).not.toContain('\\t(')
  })
})

describe('assAlpha', () => {
  it('should invert opacity into ASS alpha (00 opaque, FF clear)', () => {
    expect(assAlpha(1)).toBe('&H00&')
    expect(assAlpha(0)).toBe('&HFF&')
    expect(assAlpha(0.5)).toBe('&H80&')
  })
})
