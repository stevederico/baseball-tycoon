import { describe, expect, it } from 'vitest'
import { budget, getAdvice } from '../src/management/Advice'
import { fairTicketPrice } from '../src/management/Economy'
import { playGameDay } from '../src/management/GameDay'
import { createStateForScenario } from '../src/scenario/Scenario'
import type { GameState } from '../src/core/GameState'

describe('advice', () => {
  it('welcomes the player before Opening Day', () => {
    const state = createStateForScenario('turn_it_around', 1)
    expect(getAdvice(state).action.kind).toBe('none')
  })

  it('points at a concrete fix after the first home game', () => {
    const state = createStateForScenario('turn_it_around', 1)
    playGameDay(state)
    expect(getAdvice(state).action.kind).not.toBe('none')
  })

  it('counts home games left from the schedule', () => {
    const long = createStateForScenario('turn_it_around', 1)
    const short = createStateForScenario('short_season', 1)
    expect(budget(long).homeGamesLeft).toBe(36)
    expect(budget(short).homeGamesLeft).toBe(12)
  })

  it('holds back on big builds late in a short season that is behind on money', () => {
    const state = createStateForScenario('short_season', 1)
    for (let i = 0; i < 20; i += 1) playGameDay(state)
    state.park.cash = 20_000
    const advice = getAdvice(state)
    if (advice.action.kind === 'build') {
      expect(['hotdog', 'drinks', 'restroom', 'tree', 'grandstand', 'parking']).toContain(advice.action.id)
    }
    expect(advice.action.kind === 'build' && advice.action.id === 'scoreboard').toBe(false)
  })

  it('never suggests a ticket price far above what fans call fair', () => {
    const state = createStateForScenario('turn_it_around', 3)
    for (let i = 0; i < 40; i += 1) {
      playGameDay(state)
      const { action } = getAdvice(state)
      if (action.kind === 'ticketPrice') expect(action.price).toBeLessThanOrEqual(Math.round(fairTicketPrice(state)) + 1)
    }
  })

  /** A park that sold out last game with plenty of fans turned away. */
  const soldOut = (cash: number): GameState => {
    const state = createStateForScenario('turn_it_around', 11)
    playGameDay(state)
    const report = state.lastHome
    if (!report) throw new Error('no report')
    report.limit = 'seats'
    report.attendance = report.seats
    report.demand = report.seats + 1_500
    report.revenue.tickets = report.attendance * 10
    report.factors = report.factors.map((f) => ({ ...f, score: 90 }))
    state.history.demand = [report.demand]
    state.park.cash = cash
    return state
  }

  it('grows the park first when fans were turned away', () => {
    const { action } = getAdvice(soldOut(60_000))
    expect(action).toEqual({ kind: 'build', id: 'grandstand' })
  })

  it('suggests a loan when seats would pay for themselves but cash is short', () => {
    expect(getAdvice(soldOut(8_000)).action.kind).toBe('borrow')
  })

  it('does not suggest a loan late in the season', () => {
    const state = soldOut(8_000)
    state.season.gamesPlayed = 66
    expect(getAdvice(state).action.kind).not.toBe('borrow')
  })

  it('points at shops and upgrades that pay for themselves', () => {
    const state = createStateForScenario('turn_it_around', 11)
    playGameDay(state)
    const report = state.lastHome
    if (!report) throw new Error('no report')
    report.limit = 'demand'
    report.factors = report.factors.map((f) => ({ ...f, score: 90 }))
    state.season.recentResults = Array(10).fill(true)
    state.season.wins = 40
    state.park.cash = 80_000
    const { action } = getAdvice(state)
    expect(action.kind === 'research' || (action.kind === 'build' && action.id === 'team_store')).toBe(true)
  })
})
