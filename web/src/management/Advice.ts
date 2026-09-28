import type { FoodPrice, GameReport, GameState } from '../core/GameState'
import { goalProgress, listOf } from '../scenario/Scenario'
import { getScenarioDef } from '../scenario/Scenarios'
import { getPlayerGame } from '../season/Schedule'
import { MAX_SIGNINGS, signingCost, teamRatings, type SigningKind } from '../season/Team'
import { BUILDINGS, formatMoney, isBuildingUnlocked, type BuildingId } from '../world/facilities'
import { accessCapacity, fairTicketPrice, foodCapacity, getParkStats, teamHype, TRAVEL_PER_GAME } from './Economy'
import { worstFactor, type FactorKey, type FanFactor } from './FanExperience'
import { LOAN_STEP, MAX_DEBT, netWorth } from './Finance'
import { getResearchDef, hasResearch } from './Research'
import { getStaffDef, type StaffRole } from './Staff'

/** One concrete step the advice points at. The UI shows the text; bots and tests apply the action. */
export type AdviceAction =
  | { kind: 'build'; id: BuildingId }
  | { kind: 'hire'; role: StaffRole }
  | { kind: 'ticketPrice'; price: number }
  | { kind: 'foodPrice'; price: FoodPrice }
  | { kind: 'repay' }
  | { kind: 'borrow' }
  | { kind: 'research'; id: string }
  | { kind: 'sign'; signing: SigningKind }
  | { kind: 'none' }

export interface Advice {
  text: string
  action: AdviceAction
}

/** Cash kept back so a road trip or a rainy day does not tip the club into the red. */
const RESERVE = 6_000
/** Anything this cheap is always worth trying, however tight the budget. */
const SMALL_SPEND = 3_000
/** Share of the money goal kept as a cushion when judging spare cash. */
const GOAL_CUSHION = 0.1
const MAX_CUSHION = 15_000
/** Home games used to judge the recent profit pace. */
const PACE_WINDOW = 6
/** With this many home games left there is time for a big build to pay for itself. */
const LONG_RUNWAY = 15
/** What a shopper spends at the team store (matches the economy). */
const MERCH_SPEND = 16

/** Home games used to judge how often the park fills. */
const DEMAND_WINDOW = 6
/** Training beyond this many cages or bullpens does nothing more. */
const MAX_TRAINING_BUILDS = 2

export interface Budget {
  homeGamesLeft: number
  awayGamesLeft: number
  /** Money in the bank at season end if the recent pace holds. */
  projected: number
  /** How much could be spent now and still finish on the money goal. Infinity with no money goal. */
  room: number
}

export function budget(state: GameState): Budget {
  const def = getScenarioDef(state.scenarioId)
  let homeGamesLeft = 0
  for (let i = state.season.gamesPlayed; i < def.seasonGames; i += 1) {
    if (getPlayerGame(i).home) homeGamesLeft += 1
  }
  const awayGamesLeft = def.seasonGames - state.season.gamesPlayed - homeGamesLeft
  const recent = state.history.profit.slice(-PACE_WINDOW)
  const pace = recent.length > 0 ? recent.reduce((s, v) => s + v, 0) / recent.length : 0
  // Plan on a little less than the recent pace: rain and slumps happen.
  const projected = netWorth(state) + pace * 0.85 * homeGamesLeft - TRAVEL_PER_GAME * awayGamesLeft
  // Keep a cushion over the goal rather than planning to land exactly on it.
  const cushion = Math.min(def.goals.cash * GOAL_CUSHION, MAX_CUSHION)
  const room = def.goals.cash > 0 ? projected - def.goals.cash - cushion : Infinity
  return { homeGamesLeft, awayGamesLeft, projected, room }
}

interface Option {
  action: AdviceAction
  cost: number
  /** Running cost for every home game left. */
  perGame: number
  /** Extra money it should bring in per home game, where that can be estimated. */
  gain: number
  text: string
}

/** Rough money one more served or seated fan brings in, from the last home game. */
function perFan(report: GameReport, kind: 'food' | 'ticket'): number {
  if (kind === 'food') return report.served > 0 ? report.revenue.food / report.served : 6
  return report.attendance > 0 ? report.revenue.tickets / report.attendance : 8
}

/** Money a facility or hire would add per game by serving fans who went without last time. */
function estimateGain(state: GameState, action: AdviceAction): number {
  const report = state.lastHome
  if (!report) return 0
  // Count only what is still unmet after anything built since that game.
  const stats = getParkStats(state.map)
  const unfed = Math.max(0, report.hungry - Math.max(report.served, foodCapacity(state)))
  const turnedAway = Math.max(0, report.demand - Math.max(report.attendance, stats.seats))
  // Seats pay only on the days they fill, so judge them on recent home games, not one busy Saturday.
  const recentDemand = state.history.demand.slice(-DEMAND_WINDOW)
  const extraFans = (added: number): number => {
    const lastGame = Math.min(added, turnedAway)
    if (recentDemand.length === 0) return lastGame
    const typical = recentDemand.reduce((sum, d) => sum + Math.min(added, Math.max(0, d - stats.seats)), 0) / recentDemand.length
    return (lastGame + typical) / 2
  }
  if (action.kind === 'build') {
    const def = BUILDINGS[action.id]
    if (def.serves) return Math.min(def.serves * (1 + 0.15 * state.staff.vendor), unfed) * perFan(report, 'food') * (def.spend ?? 1)
    if (def.seats && report.limit === 'seats') return extraFans(def.seats) * perFan(report, 'ticket')
    if (def.merch) {
      const shoppers = report.attendance * 0.1 * (0.6 + teamHype(state.season))
      return Math.min(def.merch, Math.max(0, shoppers - stats.merchCapacity)) * MERCH_SPEND
    }
    if (def.cars && report.limit === 'parking') {
      const stuck = Math.max(0, report.demand - Math.max(report.attendance, accessCapacity(stats)))
      return Math.min(def.cars * 2.5, stuck) * perFan(report, 'ticket')
    }
  }
  if (action.kind === 'hire' && action.role === 'vendor') {
    return Math.min(foodCapacity(state) * 0.15, unfed) * perFan(report, 'food')
  }
  return 0
}

function build(state: GameState, id: BuildingId, text: string): Option | null {
  if (!isBuildingUnlocked(id, state.research.unlocked)) return null
  const def = BUILDINGS[id]
  const action: AdviceAction = { kind: 'build', id }
  return { action, cost: def.cost, perGame: def.upkeep, gain: estimateGain(state, action), text }
}

function hire(state: GameState, role: StaffRole, text: string): Option | null {
  const def = getStaffDef(role)
  if (state.staff[role] >= def.max) return null
  const action: AdviceAction = { kind: 'hire', role }
  return { action, cost: def.hireCost, perGame: def.wage, gain: estimateGain(state, action), text }
}

/** Ways to fix one factor, cheapest first. */
function fixesFor(state: GameState, factor: FactorKey): Option[] {
  const stats = getParkStats(state.map)
  const count = (id: BuildingId): number => stats.counts[id] ?? 0
  const options: (Option | null)[] = []
  switch (factor) {
    case 'food':
      if (state.park.foodPrice === 'high') {
        options.push({ action: { kind: 'foodPrice', price: 'fair' }, cost: 0, perGame: 0, gain: 0, text: 'Fans think food costs too much. Set menu prices back to Fair.' })
      }
      if (stats.foodTypes < 2) {
        options.push(build(state, count('drinks') === 0 ? 'drinks' : 'hotdog', 'Fans want more choice. Add a different kind of food stand.'))
      }
      options.push(hire(state, 'vendor', 'Food lines are long. Hire a vendor to speed up every stand.'))
      options.push(build(state, count('drinks') < count('hotdog') ? 'drinks' : 'hotdog', 'Food lines are long. Build another food stand.'))
      break
    case 'restrooms':
      options.push(build(state, 'restroom', 'Not enough restrooms for the crowd. Build more.'))
      break
    case 'clean':
      options.push(hire(state, 'janitor', 'Trash is piling up. Hire a janitor.'))
      break
    case 'fun':
      options.push(hire(state, 'mascot', 'Fans are bored between innings. Hire a mascot.'))
      if (count('kids_zone') === 0) options.push(build(state, 'kids_zone', 'Fans are bored. Build a Kids Corner.'))
      if (count('scoreboard') === 0) options.push(build(state, 'scoreboard', 'Fans are bored. Build a Video Board.'))
      break
    case 'seats':
      options.push(hire(state, 'usher', 'Fans want better seats. Hire an usher to look after them.'))
      options.push(build(state, 'grandstand', 'Hard benches are wearing thin. Build a Grandstand.'))
      break
    case 'value': {
      const fair = Math.max(1, Math.round(fairTicketPrice(state)))
      if (state.park.ticketPrice > fair) {
        options.push({ action: { kind: 'ticketPrice', price: fair }, cost: 0, perGame: 0, gain: 0, text: `Tickets cost more than fans think is fair. Lower the price to $${fair}.` })
      }
      break
    }
    case 'team': {
      const id: BuildingId = count('batting_cage') <= count('bullpen') ? 'batting_cage' : 'bullpen'
      if (count(id) < MAX_TRAINING_BUILDS) {
        options.push(build(state, id, 'Fans want a winner. Build training facilities so the team improves.'))
      }
      break
    }
    case 'beauty':
      options.push(build(state, 'tree', 'The park looks tired. Plant a few trees.'))
      options.push(hire(state, 'groundskeeper', 'The park looks tired. Hire a groundskeeper.'))
      break
  }
  return options.filter((o): o is Option => o !== null)
}

/**
 * Can the club afford this now, and is it worth it with the season that is left?
 * Anything that pays for itself before the last game is fine; otherwise it has to
 * fit the money goal, or there has to be a long season left to make it back.
 */
function affordable(state: GameState, option: Option, plan: Budget): boolean {
  const total = option.cost + option.perGame * plan.homeGamesLeft
  // Late in a season, estimates have fewer games to be right in, so ask for a wider margin.
  const margin = plan.homeGamesLeft >= LONG_RUNWAY ? 1 : 1.5
  const paysBack = option.gain * plan.homeGamesLeft > total * margin
  // Something that pays for itself quickly may dip further into the reserve.
  const reserve = paysBack && option.gain * 3 > option.cost ? RESERVE / 2 : RESERVE
  if (state.park.cash - option.cost < reserve) return false
  if (paysBack) return true
  return total <= SMALL_SPEND || total <= plan.room || plan.homeGamesLeft >= LONG_RUNWAY
}

function adviseFix(state: GameState, factor: FanFactor, plan: Budget): Advice | null {
  const options = fixesFor(state, factor.key)
  const pick = options.find((o) => affordable(state, o, plan))
  if (pick) return { text: pick.text, action: pick.action }
  if (options.length === 0) return null
  const tight = plan.room < options[0].cost
  return {
    text: tight
      ? `${factor.label} could be better, but money is tight for the goal. Hold off and bank your profits.`
      : `${factor.label} needs work. Save up for the fix.`,
    action: { kind: 'none' },
  }
}

/**
 * Growth: when fans were turned away, more seats (or parking) pay for themselves.
 * If the only thing stopping a build that pays back is cash, suggest a loan.
 */
function adviseGrowth(state: GameState, report: GameReport, plan: Budget): Advice | null {
  const candidates: (Option | null)[] = []
  if (report.limit === 'seats') candidates.push(build(state, 'grandstand', 'Sold out! Fans were turned away. Build more seats.'))
  if (report.limit === 'parking') candidates.push(build(state, 'parking', 'The roads were jammed. Build a parking lot.'))
  for (const option of candidates) {
    if (!option || option.gain <= 0) continue
    if (affordable(state, option, plan)) return { text: option.text, action: option.action }
    const total = option.cost + option.perGame * plan.homeGamesLeft
    const paysWell = option.gain * plan.homeGamesLeft > total * 2
    const canBorrow = state.park.debt + LOAN_STEP <= MAX_DEBT
    if (paysWell && canBorrow && plan.homeGamesLeft >= LONG_RUNWAY) {
      return {
        text: `Fans are being turned away and more seats would pay for themselves. Borrow ${formatMoney(LOAN_STEP)} to build them.`,
        action: { kind: 'borrow' },
      }
    }
  }
  return null
}

/** Upgrades and shops that earn more than they cost, while there is season left to earn it. */
function adviseInvestment(state: GameState, report: GameReport, plan: Budget): Advice | null {
  // A short season needs a clear win: twice the money back, not just a bit more.
  const margin = plan.homeGamesLeft >= LONG_RUNWAY ? 1.5 : 2
  const options: Option[] = []
  const store = build(state, 'team_store', 'Fans want caps and jerseys. Build a Team Store.')
  if (store) options.push(store)
  const research = (id: string, gain: number, text: string): void => {
    const def = getResearchDef(id)
    if (!def || hasResearch(state.research.unlocked, id)) return
    options.push({ action: { kind: 'research', id }, cost: def.cost, perGame: 0, gain, text })
  }
  research('season_tickets', report.attendance * 0.05 * perFan(report, 'ticket'), 'Open a Season Ticket Office (Office tab) so more fans want to come.')
  research('concessions_plus', report.revenue.food * 0.15, 'Buy Gourmet Concessions (Office tab): fans spend more on food.')
  const worth = options
    .filter((o) => o.gain * plan.homeGamesLeft > (o.cost + o.perGame * plan.homeGamesLeft) * margin)
    .sort((a, b) => b.gain / b.cost - a.gain / a.cost)
  const pick = worth.find((o) => affordable(state, o, plan))
  return pick ? { text: pick.text, action: pick.action } : null
}

/** Wins the club is on course for, from its recent form. */
function projectedWins(state: GameState): number {
  const def = getScenarioDef(state.scenarioId)
  const recent = state.season.recentResults
  // Smooth early form toward a modest record so one lucky week does not hide a weak team.
  const form = (recent.filter(Boolean).length + 2) / (recent.length + 6)
  return state.season.wins + form * (def.seasonGames - state.season.gamesPlayed)
}

/** When the wins goal is slipping, point at the cheapest way to a better team. */
function adviseTeam(state: GameState, plan: Budget): Advice | null {
  const def = getScenarioDef(state.scenarioId)
  // With a long season left, a better team also sells more tickets, so keep investing.
  const margin = plan.homeGamesLeft >= LONG_RUNWAY ? 8 : 2
  if (def.goals.wins <= 0 || projectedWins(state) >= def.goals.wins + margin) return null
  const stats = getParkStats(state.map)
  const ratings = teamRatings(state.team)
  const weakHitting = ratings.hitting <= ratings.pitching
  const options: (Option | null)[] = [
    (stats.counts.batting_cage ?? 0) < 1 ? build(state, 'batting_cage', 'The wins goal is slipping. Build a Batting Cage so the hitters improve.') : null,
    (stats.counts.bullpen ?? 0) < 1 ? build(state, 'bullpen', 'The wins goal is slipping. Build a Bullpen so the pitchers improve.') : null,
    hire(state, weakHitting ? 'hitting_coach' : 'pitching_coach', `The wins goal is slipping. Hire a ${weakHitting ? 'hitting' : 'pitching'} coach.`),
  ]
  if (state.team.signings < MAX_SIGNINGS) {
    const signing: SigningKind = weakHitting ? 'slugger' : 'ace'
    options.push({
      action: { kind: 'sign', signing },
      cost: signingCost(state.team),
      perGame: 600,
      gain: 0,
      text: `The wins goal is slipping. Sign ${weakHitting ? 'a slugger' : 'an ace'} in the Team tab.`,
    })
  }
  const pick = options.find((o): o is Option => o !== null && affordable(state, o, plan))
  return pick ? { text: pick.text, action: pick.action } : null
}

/** The most useful thing to do next, aware of how much season and money is left. */
export function getAdvice(state: GameState): Advice {
  const none: AdviceAction = { kind: 'none' }
  if (state.scenario.status !== 'active') return { text: state.scenario.reason, action: none }
  const report = state.lastHome
  if (!report) {
    return {
      text: state.paused
        ? 'Welcome, boss. Opening Day is here. Look around, then press Play Ball.'
        : 'Opening Day! Watch the first game, then check what the fans thought.',
      action: none,
    }
  }
  const stats = getParkStats(state.map)
  if (state.park.cash < 0) {
    return { text: 'You are in the red. Raise income or cut staff before the bank calls.', action: none }
  }
  if (state.park.debt > 0 && state.park.cash > state.park.debt + 20_000 && state.lastHome?.limit !== 'seats') {
    return { text: 'You can afford to repay the bank. Loans count against your money goal.', action: { kind: 'repay' } }
  }

  const plan = budget(state)
  const worst = worstFactor(report.factors)

  // A full park is the best problem to have: grow it before polishing anything else.
  const growth = adviseGrowth(state, report, plan)
  if (growth) return growth

  if (worst.score < 55) {
    const fix = adviseFix(state, worst, plan)
    if (fix && fix.action.kind !== 'none') return fix
  }

  const fair = Math.max(1, Math.round(fairTicketPrice(state)))
  if (report.limit === 'seats') {
    // Nudge the price once per sellout, and never far past what fans call fair.
    const higher = report.ticketPrice + 1
    const busy = report.demand - report.attendance > report.seats * 0.05
    if (busy && stats.seats <= report.seats && state.park.ticketPrice < higher && higher <= fair + 1) {
      return { text: `Sold out! Raise the ticket price to $${higher}.`, action: { kind: 'ticketPrice', price: higher } }
    }
  }

  const team = adviseTeam(state, plan)
  if (team) return team

  const investment = adviseInvestment(state, report, plan)
  if (investment) return investment

  if (state.park.ticketPrice < fair - 1) {
    return { text: `Fans would happily pay $${fair} a ticket. Raise the price.`, action: { kind: 'ticketPrice', price: fair } }
  }
  if (report.attendance < report.seats * 0.75 && state.park.ticketPrice > fair) {
    return { text: `Plenty of empty seats. Lower the ticket price to $${fair}.`, action: { kind: 'ticketPrice', price: fair } }
  }

  // Past the worst problem, polish weak spots only while happiness still needs it.
  const def = getScenarioDef(state.scenarioId)
  const happyEnough = def.goals.happiness > 0 && state.park.fanHappiness >= def.goals.happiness + 8
  const weak = happyEnough ? [] : [...report.factors]
    .filter((f) => f.score < 75)
    .sort((a, b) => (100 - b.score) * b.weight - (100 - a.score) * a.weight)
  for (const factor of weak) {
    const fix = adviseFix(state, factor, plan)
    if (fix && fix.action.kind !== 'none') return fix
  }

  const goals = goalProgress(state).filter((g) => !g.met)
  if (plan.room < 0 && Number.isFinite(plan.room)) {
    return {
      text: `At this pace you finish ${formatMoney(-plan.room)} short of the money goal. Hold off on big builds and keep prices fair.`,
      action: none,
    }
  }
  if (goals.length > 0) {
    return { text: `Good work. Keep chasing ${listOf(goals.map((g) => g.label.toLowerCase()))}.`, action: none }
  }
  return { text: 'Every goal is on track. Hold steady until the last game.', action: none }
}
