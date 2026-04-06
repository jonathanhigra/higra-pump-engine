import { useState, useCallback } from 'react'

export type UnitSystem = 'SI' | 'practical' | 'imperial'

const SYSTEMS: Record<UnitSystem, Record<string, { unit: string; factor: number }>> = {
  SI: { pressure: { unit: 'Pa', factor: 1 }, length: { unit: 'm', factor: 1 }, power: { unit: 'W', factor: 1 }, flow: { unit: 'm\u00B3/s', factor: 1 / 3600 }, head: { unit: 'm', factor: 1 } },
  practical: { pressure: { unit: 'bar', factor: 1e-5 }, length: { unit: 'mm', factor: 1000 }, power: { unit: 'kW', factor: 0.001 }, flow: { unit: 'm\u00B3/h', factor: 1 }, head: { unit: 'm', factor: 1 } },
  imperial: { pressure: { unit: 'psi', factor: 0.000145038 }, length: { unit: 'in', factor: 39.3701 }, power: { unit: 'HP', factor: 0.001341 }, flow: { unit: 'GPM', factor: 4.40287 }, head: { unit: 'ft', factor: 3.28084 } },
}

export function useUnits() {
  const [system, setSystem] = useState<UnitSystem>(() =>
    (localStorage.getItem('hpe_units') as UnitSystem) || 'practical'
  )
  const changeSystem = useCallback((s: UnitSystem) => {
    setSystem(s); localStorage.setItem('hpe_units', s)
  }, [])
  const fmt = useCallback((value: number, type: string, decimals = 1): string => {
    const cfg = SYSTEMS[system]?.[type]
    if (!cfg) return `${value.toFixed(decimals)}`
    return `${(value * cfg.factor).toFixed(decimals)} ${cfg.unit}`
  }, [system])
  return { system, setSystem: changeSystem, fmt }
}
