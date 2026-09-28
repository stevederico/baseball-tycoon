import { gameEvents } from '../core/events'
import { applyUndo } from '../core/Undo'
import { computeRating } from '../management/Economy'
import type { ActionResult, GameAction } from './types'
import type { GameState } from '../core/GameState'

export class UndoAction implements GameAction {
  readonly type = 'undo'

  query(state: GameState): ActionResult {
    if (state.undoStack.length === 0) {
      return { ok: false, message: 'Nothing to undo.' }
    }
    return { ok: true, message: 'Can undo last action.' }
  }

  execute(state: GameState): ActionResult {
    const check = this.query(state)
    if (!check.ok) return check

    applyUndo(state)
    state.park.rating = computeRating(state)

    gameEvents.emit('cash:updated', { cash: state.park.cash })
    gameEvents.emit('park:updated', { rating: state.park.rating, happiness: state.park.fanHappiness })

    return { ok: true, message: 'Undid the last build.' }
  }
}
