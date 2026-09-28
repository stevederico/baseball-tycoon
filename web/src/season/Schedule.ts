import { PLAYER_TEAM_ID, TEAM_DEFS } from './League'

export const GAMES_PER_SERIES = 3

export interface Matchup {
  home: string
  away: string
}

export interface PlayerGame {
  gameIndex: number
  opponentId: string
  home: boolean
  /** 0-based game within its three-game series. */
  seriesGame: number
  seriesIndex: number
  /** 0 = Monday … 6 = Sunday. */
  weekday: number
  dateLabel: string
}

const TEAM_IDS = TEAM_DEFS.map((t) => t.id)
const MONTHS: { name: string; days: number }[] = [
  { name: 'Apr', days: 30 },
  { name: 'May', days: 31 },
  { name: 'Jun', days: 30 },
  { name: 'Jul', days: 31 },
  { name: 'Aug', days: 31 },
  { name: 'Sep', days: 30 },
]
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** The player is home for two series (a six-game homestand), then away for two. */
export function isPlayerHomeSeries(seriesIndex: number): boolean {
  return Math.floor(seriesIndex / 2) % 2 === 0
}

/**
 * Round-robin pairings (circle method) for one series. The player's club is
 * pinned in slot 0, so it meets every rival once per seven-series cycle.
 */
export function seriesPairings(seriesIndex: number): Matchup[] {
  const others = TEAM_IDS.filter((id) => id !== PLAYER_TEAM_ID)
  const shift = seriesIndex % others.length
  const rotated = [...others.slice(shift), ...others.slice(0, shift)]
  const ring = [PLAYER_TEAM_ID, ...rotated]
  const pairs: Matchup[] = []
  for (let i = 0; i < ring.length / 2; i += 1) {
    const a = ring[i]
    const b = ring[ring.length - 1 - i]
    if (i === 0) {
      pairs.push(isPlayerHomeSeries(seriesIndex) ? { home: a, away: b } : { home: b, away: a })
    } else {
      pairs.push((seriesIndex + i) % 2 === 0 ? { home: a, away: b } : { home: b, away: a })
    }
  }
  return pairs
}

/** Series run Tue–Thu and Fri–Sun; Mondays are travel days. */
function dayOfSeason(gameIndex: number): number {
  const seriesIndex = Math.floor(gameIndex / GAMES_PER_SERIES)
  const week = Math.floor(seriesIndex / 2)
  const firstDay = seriesIndex % 2 === 0 ? 1 : 4
  return week * 7 + firstDay + (gameIndex % GAMES_PER_SERIES)
}

function dateLabel(day: number): string {
  let remaining = day
  for (const month of MONTHS) {
    if (remaining < month.days) return `${month.name} ${remaining + 1}`
    remaining -= month.days
  }
  return `Oct ${remaining + 1}`
}

export function getPlayerGame(gameIndex: number): PlayerGame {
  const seriesIndex = Math.floor(gameIndex / GAMES_PER_SERIES)
  const pairing = seriesPairings(seriesIndex)[0]
  const home = pairing.home === PLAYER_TEAM_ID
  const day = dayOfSeason(gameIndex)
  return {
    gameIndex,
    opponentId: home ? pairing.away : pairing.home,
    home,
    seriesGame: gameIndex % GAMES_PER_SERIES,
    seriesIndex,
    weekday: day % 7,
    dateLabel: `${WEEKDAYS[day % 7]} ${dateLabel(day)}`,
  }
}

export function countHomeGames(seasonGames: number): number {
  let total = 0
  for (let i = 0; i < seasonGames; i += 1) {
    if (getPlayerGame(i).home) total += 1
  }
  return total
}
