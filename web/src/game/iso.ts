/** 2:1 isometric tile metrics. Tile (x, z) is centred on world point (x, z). */
export const TILE_W = 48
export const TILE_H = 24

export function gridToScreen(
  gx: number,
  gz: number,
  originX: number,
  originY: number,
): { x: number; y: number } {
  return {
    x: originX + (gx - gz) * (TILE_W / 2),
    y: originY + (gx + gz) * (TILE_H / 2),
  }
}

export function screenToGrid(
  sx: number,
  sy: number,
  originX: number,
  originY: number,
): { x: number; z: number } {
  const lx = sx - originX
  const ly = sy - originY
  const gx = (lx / (TILE_W / 2) + ly / (TILE_H / 2)) / 2
  const gz = (ly / (TILE_H / 2) - lx / (TILE_W / 2)) / 2
  return { x: Math.floor(gx + 0.5), z: Math.floor(gz + 0.5) }
}

export function worldToScreen(
  wx: number,
  wz: number,
  originX: number,
  originY: number,
): { x: number; y: number } {
  return gridToScreen(wx, wz, originX, originY)
}
