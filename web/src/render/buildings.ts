import { standDepth } from '../game/field'
import { TILE_H, TILE_W } from '../game/iso'
import type { BuildingId } from '../world/facilities'
import { DIRT, WATER, shade } from './palette'

export type Pt = { x: number; y: number }

export function fill(ctx: CanvasRenderingContext2D, pts: Pt[], color: string): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
  ctx.fill()
}

export function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** Deterministic 0..1 hash so crowds and scenery never flicker between frames. */
export function hash01(a: number, b: number): number {
  let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export const SHIRTS = ['#d6453f', '#3a78c0', '#e6b800', '#e8e8e8', '#46a64c', '#c060a8', '#e08020']

interface BoxTop {
  tT: Pt
  tL: Pt
  tR: Pt
  tB: Pt
}

/** Chunky iso box. Returns the four corners of its top face. */
export function isoBox(
  ctx: CanvasRenderingContext2D,
  cx: number, baseY: number,
  hw: number, hh: number, boxH: number,
  top: string, left: string, right: string,
): BoxTop {
  const bL = { x: cx - hw, y: baseY }
  const bB = { x: cx, y: baseY + hh }
  const bR = { x: cx + hw, y: baseY }
  const tT = { x: cx, y: baseY - hh - boxH }
  const tL = { x: cx - hw, y: baseY - boxH }
  const tB = { x: cx, y: baseY + hh - boxH }
  const tR = { x: cx + hw, y: baseY - boxH }
  fill(ctx, [bL, bB, tB, tL], left)
  fill(ctx, [bB, bR, tR, tB], right)
  fill(ctx, [tT, tR, tB, tL], top)
  return { tT, tL, tR, tB }
}

/** A point on the left (+z facing) wall of a box: u along the wall, v up it. */
function onLeftWall(cx: number, baseY: number, hw: number, hh: number, u: number, v: number): Pt {
  return { x: cx - hw + hw * u, y: baseY + hh * u - v }
}

function onRightWall(cx: number, baseY: number, hw: number, hh: number, u: number, v: number): Pt {
  return { x: cx + hw * u, y: baseY + hh - hh * u - v }
}

/** Rectangle painted flat onto one of the two camera-facing walls. */
function wallPanel(
  ctx: CanvasRenderingContext2D,
  side: 'left' | 'right',
  cx: number, baseY: number, hw: number, hh: number,
  u0: number, u1: number, v0: number, v1: number,
  color: string,
): void {
  const at = side === 'left' ? onLeftWall : onRightWall
  fill(ctx, [
    at(cx, baseY, hw, hh, u0, v0),
    at(cx, baseY, hw, hh, u1, v0),
    at(cx, baseY, hw, hh, u1, v1),
    at(cx, baseY, hw, hh, u0, v1),
  ], color)
}

interface StandColors {
  seatA: string
  seatB: string
  seam: string
  lip: string
  wallRight: string
  wallLeft: string
}

const GRANDSTAND: StandColors = {
  seatA: '#3569b4', seatB: '#2f62ad', seam: '#1b3a68', lip: '#82abe0', wallRight: '#8c8c8c', wallLeft: '#6f6f6f',
}
const BLEACHERS: StandColors = {
  seatA: '#b9bec4', seatB: '#a6acb3', seam: '#7d848c', lip: '#dfe3e7', wallRight: '#7e6a55', wallLeft: '#655443',
}

/**
 * A raked seating section on one tile that always FACES THE FIELD: each tile
 * corner is lifted by how far it sits behind the field edge, so neighbouring
 * sections join into one continuous bank.
 */
function drawStand(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  gx: number,
  gz: number,
  crowd: number,
  colors: StandColors,
  frontDepth: number,
): void {
  const hw = TILE_W / 2
  const hh = TILE_H / 2
  const FRONT = 3
  const STEP = 10
  const rows = 5
  const seats = 6

  // Diamond corners (screen) and their world coords: top, right, bottom, left.
  const baseC: Pt[] = [
    { x: cx, y: baseY - hh },
    { x: cx + hw, y: baseY },
    { x: cx, y: baseY + hh },
    { x: cx - hw, y: baseY },
  ]
  const cwx = [gx - 0.5, gx + 0.5, gx + 0.5, gx - 0.5]
  const cwz = [gz - 0.5, gz - 0.5, gz + 0.5, gz + 0.5]
  const rs = cwx.map((wx, i) => FRONT + Math.max(0, Math.min(6, standDepth(wx, cwz[i]) - frontDepth)) * STEP)
  const topC = baseC.map((p, i) => ({ x: p.x, y: p.y - rs[i] }))

  // Camera-facing structure walls (the +x and +z edges).
  fill(ctx, [baseC[1], baseC[2], topC[2], topC[1]], colors.wallRight)
  fill(ctx, [baseC[2], baseC[3], topC[3], topC[2]], colors.wallLeft)

  // Seating plane (raked toward the field).
  fill(ctx, [topC[0], topC[1], topC[2], topC[3]], colors.seatB)

  // Bilinear sampler across the raked top: u = top→right, v = top→left.
  const P = (u: number, v: number): Pt => {
    const a = lerpPt(topC[0], topC[1], u)
    const b = lerpPt(topC[3], topC[2], u)
    return lerpPt(a, b, v)
  }
  // Step along whichever axis the rake runs (toward/away from the field).
  const gradU = rs[1] + rs[2] - (rs[0] + rs[3])
  const gradV = rs[3] + rs[2] - (rs[0] + rs[1])
  const stepV = Math.abs(gradV) >= Math.abs(gradU)

  for (let k = 0; k < rows; k += 1) {
    const a0 = k / rows
    const a1 = (k + 1) / rows
    const A0 = stepV ? P(0, a0) : P(a0, 0)
    const B0 = stepV ? P(1, a0) : P(a0, 1)
    const A1 = stepV ? P(0, a1) : P(a1, 0)
    const B1 = stepV ? P(1, a1) : P(a1, 1)

    fill(ctx, [A0, B0, B1, A1], k % 2 ? colors.seatB : colors.seatA)
    ctx.strokeStyle = colors.seam
    ctx.lineWidth = 1
    for (let s = 1; s < seats; s += 1) {
      const p = lerpPt(A0, B0, s / seats)
      const q = lerpPt(A1, B1, s / seats)
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(q.x, q.y)
      ctx.stroke()
    }
    ctx.strokeStyle = colors.lip
    ctx.beginPath()
    ctx.moveTo(A1.x, A1.y)
    ctx.lineTo(B1.x, B1.y)
    ctx.stroke()

    // Seated spectators: a dot per occupied seat, density = crowd fill.
    if (crowd > 0) {
      const mA = lerpPt(A0, A1, 0.42)
      const mB = lerpPt(B0, B1, 0.42)
      for (let s = 0; s < seats; s += 1) {
        if (hash01(gx * 131 + gz * 7, k * 17 + s) >= crowd) continue
        const c = lerpPt(mA, mB, (s + 0.5) / seats)
        const sx = Math.round(c.x)
        const sy = Math.round(c.y)
        ctx.fillStyle = SHIRTS[Math.floor(hash01(gx * 7 + s, gz * 13 + k) * SHIRTS.length) % SHIRTS.length]
        ctx.fillRect(sx - 1, sy - 2, 2, 2)
        ctx.fillStyle = '#f0c8a0'
        ctx.fillRect(sx - 1, sy - 3, 2, 1)
      }
    }
  }
}

function drawTree(ctx: CanvasRenderingContext2D, cx: number, baseY: number, seed: number): void {
  const sway = Math.round((hash01(seed, 3) - 0.5) * 4)
  const tall = 16 + Math.round(hash01(seed, 9) * 6)
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.beginPath()
  ctx.ellipse(cx + 2, baseY + 1, 9, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#6b4a2f'
  ctx.fillRect(cx - 1 + sway, baseY - 8, 3, 9)
  const blob = (dx: number, dy: number, r: number, color: string): void => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(cx + sway + dx, baseY - tall + dy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  blob(0, 4, 9, '#2f6e2c')
  blob(-4, 0, 7, '#3c8636')
  blob(4, 1, 7, '#37802f')
  blob(0, -4, 6, '#4d9b41')
  blob(-2, -5, 3, '#65b455')
}

export function drawSceneryTree(ctx: CanvasRenderingContext2D, cx: number, baseY: number, seed: number): void {
  drawTree(ctx, cx, baseY, seed)
}

/**
 * Paint one facility with its base centred on (cx, baseY). `time` (seconds)
 * drives the small animations; `crowd` is the 0..1 seat fill. `frontDepth` is
 * where a seating bank's front row starts (see `standFrontDepth`); by default
 * the tile is treated as a front row of its own.
 */
export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  id: BuildingId,
  cx: number,
  baseY: number,
  gx: number,
  gz: number,
  crowd: number,
  time = 0,
  frontDepth = Math.max(0, standDepth(gx, gz) - 0.5),
): void {
  const hw = TILE_W * 0.34
  const hh = TILE_H * 0.34
  switch (id) {
    case 'grandstand': {
      drawStand(ctx, cx, baseY, gx, gz, crowd, GRANDSTAND, frontDepth)
      break
    }
    case 'bleachers': {
      drawStand(ctx, cx, baseY, gx, gz, crowd, BLEACHERS, frontDepth)
      break
    }
    case 'luxury_boxes': {
      const w = hw * 1.15
      const h = hh * 1.15
      isoBox(ctx, cx, baseY, w, h, 26, '#b24552', '#7a2832', '#8f323d')
      for (const v of [7, 16]) {
        wallPanel(ctx, 'left', cx, baseY, w, h, 0.12, 0.88, v, v + 5, '#9fd0e8')
        wallPanel(ctx, 'right', cx, baseY, w, h, 0.12, 0.88, v, v + 5, '#b9e0f2')
      }
      isoBox(ctx, cx, baseY - 26, w * 1.08, h * 1.08, 3, '#e9dfc8', '#b9ad92', '#cfc3a8')
      break
    }
    case 'hotdog': {
      const w = hw * 0.85
      const h = hh * 0.85
      isoBox(ctx, cx, baseY, w, h, 13, '#e6cf72', '#b89a3a', '#cdb251')
      wallPanel(ctx, 'left', cx, baseY, w, h, 0.2, 0.8, 5, 10, '#4a3a20')
      wallPanel(ctx, 'right', cx, baseY, w, h, 0.2, 0.8, 5, 10, '#5a4626')
      const roof = isoBox(ctx, cx, baseY - 13, w * 1.18, h * 1.18, 4, '#d23b30', '#9c2a22', '#bb332b')
      // A hot dog on the roof, so it reads at a glance.
      ctx.fillStyle = '#e0a458'
      ctx.fillRect(roof.tT.x - 6, roof.tT.y + 4, 12, 4)
      ctx.fillStyle = '#b5482f'
      ctx.fillRect(roof.tT.x - 7, roof.tT.y + 5, 14, 2)
      break
    }
    case 'drinks': {
      const w = hw * 0.75
      const h = hh * 0.75
      isoBox(ctx, cx, baseY, w, h, 11, '#f7f2dc', '#c9c2a4', '#e0d9bb')
      wallPanel(ctx, 'left', cx, baseY, w, h, 0.2, 0.8, 4, 9, '#6fb7d6')
      wallPanel(ctx, 'right', cx, baseY, w, h, 0.2, 0.8, 4, 9, '#86c8e4')
      const top = isoBox(ctx, cx, baseY - 11, w * 1.2, h * 1.2, 3, '#f2c230', '#b88c12', '#d9a81c')
      // Striped awning.
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      for (let i = 1; i <= 3; i += 1) {
        const a = lerpPt(top.tL, top.tT, i / 4)
        const b = lerpPt(top.tB, top.tR, i / 4)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      break
    }
    case 'grill': {
      isoBox(ctx, cx, baseY, hw, hh, 15, '#8a5a3c', '#5c3a26', '#734a31')
      wallPanel(ctx, 'left', cx, baseY, hw, hh, 0.15, 0.85, 5, 11, '#2a1c14')
      wallPanel(ctx, 'right', cx, baseY, hw, hh, 0.15, 0.85, 5, 11, '#38261a')
      const roof = isoBox(ctx, cx, baseY - 15, hw * 1.12, hh * 1.12, 4, '#3d3a38', '#262423', '#31302e')
      ctx.fillStyle = '#4a4745'
      ctx.fillRect(roof.tT.x + 3, roof.tT.y - 6, 4, 10)
      // Smoke drifting off the chimney.
      for (let i = 0; i < 3; i += 1) {
        const t = (time * 0.5 + i / 3) % 1
        ctx.fillStyle = `rgba(235,235,235,${0.55 * (1 - t)})`
        ctx.beginPath()
        ctx.arc(roof.tT.x + 5 + Math.sin(t * 5 + i) * 2, roof.tT.y - 7 - t * 16, 2 + t * 3, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'restroom': {
      const w = hw * 0.9
      const h = hh * 0.9
      isoBox(ctx, cx, baseY, w, h, 12, '#dfe7ea', '#9fb0b8', '#bccad0')
      wallPanel(ctx, 'left', cx, baseY, w, h, 0.18, 0.42, 0, 8, '#3a78c0')
      wallPanel(ctx, 'left', cx, baseY, w, h, 0.58, 0.82, 0, 8, '#d6557f')
      isoBox(ctx, cx, baseY - 12, w * 1.08, h * 1.08, 2, '#6f8792', '#4b5f68', '#5c737d')
      break
    }
    case 'team_store': {
      isoBox(ctx, cx, baseY, hw, hh, 17, '#3f6fb5', '#274a7e', '#315b98')
      wallPanel(ctx, 'left', cx, baseY, hw, hh, 0.1, 0.9, 2, 9, '#bfe3f5')
      wallPanel(ctx, 'right', cx, baseY, hw, hh, 0.1, 0.9, 2, 9, '#d3eefb')
      wallPanel(ctx, 'left', cx, baseY, hw, hh, 0.15, 0.85, 11, 15, '#f4f1e6')
      wallPanel(ctx, 'right', cx, baseY, hw, hh, 0.15, 0.85, 11, 15, '#ffffff')
      const roof = isoBox(ctx, cx, baseY - 17, hw * 1.06, hh * 1.06, 2, '#f4f1e6', '#b9b5a6', '#d6d2c2')
      // Ball cap on the roof.
      ctx.fillStyle = '#d23b30'
      ctx.beginPath()
      ctx.arc(roof.tT.x, roof.tT.y + 7, 4, Math.PI, 0)
      ctx.fill()
      ctx.fillRect(roof.tT.x, roof.tT.y + 6, 7, 2)
      break
    }
    case 'parking': {
      const top = isoBox(ctx, cx, baseY, hw * 1.3, hh * 1.3, 1, '#5a5a5e', '#3f3f42', '#4c4c50')
      ctx.strokeStyle = '#cfcfcf'
      ctx.lineWidth = 1
      for (let i = 1; i <= 3; i += 1) {
        const a = lerpPt(top.tL, top.tT, i / 4)
        const b = lerpPt(top.tB, top.tR, i / 4)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(lerpPt(a, b, 0.42).x, lerpPt(a, b, 0.42).y)
        ctx.moveTo(lerpPt(a, b, 0.58).x, lerpPt(a, b, 0.58).y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      // Parked cars fill in with the crowd.
      const cars = ['#d6453f', '#3a78c0', '#e8e8e8', '#e6b800', '#46a64c', '#2c2c34']
      let n = 0
      for (let lane = 0; lane < 4; lane += 1) {
        for (let row = 0; row < 2; row += 1) {
          n += 1
          if (hash01(gx * 17 + lane, gz * 29 + row) > 0.25 + crowd * 0.75) continue
          const a = lerpPt(top.tL, top.tT, (lane + 0.5) / 4)
          const b = lerpPt(top.tB, top.tR, (lane + 0.5) / 4)
          const p = lerpPt(a, b, row === 0 ? 0.2 : 0.8)
          isoBox(ctx, Math.round(p.x), Math.round(p.y) + 1, 4, 2, 3, cars[n % cars.length], '#1c1c22', '#2a2a32')
        }
      }
      break
    }
    case 'scoreboard': {
      isoBox(ctx, cx - 9, baseY, 2, 1, 22, '#8a8f98', '#555a63', '#6c717a')
      isoBox(ctx, cx + 9, baseY, 2, 1, 22, '#8a8f98', '#555a63', '#6c717a')
      ctx.fillStyle = '#1a1d24'
      ctx.fillRect(cx - 17, baseY - 40, 34, 22)
      ctx.fillStyle = '#2f3540'
      ctx.fillRect(cx - 17, baseY - 40, 34, 2)
      // Animated replay: a handful of lit pixels that change every half second.
      const frame = Math.floor(time * 2)
      for (let row = 0; row < 4; row += 1) {
        for (let col = 0; col < 8; col += 1) {
          const v = hash01(col * 7 + frame, row * 13 + gx)
          if (v < 0.45) continue
          ctx.fillStyle = v > 0.85 ? '#ffe27a' : v > 0.65 ? '#7fd3ff' : '#5fe08a'
          ctx.fillRect(cx - 15 + col * 4, baseY - 36 + row * 4, 3, 3)
        }
      }
      break
    }
    case 'kids_zone': {
      isoBox(ctx, cx, baseY, hw * 1.25, hh * 1.25, 1, '#79c267', '#4f8f42', '#62a653')
      // Slide tower.
      isoBox(ctx, cx - 5, baseY - 1, 4, 2, 12, '#f2c230', '#b88c12', '#d9a81c')
      ctx.strokeStyle = '#d23b30'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(cx - 3, baseY - 12)
      ctx.lineTo(cx + 10, baseY + 1)
      ctx.stroke()
      // Bouncing ball.
      const bounce = Math.abs(Math.sin(time * 4 + gx)) * 6
      ctx.fillStyle = '#3a78c0'
      ctx.beginPath()
      ctx.arc(cx + 6, baseY - 7 - bounce, 2.5, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'lights': {
      isoBox(ctx, cx, baseY, 2.5, 1.5, 38, '#9a9a9a', '#6f6f6f', '#828282')
      ctx.fillStyle = '#3a3a3a'
      ctx.fillRect(cx - 9, baseY - 45, 18, 8)
      for (let i = 0; i < 8; i += 1) {
        ctx.fillStyle = '#fff3b0'
        ctx.fillRect(cx - 8 + (i % 4) * 4, baseY - 44 + Math.floor(i / 4) * 3, 3, 2)
      }
      break
    }
    case 'batting_cage': {
      const top = isoBox(ctx, cx, baseY, hw * 1.2, hh * 1.2, 1, '#6f9a58', '#4f6740', '#5d7a4c')
      const H = 15
      const posts = [top.tL, top.tT, top.tR, top.tB]
      ctx.fillStyle = 'rgba(230,230,230,0.2)'
      ctx.beginPath()
      ctx.moveTo(top.tL.x, top.tL.y)
      ctx.lineTo(top.tB.x, top.tB.y)
      ctx.lineTo(top.tR.x, top.tR.y)
      ctx.lineTo(top.tR.x, top.tR.y - H)
      ctx.lineTo(top.tT.x, top.tT.y - H)
      ctx.lineTo(top.tL.x, top.tL.y - H)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#e6e6e6'
      ctx.lineWidth = 1
      for (const p of posts) {
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x, p.y - H)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(top.tL.x, top.tL.y - H)
      ctx.lineTo(top.tT.x, top.tT.y - H)
      ctx.lineTo(top.tR.x, top.tR.y - H)
      ctx.lineTo(top.tB.x, top.tB.y - H)
      ctx.closePath()
      ctx.stroke()
      ctx.fillStyle = '#f4f1e6'
      ctx.fillRect(cx - 1, baseY - 2, 3, 3)
      break
    }
    case 'bullpen': {
      const top = isoBox(ctx, cx, baseY, hw * 1.2, hh * 1.2, 4, '#6f8a5a', '#4f6740', '#5d7a4c')
      ctx.fillStyle = shade(DIRT.light, 6)
      for (const t of [0.3, 0.7]) {
        const p = lerpPt(lerpPt(top.tL, top.tT, t), lerpPt(top.tB, top.tR, t), 0.5)
        ctx.beginPath()
        ctx.ellipse(p.x, p.y, 5, 2.5, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#f4f1e6'
      ctx.fillRect(cx - 1, baseY - 5, 3, 1)
      break
    }
    case 'clubhouse': {
      isoBox(ctx, cx, baseY, hw * 1.1, hh * 1.1, 19, '#a8694a', '#7a4630', '#8f553c')
      wallPanel(ctx, 'left', cx, baseY, hw * 1.1, hh * 1.1, 0.4, 0.6, 0, 9, '#3a2c20')
      wallPanel(ctx, 'right', cx, baseY, hw * 1.1, hh * 1.1, 0.15, 0.4, 8, 14, '#f3e7a6')
      wallPanel(ctx, 'right', cx, baseY, hw * 1.1, hh * 1.1, 0.6, 0.85, 8, 14, '#f3e7a6')
      isoBox(ctx, cx, baseY - 19, hw * 1.2, hh * 1.2, 4, '#5a4636', '#3f3024', '#4c3a2c')
      break
    }
    case 'tree': {
      drawTree(ctx, cx, baseY, gx * 31 + gz * 17)
      break
    }
    case 'fountain': {
      ctx.fillStyle = '#8f8a80'
      ctx.beginPath()
      ctx.ellipse(cx, baseY, 16, 8, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#c7c2b6'
      ctx.beginPath()
      ctx.ellipse(cx, baseY - 2, 16, 8, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = WATER
      ctx.beginPath()
      ctx.ellipse(cx, baseY - 2, 13, 6, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#c7c2b6'
      ctx.fillRect(cx - 1, baseY - 12, 3, 10)
      for (let i = 0; i < 6; i += 1) {
        const t = (time * 0.9 + i / 6) % 1
        const angle = (i / 6) * Math.PI * 2
        ctx.fillStyle = `rgba(235,248,255,${0.9 * (1 - t)})`
        ctx.fillRect(
          Math.round(cx + Math.cos(angle) * t * 9),
          Math.round(baseY - 14 + Math.sin(angle) * t * 3 - Math.sin(t * Math.PI) * 8 + t * 10),
          2, 2,
        )
      }
      break
    }
  }
}

/** Render a facility onto its own small canvas for the build menu. */
export function drawBuildingIcon(canvas: HTMLCanvasElement, id: BuildingId): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = false
  const cx = canvas.width / 2
  const baseY = canvas.height - 18
  fill(ctx, [
    { x: cx, y: baseY - TILE_H / 2 },
    { x: cx + TILE_W / 2, y: baseY },
    { x: cx, y: baseY + TILE_H / 2 },
    { x: cx - TILE_W / 2, y: baseY },
  ], '#a39a86')
  // Icons sit two tiles behind the field edge so stands show their rake.
  drawBuilding(ctx, id, cx, baseY, 20, 17, 0.6, 0)
}
