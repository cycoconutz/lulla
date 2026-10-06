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
  ml: { step: 5, max: 1000 },
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
 * unconverted seed (the 3 oz default, say) sits off the 5 ml grid, where "−"
 * clamps straight to zero and "＋" jumps to an odd 8 ml.
 */
export function defaultVolume(ounces: number, unit: VolumeUnit): number {
  const { step, max } = VOLUME_BOUNDS[unit]
  return Math.min(max, Math.round(convertVolume(ounces, 'oz', unit) / step) * step)
}
export const weightBounds = (unit: WeightUnit): UnitBounds => WEIGHT_BOUNDS[unit]
export const lengthBounds = (unit: LengthUnit): UnitBounds => LENGTH_BOUNDS[unit]