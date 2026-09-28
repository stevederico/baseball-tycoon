import type { GameState } from './GameState'
import { createStateForScenario } from '../scenario/Scenario'
import { isScenarioId } from '../scenario/Scenarios'
import { MapStore, type MapJSON } from '../world/Map'

const SAVE_KEY = 'baseball-tycoon-save'
const BEST_KEY = 'baseball-tycoon-best'
const SAVE_VERSION = 3

/** Everything worth keeping. Walking fans, the undo stack and UI state are rebuilt. */
type SavedFields = Omit<GameState, 'map' | 'entities' | 'actionQueue' | 'undoStack' | 'ghostPos'>

interface SavePayload extends SavedFields {
  version: number
  savedAt: string
  map: MapJSON
}

export function serializeState(state: GameState): string {
  const { map, entities: _entities, actionQueue: _queue, undoStack: _undo, ghostPos: _ghost, ...rest } = state
  const payload: SavePayload = {
    ...rest,
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    map: map.toJSON(),
  }
  return JSON.stringify(payload)
}

function isSavePayload(raw: unknown): raw is SavePayload {
  if (typeof raw !== 'object' || raw === null) return false
  if (!('version' in raw) || raw.version !== SAVE_VERSION) return false
  return 'scenarioId' in raw && typeof raw.scenarioId === 'string' && 'map' in raw && 'park' in raw
}

export function deserializeState(json: string): GameState | null {
  try {
    const payload: unknown = JSON.parse(json)
    if (!isSavePayload(payload) || !isScenarioId(payload.scenarioId)) return null

    const { version: _version, savedAt: _savedAt, map, ...saved } = payload
    const fresh = createStateForScenario(payload.scenarioId, 1)
    const state: GameState = {
      ...fresh,
      ...saved,
      // Nested records merge over fresh defaults so new fields survive old saves.
      park: { ...fresh.park, ...saved.park },
      season: { ...fresh.season, ...saved.season },
      history: { ...fresh.history, ...saved.history },
      staff: { ...fresh.staff, ...saved.staff },
      map: MapStore.fromJSON(map),
      entities: { fans: [], nextId: 1 },
      actionQueue: [],
      undoStack: [],
      ghostPos: null,
    }
    return state
  } catch {
    return null
  }
}

export function saveToStorage(state: GameState): boolean {
  try {
    localStorage.setItem(SAVE_KEY, serializeState(state))
    return true
  } catch {
    return false
  }
}

export function loadFromStorage(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    return deserializeState(raw)
  } catch {
    return null
  }
}

export function hasSaveInStorage(): boolean {
  const state = loadFromStorage()
  return state !== null && state.scenario.status === 'active'
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* storage unavailable */
  }
}

export function loadBestScores(): Record<string, number> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}')
    if (typeof raw !== 'object' || raw === null) return {}
    const out: Record<string, number> = {}
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'number') out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

/** Store a score if it beats the scenario's best. Returns true for a new record. */
export function recordBestScore(scenarioId: string, score: number): boolean {
  const best = loadBestScores()
  if ((best[scenarioId] ?? 0) >= score) return false
  best[scenarioId] = score
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best))
  } catch {
    /* storage unavailable */
  }
  return true
}
