import type { GameState } from '../core/GameState'
import { GRID_H, GRID_W } from '../core/constants'
import { GroundLayer, paintPark } from '../render/paint'
import { TileAtlas } from '../render/sprites'
import { HOME } from './field'
import { gridToScreen, screenToGrid, TILE_H, TILE_W } from './iso'

const MAX_BUFFER = 4096
/** Pointer travel (CSS px) before a press becomes a drag instead of a tap. */
const DRAG_THRESHOLD = 7
const MIN_ZOOM_FACTOR = 0.6
const MAX_ZOOM_FACTOR = 4

export interface Cell {
  x: number
  z: number
}

interface FloatText {
  text: string
  wx: number
  wz: number
  color: string
  born: number
}

const FLOAT_MS = 2200

/** Wide screens frame the whole park; narrow ones centre on the diamond. */
const PARK_CENTER = { x: (GRID_W - 1) / 2 + 1, z: (GRID_H - 1) / 2 + 1 }
const FIELD_CENTER = { x: HOME.x - 3.5, z: HOME.z - 3.5 }

export class StadiumScene {
  /** A tap or click on a tile. `touch` is true for finger input. */
  onTileTap: (cell: Cell, touch: boolean) => void = () => {}
  onTileHover: (cell: Cell | null) => void = () => {}

  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly buffer: HTMLCanvasElement
  private readonly bctx: CanvasRenderingContext2D
  private readonly atlas = new TileAtlas()
  private readonly ground = new GroundLayer()
  private state: GameState | null = null
  private cssW = 0
  private cssH = 0
  private dpr = 1
  private panX = 0
  private panY = 0
  private zoom = 0
  private defaultZoom = 1
  private viewCenter = PARK_CENTER
  private readonly pointers = new Map<number, { x: number; y: number }>()
  private press: { x: number; y: number; panX: number; panY: number; moved: boolean } | null = null
  private pinch: { distance: number; zoom: number } | null = null
  private floats: FloatText[] = []

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D not supported')
    this.ctx = ctx

    this.buffer = document.createElement('canvas')
    const bctx = this.buffer.getContext('2d')
    if (!bctx) throw new Error('Buffer 2D not supported')
    this.bctx = bctx

    const viewport = canvas.parentElement
    if (viewport) new ResizeObserver(() => this.fitToStadium()).observe(viewport)
    window.addEventListener('resize', () => this.fitToStadium())

    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerCancel)
    canvas.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'mouse') this.onTileHover(null)
    })
    canvas.addEventListener('contextmenu', (event) => event.preventDefault())
    this.fitToStadium()
  }

  syncFromState(state: GameState): void {
    this.state = state
  }

  resetView(): void {
    this.panX = 0
    this.panY = 0
    this.zoom = this.defaultZoom
  }

  fitToStadium(): void {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width === 0 || height === 0) return

    this.cssW = width
    this.cssH = height
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.floor(width * this.dpr)
    this.canvas.height = Math.floor(height * this.dpr)

    // Show the whole park on wide screens; on narrow ones favour the diamond.
    const parkW = (GRID_W + GRID_H - 6) * (TILE_W / 2)
    const parkH = (GRID_W + GRID_H - 6) * (TILE_H / 2) + 70
    const fitAll = Math.min(width / parkW, height / parkH)
    // Phones fit the ballpark to the screen width; wider screens fit it in both directions.
    const narrow = width <= 760
    const fitField = narrow ? width / 560 : Math.min(width / 640, height / 470, 0.8)
    const previous = this.defaultZoom
    this.defaultZoom = Math.max(fitAll, fitField)
    this.viewCenter = fitField > fitAll ? FIELD_CENTER : PARK_CENTER
    if (this.zoom === 0) this.zoom = this.defaultZoom
    else this.zoom = this.clampZoom(this.zoom * (this.defaultZoom / previous))
    this.clampPan()
  }

  private clampZoom(zoom: number): number {
    return Math.max(this.defaultZoom * MIN_ZOOM_FACTOR, Math.min(this.defaultZoom * MAX_ZOOM_FACTOR, zoom))
  }

  /** Keep the park on screen: the view centre may not leave the map. */
  private clampPan(): void {
    const limitX = (GRID_W + GRID_H) * (TILE_W / 4)
    const limitY = (GRID_W + GRID_H) * (TILE_H / 4)
    this.panX = Math.max(-limitX, Math.min(limitX, this.panX))
    this.panY = Math.max(-limitY, Math.min(limitY, this.panY))
  }

  private bufferDims(): { w: number; h: number } {
    return {
      w: Math.min(MAX_BUFFER, Math.max(1, Math.ceil(this.cssW / this.zoom))),
      h: Math.min(MAX_BUFFER, Math.max(1, Math.ceil(this.cssH / this.zoom))),
    }
  }

  /** Buffer-space position of world (0, 0). */
  private computeOrigin(): { x: number; y: number } {
    const { w, h } = this.bufferDims()
    const centre = gridToScreen(this.viewCenter.x, this.viewCenter.z, 0, 0)
    return {
      x: Math.round(w / 2 - centre.x + this.panX),
      y: Math.round(h / 2 - centre.y + this.panY),
    }
  }

  pickGridCell(clientX: number, clientY: number): Cell | null {
    const rect = this.canvas.getBoundingClientRect()
    const sx = (clientX - rect.left) / this.zoom
    const sy = (clientY - rect.top) / this.zoom
    const o = this.computeOrigin()
    const cell = screenToGrid(sx, sy, o.x, o.y)
    if (cell.x < 0 || cell.x >= GRID_W || cell.z < 0 || cell.z >= GRID_H) return null
    return cell
  }

  /** Page position of a tile's centre (the inverse of pickGridCell). */
  tileToClient(x: number, z: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    const o = this.computeOrigin()
    const p = gridToScreen(x, z, o.x, o.y)
    return { x: rect.left + p.x * this.zoom, y: rect.top + p.y * this.zoom }
  }

  /** Floating text that rises from a world position, e.g. "+$12,400". */
  addFloat(text: string, wx: number, wz: number, color: string): void {
    const now = performance.now()
    // Replace a float still rising from the same spot rather than stacking on it.
    this.floats = this.floats.filter((f) => !(f.wx === wx && f.wz === wz && now - f.born < FLOAT_MS / 2))
    this.floats.push({ text, wx, wz, color, born: now })
    if (this.floats.length > 12) this.floats.shift()
  }

  render(now: number): void {
    if (!this.state || this.cssW === 0) return

    const { w, h } = this.bufferDims()
    if (this.buffer.width !== w || this.buffer.height !== h) {
      this.buffer.width = w
      this.buffer.height = h
    }
    this.bctx.imageSmoothingEnabled = false

    const o = this.computeOrigin()
    paintPark(this.bctx, this.state, w, h, o.x, o.y, this.atlas, this.ground, now / 1000)

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.ctx.imageSmoothingEnabled = this.zoom < 1
    this.ctx.clearRect(0, 0, this.cssW, this.cssH)
    this.ctx.drawImage(this.buffer, 0, 0, w, h, 0, 0, w * this.zoom, h * this.zoom)
    this.paintOverlay(now, o)
  }

  /** Crisp text drawn at screen resolution on top of the pixel-art buffer. */
  private paintOverlay(now: number, origin: { x: number; y: number }): void {
    const state = this.state
    if (!state) return
    const ctx = this.ctx
    const toScreen = (wx: number, wz: number): { x: number; y: number } => {
      const p = gridToScreen(wx, wz, origin.x, origin.y)
      return { x: p.x * this.zoom, y: p.y * this.zoom }
    }

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const placed: { x: number; y: number; w: number }[] = []
    ctx.font = '600 11px Verdana, Tahoma, sans-serif'
    const maxBubbles = this.cssW <= 760 ? 1 : 2
    const shown = new Set<string>()
    for (const fan of state.entities.fans) {
      if (!fan.thought || fan.thoughtTtl <= 0 || placed.length >= maxBubbles || shown.has(fan.thought)) continue
      const p = toScreen(fan.x, fan.z)
      const y = p.y - 16 * this.zoom - 12
      const width = ctx.measureText(fan.thought).width + 14
      const x = Math.max(width / 2 + 4, Math.min(this.cssW - width / 2 - 4, p.x))
      // Skip a bubble that would sit on top of one already drawn.
      if (placed.some((b) => Math.abs(b.y - y) < 24 && Math.abs(b.x - x) < (b.w + width) / 2)) continue
      placed.push({ x, y, w: width })
      shown.add(fan.thought)
      ctx.globalAlpha = Math.min(1, fan.thoughtTtl / 30)
      ctx.fillStyle = fan.happiness >= 60 ? '#f4fff0' : '#fff3ee'
      ctx.strokeStyle = fan.happiness >= 60 ? '#2f7d34' : '#b3402f'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.roundRect(x - width / 2, y - 10, width, 20, 6)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(p.x - 4, y + 10)
      ctx.lineTo(p.x, y + 16)
      ctx.lineTo(p.x + 4, y + 10)
      ctx.fill()
      ctx.fillStyle = '#1c1c1c'
      ctx.fillText(fan.thought, x, y + 1)
    }
    ctx.globalAlpha = 1

    this.floats = this.floats.filter((f) => now - f.born < FLOAT_MS)
    ctx.font = '800 17px Verdana, Tahoma, sans-serif'
    for (const float of this.floats) {
      const t = (now - float.born) / FLOAT_MS
      const p = toScreen(float.wx, float.wz)
      const y = p.y - 30 - t * 60
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(0,0,0,0.75)'
      ctx.strokeText(float.text, p.x, y)
      ctx.fillStyle = float.color
      ctx.fillText(float.text, p.x, y)
    }
    ctx.globalAlpha = 1
  }

  zoomIn(): void {
    this.zoomAt(1.25, this.cssW / 2, this.cssH / 2)
  }

  zoomOut(): void {
    this.zoomAt(1 / 1.25, this.cssW / 2, this.cssH / 2)
  }

  /** Zoom by a factor while keeping the point under (sx, sy) where it is. */
  private zoomAt(factor: number, sx: number, sy: number): void {
    const before = this.zoom
    const after = this.clampZoom(before * factor)
    if (after === before) return
    // Buffer-space offset of the pointer from the view centre, before and after.
    const dx = sx - this.cssW / 2
    const dy = sy - this.cssH / 2
    this.panX += dx / after - dx / before
    this.panY += dy / after - dy / before
    this.zoom = after
    this.clampPan()
  }

  panBy(dx: number, dy: number): void {
    this.panX += dx / this.zoom
    this.panY += dy / this.zoom
    this.clampPan()
  }

  private localPoint(event: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const p = this.localPoint(event)
    this.zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y)
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  private onPointerDown = (event: PointerEvent): void => {
    try {
      this.canvas.setPointerCapture(event.pointerId)
    } catch {
      /* the pointer is already gone; dragging still works inside the canvas */
    }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (this.pointers.size === 1) {
      this.press = { x: event.clientX, y: event.clientY, panX: this.panX, panY: this.panY, moved: false }
    } else if (this.pointers.size === 2) {
      this.pinch = { distance: this.pinchDistance(), zoom: this.zoom }
      if (this.press) this.press.moved = true
    }
  }

  private onPointerMove = (event: PointerEvent): void => {
    const known = this.pointers.get(event.pointerId)
    if (!known) {
      if (event.pointerType === 'mouse') this.onTileHover(this.pickGridCell(event.clientX, event.clientY))
      return
    }
    known.x = event.clientX
    known.y = event.clientY

    if (this.pointers.size === 2 && this.pinch) {
      const distance = this.pinchDistance()
      if (this.pinch.distance > 0) {
        const [a, b] = [...this.pointers.values()]
        const rect = this.canvas.getBoundingClientRect()
        const target = this.pinch.zoom * (distance / this.pinch.distance)
        this.zoomAt(target / this.zoom, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top)
      }
      return
    }

    const press = this.press
    if (!press) return
    const dx = event.clientX - press.x
    const dy = event.clientY - press.y
    if (!press.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      press.moved = true
      this.canvas.classList.add('panning')
    }
    if (press.moved) {
      this.panX = press.panX + dx / this.zoom
      this.panY = press.panY + dy / this.zoom
      this.clampPan()
    } else if (event.pointerType === 'mouse') {
      this.onTileHover(this.pickGridCell(event.clientX, event.clientY))
    }
  }

  private onPointerUp = (event: PointerEvent): void => {
    const press = this.press
    const wasOnly = this.pointers.size === 1
    this.pointers.delete(event.pointerId)
    if (this.pointers.size < 2) this.pinch = null
    if (this.pointers.size > 0) return

    this.press = null
    this.canvas.classList.remove('panning')
    if (!press || press.moved || !wasOnly || event.button > 0) return
    const cell = this.pickGridCell(event.clientX, event.clientY)
    if (cell) this.onTileTap(cell, event.pointerType !== 'mouse')
  }

  private onPointerCancel = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId)
    this.pinch = null
    this.press = null
    this.canvas.classList.remove('panning')
  }
}
