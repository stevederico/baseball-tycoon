import { GRID_H, GRID_W } from '../core/constants'

/**
 * Field geometry, oriented for the classic "diamond" screen view:
 * home plate sits at the near (bottom) point, center field points straight up,
 * and the foul lines fan out to the upper-left / upper-right. Baselines run
 * along the world axes, so on the 2:1 iso screen the bases form a diamond.
 *
 * World units are tiles; tile (x, z) is centred on world point (x, z).
 */
export const HOME = { x: 18, z: 18 }

/** 90-ft basepaths as tile steps (~20 ft per tile), axis-aligned. */
export const BASELINE_TILES = 4.5

/** Outfield fence distance from home along the foul lines / to center field. */
export const OUTFIELD_RADIUS = 11

/** Grass kept in foul territory between the lines and the stands. */
export const FOUL_MARGIN = 0.5

const MOUND_DIST = BASELINE_TILES * (60.5 / 90)
const GRASS_ARC_RATIO = 0.78
/** Center-field unit direction (−x,−z → straight up on screen). */
const CF = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 }

export type PlayingSurface = 'infield' | 'outfield'

export interface FieldPoint {
  x: number
  z: number
}

export interface FieldBases {
  home: FieldPoint
  first: FieldPoint
  second: FieldPoint
  third: FieldPoint
  mound: FieldPoint
}

export function getBases(): FieldBases {
  const b = BASELINE_TILES
  return {
    home: { x: HOME.x, z: HOME.z },
    first: { x: HOME.x, z: HOME.z - b },
    second: { x: HOME.x - b, z: HOME.z - b },
    third: { x: HOME.x - b, z: HOME.z },
    mound: { x: HOME.x + CF.x * MOUND_DIST, z: HOME.z + CF.z * MOUND_DIST },
  }
}

/** Tiles the playing field (or its fence) touches — nothing can be built here. */
export function getPlayingSurface(tileX: number, tileZ: number): PlayingSurface | null {
  const ox = tileX - HOME.x
  const oz = tileZ - HOME.z
  if (ox > 0 || oz > 0) return null
  if (Math.hypot(ox, oz) > OUTFIELD_RADIUS + 0.5) return null
  const infield = ox >= -(BASELINE_TILES + 1) && oz >= -(BASELINE_TILES + 1)
  return infield ? 'infield' : 'outfield'
}

const surfaceGrid: (PlayingSurface | null)[][] = []

function buildSurfaceGrid(): void {
  for (let x = 0; x < GRID_W; x += 1) {
    surfaceGrid[x] = []
    for (let z = 0; z < GRID_H; z += 1) {
      surfaceGrid[x][z] = getPlayingSurface(x, z)
    }
  }
}

buildSurfaceGrid()

export function playingSurfaceAt(tileX: number, tileZ: number): PlayingSurface | null {
  return surfaceGrid[tileX]?.[tileZ] ?? null
}

/** Unit vectors from home toward first base (+ first-base line) and third base. */
export function foulDirections(): { first: FieldPoint; third: FieldPoint } {
  return {
    first: { x: 0, z: -1 },
    third: { x: -1, z: 0 },
  }
}

function getFoulPoles(): { left: FieldPoint; right: FieldPoint } {
  const foul = foulDirections()
  return {
    left: { x: HOME.x + foul.third.x * OUTFIELD_RADIUS, z: HOME.z + foul.third.z * OUTFIELD_RADIUS },
    right: { x: HOME.x + foul.first.x * OUTFIELD_RADIUS, z: HOME.z + foul.first.z * OUTFIELD_RADIUS },
  }
}

function sampleArc(
  center: FieldPoint,
  radius: number,
  start: number,
  end: number,
  steps: number,
): FieldPoint[] {
  const pts: FieldPoint[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = start + ((end - start) * i) / steps
    pts.push({ x: center.x + radius * Math.sin(t), z: center.z + radius * Math.cos(t) })
  }
  return pts
}

export function getInfieldGrassArc(): FieldPoint[] {
  const foul = foulDirections()
  const bases = getBases()
  const reach = BASELINE_TILES * GRASS_ARC_RATIO
  const meetFirst = { x: HOME.x + foul.first.x * reach, z: HOME.z + foul.first.z * reach }
  const meetThird = { x: HOME.x + foul.third.x * reach, z: HOME.z + foul.third.z * reach }
  const radius = Math.hypot(meetFirst.x - bases.mound.x, meetFirst.z - bases.mound.z)
  const start = Math.atan2(meetFirst.x - bases.mound.x, meetFirst.z - bases.mound.z)
  let end = Math.atan2(meetThird.x - bases.mound.x, meetThird.z - bases.mound.z)
  if (end < start) end += 2 * Math.PI // sweep through the outfield side
  return sampleArc(bases.mound, radius, start, end, 20)
}

/** Smooth dirt infield: home plate fanning out to the grass arc. */
export function getInfieldDirtLoop(): FieldPoint[] {
  const foul = foulDirections()
  const reach = BASELINE_TILES * GRASS_ARC_RATIO
  const meetFirst = { x: HOME.x + foul.first.x * reach, z: HOME.z + foul.first.z * reach }
  const meetThird = { x: HOME.x + foul.third.x * reach, z: HOME.z + foul.third.z * reach }
  const grassArc = getInfieldGrassArc()
  return [HOME, meetFirst, ...grassArc.slice(1), meetThird]
}

/** Arc from the right foul pole through center field to the left foul pole. */
export function getOutfieldArc(radius = OUTFIELD_RADIUS, steps = 28): FieldPoint[] {
  const poles = getFoulPoles()
  const start = Math.atan2(poles.left.x - HOME.x, poles.left.z - HOME.z)
  const end = Math.atan2(poles.right.x - HOME.x, poles.right.z - HOME.z)
  // Sweep the short way through center field (−z), not the long way behind home.
  return sampleArc(HOME, radius, end, start + 2 * Math.PI, steps)
}

/** Outfield fence: right foul pole → center field → left foul pole. */
export function getOutfieldFencePath(steps = 28): FieldPoint[] {
  return getOutfieldArc(OUTFIELD_RADIUS, steps)
}

/** Outline of everything that is grass or dirt, including the foul margin. */
export function getFieldOutline(): FieldPoint[] {
  const m = FOUL_MARGIN
  return [
    { x: HOME.x + m, z: HOME.z + m },
    { x: HOME.x + m, z: HOME.z - OUTFIELD_RADIUS },
    ...getOutfieldArc(OUTFIELD_RADIUS, 40),
    { x: HOME.x - OUTFIELD_RADIUS, z: HOME.z + m },
  ]
}

/**
 * How far a world point sits behind the edge of the field, in tiles. Stands
 * rake upward with this value so every section faces the diamond.
 */
export function standDepth(wx: number, wz: number): number {
  const fx = wx - (HOME.x + FOUL_MARGIN)
  const fz = wz - (HOME.z + FOUL_MARGIN)
  if (fx > 0 || fz > 0) return Math.max(0, fx) + Math.max(0, fz)
  return Math.max(0, Math.hypot(wx - HOME.x, wz - HOME.z) - OUTFIELD_RADIUS)
}

/**
 * The ageing grandstand the player inherits: one row hugging both foul lines
 * and a second row wrapped behind home plate.
 */
export function getStarterGrandstandTiles(): { x: number; z: number }[] {
  const tiles: { x: number; z: number }[] = []
  const hx = HOME.x
  const hz = HOME.z
  for (let d = 4; d >= -1; d -= 1) tiles.push({ x: hx + 1, z: hz - d }) // first-base line
  for (let d = 4; d >= 0; d -= 1) tiles.push({ x: hx - d, z: hz + 1 }) // third-base line
  for (let d = 1; d >= -2; d -= 1) tiles.push({ x: hx + 2, z: hz - d })
  for (let d = 1; d >= -1; d -= 1) tiles.push({ x: hx - d, z: hz + 2 })
  return tiles
}

/** Starter amenities on the concourse behind home plate. */
export function getStarterAmenities(): { x: number; z: number; id: 'hotdog' | 'restroom' | 'tree' }[] {
  return [
    { x: HOME.x + 4, z: HOME.z, id: 'hotdog' },
    { x: HOME.x, z: HOME.z + 4, id: 'hotdog' },
    { x: HOME.x + 4, z: HOME.z + 4, id: 'restroom' },
    { x: HOME.x + 5, z: HOME.z - 6, id: 'tree' },
    { x: HOME.x - 6, z: HOME.z + 5, id: 'tree' },
    { x: 3, z: 3, id: 'tree' },
  ]
}
