import { describe, expect, it } from 'vitest'
import { fontScaleFor, MAX_FONT_SCALE } from './fontScale'

describe('fontScaleFor', () => {
  it('is 1 at the default iOS text size', () => {
    expect(fontScaleFor(17)).toBe(1)
  })

  it('grows with larger text sizes', () => {
    expect(fontScaleFor(21)).toBe(1.24)
  })

  it('never shrinks below the design size, so inputs stay at 16px', () => {
    expect(fontScaleFor(14)).toBe(1)
  })

  it('caps the accessibility sizes', () => {
    expect(fontScaleFor(53)).toBe(MAX_FONT_SCALE)
  })

  it('falls back to 1 when the size cannot be read', () => {
    expect(fontScaleFor(NaN)).toBe(1)
    expect(fontScaleFor(0)).toBe(1)
  })
})
