import type { GameState } from '../core/GameState'
import { BANKRUPTCY_FLOOR } from '../core/constants'
import { gameEvents } from '../core/events'
import { computeRating } from '../management/Economy'
import { netWorth } from '../management/Finance'
import { createStaff } from '../management/Staff'
import { createLeague, getLeagueTeam, getTeamDef, leaguePosition, PLAYER_TEAM_ID } from '../season/League'
import { createTeam, teamRatings } from '../season/Team'
import { MapStore } from '../world/Map'
import { getScenarioDef, type ScenarioId } from './Scenarios'

const START_HAPPINESS = 40
const START_TICKET_PRICE = 8

export function createStateForScenario(scenarioId: ScenarioId, seed = Date.now() >>> 0): GameState {
  const def = getScenarioDef(scenarioId)
  const map = new MapStore()
  map.seedStarterPark()

  const rng = { rngState: seed | 0 }
  const playerDef = getTeamDef(PLAYER_TEAM_ID)
  const team = createTeam(rng, (playerDef.hitting + playerDef.pitching) / 2)
  const league = createLeague()
  const ratings = teamRatings(team)
  const entry = getLeagueTeam(league, PLAYER_TEAM_ID)
  entry.hitting = ratings.hitting
  entry.pitching = ratings.pitching

  const state: GameState = {
    rngState: rng.rngState,
    park: {
      cash: def.startCash,
      debt: 0,
      rating: 0,
      fanHappiness: START_HAPPINESS,
      ticketPrice: START_TICKET_PRICE,
      foodPrice: 'fair',
    },
    map,
    entities: { fans: [], nextId: 1 },
    season: {
      wins: 0,
      losses: 0,
      gamesPlayed: 0,
      homeGamesPlayed: 0,
      streak: 0,
      recentResults: [],
      totalAttendance: 0,
      sellouts: 0,
    },
    league,
    team,
    today: null,
    phase: 'idle',
    phaseTicks: 0,
    lastHome: null,
    lastResult: null,
    history: { profit: [], attendance: [], demand: [], happiness: [], cash: [def.startCash] },
    currentTicks: 0,
    gameSpeed: 1,
    paused: false,
    selectedBuilding: 'hotdog',
    toolMode: 'build',
    ghostPos: null,
    scenarioId,
    scenario: { status: 'active', reason: '' },
    finance: { expenditure: {}, income: {} },
    research: { unlocked: [] },
    staff: createStaff(),
    marketing: { campaignId: null, gamesRemaining: 0 },
    actionQueue: [],
    undoStack: [],
    news: [`${def.name}: ${def.objective}`],
  }
  state.park.rating = computeRating(state)
  return state
}

export interface GoalProgress {
  key: 'cash' | 'happiness' | 'wins'
  label: string
  value: number
  target: number
  met: boolean
  display: string
}

export function goalProgress(state: GameState): GoalProgress[] {
  const { goals } = getScenarioDef(state.scenarioId)
  const money = (v: number): string => `$${Math.round(v).toLocaleString('en-US')}`
  const bank = netWorth(state)
  const goalsList: GoalProgress[] = []
  if (goals.cash > 0) {
    goalsList.push({
      key: 'cash', label: 'Money in the bank', value: bank, target: goals.cash,
      met: bank >= goals.cash, display: `${money(bank)} / ${money(goals.cash)}`,
    })
  }
  if (goals.happiness > 0) {
    const happy = Math.round(state.park.fanHappiness)
    goalsList.push({
      key: 'happiness', label: 'Fan happiness', value: happy, target: goals.happiness,
      met: happy >= goals.happiness, display: `${happy}% / ${goals.happiness}%`,
    })
  }
  if (goals.wins > 0) {
    goalsList.push({
      key: 'wins', label: 'Wins', value: state.season.wins, target: goals.wins,
      met: state.season.wins >= goals.wins, display: `${state.season.wins} / ${goals.wins}`,
    })
  }
  return goalsList
}

export function isSeasonOver(state: GameState): boolean {
  return state.season.gamesPlayed >= getScenarioDef(state.scenarioId).seasonGames
}

/** "a", "a and b", "a, b and c". */
export function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function finish(state: GameState, status: 'won' | 'lost', reason: string): void {
  state.scenario.status = status
  state.scenario.reason = reason
  state.news.unshift(reason)
  gameEvents.emit('news:added', { message: reason })
  gameEvents.emit('scenario:ended', { status })
}

/** Checked after every game day: bankruptcy ends it early, otherwise the season decides. */
export function updateScenario(state: GameState): void {
  if (state.scenario.status !== 'active') return

  if (state.park.cash < BANKRUPTCY_FLOOR) {
    finish(state, 'lost', 'Bankrupt! The bank has taken the keys to the ballpark.')
    return
  }
  if (!isSeasonOver(state)) return

  const missed = goalProgress(state).filter((g) => !g.met)
  if (missed.length === 0) {
    finish(state, 'won', 'Season complete. You turned the franchise around!')
  } else {
    const names = listOf(missed.map((g) => g.label.toLowerCase()))
    finish(state, 'lost', `Season over. You fell short on ${names}.`)
  }
}

export interface ScoreLine {
  label: string
  points: number
}

/** Final score breakdown, used on the end screen and for the saved best score. */
export function computeScore(state: GameState): { total: number; lines: ScoreLine[]; grade: string } {
  const position = leaguePosition(state.league, PLAYER_TEAM_ID)
  const pennant = [0, 3_000, 1_500, 750][position] ?? 0
  const lines: ScoreLine[] = [
    { label: 'Money in the bank', points: Math.max(0, Math.round(netWorth(state) / 50)) },
    { label: `${state.season.wins} wins`, points: state.season.wins * 120 },
    { label: 'Fan happiness', points: Math.round(state.park.fanHappiness * 40) },
    { label: 'Park rating', points: state.park.rating * 4 },
    { label: 'Fans through the gate', points: Math.round(state.season.totalAttendance / 50) },
    { label: `League finish: #${position}`, points: pennant },
    { label: 'Scenario complete', points: state.scenario.status === 'won' ? 5_000 : 0 },
  ]
  const total = lines.reduce((sum, l) => sum + l.points, 0)
  const grade =
    total >= 30_000 ? 'Dynasty'
    : total >= 22_000 ? 'Pennant Contender'
    : total >= 15_000 ? 'Solid Franchise'
    : total >= 9_000 ? 'Work in Progress'
    : 'Bush League'
  return { total, lines, grade }
}
