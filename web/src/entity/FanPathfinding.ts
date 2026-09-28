import type { MapStore } from '../world/Map'
import { GRID_W, GRID_H } from '../core/constants'
import { BUILDINGS } from '../world/facilities'
import { crossesFence, ENTRANCE, inPark } from '../world/parkBounds'
import { isInBounds } from '../world/zones'

const NEIGHBORS = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
] as const

export function isWalkable(map: MapStore, x: number, z: number): boolean {
  if (!isInBounds(x, z)) return false
  // Guests stay on the paved concourse — never the playing field.
  const zone = map.getZone(x, z)
  if (zone === 'infield' || zone === 'outfield') return false
  return map.getFacility(x, z) === null
}

function heuristic(ax: number, az: number, bx: number, bz: number): number {
  return Math.abs(ax - bx) + Math.abs(az - bz)
}

/** A* over concourse tiles. Path points are tile centres. */
export function findPath(
  map: MapStore,
  startX: number,
  startZ: number,
  goalX: number,
  goalZ: number,
): { x: number; z: number }[] {
  const sx = Math.round(startX)
  const sz = Math.round(startZ)
  const gx = Math.round(goalX)
  const gz = Math.round(goalZ)

  const goal = isWalkable(map, gx, gz) ? { x: gx, z: gz } : walkableNextTo(map, gx, gz)
  if (!goal) return []

  const startKey = `${sx},${sz}`
  const goalKey = `${goal.x},${goal.z}`
  if (startKey === goalKey) return []

  const open = new Map<string, { x: number; z: number; f: number; g: number }>()
  const cameFrom = new Map<string, string>()
  const closed = new Set<string>()

  open.set(startKey, { x: sx, z: sz, f: heuristic(sx, sz, goal.x, goal.z), g: 0 })

  while (open.size > 0) {
    let currentKey = ''
    let bestF = Infinity
    for (const [key, node] of open) {
      if (node.f < bestF) {
        bestF = node.f
        currentKey = key
      }
    }

    const current = open.get(currentKey)
    if (!current) break
    if (currentKey === goalKey) {
      return reconstructPath(cameFrom, startKey, goalKey)
    }

    open.delete(currentKey)
    closed.add(currentKey)

    for (const [dx, dz] of NEIGHBORS) {
      const nx = current.x + dx
      const nz = current.z + dz
      const nKey = `${nx},${nz}`
      if (!isWalkable(map, nx, nz) || closed.has(nKey)) continue
      if (crossesFence(current.x, current.z, nx, nz)) continue

      const g = current.g + 1
      const existing = open.get(nKey)
      if (!existing || g < existing.g) {
        cameFrom.set(nKey, currentKey)
        open.set(nKey, {
          x: nx,
          z: nz,
          g,
          f: g + heuristic(nx, nz, goal.x, goal.z),
        })
      }
    }
  }

  return []
}

function reconstructPath(
  cameFrom: Map<string, string>,
  startKey: string,
  goalKey: string,
): { x: number; z: number }[] {
  const path: { x: number; z: number }[] = []
  let cursor = goalKey
  while (cursor && cursor !== startKey) {
    const [x, z] = cursor.split(',').map(Number)
    // Nudge off dead centre so a crowd does not walk in single file.
    path.unshift({ x: x + (Math.random() - 0.5) * 0.5, z: z + (Math.random() - 0.5) * 0.5 })
    cursor = cameFrom.get(cursor) ?? ''
  }
  return path
}

/** A walkable concourse tile next to a facility (for standing/watching/buying). */
function walkableNextTo(map: MapStore, fx: number, fz: number): { x: number; z: number } | null {
  const options: { x: number; z: number }[] = []
  for (const [dx, dz] of NEIGHBORS) {
    const x = fx + dx
    const z = fz + dz
    if (inPark(x, z) && isWalkable(map, x, z)) options.push({ x, z })
  }
  if (options.length === 0) return null
  return options[Math.floor(Math.random() * options.length)]
}

/** A random walkable concourse tile inside the park (keeps guests in the grounds). */
function randomWalkable(map: MapStore): { x: number; z: number } | null {
  for (let i = 0; i < 40; i += 1) {
    const x = Math.floor(Math.random() * GRID_W)
    const z = Math.floor(Math.random() * GRID_H)
    if (inPark(x, z) && isWalkable(map, x, z)) return { x, z }
  }
  return null
}

export function pickFanDestination(map: MapStore): { x: number; z: number; nearConcession: boolean } {
  const facilities = [...map.getAllFacilities().entries()]
  const shops = facilities.filter(([, id]) => {
    const def = BUILDINGS[id]
    return Boolean(def.serves || def.merch || def.restroom)
  })
  const sights = facilities.filter(([, id]) => {
    const def = BUILDINGS[id]
    return Boolean(def.seats || def.fun)
  })
  const roll = Math.random()

  // Shop: go stand next to a food stand, store or restroom.
  if (shops.length > 0 && roll < 0.35) {
    const [key] = shops[Math.floor(Math.random() * shops.length)]
    const [x, z] = key.split(',').map(Number)
    const spot = walkableNextTo(map, x, z)
    if (spot) return { x: spot.x, z: spot.z, nearConcession: true }
  }

  // Watch: head for a seating section or an attraction.
  if (sights.length > 0 && roll < 0.75) {
    const [key] = sights[Math.floor(Math.random() * sights.length)]
    const [x, z] = key.split(',').map(Number)
    const spot = walkableNextTo(map, x, z)
    if (spot) return { x: spot.x, z: spot.z, nearConcession: false }
  }

  // Wander anywhere on the concourse.
  const w = randomWalkable(map)
  if (w) return { x: w.x, z: w.z, nearConcession: false }
  return { x: EXIT_POINT.x, z: EXIT_POINT.z, nearConcession: false }
}

/** Stadium entrance/exit — the gate on the park's front fence. */
export const EXIT_POINT = { x: ENTRANCE.x, z: ENTRANCE.z }
