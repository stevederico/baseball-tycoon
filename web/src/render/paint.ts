import type { Fan } from '../entity/Fan'
import type { GameState } from '../core/GameState'
import { GRID_H, GRID_W } from '../core/constants'
import { BUILDINGS, isBuildingUnlocked, type BuildingId } from '../world/facilities'
import {
  getBases,
  getFieldOutline,
  getInfieldDirtLoop,
  getOutfieldArc,
  getOutfieldFencePath,
  HOME,
  OUTFIELD_RADIUS,
  foulDirections,
  standDepth,
  type FieldPoint,
} from '../game/field'
import { gridToScreen, TILE_H, TILE_W, worldToScreen } from '../game/iso'
import { getParkStats } from '../management/Economy'
import { GATE, PARK } from '../world/parkBounds'
import { drawBuilding, drawSceneryTree, fill, hash01, SHIRTS, type Pt } from './buildings'
import { CHALK, DIRT, MEADOW } from './palette'
import { TileAtlas, TILE_SPRITE_H, TILE_SPRITE_W, type TileKind } from './sprites'

/** Decorative countryside drawn around the playable grid, in tiles. */
const RING = 6
const ROAD_Z = GRID_H + 1

// ── Ground layer (baked once, re-baked when the park changes) ────────────

function isPlaza(x: number, z: number): boolean {
  return x >= GATE.x0 - 1 && x <= GATE.x1 + 1 && z > PARK.maxZ && z < ROAD_Z
}

function isRoad(z: number): boolean {
  return z === ROAD_Z || z === ROAD_Z + 1
}

function groundKind(state: GameState, x: number, z: number): TileKind {
  if (isRoad(z)) return 'road'
  if (isPlaza(x, z)) return 'lot'
  const zone = state.map.getZone(x, z)
  if (zone === 'outside') return 'grass'
  // Facilities sit on a darker pad so the footprint reads clearly.
  if (zone === 'lot' && state.map.getFacility(x, z)) return 'path'
  return 'lot'
}

function chalkLine(ctx: CanvasRenderingContext2D, a: FieldPoint, b: FieldPoint, ox: number, oy: number, w: number): void {
  const p0 = worldToScreen(a.x, a.z, ox, oy)
  const p1 = worldToScreen(b.x, b.z, ox, oy)
  ctx.strokeStyle = CHALK
  ctx.lineWidth = w
  ctx.beginPath()
  ctx.moveTo(p0.x, p0.y)
  ctx.lineTo(p1.x, p1.y)
  ctx.stroke()
}

function fieldPts(loop: FieldPoint[], ox: number, oy: number): Pt[] {
  return loop.map((p) => worldToScreen(p.x, p.z, ox, oy))
}

function tracePath(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
}

function dirtBlob(ctx: CanvasRenderingContext2D, p: Pt, rx: number, ry: number): void {
  ctx.fillStyle = DIRT.base
  ctx.beginPath()
  ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** Grass clipped to the smooth field outline, with a dirt warning track. */
function drawFieldSurface(ctx: CanvasRenderingContext2D, atlas: TileAtlas, ox: number, oy: number): void {
  ctx.save()
  tracePath(ctx, fieldPts(getFieldOutline(), ox, oy))
  ctx.clip()
  for (let sum = 0; sum <= HOME.x + HOME.z + 2; sum += 1) {
    for (let x = 0; x <= Math.min(sum, HOME.x + 1); x += 1) {
      const z = sum - x
      if (z > HOME.z + 1) continue
      const c = gridToScreen(x, z, ox, oy)
      ctx.drawImage(atlas.get('outfield', x, z), c.x - TILE_SPRITE_W / 2, c.y - TILE_SPRITE_H / 2)
    }
  }
  // Warning track just inside the outfield wall.
  const track = fieldPts(getOutfieldArc(OUTFIELD_RADIUS - 0.35, 40), ox, oy)
  ctx.strokeStyle = DIRT.base
  ctx.lineWidth = 9
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(track[0].x, track[0].y)
  for (let i = 1; i < track.length; i += 1) ctx.lineTo(track[i].x, track[i].y)
  ctx.stroke()
  ctx.restore()
}

function drawFieldMarkings(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const bases = getBases()
  const foul = foulDirections()
  const W = (p: FieldPoint): Pt => worldToScreen(p.x, p.z, ox, oy)

  // Smooth dirt infield (home plate fanning out to the grass arc).
  fill(ctx, fieldPts(getInfieldDirtLoop(), ox, oy), DIRT.base)

  // Dirt basepaths threading through the grass to each base.
  const bp = [bases.home, bases.first, bases.second, bases.third, bases.home].map(W)
  ctx.strokeStyle = DIRT.base
  ctx.lineWidth = 7
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(bp[0].x, bp[0].y)
  for (let i = 1; i < bp.length; i += 1) ctx.lineTo(bp[i].x, bp[i].y)
  ctx.stroke()
  for (const b of [bases.first, bases.second, bases.third]) dirtBlob(ctx, W(b), 8, 4)
  dirtBlob(ctx, W(HOME), 11, 6)

  // Foul lines run all the way to the foul poles at the outfield fence.
  chalkLine(ctx, HOME, { x: HOME.x + foul.first.x * OUTFIELD_RADIUS, z: HOME.z + foul.first.z * OUTFIELD_RADIUS }, ox, oy, 2)
  chalkLine(ctx, HOME, { x: HOME.x + foul.third.x * OUTFIELD_RADIUS, z: HOME.z + foul.third.z * OUTFIELD_RADIUS }, ox, oy, 2)

  // Chalk basepaths + bases.
  chalkLine(ctx, bases.home, bases.first, ox, oy, 1.5)
  chalkLine(ctx, bases.first, bases.second, ox, oy, 1.5)
  chalkLine(ctx, bases.second, bases.third, ox, oy, 1.5)
  chalkLine(ctx, bases.third, bases.home, ox, oy, 1.5)
  for (const b of [bases.first, bases.second, bases.third]) {
    const p = W(b)
    ctx.fillStyle = CHALK
    ctx.fillRect(p.x - 3, p.y - 3, 6, 6)
  }

  const hp = W({ x: HOME.x, z: HOME.z - 0.1 })
  fill(ctx, [{ x: hp.x, y: hp.y - 5 }, { x: hp.x + 5, y: hp.y }, { x: hp.x, y: hp.y + 5 }, { x: hp.x - 5, y: hp.y + 2 }], CHALK)

  const mound = W(bases.mound)
  dirtBlob(ctx, mound, 7, 4)
  ctx.fillStyle = CHALK
  ctx.fillRect(mound.x - 2, mound.y - 1, 4, 2)
}

function drawRoadMarkings(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  ctx.strokeStyle = '#e6c84a'
  ctx.lineWidth = 1.5
  ctx.setLineDash([10, 8])
  const a = worldToScreen(-RING - 0.5, ROAD_Z + 0.5, ox, oy)
  const b = worldToScreen(GRID_W + RING - 0.5, ROAD_Z + 0.5, ox, oy)
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
  ctx.setLineDash([])
}

export class GroundLayer {
  readonly canvas: HTMLCanvasElement
  /** Where world (0, 0) sits inside the baked canvas. */
  readonly originX: number
  readonly originY: number
  private bakedVersion = -1
  private bakedMap: GameState['map'] | null = null

  constructor() {
    const span = GRID_W + GRID_H + RING * 4
    this.canvas = document.createElement('canvas')
    this.canvas.width = span * (TILE_W / 2) + TILE_W * 2
    this.canvas.height = span * (TILE_H / 2) + TILE_H * 4
    this.originX = (GRID_H + RING * 2) * (TILE_W / 2) + TILE_W
    this.originY = RING * TILE_H + TILE_H * 2
  }

  /** Re-bake if the park has changed since the last frame. */
  ensure(state: GameState, atlas: TileAtlas): void {
    if (this.bakedMap === state.map && this.bakedVersion === state.map.version) return
    this.bakedMap = state.map
    this.bakedVersion = state.map.version
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    const ox = this.originX
    const oy = this.originY
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    const min = -RING
    const maxX = GRID_W + RING - 1
    const maxZ = GRID_H + RING - 1
    for (let sum = min * 2; sum <= maxX + maxZ; sum += 1) {
      for (let x = min; x <= maxX; x += 1) {
        const z = sum - x
        if (z < min || z > maxZ) continue
        const c = gridToScreen(x, z, ox, oy)
        // Fade the countryside into the meadow colour toward the edge.
        const edge = Math.max(min + RING - x, x - (GRID_W - 1), min + RING - z, z - (GRID_H - 1), 0)
        ctx.globalAlpha = isRoad(z) ? 1 : 1 - Math.max(0, edge - 2) / (RING - 1)
        ctx.drawImage(atlas.get(groundKind(state, x, z), x, z), c.x - TILE_SPRITE_W / 2, c.y - TILE_SPRITE_H / 2)
      }
    }
    ctx.globalAlpha = 1

    drawRoadMarkings(ctx, ox, oy)
    drawFieldSurface(ctx, atlas, ox, oy)
    drawFieldMarkings(ctx, ox, oy)

    // Trees dotted around the countryside, back to front.
    for (let sum = min * 2; sum <= maxX + maxZ; sum += 1) {
      for (let x = min; x <= maxX; x += 1) {
        const z = sum - x
        if (z < min || z > maxZ) continue
        if (state.map.getZone(x, z) !== 'outside' || isRoad(z) || isPlaza(x, z)) continue
        if (z === ROAD_Z - 1 || z === ROAD_Z + 2) continue
        if (hash01(x * 53 + 11, z * 97 + 5) > 0.16) continue
        const c = gridToScreen(x, z, ox, oy)
        drawSceneryTree(ctx, c.x, c.y, x * 31 + z * 17)
      }
    }
  }
}

// ── Depth-sorted scene objects ───────────────────────────────────────────

interface Drawable {
  depth: number
  draw: (ctx: CanvasRenderingContext2D) => void
}

const FENCE_H = 10
const FENCE_FACE = '#46505c'
const FENCE_CAP = '#7b8492'

function wallSegment(
  ctx: CanvasRenderingContext2D,
  a: Pt, b: Pt, height: number, face: string, cap: string,
): void {
  fill(ctx, [{ x: a.x, y: a.y - height }, { x: b.x, y: b.y - height }, b, a], face)
  ctx.strokeStyle = cap
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(a.x, a.y - height)
  ctx.lineTo(b.x, b.y - height)
  ctx.stroke()
}

function addParkFence(list: Drawable[], ox: number, oy: number): void {
  const lo = { x: PARK.minX - 0.5, z: PARK.minZ - 0.5 }
  const hi = { x: PARK.maxX + 0.5, z: PARK.maxZ + 0.5 }
  const segment = (ax: number, az: number, bx: number, bz: number): void => {
    const a = worldToScreen(ax, az, ox, oy)
    const b = worldToScreen(bx, bz, ox, oy)
    list.push({
      depth: (ax + az + bx + bz) / 2 - 0.01,
      draw: (ctx) => wallSegment(ctx, a, b, FENCE_H, FENCE_FACE, FENCE_CAP),
    })
  }
  for (let x = PARK.minX; x <= PARK.maxX; x += 1) {
    segment(x - 0.5, lo.z, x + 0.5, lo.z)
    if (x < GATE.x0 || x > GATE.x1) segment(x - 0.5, hi.z, x + 0.5, hi.z)
  }
  for (let z = PARK.minZ; z <= PARK.maxZ; z += 1) {
    segment(lo.x, z - 0.5, lo.x, z + 0.5)
    segment(hi.x, z - 0.5, hi.x, z + 0.5)
  }

  // Gate posts and the banner over the opening.
  const left = worldToScreen(GATE.x0 - 0.5, hi.z, ox, oy)
  const right = worldToScreen(GATE.x1 + 0.5, hi.z, ox, oy)
  list.push({
    depth: GATE.x1 + 0.5 + hi.z + 0.2,
    draw: (ctx) => {
      for (const p of [left, right]) {
        ctx.fillStyle = '#2a3038'
        ctx.fillRect(p.x - 2, p.y - FENCE_H - 14, 4, FENCE_H + 14)
        ctx.fillStyle = '#c9a227'
        ctx.fillRect(p.x - 3, p.y - FENCE_H - 18, 6, 4)
      }
      fill(ctx, [
        { x: left.x, y: left.y - FENCE_H - 14 },
        { x: right.x, y: right.y - FENCE_H - 14 },
        { x: right.x, y: right.y - FENCE_H - 6 },
        { x: left.x, y: left.y - FENCE_H - 6 },
      ], '#a83b48')
      ctx.strokeStyle = '#f4f1e6'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(left.x + 4, left.y - FENCE_H - 10 + 2)
      ctx.lineTo(right.x - 4, right.y - FENCE_H - 10 - 2)
      ctx.stroke()
    },
  })
}

function addOutfieldWall(list: Drawable[], ox: number, oy: number): void {
  const path = getOutfieldFencePath(36)
  const WALL_H = 12
  for (let i = 0; i < path.length - 1; i += 1) {
    const wa = path[i]
    const wb = path[i + 1]
    const a = worldToScreen(wa.x, wa.z, ox, oy)
    const b = worldToScreen(wb.x, wb.z, ox, oy)
    list.push({
      depth: (wa.x + wa.z + wb.x + wb.z) / 2,
      draw: (ctx) => {
        wallSegment(ctx, a, b, WALL_H, '#1f7338', '#e8c63a')
        if (i % 3 === 0) {
          ctx.fillStyle = '#0e3219'
          ctx.fillRect(a.x - 1, a.y - WALL_H, 2, WALL_H)
        }
      },
    })
  }
  // Foul poles.
  for (const pole of [path[0], path[path.length - 1]]) {
    const p = worldToScreen(pole.x, pole.z, ox, oy)
    list.push({
      depth: pole.x + pole.z + 0.05,
      draw: (ctx) => {
        ctx.fillStyle = '#f2c230'
        ctx.fillRect(p.x - 1, p.y - 34, 2, 34)
      },
    })
  }
}

function drawFigure(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  shirt: string, legs: string, cap: string | null, step: number,
): void {
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.fillRect(x - 2, y, 5, 2)
  ctx.fillStyle = '#15151b'
  ctx.fillRect(x - 2, y - 11, 5, 11)
  ctx.fillStyle = legs
  ctx.fillRect(x - 1, y - 5, 1, 5 - (step === 1 ? 1 : 0))
  ctx.fillRect(x + 1, y - 5, 1, 5 - (step === 2 ? 1 : 0))
  ctx.fillStyle = shirt
  ctx.fillRect(x - 1, y - 9, 3, 4)
  ctx.fillStyle = '#f0c8a0'
  ctx.fillRect(x - 1, y - 11, 3, 2)
  if (cap) {
    ctx.fillStyle = cap
    ctx.fillRect(x - 1, y - 12, 3, 1)
  }
}

function addFans(list: Drawable[], fans: Fan[], ox: number, oy: number, ticks: number): void {
  for (const fan of fans) {
    const p = worldToScreen(fan.x, fan.z, ox, oy)
    const moving = fan.state === 'walking' || fan.state === 'entering' || fan.state === 'leaving'
    const step = moving ? 1 + (Math.floor(ticks / 6 + fan.id) % 2) : 0
    list.push({
      depth: fan.x + fan.z,
      draw: (ctx) => drawFigure(ctx, Math.round(p.x), Math.round(p.y), SHIRTS[fan.shirt % SHIRTS.length], '#3a3640', null, step),
    })
  }
}

/** Ticks one pitch takes, from the wind-up to the ball coming back in. */
const PITCH_TICKS = 72

interface BallState {
  pos: FieldPoint
  height: number
  runner: FieldPoint | null
}

/** Where the ball (and any runner) is for the current tick of the live game. */
function ballAt(state: GameState): BallState {
  const bases = getBases()
  const pitch = Math.floor(state.phaseTicks / PITCH_TICKS)
  const t = (state.phaseTicks % PITCH_TICKS) / PITCH_TICKS
  const lerp = (a: FieldPoint, b: FieldPoint, k: number): FieldPoint => ({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k })
  const plate = { x: HOME.x - 0.1, z: HOME.z - 0.1 }

  if (t < 0.3) return { pos: lerp(bases.mound, plate, t / 0.3), height: 5, runner: null }

  const roll = hash01(pitch * 31 + 7, (state.today?.gameIndex ?? 0) * 13 + 3)
  if (roll < 0.45) {
    // Taken pitch: the catcher tosses it back.
    return { pos: lerp(plate, bases.mound, (t - 0.3) / 0.7), height: 5, runner: null }
  }
  const angle = hash01(pitch * 17 + 1, 5) * (Math.PI / 2)
  const reach = 4 + hash01(pitch * 23 + 9, 2) * (roll > 0.9 ? 8 : 5.5)
  const landing = { x: HOME.x - Math.sin(angle) * reach, z: HOME.z - Math.cos(angle) * reach }
  const k = Math.min(1, (t - 0.3) / 0.5)
  return {
    pos: lerp(plate, landing, k),
    height: 4 + Math.sin(k * Math.PI) * (12 + reach * 3),
    runner: lerp(plate, bases.first, Math.min(1, (t - 0.3) / 0.6)),
  }
}

function addPlayers(list: Drawable[], state: GameState, ox: number, oy: number): void {
  if (state.phase !== 'live' && state.phase !== 'pregame') return
  const b = getBases()
  const cf = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 }
  const mid = (a: FieldPoint, c: FieldPoint): FieldPoint => ({ x: (a.x + c.x) / 2, z: (a.z + c.z) / 2 })
  const off = (p: FieldPoint, d: { x: number; z: number }, m: number): FieldPoint => ({ x: p.x + d.x * m, z: p.z + d.z * m })
  const home: FieldPoint = { x: HOME.x, z: HOME.z }
  const live = state.phase === 'live'
  // The home side fields in the top half of each inning.
  const half = state.today?.halfInningsShown ?? 0
  const homeFielding = half % 2 === 0
  const homeColors = { shirt: '#f4f4f4', cap: '#2f62ad' }
  const awayColors = { shirt: '#9aa0a8', cap: '#3a3a44' }
  const fielding = homeFielding ? homeColors : awayColors
  const batting = homeFielding ? awayColors : homeColors

  const put = (p: FieldPoint, colors: { shirt: string; cap: string }): void => {
    const s = worldToScreen(p.x, p.z, ox, oy)
    list.push({
      depth: p.x + p.z,
      draw: (ctx) => drawFigure(ctx, Math.round(s.x), Math.round(s.y), colors.shirt, '#d8d8d8', colors.cap, 0),
    })
  }

  const fielders: FieldPoint[] = [
    b.mound,
    off(b.first, cf, 0.4),
    off(mid(b.first, b.second), cf, 1),
    off(mid(b.second, b.third), cf, 1),
    off(b.third, cf, 0.4),
    off(home, { x: -0.86, z: -0.5 }, 8),
    off(home, cf, 9),
    off(home, { x: -0.5, z: -0.86 }, 8),
    { x: home.x + 0.45, z: home.z + 0.45 },
  ]
  for (const p of fielders) put(p, fielding)
  if (!live) return

  put({ x: home.x + 0.35, z: home.z - 0.3 }, batting)
  const ball = ballAt(state)
  if (ball.runner) put(ball.runner, batting)
  const s = worldToScreen(ball.pos.x, ball.pos.z, ox, oy)
  list.push({
    depth: ball.pos.x + ball.pos.z + 0.3,
    draw: (ctx) => {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y), 3, 1)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y - ball.height) - 1, 3, 3)
    },
  })
}

function isSeating(id: BuildingId | null): boolean {
  return id === 'grandstand' || id === 'bleachers'
}

/**
 * Depth at which a seating bank starts: follow the rows in front of this tile
 * toward the field. A lone section far from the diamond then sits low instead
 * of towering, while rows stacked behind each other still rake upward.
 */
function standFrontDepth(state: GameState, gx: number, gz: number): number {
  let x = gx
  let z = gz
  for (let i = 0; i < 8; i += 1) {
    const fx = x - HOME.x
    const fz = z - HOME.z
    let nx = x
    let nz = z
    if (fx > 0 && (fz <= 0 || fx >= fz)) nx -= 1
    else if (fz > 0) nz -= 1
    else if (Math.abs(fx) >= Math.abs(fz)) nx += 1
    else nz += 1
    if (!isSeating(state.map.getFacility(nx, nz))) break
    x = nx
    z = nz
  }
  return Math.max(0, standDepth(x, z) - 0.5)
}

/** How full the stands look right now, 0..1. */
function crowdFill(state: GameState): number {
  const today = state.today
  if (!today || !today.home) return 0
  const seats = getParkStats(state.map).seats
  if (seats <= 0) return 0
  const full = Math.min(1, today.attendance / seats)
  if (state.phase === 'pregame') return full * Math.min(1, state.phaseTicks / 120)
  if (state.phase === 'live') return full
  if (state.phase === 'postgame') return full * Math.max(0, 1 - state.phaseTicks / 80)
  return 0
}

function tileDiamond(cx: number, cy: number): Pt[] {
  return [
    { x: cx, y: cy - TILE_H / 2 },
    { x: cx + TILE_W / 2, y: cy },
    { x: cx, y: cy + TILE_H / 2 },
    { x: cx - TILE_W / 2, y: cy },
  ]
}

/** True if the current tool would do something on this tile. */
export function isGhostValid(state: GameState, x: number, z: number): boolean {
  if (state.toolMode === 'demolish') return state.map.getFacility(x, z) !== null
  const def = BUILDINGS[state.selectedBuilding]
  return (
    state.map.canPlaceFacility(x, z) &&
    state.park.cash >= def.cost &&
    isBuildingUnlocked(state.selectedBuilding, state.research.unlocked)
  )
}

function addGhost(list: Drawable[], state: GameState, ox: number, oy: number, time: number): void {
  if (!state.ghostPos || state.scenario.status !== 'active') return
  const { x, z } = state.ghostPos
  const c = gridToScreen(x, z, ox, oy)
  const valid = isGhostValid(state, x, z)
  const building: BuildingId | null = state.toolMode === 'build' ? state.selectedBuilding : null
  list.push({
    depth: x + z + 0.02,
    draw: (ctx) => {
      const pulse = 0.4 + Math.sin(time * 5) * 0.1
      fill(ctx, tileDiamond(c.x, c.y), valid
        ? (building ? `rgba(90,220,110,${pulse})` : `rgba(235,70,70,${pulse + 0.1})`)
        : `rgba(235,70,70,${pulse})`)
      ctx.strokeStyle = valid && building ? '#eaffea' : '#ffe1e1'
      ctx.lineWidth = 1
      tracePath(ctx, tileDiamond(c.x, c.y))
      ctx.stroke()
      if (building && valid) {
        ctx.globalAlpha = 0.7
        drawBuilding(ctx, building, c.x, c.y, x, z, 0, time, standFrontDepth(state, x, z))
        ctx.globalAlpha = 1
      }
    },
  })
}

// ── Weather and lighting ─────────────────────────────────────────────────

function drawNight(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number, ox: number, oy: number): void {
  ctx.fillStyle = 'rgba(8,14,44,0.46)'
  ctx.fillRect(0, 0, w, h)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const glow = (p: Pt, radius: number, strength: number): void => {
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius)
    g.addColorStop(0, `rgba(255,244,190,${strength})`)
    g.addColorStop(1, 'rgba(255,244,190,0)')
    ctx.fillStyle = g
    ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2)
  }
  // The field itself is floodlit.
  glow(worldToScreen(HOME.x - 5, HOME.z - 5, ox, oy), 330, 0.2)
  for (const [key, id] of state.map.getAllFacilities()) {
    if (id !== 'lights') continue
    const [x, z] = key.split(',').map(Number)
    const c = gridToScreen(x, z, ox, oy)
    glow({ x: c.x, y: c.y - 40 }, 70, 0.5)
  }
  ctx.restore()
}

function drawRain(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  ctx.fillStyle = 'rgba(40,52,70,0.2)'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(200,220,245,0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < 140; i += 1) {
    const x = (hash01(i, 1) * (w + 80) + time * 90) % (w + 80) - 40
    const y = (hash01(i, 2) * h + time * (420 + hash01(i, 3) * 160)) % h
    ctx.moveTo(x, y)
    ctx.lineTo(x - 3, y + 9)
  }
  ctx.stroke()
}

function weatherShowing(state: GameState): boolean {
  return Boolean(state.today?.home) && state.phase !== 'idle' && state.phase !== 'away'
}

export function paintPark(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  width: number,
  height: number,
  originX: number,
  originY: number,
  atlas: TileAtlas,
  ground: GroundLayer,
  time: number,
): void {
  ctx.fillStyle = MEADOW
  ctx.fillRect(0, 0, width, height)

  ground.ensure(state, atlas)
  ctx.drawImage(ground.canvas, Math.round(originX - ground.originX), Math.round(originY - ground.originY))

  const list: Drawable[] = []
  const crowd = crowdFill(state)
  for (const [key, id] of state.map.getAllFacilities()) {
    const [x, z] = key.split(',').map(Number)
    const c = gridToScreen(x, z, originX, originY)
    const front = isSeating(id) ? standFrontDepth(state, x, z) : 0
    list.push({ depth: x + z, draw: (c2) => drawBuilding(c2, id, c.x, c.y, x, z, crowd, time, front) })
  }
  addParkFence(list, originX, originY)
  addOutfieldWall(list, originX, originY)
  addPlayers(list, state, originX, originY)
  addFans(list, state.entities.fans, originX, originY, state.currentTicks)
  addGhost(list, state, originX, originY, time)

  list.sort((a, b) => a.depth - b.depth)
  for (const item of list) item.draw(ctx)

  if (weatherShowing(state)) {
    if (state.today?.night) drawNight(ctx, state, width, height, originX, originY)
    if (state.today?.weather === 'rain') drawRain(ctx, width, height, time)
  }
}
