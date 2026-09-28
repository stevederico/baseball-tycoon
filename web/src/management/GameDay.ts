import type { GameReport, GameState, Weather } from '../core/GameState'
import { gameEvents } from '../core/events'
import { clamp, nextRandom, randRange } from '../core/rng'
import { updateScenario } from '../scenario/Scenario'
import { simulateGame } from '../season/GameSim'
import { getLeagueTeam, getTeamDef, PLAYER_TEAM_ID } from '../season/League'
import { GAMES_PER_SERIES, getPlayerGame, seriesPairings } from '../season/Schedule'
import { teamRatings, trainTeam } from '../season/Team'
import { computeAttendance, computeCosts, computeRating, computeRevenue, getParkStats } from './Economy'
import { computeFanFactors, experienceTarget, worstFactor } from './FanExperience'
import { coverOverdraft, financeIncome, financePayment } from './Finance'
import { hasResearch } from './Research'

const HISTORY_LENGTH = 72
/** How far happiness moves toward the latest game's mood. */
const MOOD_SHIFT = 0.4

function rollWeather(state: GameState): Weather {
  const roll = nextRandom(state)
  if (roll < 0.45) return 'sunny'
  if (roll < 0.7) return 'cloudy'
  if (roll < 0.85) return 'hot'
  return 'rain'
}

function syncPlayerRatings(state: GameState): void {
  const ratings = teamRatings(state.team)
  const entry = getLeagueTeam(state.league, PLAYER_TEAM_ID)
  entry.hitting = ratings.hitting
  entry.pitching = ratings.pitching
}

/** Set up today's game: weather, the crowd, and the (hidden) final score. */
export function beginGameDay(state: GameState): void {
  const game = getPlayerGame(state.season.gamesPlayed)
  const stats = getParkStats(state.map)
  const weather = rollWeather(state)
  const hasLights = (stats.counts.lights ?? 0) > 0 && hasResearch(state.research.unlocked, 'night_games')
  const night = game.home && hasLights && game.weekday <= 4

  let demand = 0
  let attendance = 0
  let limit: 'demand' | 'seats' | 'parking' = 'demand'
  if (game.home) {
    const crowd = computeAttendance(
      state,
      { weekday: game.weekday, weather, night, openingDay: state.season.homeGamesPlayed === 0 },
      randRange(state, 0.93, 1.07),
    )
    demand = crowd.demand
    attendance = crowd.attendance
    limit = crowd.limit
  }

  syncPlayerRatings(state)
  const player = getLeagueTeam(state.league, PLAYER_TEAM_ID)
  const rival = getLeagueTeam(state.league, game.opponentId)
  const fill = stats.seats > 0 ? attendance / stats.seats : 0
  const crowdEdge = 0.04 + 0.06 * fill * (state.park.fanHappiness / 100)
  const line = game.home
    ? simulateGame(state, rival, player, crowdEdge)
    : simulateGame(state, player, rival, 0.04)

  state.today = {
    gameIndex: game.gameIndex,
    home: game.home,
    opponentId: game.opponentId,
    dateLabel: game.dateLabel,
    weekday: game.weekday,
    weather,
    night,
    demand,
    attendance,
    ticketPrice: state.park.ticketPrice,
    foodPrice: state.park.foodPrice,
    limit,
    line,
    halfInningsShown: 0,
    completed: false,
  }
  state.phase = game.home ? 'pregame' : 'away'
  state.phaseTicks = 0
  // Once fans are coming through the gate, earlier building work is final.
  state.undoStack = []
  gameEvents.emit('day:started', { gameIndex: game.gameIndex, home: game.home })
}

function recordResult(state: GameState, won: boolean): void {
  const { season } = state
  const player = getLeagueTeam(state.league, PLAYER_TEAM_ID)
  const rival = getLeagueTeam(state.league, state.today?.opponentId ?? '')
  if (won) {
    season.wins += 1
    player.wins += 1
    rival.losses += 1
    season.streak = season.streak > 0 ? season.streak + 1 : 1
  } else {
    season.losses += 1
    player.losses += 1
    rival.wins += 1
    season.streak = season.streak < 0 ? season.streak - 1 : -1
  }
  season.recentResults.push(won)
  if (season.recentResults.length > 10) season.recentResults.shift()
}

/** Play out the other three games in the league for today. */
function playRestOfLeague(state: GameState, gameIndex: number): void {
  const pairings = seriesPairings(Math.floor(gameIndex / GAMES_PER_SERIES))
  for (const pairing of pairings) {
    if (pairing.home === PLAYER_TEAM_ID || pairing.away === PLAYER_TEAM_ID) continue
    const home = getLeagueTeam(state.league, pairing.home)
    const away = getLeagueTeam(state.league, pairing.away)
    const line = simulateGame(state, away, home)
    if (line.homeRuns > line.awayRuns) {
      home.wins += 1
      away.losses += 1
    } else {
      away.wins += 1
      home.losses += 1
    }
  }
}

function pushHistory(list: number[], value: number): void {
  list.push(value)
  if (list.length > HISTORY_LENGTH) list.shift()
}

function announce(state: GameState, message: string): void {
  state.news.unshift(message)
  if (state.news.length > 60) state.news.length = 60
  gameEvents.emit('news:added', { message })
}

/** Apply today's result: the record, the box office, the bills and the fans' mood. */
export function completeGameDay(state: GameState): void {
  const today = state.today
  if (!today || today.completed) return
  today.completed = true
  today.halfInningsShown = 99

  const runsFor = today.home ? today.line.homeRuns : today.line.awayRuns
  const runsAgainst = today.home ? today.line.awayRuns : today.line.homeRuns
  const won = runsFor > runsAgainst
  recordResult(state, won)
  playRestOfLeague(state, today.gameIndex)

  const rival = getTeamDef(today.opponentId)
  const cashBefore = state.park.cash
  const costs = computeCosts(state, today.home, today.attendance)
  const result = won ? 'WIN' : 'LOSS'

  if (today.home) {
    const stats = getParkStats(state.map)
    const prices = { ticketPrice: today.ticketPrice, foodPrice: today.foodPrice }
    const revenue = computeRevenue(state, today.attendance, today.weather, prices)
    financeIncome(state, revenue.tickets, 'admission')
    financeIncome(state, revenue.food, 'concessions')
    financeIncome(state, revenue.merch, 'merchandise')
    financeIncome(state, revenue.parking, 'parking')

    const factors = computeFanFactors(state, {
      attendance: today.attendance,
      weather: today.weather,
      night: today.night,
      won,
      streak: state.season.streak,
      hungry: revenue.hungry,
      served: revenue.served,
      prices,
    })
    const mood = experienceTarget(factors, today.weather)
    state.park.fanHappiness = clamp(
      state.park.fanHappiness + (mood - state.park.fanHappiness) * MOOD_SHIFT,
      0,
      100,
    )

    state.season.homeGamesPlayed += 1
    state.season.totalAttendance += today.attendance
    const sellout = stats.seats > 0 && today.attendance >= stats.seats
    if (sellout) state.season.sellouts += 1

    if (state.marketing.gamesRemaining > 0) {
      state.marketing.gamesRemaining -= 1
      if (state.marketing.gamesRemaining === 0) state.marketing.campaignId = null
    }

    financePayment(state, costs.upkeep, 'upkeep')
    financePayment(state, costs.staff, 'staff')
    financePayment(state, costs.payroll, 'payroll')
    financePayment(state, costs.operations, 'operations')
    financePayment(state, costs.interest, 'interest')

    const profit = state.park.cash - cashBefore
    const report: GameReport = {
      gameIndex: today.gameIndex,
      opponentId: today.opponentId,
      won,
      runsFor,
      runsAgainst,
      attendance: today.attendance,
      seats: stats.seats,
      demand: today.demand,
      limit: today.limit,
      weather: today.weather,
      revenue: {
        tickets: revenue.tickets, food: revenue.food, merch: revenue.merch, parking: revenue.parking,
      },
      hungry: revenue.hungry,
      served: revenue.served,
      ticketPrice: today.ticketPrice,
      costs,
      profit,
      factors,
      happiness: state.park.fanHappiness,
    }
    state.lastHome = report
    pushHistory(state.history.profit, profit)
    pushHistory(state.history.attendance, today.attendance)
    pushHistory(state.history.demand, today.demand)
    pushHistory(state.history.happiness, state.park.fanHappiness)

    const crowd = `${today.attendance.toLocaleString('en-US')} fans${sellout ? ' (sellout!)' : ''}`
    const money = `${profit >= 0 ? '+' : '-'}$${Math.abs(profit).toLocaleString('en-US')}`
    announce(state, `${result} ${runsFor}-${runsAgainst} vs ${rival.name}. ${crowd}, ${money}.`)
    const worst = worstFactor(factors)
    if (worst.score < 55) announce(state, `Fans say: "${worst.complaint}"`)
  } else {
    financePayment(state, costs.travel, 'travel')
    financePayment(state, costs.interest, 'interest')
    announce(state, `${result} ${runsFor}-${runsAgainst} at ${rival.name}.`)
  }

  const stats = getParkStats(state.map)
  trainTeam(state, state.team, {
    battingCages: stats.counts.batting_cage ?? 0,
    bullpens: stats.counts.bullpen ?? 0,
    clubhouses: stats.counts.clubhouse ?? 0,
    hittingCoaches: state.staff.hitting_coach,
    pitchingCoaches: state.staff.pitching_coach,
    playerDevelopment: hasResearch(state.research.unlocked, 'player_dev'),
  })
  syncPlayerRatings(state)

  state.season.gamesPlayed += 1
  state.lastResult = {
    gameIndex: today.gameIndex, home: today.home, opponentId: today.opponentId, won, runsFor, runsAgainst,
  }
  state.park.rating = computeRating(state)
  pushHistory(state.history.cash, state.park.cash)
  // Anything built during the game has now served this crowd.
  state.undoStack = []

  const borrowed = coverOverdraft(state)
  if (borrowed > 0) {
    announce(state, `You ran out of cash. The bank covered it with a $${borrowed.toLocaleString('en-US')} loan.`)
  } else if (state.park.cash < 0) {
    announce(state, 'You are in the red and the bank will not lend any more!')
  }

  gameEvents.emit('game:finished', { home: today.home, won })
  gameEvents.emit('cash:updated', { cash: state.park.cash })
  gameEvents.emit('park:updated', { rating: state.park.rating, happiness: state.park.fanHappiness })
  gameEvents.emit('season:updated', {
    wins: state.season.wins, losses: state.season.losses, gamesPlayed: state.season.gamesPlayed,
  })
  updateScenario(state)
}

/** Play a whole game day at once — used by tests and the balance bots. */
export function playGameDay(state: GameState): void {
  if (state.scenario.status !== 'active') return
  beginGameDay(state)
  completeGameDay(state)
  state.phase = 'idle'
  state.phaseTicks = 0
}
