import { gameEvents } from '../core/events'
import { computeRating } from '../management/Economy'
import { financePayment } from '../management/Finance'
import { getResearchDef } from '../management/Research'
import { BUILDINGS, formatMoney, isBuildingUnlocked } from '../world/facilities'
import type { BuildingId } from '../world/facilities'
import { ZONE_INFO } from '../world/zones'
import type { ActionResult, GameAction } from './types'
import type { GameState } from '../core/GameState'

export class PlaceFacilityAction implements GameAction {
  readonly type = 'placeFacility'
  readonly x: number
  readonly z: number
  readonly buildingId: BuildingId

  constructor(x: number, z: number, buildingId: BuildingId) {
    this.x = x
    this.z = z
    this.buildingId = buildingId
  }

  query(state: GameState): ActionResult {
    const def = BUILDINGS[this.buildingId]
    if (!isBuildingUnlocked(this.buildingId, state.research.unlocked)) {
      const research = getResearchDef(def.researchRequired ?? '')
      return { ok: false, message: `${def.label} needs the ${research?.label ?? 'right'} upgrade first.` }
    }
    const zone = state.map.getZone(this.x, this.z)
    if (zone !== 'lot') {
      return { ok: false, message: ZONE_INFO[zone].hint }
    }
    if (!state.map.canPlaceFacility(this.x, this.z)) {
      return { ok: false, message: 'Something is already built here.' }
    }
    if (state.park.cash < def.cost) {
      return { ok: false, message: `Not enough cash for ${def.label} (${formatMoney(def.cost)}).` }
    }
    return { ok: true, message: `Can build ${def.label}.` }
  }

  execute(state: GameState): ActionResult {
    const check = this.query(state)
    if (!check.ok) return check

    const def = BUILDINGS[this.buildingId]
    financePayment(state, def.cost, 'construction')
    state.map.placeFacility(this.x, this.z, this.buildingId)
    state.park.rating = computeRating(state)

    gameEvents.emit('cash:updated', { cash: state.park.cash })
    gameEvents.emit('park:updated', { rating: state.park.rating, happiness: state.park.fanHappiness })

    return { ok: true, message: `Built ${def.label}.` }
  }
}
