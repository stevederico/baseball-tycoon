import { gameEvents } from '../core/events'
import { financePayment } from '../management/Finance'
import { getResearchDef } from '../management/Research'
import { formatMoney } from '../world/facilities'
import type { ActionResult, GameAction } from './types'
import type { GameState } from '../core/GameState'

export class FundResearchAction implements GameAction {
  readonly type = 'fundResearch'
  readonly researchId: string

  constructor(researchId: string) {
    this.researchId = researchId
  }

  query(state: GameState): ActionResult {
    const def = getResearchDef(this.researchId)
    if (!def) return { ok: false, message: 'Unknown upgrade.' }
    if (state.research.unlocked.includes(this.researchId)) {
      return { ok: false, message: `${def.label} is already done.` }
    }
    if (state.park.cash < def.cost) {
      return { ok: false, message: `Need ${formatMoney(def.cost)} for ${def.label}.` }
    }
    return { ok: true, message: `Can fund ${def.label}.` }
  }

  execute(state: GameState): ActionResult {
    const check = this.query(state)
    if (!check.ok) return check

    const def = getResearchDef(this.researchId)
    if (!def) return { ok: false, message: 'Unknown upgrade.' }
    financePayment(state, def.cost, 'research')
    state.research.unlocked.push(this.researchId)

    gameEvents.emit('cash:updated', { cash: state.park.cash })
    return { ok: true, message: `Upgrade complete: ${def.label}.` }
  }
}
