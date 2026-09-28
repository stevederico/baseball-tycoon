import { gameEvents } from '../core/events'
import { computeRating } from '../management/Economy'
import { financePayment } from '../management/Finance'
import { getStaffDef, type StaffRole } from '../management/Staff'
import { formatMoney } from '../world/facilities'
import type { ActionResult, GameAction } from './types'
import type { GameState } from '../core/GameState'

export class HireStaffAction implements GameAction {
  readonly type = 'hireStaff'
  readonly role: StaffRole

  constructor(role: StaffRole) {
    this.role = role
  }

  query(state: GameState): ActionResult {
    const def = getStaffDef(this.role)
    if (state.staff[this.role] >= def.max) {
      return { ok: false, message: `You cannot hire any more ${def.label.toLowerCase()}s.` }
    }
    if (state.park.cash < def.hireCost) {
      return { ok: false, message: `Need ${formatMoney(def.hireCost)} to hire a ${def.label.toLowerCase()}.` }
    }
    return { ok: true, message: `Can hire ${def.label}.` }
  }

  execute(state: GameState): ActionResult {
    const check = this.query(state)
    if (!check.ok) return check

    const def = getStaffDef(this.role)
    financePayment(state, def.hireCost, 'staff')
    state.staff[this.role] += 1
    state.park.rating = computeRating(state)

    gameEvents.emit('cash:updated', { cash: state.park.cash })
    return { ok: true, message: `Hired a ${def.label.toLowerCase()}.` }
  }
}

export class FireStaffAction implements GameAction {
  readonly type = 'fireStaff'
  readonly role: StaffRole

  constructor(role: StaffRole) {
    this.role = role
  }

  query(state: GameState): ActionResult {
    const def = getStaffDef(this.role)
    if (state.staff[this.role] <= 0) {
      return { ok: false, message: `No ${def.label.toLowerCase()} to let go.` }
    }
    return { ok: true, message: `Can let a ${def.label.toLowerCase()} go.` }
  }

  execute(state: GameState): ActionResult {
    const check = this.query(state)
    if (!check.ok) return check

    const def = getStaffDef(this.role)
    state.staff[this.role] -= 1
    state.park.rating = computeRating(state)
    gameEvents.emit('park:updated', { rating: state.park.rating, happiness: state.park.fanHappiness })
    return { ok: true, message: `Let a ${def.label.toLowerCase()} go.` }
  }
}
