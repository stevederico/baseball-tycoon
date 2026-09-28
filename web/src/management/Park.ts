import type { GameState } from '../core/GameState'
import { assignFanThought, createFan, sendFanLeaving, updateFan } from '../entity/Fan'
import { EXIT_POINT } from '../entity/FanPathfinding'
import { worstFactor } from './FanExperience'

const MAX_FANS = 90

/** Walking guests are a sample of the crowd: roughly one figure per 45 fans. */
export function visibleFanTarget(attendance: number): number {
  if (attendance <= 0) return 0
  return Math.max(6, Math.min(MAX_FANS, Math.round(attendance / 45)))
}

export function spawnFans(state: GameState, count: number): void {
  for (let i = 0; i < count && state.entities.fans.length < MAX_FANS; i += 1) {
    const jx = EXIT_POINT.x + (Math.random() - 0.5) * 2
    const jz = EXIT_POINT.z + Math.random() * 0.6
    state.entities.fans.push(createFan(state.entities.nextId++, jx, jz, state.map))
  }
}

export function sendEveryoneHome(state: GameState): void {
  for (const fan of state.entities.fans) {
    if (fan.state !== 'leaving') sendFanLeaving(fan, state.map)
  }
}

export function updateAllFans(state: GameState): void {
  if (state.entities.fans.length === 0) return
  const remaining = []
  const report = state.lastHome
  for (const fan of state.entities.fans) {
    if (!updateFan(fan, state.map)) continue
    remaining.push(fan)
    if (fan.thoughtTtl === 0 && fan.state !== 'leaving' && Math.random() < 0.0004) {
      assignFanThought(fan, state.park.fanHappiness, report ? worstFactor(report.factors) : null)
    }
  }
  state.entities.fans = remaining
}
