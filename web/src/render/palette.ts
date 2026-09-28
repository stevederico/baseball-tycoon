/**
 * Retro tycoon palette: slightly desaturated, hand-tuned ramps.
 * Each surface/material ships a {base, light, dark, edge} ramp so the
 * baked tile textures and the live iso-box shading stay consistent.
 */

export interface Ramp {
  base: string
  light: string
  dark: string
  edge: string
}

/** Countryside beyond the map edge. */
export const MEADOW = '#4f8f3a'
export const WATER = '#3d9bd1'

export const GRASS: Ramp = { base: '#5a9e3e', light: '#6cb24c', dark: '#487f31', edge: '#3a6627' }
export const GRASS_MOWED: Ramp = { base: '#52963a', light: '#63ab47', dark: '#3f7a2e', edge: '#356024' }
export const DIRT: Ramp = { base: '#b07a45', light: '#c4904f', dark: '#946537', edge: '#74492a' }
export const SAND: Ramp = { base: '#c9b487', light: '#dcc89b', dark: '#ab9669', edge: '#897650' }
export const CONCRETE: Ramp = { base: '#b6ad97', light: '#c8c0ac', dark: '#9a9079', edge: '#736b58' }
export const ASPHALT: Ramp = { base: '#55565c', light: '#64656c', dark: '#47484e', edge: '#3c3d42' }
export const PAD: Ramp = { base: '#a39a86', light: '#b3ab98', dark: '#8b826e', edge: '#6b6453' }

export const CHALK = '#f4f1e6'

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = clamp(((n >> 16) & 255) + amount)
  const g = clamp(((n >> 8) & 255) + amount)
  const b = clamp((n & 255) + amount)
  return `rgb(${r},${g},${b})`
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}
