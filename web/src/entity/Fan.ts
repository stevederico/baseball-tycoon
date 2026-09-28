import type { MapStore } from '../world/Map'
import type { FanFactor } from '../management/FanExperience'
import { EXIT_POINT, findPath, pickFanDestination } from './FanPathfinding'

export type FanState = 'entering' | 'walking' | 'watching' | 'buying' | 'leaving'

export interface Fan {
  id: number
  x: number
  z: number
  targetX: number
  targetZ: number
  path: { x: number; z: number }[]
  state: FanState
  happiness: number
  /** Shirt colour index, so the crowd is not all one colour. */
  shirt: number
  thought?: string
  thoughtTtl: number
  wantsConcession: boolean
  buyingTicks: number
}

const THOUGHT_TICKS = 200
const WALK_SPEED = 0.06

const THOUGHTS_HAPPY = ['Great view of the field!', 'Love this ballpark.', 'Go Haymakers!', 'Perfect day for a game.']
const THOUGHTS_SAD = ['I expected more.', 'Not sure I will come back.', 'This place has seen better days.']

export function createFan(id: number, spawnX: number, spawnZ: number, map: MapStore): Fan {
  const dest = pickFanDestination(map)
  const path = findPath(map, spawnX, spawnZ, dest.x, dest.z)
  const fan: Fan = {
    id,
    x: spawnX,
    z: spawnZ,
    targetX: dest.x,
    targetZ: dest.z,
    path,
    state: 'entering',
    happiness: 50 + Math.random() * 40,
    shirt: Math.floor(Math.random() * 7),
    thoughtTtl: 0,
    wantsConcession: dest.nearConcession,
    buyingTicks: 0,
  }
  if (path.length > 0) {
    fan.targetX = path[0].x
    fan.targetZ = path[0].z
  }
  return fan
}

export function assignNewDestination(fan: Fan, map: MapStore): void {
  const dest = pickFanDestination(map)
  fan.wantsConcession = dest.nearConcession
  fan.path = findPath(map, fan.x, fan.z, dest.x, dest.z)
  if (fan.path.length > 0) {
    fan.targetX = fan.path[0].x
    fan.targetZ = fan.path[0].z
  } else {
    // Nowhere reachable: stay put rather than walking through buildings.
    fan.targetX = fan.x
    fan.targetZ = fan.z
  }
  fan.state = 'walking'
}

export function sendFanLeaving(fan: Fan, map: MapStore): void {
  fan.state = 'leaving'
  fan.path = findPath(map, fan.x, fan.z, EXIT_POINT.x, EXIT_POINT.z)
  fan.targetX = fan.path.length > 0 ? fan.path[0].x : EXIT_POINT.x
  fan.targetZ = fan.path.length > 0 ? fan.path[0].z : EXIT_POINT.z
}

/** Advance one tick. Returns false once the fan has left the park. */
export function updateFan(fan: Fan, map: MapStore): boolean {
  if (fan.thoughtTtl > 0) fan.thoughtTtl -= 1

  if (fan.state === 'buying') {
    fan.buyingTicks -= 1
    if (fan.buyingTicks <= 0) assignNewDestination(fan, map)
    return true
  }

  const dx = fan.targetX - fan.x
  const dz = fan.targetZ - fan.z
  const dist = Math.hypot(dx, dz)

  if (dist < 0.08) {
    if (fan.path.length > 0) {
      fan.path.shift()
      if (fan.path.length > 0) {
        fan.targetX = fan.path[0].x
        fan.targetZ = fan.path[0].z
        return true
      }
    }

    if (fan.state === 'leaving') return false

    if (fan.wantsConcession) {
      fan.state = 'buying'
      fan.buyingTicks = 50
      fan.wantsConcession = false
      return true
    }

    fan.state = 'watching'
    if (Math.random() < 0.01) assignNewDestination(fan, map)
    return true
  }

  fan.x += (dx / dist) * WALK_SPEED
  fan.z += (dz / dist) * WALK_SPEED
  if (fan.state !== 'leaving' && fan.state !== 'entering') fan.state = 'walking'
  return true
}

/** Thought bubbles echo the park's real problems, so watching the crowd is useful. */
export function assignFanThought(fan: Fan, parkHappiness: number, worst: FanFactor | null): void {
  const unhappy = Math.random() * 100 > parkHappiness
  if (worst && unhappy && worst.score < 60) {
    fan.thought = worst.complaint
    fan.happiness = 30
  } else if (unhappy) {
    fan.thought = THOUGHTS_SAD[Math.floor(Math.random() * THOUGHTS_SAD.length)]
    fan.happiness = 40
  } else {
    fan.thought = THOUGHTS_HAPPY[Math.floor(Math.random() * THOUGHTS_HAPPY.length)]
    fan.happiness = 85
  }
  fan.thoughtTtl = THOUGHT_TICKS
}
