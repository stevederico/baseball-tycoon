import { type BuildingId } from './facilities'
import { getStarterAmenities, getStarterGrandstandTiles } from '../game/field'
import { getZoneType, type ZoneType } from './zones'

function posKey(x: number, z: number): string {
  return `${x},${z}`
}

export interface MapJSON {
  facilities: [string, BuildingId][]
}

/** Tile store: which facility (if any) stands on each concourse tile. */
export class MapStore {
  private facilities = new Map<string, BuildingId>()
  /** Bumped on every change so renderers and stat caches know to refresh. */
  version = 0

  getZone(x: number, z: number): ZoneType {
    return getZoneType(x, z)
  }

  canPlaceFacility(x: number, z: number): boolean {
    return this.getZone(x, z) === 'lot' && !this.facilities.has(posKey(x, z))
  }

  placeFacility(x: number, z: number, facilityId: BuildingId): boolean {
    if (!this.canPlaceFacility(x, z)) return false
    this.facilities.set(posKey(x, z), facilityId)
    this.version += 1
    return true
  }

  removeFacility(x: number, z: number): BuildingId | null {
    const key = posKey(x, z)
    const removed = this.facilities.get(key)
    if (!removed) return null
    this.facilities.delete(key)
    this.version += 1
    return removed
  }

  getFacility(x: number, z: number): BuildingId | null {
    return this.facilities.get(posKey(x, z)) ?? null
  }

  hasAdjacentFacility(x: number, z: number, id: BuildingId): boolean {
    const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]] as const
    for (const [dx, dz] of neighbors) {
      if (this.getFacility(x + dx, z + dz) === id) return true
    }
    return false
  }

  getAllFacilities(): Map<string, BuildingId> {
    return this.facilities
  }

  countOf(id: BuildingId): number {
    let total = 0
    for (const value of this.facilities.values()) {
      if (value === id) total += 1
    }
    return total
  }

  seedStarterPark(): void {
    for (const { x, z } of getStarterGrandstandTiles()) this.placeFacility(x, z, 'grandstand')
    for (const { x, z, id } of getStarterAmenities()) this.placeFacility(x, z, id)
  }

  toJSON(): MapJSON {
    return { facilities: [...this.facilities.entries()] }
  }

  static fromJSON(data: MapJSON): MapStore {
    const map = new MapStore()
    for (const [key, id] of data.facilities) {
      const [x, z] = key.split(',').map(Number)
      map.placeFacility(x, z, id)
    }
    return map
  }
}
