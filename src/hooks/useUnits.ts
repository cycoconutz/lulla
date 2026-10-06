import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { normalizeSettings } from '../domain/repositories'
import { lengthUnitFor, type LengthUnit, type VolumeUnit, type WeightUnit } from '../domain/units'

/**
 * The units the user picked in Settings, read live so a toggle applies
 * everywhere at once.
 *
 * The settings row is read with a plain query rather than `getSettings()`:
 * that helper can write (it inserts defaults), which `useLiveQuery` rejects
 * with `ReadOnlyError`.
 */
export function useUnits(): {
  volume: VolumeUnit
  weight: WeightUnit
  length: LengthUnit
} {
  const row = useLiveQuery(async () => {
    const [settings] = await db.settings.toArray()
    return settings ? normalizeSettings(settings) : undefined
  }, [])

  const volume: VolumeUnit = row?.unitsVolume === 'ml' ? 'ml' : 'oz'
  const weight: WeightUnit = row?.unitsWeight === 'kg' ? 'kg' : 'lb'
  return { volume, weight, length: lengthUnitFor(weight) }
}

export function useVolumeUnit(): VolumeUnit {
  return useUnits().volume
}

export function useWeightUnit(): WeightUnit {
  return useUnits().weight
}

export function useLengthUnit(): LengthUnit {
  return useUnits().length
}