import type { GradeCategory, GradeItem } from '@/types/models'

type Scored = Pick<GradeItem, 'score' | 'maxScore' | 'weight'>
type Item = Scored & Pick<GradeItem, 'categoryId'>

const round1 = (n: number) => Math.round(n * 10) / 10

const isGraded = (i: Scored): i is Scored & { score: number } => i.score !== null && i.maxScore > 0 && i.weight > 0

/**
 * Weighted average of each graded item's percentage, to one decimal place. With every weight at 1
 * this is a plain average of percentages. Ungraded items are ignored. Null until something is graded.
 * Always presented as an estimate: schools use their own formulas.
 */
export function gradeEstimate(items: Scored[]): number | null {
  let weighted = 0
  let weights = 0
  for (const i of items) {
    if (!isGraded(i)) continue
    weighted += (i.score / i.maxScore) * 100 * i.weight
    weights += i.weight
  }
  if (weights === 0) return null
  return round1(weighted / weights)
}

export function itemPercent(i: { score: number; maxScore: number }): number {
  return round1((i.score / i.maxScore) * 100)
}

/** A group of items with its share of the final grade. */
interface Group {
  id: string | null
  name: string
  weight: number
  items: Scored[]
}

export interface CategoryResult {
  id: string | null
  name: string
  weight: number
  /** Average of the graded items, or null if none are graded yet. */
  percent: number | null
  graded: number
  pending: number
}

export interface GradeSummary {
  /** Current estimate from graded work only. */
  estimate: number | null
  categories: CategoryResult[]
  /** Items that count toward nothing (categories already add up to 100%). */
  ignored: number
  /** Ungraded items whose result is still open. */
  pending: number
  /**
   * The average needed on all ungraded items to finish at `target`, or null when that can't be
   * worked out (no target, no ungraded items, or nothing graded).
   */
  needed: number | null
  outlook: 'secured' | 'reachable' | 'out_of_reach' | null
}

/** Uncategorised items share whatever weight the categories leave over. */
function groups(items: Item[], categories: GradeCategory[]): { groups: Group[]; ignored: number } {
  if (categories.length === 0) return { groups: [{ id: null, name: 'All work', weight: 100, items }], ignored: 0 }
  const known = new Set(categories.map((c) => c.id))
  const out: Group[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    weight: c.weight,
    items: items.filter((i) => i.categoryId === c.id),
  }))
  const loose = items.filter((i) => !i.categoryId || !known.has(i.categoryId))
  const left = Math.max(0, 100 - categories.reduce((n, c) => n + c.weight, 0))
  if (loose.length > 0 && left > 0) out.push({ id: null, name: 'Other', weight: left, items: loose })
  return { groups: out, ignored: left > 0 ? 0 : loose.length }
}

/**
 * Category-weighted estimate. Each category's percentage is the weighted average of its graded
 * items; categories with nothing graded yet are left out and the rest re-scaled, which is how
 * "current grade" is normally reported mid-term.
 *
 * `needed` assumes the same percentage on every ungraded item. Within a category, ungraded items
 * count with their own weights; categories with no items at all are left out, since there's
 * nothing to project for them.
 */
export function gradeSummary(items: Item[], categories: GradeCategory[], target: number | null): GradeSummary {
  const { groups: gs, ignored } = groups(items, categories)

  const results: CategoryResult[] = gs.map((g) => ({
    id: g.id,
    name: g.name,
    weight: g.weight,
    percent: gradeEstimate(g.items),
    graded: g.items.filter(isGraded).length,
    pending: g.items.filter((i) => !isGraded(i) && i.maxScore > 0 && i.weight > 0).length,
  }))

  let estW = 0
  let estSum = 0
  for (const r of results) {
    if (r.percent === null) continue
    estW += r.weight
    estSum += r.weight * r.percent
  }
  const estimate = estW > 0 ? round1(estSum / estW) : null
  const pending = results.reduce((n, r) => n + r.pending, 0)

  // final(x) = a + b·x, where x is the percentage scored on every ungraded item.
  let a = 0
  let b = 0
  let projW = 0
  for (const g of gs) {
    let gradedW = 0
    let gradedSum = 0
    let pendingW = 0
    for (const i of g.items) {
      if (i.maxScore <= 0 || i.weight <= 0) continue
      if (isGraded(i)) {
        gradedW += i.weight
        gradedSum += (i.score / i.maxScore) * 100 * i.weight
      } else pendingW += i.weight
    }
    const total = gradedW + pendingW
    if (total === 0) continue
    projW += g.weight
    a += (g.weight * gradedSum) / total
    b += (g.weight * pendingW) / total
  }

  let needed: number | null = null
  let outlook: GradeSummary['outlook'] = null
  if (target !== null && projW > 0 && b > 0 && estimate !== null) {
    a /= projW
    b /= projW
    needed = round1((target - a) / b)
    outlook = needed <= 0 ? 'secured' : needed > 100 ? 'out_of_reach' : 'reachable'
  }
  return { estimate, categories: results, ignored, pending, needed, outlook }
}

export type TargetStatus = 'met' | 'close' | 'below'

/** Within 3 points of the target counts as close. */
export function targetStatus(estimate: number, target: number): TargetStatus {
  if (estimate >= target) return 'met'
  if (target - estimate <= 3) return 'close'
  return 'below'
}

/** "87.5" → "87.5%", "90" → "90%". */
export function formatPercent(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`
}
