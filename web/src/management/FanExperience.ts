import type { GameState, Weather } from '../core/GameState'
import { clamp } from '../core/rng'
import { fairTicketPrice, foodCapacity, getParkStats, type GamePrices } from './Economy'
import { getActiveCampaign } from './Marketing'

export type FactorKey = 'seats' | 'food' | 'restrooms' | 'clean' | 'fun' | 'value' | 'team' | 'beauty'

export interface FanFactor {
  key: FactorKey
  label: string
  /** 0..100 — how fans felt about this part of their day. */
  score: number
  weight: number
  /** What to do about it when the score is poor. */
  tip: string
  /** What a fan says when it goes badly / well. */
  complaint: string
  praise: string
}

export interface ExperienceInputs {
  attendance: number
  weather: Weather
  night: boolean
  won: boolean
  /** Signed streak after the game: positive = wins in a row. */
  streak: number
  hungry: number
  served: number
  /** The prices this crowd paid. Defaults to the current prices. */
  prices?: GamePrices
}

const ratio = (capacity: number, need: number): number => (need <= 0 ? 1 : clamp(capacity / need, 0, 1))

export function computeFanFactors(state: GameState, input: ExperienceInputs): FanFactor[] {
  const stats = getParkStats(state.map)
  const campaign = getActiveCampaign(state.marketing)
  const prices = input.prices ?? state.park

  const seats = clamp(30 + 65 * stats.comfort + state.staff.usher * 5, 0, 100)

  const variety = stats.foodTypes >= 3 ? 10 : stats.foodTypes === 2 ? 0 : -10
  const menu = prices.foodPrice === 'low' ? 8 : prices.foodPrice === 'high' ? -35 : 0
  const food = clamp(100 * ratio(input.served, input.hungry) ** 1.2 + variety + menu, 0, 100)

  const restrooms = clamp(100 * ratio(stats.restroomCapacity, input.attendance), 0, 100)
  const clean = clamp(100 * ratio(400 + state.staff.janitor * 700, input.attendance), 0, 100)

  const fun = clamp(
    25 + stats.fun + state.staff.mascot * 15 + (campaign?.funBoost ?? 0) + (input.night ? 5 : 0),
    0,
    100,
  )

  const value = clamp(100 * (1.5 - 0.75 * (prices.ticketPrice / fairTicketPrice(state))), 0, 100)

  const team = input.won
    ? clamp(70 + Math.min(Math.abs(input.streak), 5) * 6, 0, 100)
    : clamp(45 - Math.min(Math.abs(input.streak), 5) * 5, 0, 100)

  const beauty = clamp(30 + stats.beauty * 2 + state.staff.groundskeeper * 12, 0, 100)

  return [
    {
      key: 'food', label: 'Food & drink', score: food, weight: 0.2,
      tip: foodCapacity(state) < input.hungry
        ? 'Lines are too long. Build more food stands or hire vendors.'
        : stats.foodTypes < 2
          ? 'Fans want more choice. Add a different kind of food stand.'
          : 'Fans think food costs too much. Lower the menu prices.',
      complaint: 'The food line took three innings!', praise: 'Best hot dog in the league.',
    },
    {
      key: 'restrooms', label: 'Restrooms', score: restrooms, weight: 0.14,
      tip: 'Not enough restrooms for the crowd. Build more.',
      complaint: 'The restroom line is brutal.', praise: 'No wait at the restrooms!',
    },
    {
      key: 'clean', label: 'Cleanliness', score: clean, weight: 0.14,
      tip: 'Trash is piling up. Hire janitors.',
      complaint: 'There is trash everywhere.', praise: 'This park is spotless.',
    },
    {
      key: 'fun', label: 'Entertainment', score: fun, weight: 0.14,
      tip: 'Fans are bored between innings. Add a Video Board, Kids Corner or a mascot.',
      complaint: 'Nothing to do between innings.', praise: 'What a show!',
    },
    {
      key: 'seats', label: 'Seating', score: seats, weight: 0.12,
      tip: 'Hard benches are wearing thin. Build grandstands and hire ushers.',
      complaint: 'My seat is a splintery bench.', praise: 'Great view from my seat.',
    },
    {
      key: 'value', label: 'Ticket value', score: value, weight: 0.1,
      tip: 'Tickets cost more than fans think is fair. Lower the price.',
      complaint: 'These tickets are a rip-off.', praise: 'What a bargain!',
    },
    {
      key: 'team', label: 'Team', score: team, weight: 0.1,
      tip: 'Fans want a winner. Build training facilities and sign free agents.',
      complaint: 'This team is hard to watch.', praise: 'Go Haymakers!',
    },
    {
      key: 'beauty', label: 'Atmosphere', score: beauty, weight: 0.06,
      tip: 'The park looks tired. Plant trees and hire a groundskeeper.',
      complaint: 'This place needs a coat of paint.', praise: 'What a beautiful ballpark.',
    },
  ]
}

/** Weighted fan mood for one game, 0..100. */
export function experienceTarget(factors: FanFactor[], weather: Weather): number {
  const total = factors.reduce((sum, f) => sum + f.score * f.weight, 0)
  return clamp(total - (weather === 'rain' ? 6 : 0), 0, 100)
}

/** The factor dragging fan happiness down the most (score against its weight). */
export function worstFactor(factors: FanFactor[]): FanFactor {
  return factors.reduce((worst, f) => ((100 - f.score) * f.weight > (100 - worst.score) * worst.weight ? f : worst))
}
