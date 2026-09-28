import { GRID_H, GRID_W } from '../core/constants'
import { playingSurfaceAt } from '../game/field'
import { inPark, isGateTile } from './parkBounds'

export type ZoneType = 'lot' | 'infield' | 'outfield' | 'gate' | 'outside'

export interface ZoneInfo {
  type: ZoneType
  label: string
  hint: string
  canBuild: boolean
}

export const ZONE_INFO: Record<ZoneType, ZoneInfo> = {
  lot: {
    type: 'lot',
    label: 'Concourse',
    hint: 'Open concourse. Build seats, food stands and attractions here.',
    canBuild: true,
  },
  infield: {
    type: 'infield',
    label: 'Infield',
    hint: 'The diamond. Nothing can be built on the playing field.',
    canBuild: false,
  },
  outfield: {
    type: 'outfield',
    label: 'Outfield',
    hint: 'Outfield grass. Nothing can be built on the playing field.',
    canBuild: false,
  },
  gate: {
    type: 'gate',
    label: 'Main gate',
    hint: 'Fans enter here. The gate plaza has to stay clear.',
    canBuild: false,
  },
  outside: {
    type: 'outside',
    label: 'Outside the park',
    hint: 'Beyond the fence. Build inside the ballpark.',
    canBuild: false,
  },
}

export function isInBounds(x: number, z: number): boolean {
  return x >= 0 && x < GRID_W && z >= 0 && z < GRID_H
}

export function getZoneType(x: number, z: number): ZoneType {
  if (!isInBounds(x, z) || !inPark(x, z)) return 'outside'
  const surface = playingSurfaceAt(x, z)
  if (surface === 'infield') return 'infield'
  if (surface === 'outfield') return 'outfield'
  if (isGateTile(x, z)) return 'gate'
  return 'lot'
}
