import type { FoodPrice, GameState } from '../core/GameState'
import type { ActionResult, GameAction } from './types'

export const MIN_TICKET_PRICE = 1
export const MAX_TICKET_PRICE = 40

export class SetTicketPriceAction implements GameAction {
  readonly type = 'setTicketPrice'
  readonly price: number

  constructor(price: number) {
    this.price = price
  }

  query(): ActionResult {
    if (!Number.isFinite(this.price) || this.price < MIN_TICKET_PRICE || this.price > MAX_TICKET_PRICE) {
      return { ok: false, message: `Tickets must cost $${MIN_TICKET_PRICE} to $${MAX_TICKET_PRICE}.` }
    }
    return { ok: true, message: 'Can set ticket price.' }
  }

  execute(state: GameState): ActionResult {
    const check = this.query()
    if (!check.ok) return check
    state.park.ticketPrice = Math.round(this.price)
    return { ok: true, message: `Tickets now cost $${state.park.ticketPrice}.` }
  }
}

export class SetFoodPriceAction implements GameAction {
  readonly type = 'setFoodPrice'
  readonly price: FoodPrice

  constructor(price: FoodPrice) {
    this.price = price
  }

  query(): ActionResult {
    return { ok: true, message: 'Can set menu prices.' }
  }

  execute(state: GameState): ActionResult {
    state.park.foodPrice = this.price
    return { ok: true, message: 'Menu prices updated.' }
  }
}
