import type { GameState } from '../core/GameState'
import type { ActionResult, GameAction } from './types'
import { gameEvents } from '../core/events'
import { pushUndo } from '../core/Undo'

/** Building work can be undone until the next game is played on it. */
const UNDOABLE = new Set(['placeFacility', 'demolishFacility'])

export function queryAction(state: GameState, action: GameAction): ActionResult {
  return action.query(state)
}

export function executeAction(state: GameState, action: GameAction): ActionResult {
  const check = action.query(state)
  if (!check.ok) return check
  if (UNDOABLE.has(action.type)) pushUndo(state)
  return action.execute(state)
}

export function enqueueAction(state: GameState, action: GameAction): void {
  state.actionQueue.push(action)
}

export function processActionQueue(state: GameState): ActionResult | null {
  let lastResult: ActionResult | null = null
  while (state.actionQueue.length > 0) {
    const action = state.actionQueue.shift()
    if (!action) break
    lastResult = executeAction(state, action)
    if (!lastResult.ok) {
      gameEvents.emit('news:added', { message: lastResult.message })
      break
    }
  }
  return lastResult
}

export function submitAction(state: GameState, action: GameAction): ActionResult {
  if (state.scenario.status !== 'active') {
    return { ok: false, message: 'The season is over.' }
  }
  enqueueAction(state, action)
  return processActionQueue(state) ?? { ok: true, message: '' }
}
