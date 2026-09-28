/**
 * Seeded PRNG (mulberry32) that keeps its cursor on the game state, so a
 * season replays identically from a save and the sim is testable.
 */
export interface RngHost {
  rngState: number
}

export function nextRandom(host: RngHost): number {
  host.rngState = (host.rngState + 0x6d2b79f5) | 0
  let t = Math.imul(host.rngState ^ (host.rngState >>> 15), 1 | host.rngState)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function randRange(host: RngHost, min: number, max: number): number {
  return min + nextRandom(host) * (max - min)
}

export function randInt(host: RngHost, min: number, maxInclusive: number): number {
  return min + Math.floor(nextRandom(host) * (maxInclusive - min + 1))
}

export function pick<T>(host: RngHost, items: readonly T[]): T {
  return items[Math.floor(nextRandom(host) * items.length)]
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}
