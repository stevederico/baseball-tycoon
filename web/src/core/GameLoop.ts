import { AWAY_TICKS, HALF_INNING_TICKS, MAX_GAME_UPDATES, POSTGAME_TICKS, PREGAME_TICKS, TICK_MS } from './constants'
import type { GameState } from './GameState'
import { gameEvents } from './events'
import { processActionQueue } from '../actions/GameActions'
import { beginGameDay, completeGameDay } from '../management/GameDay'
import { sendEveryoneHome, spawnFans, updateAllFans, visibleFanTarget } from '../management/Park'
import { halfInningsPlayed, runsInHalfInning } from '../season/GameSim'

function revealHalfInning(state: GameState): void {
  const today = state.today
  if (!today) return
  const half = today.halfInningsShown
  const runs = runsInHalfInning(today.line, half)
  today.halfInningsShown = half + 1
  if (runs > 0) {
    // The home side bats in the bottom (odd) half innings.
    const byPlayer = (half % 2 === 1) === today.home
    gameEvents.emit('game:runs', { runs, byPlayer, inning: Math.floor(half / 2) + 1 })
  }
}

function enterPhase(state: GameState, phase: GameState['phase']): void {
  state.phase = phase
  state.phaseTicks = 0
}

function updateGameDay(state: GameState): void {
  const today = state.today
  if (state.phase === 'idle' || !today) {
    beginGameDay(state)
    return
  }
  state.phaseTicks += 1

  switch (state.phase) {
    case 'pregame': {
      const target = visibleFanTarget(today.attendance)
      if (state.phaseTicks % 4 === 0 && state.entities.fans.length < target) spawnFans(state, 2)
      if (state.phaseTicks >= PREGAME_TICKS) {
        enterPhase(state, 'live')
        gameEvents.emit('game:firstPitch', { gameIndex: today.gameIndex })
      }
      break
    }
    case 'live': {
      if (state.phaseTicks % HALF_INNING_TICKS !== 0) break
      if (today.halfInningsShown < halfInningsPlayed(today.line)) {
        revealHalfInning(state)
      } else {
        completeGameDay(state)
        sendEveryoneHome(state)
        enterPhase(state, 'postgame')
      }
      break
    }
    case 'postgame': {
      if (state.phaseTicks >= POSTGAME_TICKS) enterPhase(state, 'idle')
      break
    }
    case 'away': {
      if (state.phaseTicks === Math.floor(AWAY_TICKS / 2)) completeGameDay(state)
      if (state.phaseTicks >= AWAY_TICKS) enterPhase(state, 'idle')
      break
    }
  }
}

export function gameStateUpdateLogic(state: GameState): void {
  if (state.paused || state.scenario.status !== 'active') return

  updateAllFans(state)
  updateGameDay(state)
  processActionQueue(state)
  state.currentTicks += 1
}

export class GameLoop {
  private accumulator = 0
  private lastTime = performance.now()
  private state: GameState

  constructor(state: GameState) {
    this.state = state
  }

  setState(state: GameState): void {
    this.state = state
    this.accumulator = 0
  }

  tick(now: number): void {
    // Cap the catch-up after a background tab so the season does not fast-forward.
    const frameMs = Math.min(now - this.lastTime, 250)
    this.lastTime = now
    this.accumulator += frameMs

    let updates = 0
    const tickBudget = TICK_MS / this.state.gameSpeed
    while (this.accumulator >= tickBudget && updates < MAX_GAME_UPDATES) {
      gameStateUpdateLogic(this.state)
      this.accumulator -= tickBudget
      updates += 1
    }
    if (updates === MAX_GAME_UPDATES) this.accumulator = 0
  }
}
