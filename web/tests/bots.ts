import { submitAction } from '../src/actions/GameActions'
import { FundResearchAction } from '../src/actions/FundResearchAction'
import { HireStaffAction } from '../src/actions/HireStaffAction'
import { RepayLoanAction, TakeLoanAction } from '../src/actions/LoanActions'
import { PlaceFacilityAction } from '../src/actions/PlaceFacilityAction'
import { SetFoodPriceAction, SetTicketPriceAction } from '../src/actions/PricingActions'
import { SignPlayerAction } from '../src/actions/SignPlayerAction'
import { GRID_H, GRID_W } from '../src/core/constants'
import type { GameState } from '../src/core/GameState'
import { budget, getAdvice } from '../src/management/Advice'
import { fairTicketPrice, getParkStats } from '../src/management/Economy'
import { playGameDay } from '../src/management/GameDay'
import { getStaffDef, type StaffRole } from '../src/management/Staff'
import { createStateForScenario } from '../src/scenario/Scenario'
import type { ScenarioId } from '../src/scenario/Scenarios'
import { teamRatings } from '../src/season/Team'
import { BUILDINGS, type BuildingId } from '../src/world/facilities'

export type Bot = (state: GameState) => void

function freeTile(state: GameState): { x: number; z: number } | null {
  for (let x = GRID_W - 1; x >= 0; x -= 1) {
    for (let z = GRID_H - 1; z >= 0; z -= 1) {
      if (state.map.canPlaceFacility(x, z)) return { x, z }
    }
  }
  return null
}

function build(state: GameState, id: BuildingId, reserve = 10_000): boolean {
  if (state.park.cash < BUILDINGS[id].cost + reserve) return false
  const tile = freeTile(state)
  if (!tile) return false
  return submitAction(state, new PlaceFacilityAction(tile.x, tile.z, id)).ok
}

function hire(state: GameState, role: StaffRole, reserve = 10_000): boolean {
  if (state.park.cash < getStaffDef(role).hireCost + reserve) return false
  return submitAction(state, new HireStaffAction(role)).ok
}

/** Never touches anything. */
export const passiveBot: Bot = () => {}

/** Fixes what fans complain about and trains the team, but never expands the park. */
export const frugalBot: Bot = (state) => {
  const stats = getParkStats(state.map)
  const report = state.lastHome
  const score = (key: string): number => report?.factors.find((f) => f.key === key)?.score ?? 50
  submitAction(state, new SetTicketPriceAction(Math.max(1, Math.round(fairTicketPrice(state)))))
  if (score('food') < 80) build(state, (stats.counts.drinks ?? 0) < (stats.counts.hotdog ?? 0) ? 'drinks' : 'hotdog')
  if (score('restrooms') < 85) build(state, 'restroom')
  if (score('clean') < 85) hire(state, 'janitor')
  if (state.season.gamesPlayed > 12) return
  if ((stats.counts.batting_cage ?? 0) < 1) build(state, 'batting_cage')
  if ((stats.counts.bullpen ?? 0) < 1) build(state, 'bullpen')
  if (state.team.signings < 1 && state.park.cash > 30_000) submitAction(state, new SignPlayerAction('ace'))
}

/** Fixes whatever the fan report complains about, then grows and banks the rest. */
export const sensibleBot: Bot = (state) => {
  const stats = getParkStats(state.map)
  const report = state.lastHome
  const homeGamesLeft = budget(state).homeGamesLeft
  const score = (key: string): number => report?.factors.find((f) => f.key === key)?.score ?? 50

  submitAction(state, new SetTicketPriceAction(Math.max(1, Math.round(fairTicketPrice(state)))))
  if (state.park.debt > 0) submitAction(state, new RepayLoanAction())

  if (score('food') < 80) {
    build(state, stats.foodTypes < 2 || (stats.counts.drinks ?? 0) < (stats.counts.hotdog ?? 0) ? 'drinks' : 'hotdog')
  }
  if (score('restrooms') < 85) build(state, 'restroom')
  if (score('clean') < 85) hire(state, 'janitor')

  // Bank the profits over the closing stretch.
  // Big builds only while there is time for them to pay off.
  if (homeGamesLeft < 15) return

  const count = (id: BuildingId): number => stats.counts[id] ?? 0
  if (count('batting_cage') < 2) build(state, 'batting_cage', 6_000)
  if (count('bullpen') < 2) build(state, 'bullpen', 6_000)
  if (state.staff.hitting_coach < 1) hire(state, 'hitting_coach', 8_000)
  if (state.staff.pitching_coach < 1) hire(state, 'pitching_coach', 8_000)
  if (score('fun') < 60) {
    if (state.staff.mascot < 1) hire(state, 'mascot', 6_000)
    if (count('kids_zone') < 1) build(state, 'kids_zone', 8_000)
    else if (count('scoreboard') < 1) build(state, 'scoreboard', 10_000)
  }
  if (score('beauty') < 60 && state.park.cash > 15_000) {
    if (state.staff.groundskeeper < 2) hire(state, 'groundskeeper')
    build(state, 'tree')
    build(state, 'tree')
  }
  if (state.staff.usher < 2) hire(state, 'usher', 10_000)
  if (count('team_store') < 1) build(state, 'team_store', 12_000)
  if (state.park.cash > 45_000 && state.team.signings < 4) {
    const ratings = teamRatings(state.team)
    submitAction(state, new SignPlayerAction(ratings.pitching < ratings.hitting ? 'ace' : 'slugger'))
  }
  if (state.park.cash > 30_000 && !state.research.unlocked.includes('season_tickets')) {
    submitAction(state, new FundResearchAction('season_tickets'))
  }
  if (report && report.limit === 'parking') build(state, 'parking', 8_000)
  if (report && report.limit === 'seats') {
    for (let i = 0; i < 3; i += 1) build(state, 'grandstand', 12_000)
  }
}

/** Does exactly what the Park tab's advice line says, a few steps per game day. */
export const adviceBot: Bot = (state) => {
  for (let step = 0; step < 4; step += 1) {
    const { action } = getAdvice(state)
    let ok = false
    switch (action.kind) {
      case 'build': {
        const tile = freeTile(state)
        ok = tile !== null && submitAction(state, new PlaceFacilityAction(tile.x, tile.z, action.id)).ok
        break
      }
      case 'hire': ok = submitAction(state, new HireStaffAction(action.role)).ok; break
      // One price change per game day, then see how the crowd reacts.
      case 'ticketPrice': submitAction(state, new SetTicketPriceAction(action.price)); return
      case 'foodPrice': ok = submitAction(state, new SetFoodPriceAction(action.price)).ok; break
      case 'repay': ok = submitAction(state, new RepayLoanAction()).ok; break
      case 'borrow': ok = submitAction(state, new TakeLoanAction()).ok; break
      case 'research': ok = submitAction(state, new FundResearchAction(action.id)).ok; break
      case 'sign': ok = submitAction(state, new SignPlayerAction(action.signing)).ok; break
      case 'none': break
    }
    if (!ok) return
  }
}

/** The sensible owner, but charging the most the club can for tickets and food. */
export const priceAbuseBot: Bot = (state) => {
  sensibleBot(state)
  submitAction(state, new SetTicketPriceAction(40))
  submitAction(state, new SetFoodPriceAction('high'))
}

/** The sensible owner, but gouging on food all season. */
export const greedyBot: Bot = (state) => {
  submitAction(state, new SetFoodPriceAction('high'))
  sensibleBot(state)
}

export interface SeasonSummary {
  status: GameState['scenario']['status']
  cash: number
  happiness: number
  wins: number
  attendance: number
  rating: number
  state: GameState
}

export function playSeason(bot: Bot, seed: number, scenarioId: ScenarioId = 'turn_it_around'): SeasonSummary {
  const state = createStateForScenario(scenarioId, seed)
  let guard = 0
  while (state.scenario.status === 'active' && guard < 200) {
    bot(state)
    playGameDay(state)
    guard += 1
  }
  return {
    status: state.scenario.status,
    cash: state.park.cash - state.park.debt,
    happiness: state.park.fanHappiness,
    wins: state.season.wins,
    attendance: state.season.totalAttendance,
    rating: state.park.rating,
    state,
  }
}
