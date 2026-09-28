/**
 * Park perimeter: a rectangular boundary fence with a single gate on the front
 * (bottom-left) edge. Guests can only cross the fence at the gate, so everyone
 * enters the same way.
 */
export const PARK = { minX: 2, minZ: 2, maxX: 23, maxZ: 23 }

/** Gate occupies these tile columns on the front (z = maxZ) edge. */
export const GATE = { x0: 20, x1: 22 }

/** Staging tile just outside the gate where guests spawn / exit. */
export const ENTRANCE = { x: 21, z: PARK.maxZ + 1 }

export function inPark(x: number, z: number): boolean {
  return x >= PARK.minX && x <= PARK.maxX && z >= PARK.minZ && z <= PARK.maxZ
}

/** Tiles just inside the gate — kept clear so the crowd can always get in. */
export function isGateTile(x: number, z: number): boolean {
  return z === PARK.maxZ && x >= GATE.x0 && x <= GATE.x1
}

/** True if stepping A→B crosses the perimeter fence anywhere but the gate. */
export function crossesFence(ax: number, az: number, bx: number, bz: number): boolean {
  if (inPark(ax, az) === inPark(bx, bz)) return false
  const gateCols = ax === bx && ax >= GATE.x0 && ax <= GATE.x1
  const frontEdge = Math.min(az, bz) === PARK.maxZ && Math.max(az, bz) === PARK.maxZ + 1
  return !(gateCols && frontEdge)
}
