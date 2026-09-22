export type GrowthKind = 'weight' | 'height' | 'head'
export type Sex = 'boy' | 'girl'

export interface GrowthRefPoint {
  months: number
  p3: number
  p50: number
  p97: number
}

export const GROWTH_REF: Record<GrowthKind, Record<Sex, GrowthRefPoint[]>> = {
  weight: {
    boy: [
      { months: 0, p3: 2.5, p50: 3.3, p97: 4.4 },
      { months: 1, p3: 3.4, p50: 4.5, p97: 5.8 },
      { months: 2, p3: 4.3, p50: 5.6, p97: 7.1 },
      { months: 3, p3: 5.0, p50: 6.4, p97: 8.0 },
      { months: 4, p3: 5.6, p50: 7.0, p97: 8.7 },
      { months: 5, p3: 6.0, p50: 7.5, p97: 9.3 },
      { months: 6, p3: 6.4, p50: 7.9, p97: 9.8 },
      { months: 9, p3: 7.1, p50: 8.9, p97: 11.0 },
      { months: 12, p3: 7.7, p50: 9.6, p97: 11.8 },
      { months: 15, p3: 8.2, p50: 10.3, p97: 12.6 },
      { months: 18, p3: 8.7, p50: 10.9, p97: 13.4 },
      { months: 24, p3: 9.6, p50: 12.2, p97: 15.2 },
    ],
    girl: [
      { months: 0, p3: 2.4, p50: 3.2, p97: 4.2 },
      { months: 1, p3: 3.2, p50: 4.2, p97: 5.5 },
      { months: 2, p3: 3.9, p50: 5.1, p97: 6.6 },
      { months: 3, p3: 4.5, p50: 5.8, p97: 7.5 },
      { months: 4, p3: 5.0, p50: 6.4, p97: 8.2 },
      { months: 5, p3: 5.4, p50: 6.9, p97: 8.7 },
      { months: 6, p3: 5.7, p50: 7.3, p97: 9.3 },
      { months: 9, p3: 6.5, p50: 8.2, p97: 10.4 },
      { months: 12, p3: 7.0, p50: 8.9, p97: 11.2 },
      { months: 15, p3: 7.6, p50: 9.6, p97: 12.0 },
      { months: 18, p3: 8.0, p50: 10.2, p97: 12.7 },
      { months: 24, p3: 9.0, p50: 11.5, p97: 14.3 },
    ],
  },
  height: {
    boy: [
      { months: 0, p3: 46.3, p50: 49.9, p97: 53.4 },
      { months: 1, p3: 50.0, p50: 53.7, p97: 57.4 },
      { months: 2, p3: 53.0, p50: 56.9, p97: 60.7 },
      { months: 3, p3: 55.5, p50: 59.5, p97: 63.5 },
      { months: 4, p3: 57.7, p50: 61.8, p97: 65.8 },
      { months: 5, p3: 59.6, p50: 63.8, p97: 67.9 },
      { months: 6, p3: 61.2, p50: 65.5, p97: 69.7 },
      { months: 9, p3: 64.8, p50: 69.2, p97: 73.6 },
      { months: 12, p3: 67.1, p50: 71.7, p97: 76.3 },
      { months: 15, p3: 68.9, p50: 73.7, p97: 78.4 },
      { months: 18, p3: 70.6, p50: 75.5, p97: 80.4 },
      { months: 24, p3: 73.6, p50: 78.8, p97: 84.0 },
    ],
    girl: [
      { months: 0, p3: 45.6, p50: 49.1, p97: 52.7 },
      { months: 1, p3: 49.0, p50: 52.8, p97: 56.7 },
      { months: 2, p3: 51.7, p50: 55.8, p97: 59.8 },
      { months: 3, p3: 54.0, p50: 58.3, p97: 62.5 },
      { months: 4, p3: 56.1, p50: 60.5, p97: 64.9 },
      { months: 5, p3: 58.0, p50: 62.5, p97: 67.0 },
      { months: 6, p3: 59.6, p50: 64.2, p97: 68.8 },
      { months: 9, p3: 63.2, p50: 67.9, p97: 72.7 },
      { months: 12, p3: 65.5, p50: 70.4, p97: 75.4 },
      { months: 15, p3: 67.6, p50: 72.6, p97: 77.6 },
      { months: 18, p3: 69.4, p50: 74.5, p97: 79.6 },
      { months: 24, p3: 72.6, p50: 78.0, p97: 83.5 },
    ],
  },
  head: {
    boy: [
      { months: 0, p3: 32.1, p50: 34.5, p97: 36.9 },
      { months: 1, p3: 34.6, p50: 37.2, p97: 39.8 },
      { months: 2, p3: 36.2, p50: 39.0, p97: 41.7 },
      { months: 3, p3: 37.5, p50: 40.3, p97: 43.1 },
      { months: 4, p3: 38.5, p50: 41.4, p97: 44.2 },
      { months: 5, p3: 39.4, p50: 42.3, p97: 45.2 },
      { months: 6, p3: 40.1, p50: 43.1, p97: 46.0 },
      { months: 9, p3: 41.8, p50: 44.8, p97: 47.8 },
      { months: 12, p3: 42.8, p50: 45.9, p97: 49.0 },
      { months: 15, p3: 43.6, p50: 46.7, p97: 49.8 },
      { months: 18, p3: 44.2, p50: 47.3, p97: 50.4 },
      { months: 24, p3: 45.3, p50: 48.4, p97: 51.6 },
    ],
    girl: [
      { months: 0, p3: 31.7, p50: 33.9, p97: 36.1 },
      { months: 1, p3: 33.8, p50: 36.4, p97: 39.0 },
      { months: 2, p3: 35.4, p50: 38.0, p97: 40.6 },
      { months: 3, p3: 36.5, p50: 39.2, p97: 41.9 },
      { months: 4, p3: 37.5, p50: 40.3, p97: 43.0 },
      { months: 5, p3: 38.4, p50: 41.2, p97: 44.0 },
      { months: 6, p3: 39.1, p50: 42.0, p97: 44.9 },
      { months: 9, p3: 40.7, p50: 43.7, p97: 46.8 },
      { months: 12, p3: 41.8, p50: 44.9, p97: 48.0 },
      { months: 15, p3: 42.5, p50: 45.8, p97: 49.1 },
      { months: 18, p3: 43.2, p50: 46.5, p97: 49.8 },
      { months: 24, p3: 44.3, p50: 47.7, p97: 51.1 },
    ],
  },
}

export function pickRefPoint(kind: GrowthKind, sex: Sex, months: number): GrowthRefPoint {
  const pts = GROWTH_REF[kind][sex]
  const sorted = [...pts].sort((a, b) => a.months - b.months)
  let chosen = sorted[0]
  for (const p of sorted) {
    if (p.months <= months) chosen = p
    else break
  }
  return chosen
}

export function percentileLabel(kind: GrowthKind, sex: Sex, months: number, value: number, unit: string): number | null {
  const { p3, p50, p97 } = pickRefPoint(kind, sex, months)
  const converted = convertToRef(value, unit, kind)
  if (converted == null) return null
  // Piecewise-linear percentile estimate on the three anchor points.
  if (converted <= p3) return 3
  if (converted >= p97) return 97
  if (converted <= p50) {
    const t = (converted - p3) / (p50 - p3)
    return Math.round(3 + t * 47)
  }
  const t = (converted - p50) / (p97 - p50)
  return Math.round(50 + t * 47)
}

function convertToRef(
  value: number,
  unit: string,
  kind: GrowthKind,
): number | null {
  switch (kind) {
    case 'weight':
      return unit === 'lb' ? value * 0.4536 : value
    case 'height':
    case 'head':
      return unit === 'in' ? value * 2.54 : value
    default:
      return null
  }
}

export function referenceAtMonths(kind: GrowthKind, sex: Sex, months: number) {
  return GROWTH_REF[kind][sex].filter((p) => p.months <= Math.floor(months) + 2)
}

export interface RefSample {
  months: number
  p3: number
  p50: number
  p97: number
}

export function interpolate(p1: GrowthRefPoint, p2: GrowthRefPoint, months: number): Omit<RefSample, 'months'> {
  const t = (months - p1.months) / (p2.months - p1.months)
  const lerp = (a: number, b: number) => a + (b - a) * t
  return { p3: lerp(p1.p3, p2.p3), p50: lerp(p1.p50, p2.p50), p97: lerp(p1.p97, p2.p97) }
}

export function referenceSeries(kind: GrowthKind, sex: Sex, maxMonths = 24): RefSample[] {
  const pts = [...GROWTH_REF[kind][sex]].sort((a, b) => a.months - b.months)
  const out: RefSample[] = []
  const monthCount = Math.min(maxMonths, 24)
  for (let m = 0; m <= monthCount; m++) {
    const exact = pts.find((p) => p.months === m)
    if (exact) {
      out.push({ months: m, p3: exact.p3, p50: exact.p50, p97: exact.p97 })
      continue
    }
    const upper = pts.find((p) => p.months >= m)
    const lowerIndex = pts.findIndex((p) => p.months <= m)
    const lower = pts[Math.max(0, lowerIndex)]!
    if (!upper || upper === lower) {
      out.push({ months: m, p3: lower.p3, p50: lower.p50, p97: lower.p97 })
      continue
    }
    out.push({ months: m, ...interpolate(lower, upper, m) })
  }
  return out
}

export function growthSourceLabel(): string {
  return 'Reference: WHO Child Growth Standards (median band). Simplified for this app; speak with your child’s pediatrician.'
}