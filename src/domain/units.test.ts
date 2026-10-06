import { describe, it, expect } from 'vitest'
import {
  CM_PER_IN,
  KG_PER_LB,
  ML_PER_OZ,
  convertLength,
  convertVolume,
  convertWeight,
  defaultVolume,
  lbOzToPounds,
  lengthBounds,
  lengthUnitFor,
  OZ_PER_LB,
  poundsToLbOz,
  toCentimeters,
  toInches,
  toKilograms,
  toMilliliters,
  toOunces,
  toPounds,
  volumeBounds,
  weightBounds,
} from './units'

describe('volume conversion', () => {
  it('leaves ounces untouched and divides millilitres', () => {
    expect(toOunces(4, 'oz')).toBe(4)
    expect(toOunces(100, 'ml')).toBeCloseTo(100 / 29.57, 10)
  })

  it('multiplies ounces into millilitres', () => {
    expect(toMilliliters(4, 'oz')).toBeCloseTo(4 * 29.57, 10)
    expect(toMilliliters(120, 'ml')).toBe(120)
  })

  it('round-trips oz -> ml -> oz', () => {
    expect(toOunces(toMilliliters(3.5, 'oz'), 'ml')).toBeCloseTo(3.5, 10)
  })

  it('is a no-op when the unit does not change', () => {
    expect(convertVolume(7.25, 'oz', 'oz')).toBe(7.25)
    expect(convertVolume(7.25, 'ml', 'ml')).toBe(7.25)
  })

  it('converts between the pair in either direction', () => {
    expect(convertVolume(1, 'oz', 'ml')).toBeCloseTo(ML_PER_OZ, 10)
    expect(convertVolume(ML_PER_OZ, 'ml', 'oz')).toBeCloseTo(1, 10)
  })
})

describe('weight conversion', () => {
  it('converts pounds to kilograms with the shared factor', () => {
    expect(toKilograms(10, 'lb')).toBeCloseTo(10 * 0.4536, 10)
    expect(KG_PER_LB).toBe(0.4536)
  })

  it('round-trips lb -> kg -> lb', () => {
    expect(toPounds(toKilograms(8.3, 'lb'), 'kg')).toBeCloseTo(8.3, 10)
  })

  it('leaves kilograms untouched and is a no-op when unchanged', () => {
    expect(toKilograms(4, 'kg')).toBe(4)
    expect(convertWeight(4, 'kg', 'kg')).toBe(4)
    expect(convertWeight(4, 'lb', 'lb')).toBe(4)
  })

  it('converts kg back to lb', () => {
    expect(convertWeight(1, 'kg', 'lb')).toBeCloseTo(1 / KG_PER_LB, 10)
  })
})

describe('length conversion', () => {
  it('uses 2.54 for inches', () => {
    expect(CM_PER_IN).toBe(2.54)
    expect(toCentimeters(10, 'in')).toBeCloseTo(25.4, 10)
    expect(toInches(25.4, 'cm')).toBeCloseTo(10, 10)
  })

  it('round-trips in -> cm -> in and is a no-op when unchanged', () => {
    expect(toInches(toCentimeters(21.5, 'in'), 'cm')).toBeCloseTo(21.5, 10)
    expect(convertLength(5, 'in', 'in')).toBe(5)
    expect(convertLength(5, 'cm', 'cm')).toBe(5)
  })

  it('pairs the length unit with the weight toggle', () => {
    expect(lengthUnitFor('lb')).toBe('in')
    expect(lengthUnitFor('kg')).toBe('cm')
  })
})

describe('pounds and ounces', () => {
  it('sums lb and oz into the stored decimal pound value', () => {
    expect(lbOzToPounds(7, 12)).toBe(7.75)
    expect(lbOzToPounds(8, 0)).toBe(8)
    expect(lbOzToPounds(0, 8)).toBe(0.5)
  })

  it('keeps a single ounce, which 2-decimal rounding would erase', () => {
    // 1 oz is 0.0625 lb, so this only survives with 4-decimal precision.
    expect(lbOzToPounds(0, 1)).toBe(0.0625)
    expect(lbOzToPounds(8, 1)).toBe(8.0625)
  })

  it('carries ounces of 16 or more into the pounds', () => {
    expect(lbOzToPounds(7, 18)).toBe(8.125)
    expect(poundsToLbOz(lbOzToPounds(7, 18))).toEqual({ lb: 8, oz: 2 })
  })

  it('splits a stored decimal back into the two fields', () => {
    expect(poundsToLbOz(7.75)).toEqual({ lb: 7, oz: 12 })
    expect(poundsToLbOz(8)).toEqual({ lb: 8, oz: 0 })
    expect(poundsToLbOz(8.0625)).toEqual({ lb: 8, oz: 1 })
  })

  it('round-trips every whole ounce of a pound without drift', () => {
    for (let oz = 0; oz < OZ_PER_LB; oz++) {
      expect(poundsToLbOz(lbOzToPounds(7, oz))).toEqual({ lb: 7, oz })
    }
  })

  it('reads a kg value into the fields via the shared factor', () => {
    const lb = toPounds(10, 'kg')
    expect(poundsToLbOz(lb)).toEqual({ lb: 22, oz: 1 })
    // Whole-oz entry quantizes, so the round trip is only exact to half an ounce.
    expect(Math.abs(lbOzToPounds(22, 1) - lb)).toBeLessThan(1 / (OZ_PER_LB * 2))
  })
})

describe('stepper bounds', () => {
  it('gives each volume unit its own step and max', () => {
    expect(volumeBounds('oz')).toEqual({ step: 0.5, max: 32 })
    expect(volumeBounds('ml')).toEqual({ step: 0.1, max: 1000 })
  })

  it('gives each weight unit its own step and max', () => {
    expect(weightBounds('lb')).toEqual({ step: 0.1, max: 80 })
    expect(weightBounds('kg')).toEqual({ step: 0.1, max: 40 })
  })

  it('gives each length unit its own step and max', () => {
    expect(lengthBounds('in')).toEqual({ step: 0.5, max: 30 })
    expect(lengthBounds('cm')).toEqual({ step: 1, max: 80 })
  })
})

describe('default volume', () => {
  it('keeps the ounce default exactly, so nothing changes for an oz user', () => {
    expect(defaultVolume(2, 'oz')).toBe(2)
    expect(defaultVolume(3, 'oz')).toBe(3)
  })

  it('snaps the converted default onto the unit step', () => {
    // 2 oz is 59.14 ml, which is off the 0.1 ml grid.
    expect(defaultVolume(2, 'ml')).toBe(59.1)
    expect(defaultVolume(3, 'ml')).toBe(88.7)
  })

  it('rounds the snapped ml seed to a clean 1-decimal value', () => {
    // At a 0.1 step, `snap * step` carries float noise that the Stepper would
    // otherwise render verbatim, e.g. "118.30000000000001 ml".
    for (const ounces of [1, 2, 3, 4, 8]) {
      const seed = defaultVolume(ounces, 'ml')
      expect(String(seed)).toBe(seed.toFixed(1))
    }
  })

  it('always lands on the step grid, so minus never clamps straight to zero', () => {
    for (const unit of ['oz', 'ml'] as const) {
      const step = volumeBounds(unit).step
      for (const ounces of [1, 2, 3, 4, 8]) {
        const seed = defaultVolume(ounces, unit)
        // Divided rather than `seed % step`, which is float noise at 0.1.
        expect(seed / step).toBeCloseTo(Math.round(seed / step), 10)
        expect(seed - step).toBeGreaterThan(0)
      }
    }
  })

  it('never exceeds the unit max', () => {
    expect(defaultVolume(40, 'ml')).toBe(volumeBounds('ml').max)
    expect(defaultVolume(40, 'oz')).toBe(volumeBounds('oz').max)
  })
})