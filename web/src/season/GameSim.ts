import { nextRandom, type RngHost } from '../core/rng'

export interface TeamRatings {
  hitting: number
  pitching: number
}

export interface LineScore {
  /** Runs per inning. A home entry of -1 means the bottom half was not played. */
  away: number[]
  home: number[]
  awayRuns: number
  homeRuns: number
  awayHits: number
  homeHits: number
}

const BASE_RUNS_PER_INNING = 0.5
/** Rating points that multiply scoring by e. Higher = ratings matter less. */
const RATING_SCALE = 42
const MAX_INNINGS = 15

function poisson(rng: RngHost, mean: number): number {
  const limit = Math.exp(-mean)
  let product = nextRandom(rng)
  let count = 0
  while (product > limit && count < 12) {
    product *= nextRandom(rng)
    count += 1
  }
  return count
}

function expectedRuns(offense: number, defense: number, boost: number): number {
  return BASE_RUNS_PER_INNING * Math.exp((offense - defense) / RATING_SCALE) * (1 + boost)
}

function hitsFor(rng: RngHost, runs: number, innings: number): number {
  return Math.max(runs, Math.round(runs * 1.3 + innings * 0.55 + nextRandom(rng) * 3))
}

/**
 * Simulate a game inning by inning. `homeEdge` is a fractional scoring boost
 * for the home side (home-field advantage, a loud crowd).
 */
export function simulateGame(
  rng: RngHost,
  away: TeamRatings,
  home: TeamRatings,
  homeEdge = 0.04,
): LineScore {
  const awayMean = expectedRuns(away.hitting, home.pitching, 0)
  const homeMean = expectedRuns(home.hitting, away.pitching, homeEdge)
  const line: LineScore = { away: [], home: [], awayRuns: 0, homeRuns: 0, awayHits: 0, homeHits: 0 }

  for (let inning = 1; inning <= MAX_INNINGS; inning += 1) {
    const top = poisson(rng, awayMean)
    line.away.push(top)
    line.awayRuns += top

    const lastScheduled = inning >= 9
    if (lastScheduled && line.homeRuns > line.awayRuns) {
      line.home.push(-1)
      break
    }

    let bottom = poisson(rng, homeMean)
    // A walk-off ends the game the moment the home side goes ahead.
    if (lastScheduled && line.homeRuns + bottom > line.awayRuns) {
      bottom = Math.max(1, Math.min(bottom, line.awayRuns - line.homeRuns + 4))
    }
    line.home.push(bottom)
    line.homeRuns += bottom

    if (lastScheduled && line.homeRuns !== line.awayRuns) break
    if (inning === MAX_INNINGS && line.homeRuns === line.awayRuns) {
      // Settle a marathon with one last run.
      if (nextRandom(rng) < 0.5) {
        line.home[line.home.length - 1] += 1
        line.homeRuns += 1
      } else {
        line.away[line.away.length - 1] += 1
        line.awayRuns += 1
      }
    }
  }

  line.awayHits = hitsFor(rng, line.awayRuns, line.away.length)
  line.homeHits = hitsFor(rng, line.homeRuns, line.home.length)
  return line
}

/** Number of half innings actually played (the skipped bottom half is not counted). */
export function halfInningsPlayed(line: LineScore): number {
  const skipped = line.home[line.home.length - 1] === -1 ? 1 : 0
  return line.away.length + line.home.length - skipped
}

/** Runs scored in the given 0-based half inning (even = top/away, odd = bottom/home). */
export function runsInHalfInning(line: LineScore, halfInning: number): number {
  const inning = Math.floor(halfInning / 2)
  const runs = halfInning % 2 === 0 ? line.away[inning] : line.home[inning]
  return runs === undefined || runs < 0 ? 0 : runs
}

/** Running score after the first `halfInnings` half innings. */
export function scoreThrough(line: LineScore, halfInnings: number): { away: number; home: number } {
  let away = 0
  let home = 0
  for (let h = 0; h < halfInnings; h += 1) {
    const runs = runsInHalfInning(line, h)
    if (h % 2 === 0) away += runs
    else home += runs
  }
  return { away, home }
}
