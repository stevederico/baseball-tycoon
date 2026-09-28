import type { GameState } from '../core/GameState'

export interface ActionResult {
  ok: boolean
  message: string
}

export interface GameAction {
  readonly type: string
  query(state: GameState): ActionResult
  execute(state: GameState): ActionResult
}