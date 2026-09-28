import type { GameState } from '../core/GameState'

export const EXPENDITURE_LABELS: Record<string, string> = {
  payroll: 'Player payroll',
  operations: 'Game-day operations',
  travel: 'Road trips',
  upkeep: 'Facility upkeep',
  staff: 'Staff wages',
  construction: 'Construction',
  signings: 'Free agents',
  marketing: 'Promotions',
  research: 'Upgrades',
  interest: 'Loan interest',
}

export const INCOME_LABELS: Record<string, string> = {
  admission: 'Ticket sales',
  concessions: 'Food & drink',
  merchandise: 'Merchandise',
  parking: 'Parking',
  refunds: 'Demolition refunds',
}

export const LOAN_STEP = 25_000
export const MAX_DEBT = 100_000
/** Interest charged on outstanding debt every game day. */
export const INTEREST_PER_GAME = 0.004

export function financePayment(state: GameState, amount: number, category: string): void {
  if (amount <= 0) return
  state.park.cash -= amount
  state.finance.expenditure[category] = (state.finance.expenditure[category] ?? 0) + amount
}

export function financeIncome(state: GameState, amount: number, category: string): void {
  if (amount <= 0) return
  state.park.cash += amount
  state.finance.income[category] = (state.finance.income[category] ?? 0) + amount
}

/**
 * The bank covers an overdraft with another loan while it still can, so a bad
 * week costs interest instead of the franchise. Returns the amount borrowed.
 */
export function coverOverdraft(state: GameState): number {
  let borrowed = 0
  while (state.park.cash < 0 && state.park.debt + LOAN_STEP <= MAX_DEBT) {
    state.park.debt += LOAN_STEP
    state.park.cash += LOAN_STEP
    borrowed += LOAN_STEP
  }
  return borrowed
}

/** Cash in the bank once every loan is paid back. */
export function netWorth(state: GameState): number {
  return state.park.cash - state.park.debt
}

export function totalOf(record: Record<string, number>): number {
  return Object.values(record).reduce((sum, v) => sum + v, 0)
}
