import { describe, expect, it } from 'vitest'
import { DemolishFacilityAction } from '../src/actions/DemolishFacilityAction'
import { FundResearchAction } from '../src/actions/FundResearchAction'
import { submitAction } from '../src/actions/GameActions'
import { FireStaffAction, HireStaffAction } from '../src/actions/HireStaffAction'
import { RepayLoanAction, TakeLoanAction } from '../src/actions/LoanActions'
import { PlaceFacilityAction } from '../src/actions/PlaceFacilityAction'
import { SetTicketPriceAction } from '../src/actions/PricingActions'
import { SignPlayerAction } from '../src/actions/SignPlayerAction'
import { StartMarketingAction } from '../src/actions/StartMarketingAction'
import { UndoAction } from '../src/actions/UndoAction'
import { findPath } from '../src/entity/FanPathfinding'
import { HOME } from '../src/game/field'
import {
  accessCapacity, computeAttendance, computeDemand, computeRevenue, fairTicketPrice, getParkStats,
} from '../src/management/Economy'
import { computeFanFactors, experienceTarget, worstFactor } from '../src/management/FanExperience'
import { LOAN_STEP, MAX_DEBT, netWorth } from '../src/management/Finance'
import { createStateForScenario } from '../src/scenario/Scenario'
import { BUILDINGS } from '../src/world/facilities'
import { ENTRANCE, GATE, PARK } from '../src/world/parkBounds'

const newGame = () => createStateForScenario('turn_it_around', 1234)
const saturday = { weekday: 5, weather: 'sunny', night: false, openingDay: false } as const
const tuesday = { weekday: 1, weather: 'sunny', night: false, openingDay: false } as const
/** An empty concourse tile well away from the starter park. */
const SPOT = { x: 4, z: 20 }

describe('starter park', () => {
  it('opens with an old grandstand, two food stands and one restroom', () => {
    const stats = getParkStats(newGame().map)
    expect(stats.seats).toBe(1_800)
    expect(stats.counts.hotdog).toBe(2)
    expect(stats.counts.restroom).toBe(1)
    expect(stats.foodCapacity).toBe(600)
  })

  it('leaves a walkable route from the gate to the far corner', () => {
    const state = newGame()
    const path = findPath(state.map, ENTRANCE.x, ENTRANCE.z, PARK.minX, PARK.minZ)
    expect(path.length).toBeGreaterThan(10)
  })
})

describe('building', () => {
  it('charges the cost and adds the facility', () => {
    const state = newGame()
    const result = submitAction(state, new PlaceFacilityAction(SPOT.x, SPOT.z, 'hotdog'))
    expect(result.ok).toBe(true)
    expect(state.park.cash).toBe(40_000 - BUILDINGS.hotdog.cost)
    expect(state.map.getFacility(SPOT.x, SPOT.z)).toBe('hotdog')
    expect(state.finance.expenditure.construction).toBe(BUILDINGS.hotdog.cost)
  })

  it('refuses the playing field, the gate, land outside the fence and occupied tiles', () => {
    const state = newGame()
    const attempts = [
      new PlaceFacilityAction(HOME.x - 3, HOME.z - 3, 'hotdog'),
      new PlaceFacilityAction(GATE.x0, PARK.maxZ, 'hotdog'),
      new PlaceFacilityAction(0, 0, 'hotdog'),
      new PlaceFacilityAction(HOME.x + 1, HOME.z, 'hotdog'),
    ]
    for (const action of attempts) expect(submitAction(state, action).ok).toBe(false)
    expect(state.park.cash).toBe(40_000)
  })

  it('refuses when cash is short', () => {
    const state = newGame()
    state.park.cash = 1_000
    expect(submitAction(state, new PlaceFacilityAction(SPOT.x, SPOT.z, 'grandstand')).ok).toBe(false)
    expect(state.map.getFacility(SPOT.x, SPOT.z)).toBeNull()
  })

  it('locks advanced facilities behind upgrades', () => {
    const state = newGame()
    expect(submitAction(state, new PlaceFacilityAction(SPOT.x, SPOT.z, 'lights')).ok).toBe(false)
    expect(submitAction(state, new FundResearchAction('night_games')).ok).toBe(true)
    expect(submitAction(state, new PlaceFacilityAction(SPOT.x, SPOT.z, 'lights')).ok).toBe(true)
    expect(submitAction(state, new FundResearchAction('night_games')).ok).toBe(false)
  })

  it('refunds half on demolition', () => {
    const state = newGame()
    submitAction(state, new PlaceFacilityAction(SPOT.x, SPOT.z, 'hotdog'))
    expect(submitAction(state, new DemolishFacilityAction(SPOT.x, SPOT.z)).ok).toBe(true)
    expect(state.park.cash).toBe(40_000 - BUILDINGS.hotdog.cost / 2)
    expect(submitAction(state, new DemolishFacilityAction(SPOT.x, SPOT.z)).ok).toBe(false)
  })

  it('undoes a build for a full refund', () => {
    const state = newGame()
    submitAction(state, new PlaceFacilityAction(SPOT.x, SPOT.z, 'kids_zone'))
    expect(submitAction(state, new UndoAction()).ok).toBe(true)
    expect(state.park.cash).toBe(40_000)
    expect(state.map.getFacility(SPOT.x, SPOT.z)).toBeNull()
    expect(state.finance.expenditure.construction ?? 0).toBe(0)
    expect(submitAction(state, new UndoAction()).ok).toBe(false)
  })
})

describe('front office', () => {
  it('hires up to the limit and lets staff go', () => {
    const state = newGame()
    expect(submitAction(state, new HireStaffAction('mascot')).ok).toBe(true)
    expect(submitAction(state, new HireStaffAction('mascot')).ok).toBe(false)
    expect(state.staff.mascot).toBe(1)
    expect(submitAction(state, new FireStaffAction('mascot')).ok).toBe(true)
    expect(submitAction(state, new FireStaffAction('mascot')).ok).toBe(false)
  })

  it('lends in steps up to the limit and takes repayments', () => {
    const state = newGame()
    for (let i = 0; i < MAX_DEBT / LOAN_STEP; i += 1) {
      expect(submitAction(state, new TakeLoanAction()).ok).toBe(true)
    }
    expect(submitAction(state, new TakeLoanAction()).ok).toBe(false)
    expect(state.park.debt).toBe(MAX_DEBT)
    expect(netWorth(state)).toBe(40_000)
    expect(submitAction(state, new RepayLoanAction()).ok).toBe(true)
    expect(state.park.debt).toBe(MAX_DEBT - LOAN_STEP)
  })

  it('runs one promotion at a time', () => {
    const state = newGame()
    const before = computeDemand(state, saturday)
    expect(submitAction(state, new StartMarketingAction('giveaway')).ok).toBe(true)
    expect(submitAction(state, new StartMarketingAction('local_radio')).ok).toBe(false)
    expect(computeDemand(state, saturday)).toBeGreaterThan(before)
  })

  it('signs free agents and raises payroll', () => {
    const state = newGame()
    const payroll = state.team.payrollPerGame
    expect(submitAction(state, new SignPlayerAction('slugger')).ok).toBe(true)
    expect(state.team.payrollPerGame).toBeGreaterThan(payroll)
    expect(state.park.cash).toBeLessThan(40_000)
  })

  it('validates ticket prices', () => {
    const state = newGame()
    expect(submitAction(state, new SetTicketPriceAction(0)).ok).toBe(false)
    expect(submitAction(state, new SetTicketPriceAction(500)).ok).toBe(false)
    expect(submitAction(state, new SetTicketPriceAction(12)).ok).toBe(true)
    expect(state.park.ticketPrice).toBe(12)
  })
})

describe('economy', () => {
  it('sells fewer tickets as the price climbs', () => {
    const state = newGame()
    const demandAt = (price: number): number => {
      state.park.ticketPrice = price
      return computeDemand(state, saturday)
    }
    expect(demandAt(4)).toBeGreaterThan(demandAt(8))
    expect(demandAt(8)).toBeGreaterThan(demandAt(14))
    expect(demandAt(40)).toBeLessThan(demandAt(8) / 3)
  })

  it('draws bigger crowds on weekends', () => {
    const state = newGame()
    expect(computeDemand(state, saturday)).toBeGreaterThan(computeDemand(state, tuesday))
  })

  it('caps the crowd at the number of seats', () => {
    const state = newGame()
    state.park.ticketPrice = 1
    state.park.fanHappiness = 100
    const crowd = computeAttendance(state, saturday)
    expect(crowd.demand).toBeGreaterThan(1_800)
    expect(crowd.attendance).toBe(1_800)
    expect(crowd.limit).toBe('seats')
  })

  it('needs parking once the park outgrows the walk-up crowd', () => {
    const state = newGame()
    const stats = getParkStats(state.map)
    expect(accessCapacity({ ...stats, parkingCars: 150 })).toBeGreaterThan(accessCapacity(stats))
  })

  it('earns more food money with more stands until everyone is fed', () => {
    const state = newGame()
    const before = computeRevenue(state, 1_800, 'sunny')
    expect(before.served).toBeLessThan(before.hungry)
    submitAction(state, new PlaceFacilityAction(SPOT.x, SPOT.z, 'hotdog'))
    submitAction(state, new PlaceFacilityAction(SPOT.x + 1, SPOT.z, 'drinks'))
    const after = computeRevenue(state, 1_800, 'sunny')
    expect(after.food).toBeGreaterThan(before.food)
    expect(after.tickets).toBe(before.tickets)
  })

  it('values a seat more in a better park', () => {
    const state = newGame()
    const before = fairTicketPrice(state)
    state.park.rating += 300
    expect(fairTicketPrice(state)).toBeGreaterThan(before)
  })
})

describe('fan experience', () => {
  const game = { attendance: 1_500, weather: 'sunny', night: false, won: true, streak: 1, hungry: 1_050, served: 600 } as const

  it('flags food as the biggest problem in the starter park', () => {
    const state = newGame()
    const factors = computeFanFactors(state, game)
    expect(factors.find((f) => f.key === 'food')?.score).toBeLessThan(60)
    expect(['food', 'restrooms', 'clean']).toContain(worstFactor(factors).key)
  })

  it('cheers up when the lines are fixed', () => {
    const state = newGame()
    const before = experienceTarget(computeFanFactors(state, game), 'sunny')
    state.staff.janitor = 2
    submitAction(state, new PlaceFacilityAction(SPOT.x, SPOT.z, 'restroom'))
    submitAction(state, new PlaceFacilityAction(SPOT.x + 1, SPOT.z, 'restroom'))
    const after = experienceTarget(computeFanFactors(state, { ...game, served: 1_050 }), 'sunny')
    expect(after).toBeGreaterThan(before + 15)
  })

  it('sours when the team loses and it rains', () => {
    const state = newGame()
    const win = experienceTarget(computeFanFactors(state, game), 'sunny')
    const loss = experienceTarget(computeFanFactors(state, { ...game, won: false, streak: -4 }), 'rain')
    expect(loss).toBeLessThan(win)
  })
})
