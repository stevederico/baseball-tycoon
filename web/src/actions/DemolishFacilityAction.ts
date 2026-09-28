import { gameEvents } from '../core/events'
import { computeRating } from '../management/Economy'
import { financeIncome } from '../management/Finance'
import { BUILDINGS, formatMoney } from '../world/facilities'
import type { ActionResult, GameAction } from './types'
import type { GameState } from '../core/GameState'

export const DEMOLISH_REFUND = 0.5

export class DemolishFacilityAction implements GameAction {
  readonly type = 'demolishFacility'
  readonly x: number
  readonly z: number

  constructor(x: number, z: number) {
    this.x = x
    this.z = z
  }

  query(state: GameState): ActionResult {
    const existing = state.map.getFacility(this.x, this.z)
    if (!existing) return { ok: false, message: 'Nothing to demolish here.' }
    return { ok: true, message: `Can demolish ${BUILDINGS[existing].label}.` }
  }

  execute(state: GameState): ActionResult {
    const check = this.query(state)
    if (!check.ok) return check

    const id = state.map.getFacility(this.x, this.z)
    if (!id) return { ok: false, message: 'Nothing to demolish here.' }
    const def = BUILDINGS[id]
    const refund = Math.floor(def.cost * DEMOLISH_REFUND)
    state.map.removeFacility(this.x, this.z)
    financeIncome(state, refund, 'refunds')
    state.park.rating = computeRating(state)

    gameEvents.emit('cash:updated', { cash: state.park.cash })
    gameEvents.emit('park:updated', { rating: state.park.rating, happiness: state.park.fanHappiness })

    return { ok: true, message: `Demolished ${def.label}. Refund ${formatMoney(refund)}.` }
  }
}
