import type { GameState } from './GameState'
import { MapStore, type MapJSON } from '../world/Map'

export interface UndoSnapshot {
  map: MapJSON
  cash: number
  expenditure: Record<string, number>
  income: Record<string, number>
}

const MAX_UNDO = 20

export function pushUndo(state: GameState): void {
  state.undoStack.push({
    map: state.map.toJSON(),
    cash: state.park.cash,
    expenditure: { ...state.finance.expenditure },
    income: { ...state.finance.income },
  })
  if (state.undoStack.length > MAX_UNDO) state.undoStack.shift()
}

export function applyUndo(state: GameState): boolean {
  const snapshot = state.undoStack.pop()
  if (!snapshot) return false
  const version = state.map.version
  state.map = MapStore.fromJSON(snapshot.map)
  // Keep the version moving forward so cached renders and stats refresh.
  state.map.version = version + 1
  state.park.cash = snapshot.cash
  state.finance.expenditure = { ...snapshot.expenditure }
  state.finance.income = { ...snapshot.income }
  return true
}
