import type { MapStore } from '../world/Map'
import type { BuildingId } from '../world/facilities'
import type { Fan } from '../entity/Fan'
import type { GameAction } from '../actions/types'
import type { ScenarioId } from '../scenario/Scenarios'
import type { StaffRole } from '../management/Staff'
import type { GameCosts } from '../management/Economy'
import type { FanFactor } from '../management/FanExperience'
import type { LeagueTeam } from '../season/League'
import type { LineScore } from '../season/GameSim'
import type { TeamState } from '../season/Team'
import type { UndoSnapshot } from './Undo'

export type ToolMode = 'build' | 'demolish'
export type Phase = 'idle' | 'pregame' | 'live' | 'postgame' | 'away'
export type Weather = 'sunny' | 'cloudy' | 'hot' | 'rain'
export type FoodPrice = 'low' | 'fair' | 'high'

/** The game being played today. The result is simulated up front and revealed live. */
export interface TodayGame {
  gameIndex: number
  home: boolean
  opponentId: string
  dateLabel: string
  weekday: number
  weather: Weather
  night: boolean
  demand: number
  attendance: number
  /** Prices locked in when the gates open; the game is billed at these. */
  ticketPrice: number
  foodPrice: FoodPrice
  limit: 'demand' | 'seats' | 'parking'
  line: LineScore
  halfInningsShown: number
  /** True once the result has been applied to the books. */
  completed: boolean
}

/** Box office and fan report for the most recent home game. */
export interface GameReport {
  gameIndex: number
  opponentId: string
  won: boolean
  runsFor: number
  runsAgainst: number
  attendance: number
  seats: number
  demand: number
  limit: 'demand' | 'seats' | 'parking'
  weather: Weather
  revenue: { tickets: number; food: number; merch: number; parking: number }
  /** Fans who wanted food, and those who got served. */
  hungry: number
  served: number
  /** Ticket price this game was played at. */
  ticketPrice: number
  costs: GameCosts
  profit: number
  factors: FanFactor[]
  happiness: number
}

export interface GameResult {
  gameIndex: number
  home: boolean
  opponentId: string
  won: boolean
  runsFor: number
  runsAgainst: number
}

export interface GameState {
  rngState: number
  park: {
    cash: number
    debt: number
    rating: number
    fanHappiness: number
    ticketPrice: number
    foodPrice: FoodPrice
  }
  map: MapStore
  entities: {
    fans: Fan[]
    nextId: number
  }
  season: {
    wins: number
    losses: number
    gamesPlayed: number
    homeGamesPlayed: number
    /** Positive = winning streak, negative = losing streak. */
    streak: number
    /** Last ten results, oldest first. */
    recentResults: boolean[]
    totalAttendance: number
    sellouts: number
  }
  league: LeagueTeam[]
  team: TeamState
  today: TodayGame | null
  phase: Phase
  phaseTicks: number
  lastHome: GameReport | null
  lastResult: GameResult | null
  history: {
    profit: number[]
    attendance: number[]
    /** Fans who wanted a ticket for each home game, before seats or parking. */
    demand: number[]
    happiness: number[]
    cash: number[]
  }
  currentTicks: number
  gameSpeed: 1 | 2 | 4
  paused: boolean
  selectedBuilding: BuildingId
  toolMode: ToolMode
  ghostPos: { x: number; z: number } | null
  scenarioId: ScenarioId
  scenario: {
    status: 'active' | 'won' | 'lost'
    /** Why the scenario ended, shown on the final screen. */
    reason: string
  }
  finance: {
    expenditure: Record<string, number>
    income: Record<string, number>
  }
  research: {
    unlocked: string[]
  }
  staff: Record<StaffRole, number>
  marketing: {
    campaignId: string | null
    gamesRemaining: number
  }
  actionQueue: GameAction[]
  undoStack: UndoSnapshot[]
  news: string[]
}
