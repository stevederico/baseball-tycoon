import { describe, expect, it } from 'vitest'
import { submitAction } from '../src/actions/GameActions'
import { PlaceFacilityAction } from '../src/actions/PlaceFacilityAction'
import { SetFoodPriceAction, SetTicketPriceAction } from '../src/actions/PricingActions'
import { UndoAction } from '../src/actions/UndoAction'
import { BANKRUPTCY_FLOOR } from '../src/core/constants'
import { gameStateUpdateLogic } from '../src/core/GameLoop'
import { deserializeState, serializeState } from '../src/core/SaveLoad'
import { totalCosts } from '../src/management/Economy'
import { fairTicketPrice } from '../src/management/Economy'
import { MAX_DEBT } from '../src/management/Finance'
import { beginGameDay, completeGameDay, playGameDay } from '../src/management/GameDay'
import { computeScore, createStateForScenario, goalProgress } from '../src/scenario/Scenario'
import { adviceBot, frugalBot, greedyBot, passiveBot, playSeason, priceAbuseBot, sensibleBot } from './bots'

const newGame = (seed = 1234) => createStateForScenario('turn_it_around', seed)

describe('game day', () => {
  it('books the box office and the bills for a home game', () => {
    const state = newGame()
    playGameDay(state)
    const report = state.lastHome
    expect(report).not.toBeNull()
    if (!report) return
    const revenue = report.revenue.tickets + report.revenue.food + report.revenue.merch + report.revenue.parking
    expect(report.profit).toBe(revenue - totalCosts(report.costs))
    expect(state.park.cash).toBe(40_000 + report.profit)
    expect(report.attendance).toBeGreaterThan(500)
    expect(report.attendance).toBeLessThanOrEqual(report.seats)
    expect(state.season.gamesPlayed).toBe(1)
    expect(state.season.homeGamesPlayed).toBe(1)
    expect(state.season.wins + state.season.losses).toBe(1)
  })

  it('only pays for travel on the road', () => {
    const state = newGame()
    for (let i = 0; i < 6; i += 1) playGameDay(state)
    const cash = state.park.cash
    const homeGames = state.season.homeGamesPlayed
    playGameDay(state)
    expect(state.lastResult?.home).toBe(false)
    expect(state.season.homeGamesPlayed).toBe(homeGames)
    expect(cash - state.park.cash).toBe(1_000)
  })

  it('keeps the league standings balanced', () => {
    const state = newGame()
    for (let i = 0; i < 30; i += 1) playGameDay(state)
    const wins = state.league.reduce((s, t) => s + t.wins, 0)
    const losses = state.league.reduce((s, t) => s + t.losses, 0)
    expect(wins).toBe(losses)
    expect(wins).toBe(30 * 4)
    for (const team of state.league) expect(team.wins + team.losses).toBe(30)
  })

  it('settles building work once a game has been played', () => {
    const state = newGame()
    submitAction(state, new PlaceFacilityAction(4, 20, 'hotdog'))
    playGameDay(state)
    expect(submitAction(state, new UndoAction()).ok).toBe(false)
  })

  it('clears undo once the gates open, so used seats are not refunded', () => {
    const state = newGame()
    submitAction(state, new PlaceFacilityAction(4, 20, 'grandstand'))
    beginGameDay(state)
    expect(submitAction(state, new UndoAction()).ok).toBe(false)
    expect(state.map.getFacility(4, 20)).toBe('grandstand')
  })

  it('does not refund work built during a game once it has served the crowd', () => {
    const state = newGame()
    beginGameDay(state)
    submitAction(state, new PlaceFacilityAction(4, 20, 'hotdog'))
    completeGameDay(state)
    expect(submitAction(state, new UndoAction()).ok).toBe(false)
  })

  it('bills the prices fans paid at the gate, not prices changed mid-game', () => {
    const honest = newGame()
    const sneaky = newGame()
    beginGameDay(honest)
    beginGameDay(sneaky)
    submitAction(sneaky, new SetTicketPriceAction(40))
    submitAction(sneaky, new SetFoodPriceAction('high'))
    completeGameDay(honest)
    completeGameDay(sneaky)
    expect(sneaky.lastHome?.revenue).toEqual(honest.lastHome?.revenue)
    expect(sneaky.park.cash).toBe(honest.park.cash)
  })

  it('makes raising prices mid-game worse than a fair season', () => {
    const play = (farm: boolean): number => {
      const state = newGame(4242)
      while (state.scenario.status === 'active') {
        submitAction(state, new SetTicketPriceAction(Math.round(fairTicketPrice(state))))
        submitAction(state, new SetFoodPriceAction('fair'))
        beginGameDay(state)
        if (farm) {
          submitAction(state, new SetTicketPriceAction(40))
          submitAction(state, new SetFoodPriceAction('high'))
        }
        completeGameDay(state)
        state.phase = 'idle'
      }
      return state.park.cash - state.park.debt
    }
    expect(play(true)).toBeLessThanOrEqual(play(false))
  })

  it('is applied only once', () => {
    const state = newGame()
    beginGameDay(state)
    completeGameDay(state)
    const cash = state.park.cash
    completeGameDay(state)
    expect(state.park.cash).toBe(cash)
    expect(state.season.gamesPlayed).toBe(1)
  })

  it('plays a full home game through the tick loop', () => {
    const state = newGame()
    let ticks = 0
    while (state.season.gamesPlayed === 0 && ticks < 5_000) {
      gameStateUpdateLogic(state)
      ticks += 1
    }
    expect(state.season.gamesPlayed).toBe(1)
    expect(state.phase).toBe('postgame')
    expect(ticks).toBeGreaterThan(300)
    expect(state.entities.fans.length).toBeGreaterThan(0)
  })

  it('stands still while paused', () => {
    const state = newGame()
    state.paused = true
    for (let i = 0; i < 200; i += 1) gameStateUpdateLogic(state)
    expect(state.currentTicks).toBe(0)
    expect(state.today).toBeNull()
  })
})

describe('scenario', () => {
  it('borrows to cover an overdraft before declaring bankruptcy', () => {
    const state = newGame()
    state.park.cash = -5_000
    playGameDay(state)
    expect(state.park.debt).toBeGreaterThan(0)
    expect(state.scenario.status).toBe('active')
  })

  it('ends in bankruptcy when the credit runs out', () => {
    const state = newGame()
    state.park.debt = MAX_DEBT
    state.park.cash = BANKRUPTCY_FLOOR - 50_000
    playGameDay(state)
    expect(state.scenario.status).toBe('lost')
    expect(state.scenario.reason).toMatch(/bankrupt/i)
    expect(submitAction(state, new PlaceFacilityAction(4, 20, 'tree')).ok).toBe(false)
  })

  it('is won when every goal is met at the end of the season', () => {
    const state = newGame()
    state.season.gamesPlayed = 71
    state.season.wins = 50
    state.season.losses = 21
    state.park.cash = 900_000
    state.park.fanHappiness = 95
    playGameDay(state)
    expect(state.scenario.status).toBe('won')
    expect(goalProgress(state).every((g) => g.met)).toBe(true)
    expect(computeScore(state).total).toBeGreaterThan(20_000)
  })

  it('is lost when a goal is missed', () => {
    const state = newGame()
    state.season.gamesPlayed = 71
    state.season.wins = 50
    state.park.cash = 900_000
    state.park.fanHappiness = 20
    playGameDay(state)
    expect(state.scenario.status).toBe('lost')
    expect(state.scenario.reason).toMatch(/fan happiness/)
  })

  it('counts loans against the money goal', () => {
    const state = newGame()
    state.park.cash = 260_000
    state.park.debt = 50_000
    expect(goalProgress(state).find((g) => g.key === 'cash')?.met).toBe(false)
  })
})

describe('save and load', () => {
  it('round-trips a season in progress', () => {
    const state = newGame()
    submitAction(state, new PlaceFacilityAction(4, 20, 'kids_zone'))
    for (let i = 0; i < 9; i += 1) playGameDay(state)
    const loaded = deserializeState(serializeState(state))
    expect(loaded).not.toBeNull()
    if (!loaded) return
    expect(loaded.park).toEqual(state.park)
    expect(loaded.season).toEqual(state.season)
    expect(loaded.league).toEqual(state.league)
    expect(loaded.team).toEqual(state.team)
    expect(loaded.map.getFacility(4, 20)).toBe('kids_zone')
    expect(loaded.map.toJSON().facilities.length).toBe(state.map.toJSON().facilities.length)
  })

  it('continues identically after loading', () => {
    const state = newGame()
    for (let i = 0; i < 5; i += 1) playGameDay(state)
    const loaded = deserializeState(serializeState(state))
    if (!loaded) throw new Error('load failed')
    for (let i = 0; i < 10; i += 1) {
      playGameDay(state)
      playGameDay(loaded)
    }
    expect(loaded.park.cash).toBe(state.park.cash)
    expect(loaded.season.wins).toBe(state.season.wins)
  })

  it('rejects junk and old saves', () => {
    expect(deserializeState('not json')).toBeNull()
    expect(deserializeState('{"version":2}')).toBeNull()
    expect(deserializeState('{"version":3,"scenarioId":"nope","map":{},"park":{}}')).toBeNull()
  })
})

describe('balance', () => {
  const SEEDS = Array.from({ length: 20 }, (_, i) => (i + 1) * 7919)

  it('cannot be won by doing nothing', () => {
    for (const seed of SEEDS) {
      expect(playSeason(passiveBot, seed).status).toBe('lost')
      expect(playSeason(passiveBot, seed, 'short_season').status).toBe('lost')
    }
  })

  it('does not bankrupt an owner who does nothing', () => {
    for (const seed of SEEDS) {
      expect(playSeason(passiveBot, seed).state.scenario.reason).not.toMatch(/bankrupt/i)
    }
  })

  const winsOf = (bot: typeof sensibleBot, scenario: 'turn_it_around' | 'short_season'): number =>
    SEEDS.filter((seed) => playSeason(bot, seed, scenario).status === 'won').length

  it('gives a sensible owner roughly even odds in Turn It Around', () => {
    const wins = winsOf(sensibleBot, 'turn_it_around')
    expect(wins).toBeGreaterThanOrEqual(6)
    expect(wins).toBeLessThanOrEqual(15)
  })

  it('lets a player who follows the advice win Turn It Around often, but not always', () => {
    const wins = winsOf(adviceBot, 'turn_it_around')
    expect(wins).toBeGreaterThanOrEqual(8)
    expect(wins).toBeLessThanOrEqual(15)
  })

  it('lets a player who follows the advice win Spring Sprint about half the time', () => {
    const wins = winsOf(adviceBot, 'short_season')
    expect(wins).toBeGreaterThanOrEqual(7)
    expect(wins).toBeLessThanOrEqual(15)
  })

  it('never lets an owner who never builds win either season', () => {
    expect(winsOf(passiveBot, 'turn_it_around')).toBe(0)
    expect(winsOf(passiveBot, 'short_season')).toBe(0)
  })

  it('never lets an owner who charges the maximum win', () => {
    expect(winsOf(priceAbuseBot, 'turn_it_around')).toBe(0)
    expect(winsOf(priceAbuseBot, 'short_season')).toBe(0)
  })

  it('makes the short season winnable with careful spending', () => {
    expect(winsOf(frugalBot, 'short_season')).toBeGreaterThanOrEqual(8)
    expect(winsOf(sensibleBot, 'short_season')).toBeGreaterThanOrEqual(8)
  })

  it('makes Pricey food a worse deal than Fair over a season', () => {
    const total = (bot: typeof sensibleBot): number =>
      SEEDS.slice(0, 8).reduce((sum, seed) => sum + playSeason(bot, seed).cash, 0)
    expect(total(greedyBot)).toBeLessThan(total(sensibleBot))
  })

  it('always finishes the sandbox season as a win', () => {
    expect(playSeason(passiveBot, 5, 'sandbox').status).toBe('won')
  })
})
