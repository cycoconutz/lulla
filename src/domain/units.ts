import type { VOLUME_OPTIONS, WEIGHT_OPTIONS } from './types'

export type VolumeUnit = (typeof VOLUME_OPTIONS)[number]
export type WeightUnit = (typeof WEIGHT_OPTIONS)[number]
export type LengthUnit = 'in' | 'cm'

/**
 * One conversion factor per unit pair. These are the numbers the app already
 * used in `growth.ts` and `today.ts`; both now import them from here so a
 * stored value can never be read back at a second, slightly different ratio.
 */
export const ML_PER_OZ = 29.57
export const KG_PER_LB = 0.4536
export const CM_PER_IN = 2.54

export const toOunces = (amount: number, unit: VolumeUnit): number =>
  unit === 'ml' ? amount / ML_PER_OZ : amount

export const toMilliliters = (amount: number, unit: VolumeUnit): number =>
  unit === 'ml' ? amount : amount * ML_PER_OZ

export function convertVolume(amount: number, from: VolumeUnit, to: VolumeUnit): number {
  if (from === to) return amount
  return to === 'oz' ? toOunces(amount, from) : toMilliliters(amount, from)
}

export const toKilograms = (amount: number, unit: WeightUnit): number =>
  unit === 'lb' ? amount * KG_PER_LB : amount

export const toPounds = (amount: number, unit: WeightUnit): number =>
  unit === 'lb' ? amount : amount / KG_PER_LB

export const OZ_PER_LB = 16

/**
 * Pounds + ounces to the single decimal-pound value stored on a measurement.
 *
 * 7 lb 12 oz is 7.75 lb, which a 0.1 lb stepper cannot represent. Ounces are
 * folded into the pounds, so an 18 oz entry becomes 8 lb 2 oz rather than
 * 7 lb 18 oz. Rounded to 4 decimals, the finest an ounce needs (1/16 = 0.0625);
 * 2 decimals would round a single ounce away.
 */
export function lbOzToPounds(lb: number, oz: number): number {
  const totalOz = (Number.isFinite(lb) ? lb : 0) * OZ_PER_LB + (Number.isFinite(oz) ? oz : 0)
  return Math.round((totalOz / OZ_PER_LB) * 10000) / 10000
}

/** Splits a decimal-pound value back into whole pounds and ounces for the two fields. */
export function poundsToLbOz(pounds: number): { lb: number; oz: number } {
  const safe = Number.isFinite(pounds) && pounds > 0 ? pounds : 0
  const whole = Math.floor(safe)
  return { lb: whole, oz: Math.round((safe - whole) * OZ_PER_LB) }
}

export function convertWeight(amount: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return amount
  return to === 'kg' ? toKilograms(amount, from) : toPounds(amount, from)
}

export const toCentimeters = (amount: number, unit: LengthUnit): number =>
  unit === 'in' ? amount * CM_PER_IN : amount

export const toInches = (amount: number, unit: LengthUnit): number =>
  unit === 'in' ? amount : amount / CM_PER_IN

export function convertLength(amount: number, from: LengthUnit, to: LengthUnit): number {
  if (from === to) return amount
  return to === 'cm' ? toCentimeters(amount, from) : toInches(amount, from)
}

/** Length unit implied by the weight preference, as the Settings toggle pairs them. */
export const lengthUnitFor = (weight: WeightUnit): LengthUnit => (weight === 'kg' ? 'cm' : 'in')

export interface UnitBounds {
  step: number
  max: number
}

export const VOLUME_BOUNDS: Record<VolumeUnit, UnitBounds> = {
  oz: { step: 0.5, max: 32 },
  ml: { step: 0.1, max: 1000 },
}

export const WEIGHT_BOUNDS: Record<WeightUnit, UnitBounds> = {
  lb: { step: 0.1, max: 80 },
  kg: { step: 0.1, max: 40 },
}

export const LENGTH_BOUNDS: Record<LengthUnit, UnitBounds> = {
  in: { step: 0.5, max: 30 },
  cm: { step: 1, max: 80 },
}

export const volumeBounds = (unit: VolumeUnit): UnitBounds => VOLUME_BOUNDS[unit]

/**
 * A sensible starting amount for a volume stepper, expressed in `unit`.
 *
 * Snapped to that unit's own step, so the first +/− lands on a round number. An
 * unconverted seed (the 3 oz default, say) sits off the ml grid, where "−"
 * clamps straight to zero and "＋" jumps to an odd value.
 *
 * Rounded to 2 decimals on the way out: at a 0.1 ml step, `snap * step` leaves
 * float noise (2 oz lands on 59.10000000000001) and the Stepper renders the raw
 * value, so the label would read "59.10000000000001 ml".
 */
export function defaultVolume(ounces: number, unit: VolumeUnit): number {
  const { step, max } = VOLUME_BOUNDS[unit]
  const snapped = Math.round(convertVolume(ounces, 'oz', unit) / step) * step
  return Math.min(max, Math.round(snapped * 100) / 100)
}
export const weightBounds = (unit: WeightUnit): UnitBounds => WEIGHT_BOUNDS[unit]
export const lengthBounds = (unit: LengthUnit): UnitBounds => LENGTH_BOUNDS[unit]