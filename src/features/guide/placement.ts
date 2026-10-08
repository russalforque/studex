export interface Box {
  top: number
  left: number
  width: number
  height: number
}

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export type Side = 'above' | 'below' | 'right' | 'left' | 'dock'

export interface Placement {
  top: number
  left: number
  width: number
  side: Side
}

/** Space between the card and the screen edge, and between the card and the spotlight. */
export const GUTTER = 12
export const GAP = 12
const TABLET_CARD = 360
const PHONE_CARD_MAX = 440

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max))

/**
 * Where the tour card goes. It sits next to the spotlight without covering it: below or above on
 * phones (full width), and on tablets also beside a target on the left edge (the navigation rail).
 * When nothing fits, as with a target taller than the screen, it docks at whichever edge has more
 * room. Without a target it docks at the bottom on phones and centres on tablets.
 */
export function placeCard(
  target: Box | null,
  card: { height: number },
  view: { width: number; height: number },
  insets: Insets,
  compact: boolean,
): Placement {
  const minLeft = insets.left + GUTTER
  const maxRight = view.width - insets.right - GUTTER
  const minTop = insets.top + GUTTER
  const maxBottom = view.height - insets.bottom - GUTTER
  const width = compact ? Math.min(PHONE_CARD_MAX, maxRight - minLeft) : Math.min(TABLET_CARD, maxRight - minLeft)
  const centredLeft = minLeft + (maxRight - minLeft - width) / 2
  const h = card.height

  if (!target) {
    return compact
      ? { top: maxBottom - h, left: centredLeft, width, side: 'dock' }
      : { top: clamp((view.height - h) / 2, minTop, maxBottom - h), left: centredLeft, width, side: 'dock' }
  }

  const bottom = target.top + target.height
  const right = target.left + target.width
  const centreX = target.left + target.width / 2
  const centreY = target.top + target.height / 2
  const alongX = compact ? centredLeft : clamp(centreX - width / 2, minLeft, maxRight - width)
  const alongY = clamp(centreY - h / 2, minTop, maxBottom - h)

  const options: Record<Exclude<Side, 'dock'>, { fits: boolean; at: Placement }> = {
    below: { fits: bottom + GAP + h <= maxBottom, at: { top: bottom + GAP, left: alongX, width, side: 'below' } },
    above: { fits: target.top - GAP - h >= minTop, at: { top: target.top - GAP - h, left: alongX, width, side: 'above' } },
    right: { fits: !compact && right + GAP + width <= maxRight, at: { top: alongY, left: right + GAP, width, side: 'right' } },
    left: { fits: !compact && target.left - GAP - width >= minLeft, at: { top: alongY, left: target.left - GAP - width, width, side: 'left' } },
  }

  const vertical: Array<'above' | 'below'> = centreY > view.height / 2 ? ['above', 'below'] : ['below', 'above']
  // A tall, narrow target hugging the left edge is the navigation rail: the card goes beside it.
  const railLike = !compact && target.left < view.width * 0.2 && target.height >= target.width * 0.8
  const order: Array<Exclude<Side, 'dock'>> = railLike ? ['right', ...vertical, 'left'] : [...vertical, 'right', 'left']

  for (const side of order) if (options[side].fits) return options[side].at

  // Nothing fits beside it: dock where there is more room and accept a partial overlap.
  const roomBelow = maxBottom - bottom
  const roomAbove = target.top - minTop
  return { top: roomBelow >= roomAbove ? maxBottom - h : minTop, left: centredLeft, width, side: 'dock' }
}
