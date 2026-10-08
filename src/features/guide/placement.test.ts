import { describe, expect, it } from 'vitest'
import { GAP, placeCard, type Box, type Placement } from './placement'

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 }
const PHONE = { width: 360, height: 640 } // small Android
const IPHONE = { width: 393, height: 852 }
const IPHONE_INSETS = { top: 59, right: 0, bottom: 34, left: 0 }
const TABLET_LANDSCAPE = { width: 1180, height: 820 }
const CARD = { height: 180 }

const overlaps = (a: Box, p: Placement, h: number) =>
  !(p.left + p.width <= a.left || a.left + a.width <= p.left || p.top + h <= a.top || a.top + a.height <= p.top)

const inside = (p: Placement, h: number, view: { width: number; height: number }, insets = NO_INSETS) =>
  p.left >= insets.left && p.top >= insets.top && p.left + p.width <= view.width - insets.right && p.top + h <= view.height - insets.bottom

describe('placeCard', () => {
  it('puts the card under a header button on a small phone, full width, without covering it', () => {
    const add: Box = { top: 10, left: 300, width: 56, height: 56 }
    const p = placeCard(add, CARD, PHONE, NO_INSETS, true)
    expect(p.side).toBe('below')
    expect(p.top).toBe(66 + GAP)
    expect(p.width).toBe(336)
    expect(overlaps(add, p, CARD.height)).toBe(false)
    expect(inside(p, CARD.height, PHONE)).toBe(true)
  })

  it('puts the card above a bottom-nav tab and clear of the home indicator', () => {
    const tab: Box = { top: 740, left: 20, width: 70, height: 60 }
    const p = placeCard(tab, CARD, IPHONE, IPHONE_INSETS, true)
    expect(p.side).toBe('above')
    expect(overlaps(tab, p, CARD.height)).toBe(false)
    expect(inside(p, CARD.height, IPHONE, IPHONE_INSETS)).toBe(true)
  })

  it('places the card beside a navigation-rail item on a tablet', () => {
    const railItem: Box = { top: 80, left: 6, width: 80, height: 70 }
    const p = placeCard(railItem, CARD, TABLET_LANDSCAPE, NO_INSETS, false)
    expect(p.side).toBe('right')
    expect(p.width).toBe(360)
    expect(overlaps(railItem, p, CARD.height)).toBe(false)
  })

  it('keeps a tablet card near its target but on screen', () => {
    const add: Box = { top: 14, left: 1100, width: 56, height: 56 }
    const p = placeCard(add, CARD, TABLET_LANDSCAPE, NO_INSETS, false)
    expect(p.side).toBe('below')
    expect(p.left + p.width).toBeLessThanOrEqual(1180 - 12)
    expect(overlaps(add, p, CARD.height)).toBe(false)
  })

  it('docks at the roomier edge when the target is taller than the space around it', () => {
    const huge: Box = { top: 40, left: 12, width: 336, height: 520 }
    const p = placeCard(huge, CARD, PHONE, NO_INSETS, true)
    expect(p.side).toBe('dock')
    expect(inside(p, CARD.height, PHONE)).toBe(true)
  })

  it('docks at the bottom on phones and centres on tablets when there is no target', () => {
    expect(placeCard(null, CARD, PHONE, NO_INSETS, true)).toMatchObject({ side: 'dock', top: 640 - 12 - 180 })
    const t = placeCard(null, CARD, TABLET_LANDSCAPE, NO_INSETS, false)
    expect(t.side).toBe('dock')
    expect(t.top).toBe((820 - 180) / 2)
    expect(t.left).toBe((1180 - 360) / 2)
  })
})
