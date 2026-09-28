import { gameEvents } from '../core/events'
import { LOAN_STEP, MAX_DEBT } from '../management/Finance'
import { formatMoney } from '../world/facilities'
import type { GameState } from '../core/GameState'
import type { ActionResult, GameAction } from './types'

export class TakeLoanAction implements GameAction {
  readonly type = 'takeLoan'

  query(state: GameState): ActionResult {
    if (state.park.debt + LOAN_STEP > MAX_DEBT) {
      return { ok: false, message: `The bank will not lend more than ${formatMoney(MAX_DEBT)}.` }
    }
    return { ok: true, message: 'Can borrow.' }
  }

  execute(state: GameState): ActionResult {
    const check = this.query(state)
    if (!check.ok) return check
    state.park.debt += LOAN_STEP
    state.park.cash += LOAN_STEP
    gameEvents.emit('cash:updated', { cash: state.park.cash })
    return { ok: true, message: `Borrowed ${formatMoney(LOAN_STEP)}.` }
  }
}

export class RepayLoanAction implements GameAction {
  readonly type = 'repayLoan'

  query(state: GameState): ActionResult {
    if (state.park.debt <= 0) return { ok: false, message: 'You have no loan to repay.' }
    if (state.park.cash < Math.min(LOAN_STEP, state.park.debt)) {
      return { ok: false, message: 'Not enough cash to make a repayment.' }
    }
    return { ok: true, message: 'Can repay.' }
  }

  execute(state: GameState): ActionResult {
    const check = this.query(state)
    if (!check.ok) return check
    const amount = Math.min(LOAN_STEP, state.park.debt)
    state.park.debt -= amount
    state.park.cash -= amount
    gameEvents.emit('cash:updated', { cash: state.park.cash })
    return { ok: true, message: `Repaid ${formatMoney(amount)}.` }
  }
}
