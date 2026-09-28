/**
 * Baked pixel-art tile atlas. Textures are generated ONCE at boot using a
 * seeded PRNG so they never shimmer between frames, then blitted each render.
 * This is what gives the field its retro stippled-grass look instead of
 * flat vector fills.
 */

import { TILE_H, TILE_W } from '../game/iso'
import { ASPHALT, CONCRETE, DIRT, GRASS, GRASS_MOWED, PAD as PAD_RAMP, type Ramp, shade } from './palette'

export type TileKind = 'grass' | 'outfield' | 'infield' | 'lot' | 'road' | 'path'

const RAMPS: Record<TileKind, Ramp> = {
  grass: GRASS,
  outfield: GRASS_MOWED,
  infield: DIRT,
  lot: CONCRETE,
  road: ASPHALT,
  path: PAD_RAMP,
}

/** Pad so the 1px tile border isn't clipped at the diamond tips. */
const PAD = 2
export const TILE_SPRITE_W = TILE_W + PAD * 2
export const TILE_SPRITE_H = TILE_H + PAD * 2

const VARIANTS = 4

function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Path of the tile diamond, centred in the padded sprite. */
function diamondPath(ctx: CanvasRenderingContext2D): void {
  const cx = TILE_SPRITE_W / 2
  const cy = TILE_SPRITE_H / 2
  ctx.beginPath()
  ctx.moveTo(cx, cy - TILE_H / 2)
  ctx.lineTo(cx + TILE_W / 2, cy)
  ctx.lineTo(cx, cy + TILE_H / 2)
  ctx.lineTo(cx - TILE_W / 2, cy)
  ctx.closePath()
}

function bakeTile(kind: TileKind, variant: number): HTMLCanvasElement {
  const ramp = RAMPS[kind]
  const canvas = makeCanvas(TILE_SPRITE_W, TILE_SPRITE_H)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const rand = mulberry32((kind.charCodeAt(0) << 8) + variant * 9277 + 7)
  // Checker tone keeps a subtle tile grid like classic tycoon grass.
  const checker = variant >= VARIANTS / 2 ? -6 : 0

  ctx.save()
  diamondPath(ctx)
  ctx.clip()

  ctx.fillStyle = shade(ramp.base, checker)
  ctx.fillRect(0, 0, TILE_SPRITE_W, TILE_SPRITE_H)

  // 2px stipple noise.
  for (let y = 0; y < TILE_SPRITE_H; y += 2) {
    for (let x = 0; x < TILE_SPRITE_W; x += 2) {
      const r = rand()
      let col: string | null = null
      if (r > 0.82) col = shade(ramp.light, checker)
      else if (r < 0.2) col = shade(ramp.dark, checker)
      if (col) {
        ctx.fillStyle = col
        ctx.fillRect(x, y, 2, 2)
      }
    }
  }

  // Surface-specific flourishes.
  if (kind === 'grass' || kind === 'outfield') {
    const blades = kind === 'outfield' ? 5 : 9
    ctx.fillStyle = shade(ramp.dark, -10)
    for (let i = 0; i < blades; i += 1) {
      const x = PAD + Math.floor(rand() * TILE_W)
      const y = PAD + Math.floor(rand() * TILE_H)
      ctx.fillRect(x, y, 1, 2)
    }
    if (kind === 'outfield') {
      // Mowed stripe across the diamond.
      ctx.fillStyle = shade(ramp.light, checker)
      ctx.globalAlpha = 0.25
      ctx.fillRect(0, TILE_SPRITE_H / 2 - 2, TILE_SPRITE_W, 2)
      ctx.globalAlpha = 1
    }
  } else if (kind === 'infield' || kind === 'path' || kind === 'lot') {
    // Pebbles + light specks.
    for (let i = 0; i < 7; i += 1) {
      ctx.fillStyle = rand() > 0.5 ? shade(ramp.dark, -14) : shade(ramp.light, 12)
      ctx.fillRect(PAD + Math.floor(rand() * TILE_W), PAD + Math.floor(rand() * TILE_H), 1, 1)
    }
  }
  ctx.restore()

  // Soft top-lit / bottom-shaded diamond edge for tile definition.
  diamondPath(ctx)
  ctx.strokeStyle = shade(ramp.edge, 0)
  ctx.lineWidth = 1
  ctx.stroke()

  return canvas
}

export class TileAtlas {
  private readonly tiles: Record<TileKind, HTMLCanvasElement[]>

  constructor() {
    const kinds: TileKind[] = ['grass', 'outfield', 'infield', 'lot', 'road', 'path']
    const tiles: Partial<Record<TileKind, HTMLCanvasElement[]>> = {}
    for (const kind of kinds) {
      tiles[kind] = Array.from({ length: VARIANTS }, (_, v) => bakeTile(kind, v))
    }
    this.tiles = {
      grass: tiles.grass ?? [],
      outfield: tiles.outfield ?? [],
      infield: tiles.infield ?? [],
      lot: tiles.lot ?? [],
      road: tiles.road ?? [],
      path: tiles.path ?? [],
    }
  }

  get(kind: TileKind, gx: number, gz: number): HTMLCanvasElement {
    const set = this.tiles[kind]
    const idx = (((gx * 3 + gz * 5) % VARIANTS) + VARIANTS) % VARIANTS
    return set[idx]
  }
}
