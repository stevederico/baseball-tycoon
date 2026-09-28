import { clamp, nextRandom, pick, randRange, type RngHost } from '../core/rng'
import type { TeamRatings } from './GameSim'

export interface Player {
  id: number
  name: string
  position: string
  rating: number
  pitcher: boolean
  /** True for free agents signed during the season. */
  signed: boolean
}

export interface TeamState {
  roster: Player[]
  nextPlayerId: number
  signings: number
  /** Payroll paid on every home game. */
  payrollPerGame: number
}

export type SigningKind = 'slugger' | 'ace'

export const RATING_CAP = 80
export const MAX_SIGNINGS = 6
export const BASE_PAYROLL = 7_000
export const SIGNING_PAYROLL = 600

const HITTER_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']
const PITCHER_POSITIONS = ['SP', 'SP', 'SP', 'RP', 'CL']

const INITIALS = 'ABCDEFGHJKLMNPRSTVW'.split('')
const SURNAMES = [
  'Okafor', 'Delgado', 'Whitlock', 'Nakamura', 'Brandt', 'Castellano', 'Pruitt', 'Varga',
  'Lindqvist', 'Moreau', 'Abernathy', 'Tanaka', 'Holloway', 'Reyes', 'Kowalczyk', 'Finch',
  'Oyelaran', 'Santoro', 'Becker', 'Yoon', 'Marsh', 'Quintero', 'Hale', 'Dubois',
  'Eriksen', 'Pak', 'Zamora', 'Thackeray', 'Ibarra', 'Novak', 'Callahan', 'Mbeki',
  'Strand', 'Fontaine', 'Guerrero', 'Haddad', 'Ostrowski', 'Bellamy', 'Cruz', 'Petrov',
]

function makeName(rng: RngHost, taken: Set<string>): string {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const name = `${pick(rng, INITIALS)}. ${pick(rng, SURNAMES)}`
    if (!taken.has(name)) return name
  }
  return `${pick(rng, INITIALS)}. ${pick(rng, SURNAMES)} Jr.`
}

export function createTeam(rng: RngHost, baseRating: number): TeamState {
  const taken = new Set<string>()
  const roster: Player[] = []
  let id = 1
  const add = (position: string, pitcher: boolean): void => {
    const name = makeName(rng, taken)
    taken.add(name)
    roster.push({
      id: id++,
      name,
      position,
      pitcher,
      signed: false,
      rating: clamp(baseRating + randRange(rng, -6, 6), 20, RATING_CAP),
    })
  }
  for (const position of HITTER_POSITIONS) add(position, false)
  for (const position of PITCHER_POSITIONS) add(position, true)
  return { roster, nextPlayerId: id, signings: 0, payrollPerGame: BASE_PAYROLL }
}

function average(players: Player[]): number {
  if (players.length === 0) return 0
  return players.reduce((sum, p) => sum + p.rating, 0) / players.length
}

export function teamRatings(team: TeamState): TeamRatings {
  return {
    hitting: average(team.roster.filter((p) => !p.pitcher)),
    pitching: average(team.roster.filter((p) => p.pitcher)),
  }
}

export function signingCost(team: TeamState): number {
  return 12_000 + team.signings * 4_000
}

/** Replace the weakest hitter (slugger) or pitcher (ace) with a proven free agent. */
export function signFreeAgent(rng: RngHost, team: TeamState, kind: SigningKind): Player {
  const pool = team.roster.filter((p) => p.pitcher === (kind === 'ace'))
  const weakest = pool.reduce((low, p) => (p.rating < low.rating ? p : low), pool[0])
  const taken = new Set(team.roster.map((p) => p.name))
  const best = pool.reduce((high, p) => Math.max(high, p.rating), 0)
  const signing: Player = {
    id: team.nextPlayerId++,
    name: makeName(rng, taken),
    position: weakest.position,
    pitcher: weakest.pitcher,
    signed: true,
    rating: clamp(Math.max(62, best + 2) + randRange(rng, 0, 5), 0, RATING_CAP),
  }
  team.roster[team.roster.indexOf(weakest)] = signing
  team.signings += 1
  team.payrollPerGame += SIGNING_PAYROLL
  return signing
}

export interface TrainingInputs {
  battingCages: number
  bullpens: number
  clubhouses: number
  hittingCoaches: number
  pitchingCoaches: number
  playerDevelopment: boolean
}

export function trainingRates(inputs: TrainingInputs): { hitting: number; pitching: number } {
  const shared = 0.05 + Math.min(inputs.clubhouses, 1) * 0.08
  const boost = inputs.playerDevelopment ? 1.25 : 1
  return {
    hitting: (shared + Math.min(inputs.battingCages, 2) * 0.12 + Math.min(inputs.hittingCoaches, 2) * 0.1) * boost,
    pitching: (shared + Math.min(inputs.bullpens, 2) * 0.12 + Math.min(inputs.pitchingCoaches, 2) * 0.1) * boost,
  }
}

/** One game day of practice: every player improves a little, faster with facilities. */
export function trainTeam(rng: RngHost, team: TeamState, inputs: TrainingInputs): void {
  const rates = trainingRates(inputs)
  for (const player of team.roster) {
    const rate = player.pitcher ? rates.pitching : rates.hitting
    player.rating = clamp(player.rating + rate * (0.5 + nextRandom(rng)), 0, RATING_CAP)
  }
}
