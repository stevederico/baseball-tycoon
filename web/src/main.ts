import './style.css'
import { DemolishFacilityAction } from './actions/DemolishFacilityAction'
import { FundResearchAction } from './actions/FundResearchAction'
import { submitAction } from './actions/GameActions'
import { FireStaffAction, HireStaffAction } from './actions/HireStaffAction'
import { RepayLoanAction, TakeLoanAction } from './actions/LoanActions'
import { PlaceFacilityAction } from './actions/PlaceFacilityAction'
import { MAX_TICKET_PRICE, MIN_TICKET_PRICE, SetFoodPriceAction, SetTicketPriceAction } from './actions/PricingActions'
import { SignPlayerAction } from './actions/SignPlayerAction'
import { StartMarketingAction } from './actions/StartMarketingAction'
import type { GameAction } from './actions/types'
import { UndoAction } from './actions/UndoAction'
import { SoundBoard } from './audio/Sound'
import { gameEvents } from './core/events'
import { GameLoop, gameStateUpdateLogic } from './core/GameLoop'
import type { GameState } from './core/GameState'
import { clearStorage, hasSaveInStorage, loadFromStorage, recordBestScore, saveToStorage } from './core/SaveLoad'
import { HOME } from './game/field'
import { StadiumScene, type Cell } from './game/scene'
import { getParkStats } from './management/Economy'
import { computeScore, createStateForScenario } from './scenario/Scenario'
import type { ScenarioId } from './scenario/Scenarios'
import { UiPanel } from './ui/panel'
import { BUILDINGS, formatMoney } from './world/facilities'
import { ENTRANCE } from './world/parkBounds'
import { ZONE_INFO } from './world/zones'

declare global {
  interface Window {
    /** Dev-only handle for poking at the running game from the console. */
    __tycoon?: {
      state: () => GameState
      tick: (ticks: number) => void
      tileToClient: (x: number, z: number) => { x: number; y: number }
    }
  }
}

type Mode = 'title' | 'playing'

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')
if (!canvas) throw new Error('Missing #game-canvas')

const sound = new SoundBoard()
const scene = new StadiumScene(canvas)
const ui = new UiPanel()

/** Behind the title screen a demo season plays itself. */
function createAttractState(): GameState {
  const demo = createStateForScenario('sandbox')
  demo.gameSpeed = 2
  return demo
}

let mode: Mode = 'title'
let state: GameState = createAttractState()
const gameLoop = new GameLoop(state)
let saveDirty = false
let lastSave = 0
let frame = 0

const DEFAULT_HINT = 'Drag to move · scroll or pinch to zoom'

function useState(next: GameState): void {
  state = next
  gameLoop.setState(state)
  scene.syncFromState(state)
}

function refresh(): void {
  ui.update(state)
}

function markDirty(): void {
  if (mode === 'playing') saveDirty = true
}

// ── Portal links (Vibe Jam webring) ──────────────────────────────────────

const params = new URLSearchParams(window.location.search)

function safeUrl(raw: string | null): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

const portalBack = safeUrl(params.get('ref'))
ui.setPortalLinks(`https://vibejam.com/portal/2026?ref=${encodeURIComponent(window.location.host)}`)

// ── Starting, continuing and ending seasons ──────────────────────────────

function enterGame(next: GameState): void {
  mode = 'playing'
  useState(next)
  ui.hideTitle()
  ui.hideEnd()
  ui.resetNews(state.news)
  ui.setTab('park')
  scene.resetView()
  sound.unlock()
  refresh()
}

function startScenario(id: ScenarioId, paused = true): void {
  clearStorage()
  const next = createStateForScenario(id)
  next.paused = paused
  enterGame(next)
  saveToStorage(state)
}

function showTitle(): void {
  mode = 'title'
  sound.setCrowdLevel(0)
  useState(createAttractState())
  ui.showTitle(hasSaveInStorage(), portalBack)
  refresh()
}

function endSeason(): void {
  const score = computeScore(state)
  const record = recordBestScore(state.scenarioId, score.total)
  clearStorage()
  sound.setCrowdLevel(0)
  sound.play(state.scenario.status === 'won' ? 'win' : 'lose')
  ui.showEnd(state, record)
  refresh()
}

ui.onStartScenario = (id) => startScenario(id)
ui.onContinue = () => {
  const loaded = loadFromStorage()
  if (!loaded) {
    ui.notify('That save could not be loaded.', 'error')
    return
  }
  loaded.paused = true
  enterGame(loaded)
}
ui.onQuitToTitle = () => {
  if (mode === 'playing' && state.scenario.status === 'active') saveToStorage(state)
  showTitle()
}
ui.onPlayBall = () => {
  state.paused = false
  ui.foldSheet()
  sound.unlock()
  sound.play('organ')
  refresh()
}

let pausedByMenu = false
ui.onMenuToggle = (open) => {
  if (mode !== 'playing') return
  if (open && !state.paused) {
    state.paused = true
    pausedByMenu = true
  } else if (!open && pausedByMenu) {
    state.paused = false
    pausedByMenu = false
  }
  refresh()
}

// ── Player actions ───────────────────────────────────────────────────────

/** Run an action and report the outcome. Returns true if it went through. */
function act(action: GameAction, options: { toast?: boolean; sound?: 'build' | 'demolish' | 'cash' | 'click' } = {}): boolean {
  if (mode !== 'playing') return false
  const result = submitAction(state, action)
  if (result.ok) {
    if (options.sound) sound.play(options.sound)
    if (options.toast !== false && result.message) ui.notify(result.message, 'success')
    markDirty()
  } else {
    sound.play('error')
  }
  refresh()
  return result.ok
}

function useTool(cell: Cell): void {
  if (state.toolMode === 'demolish') {
    const id = state.map.getFacility(cell.x, cell.z)
    if (act(new DemolishFacilityAction(cell.x, cell.z), { toast: false, sound: 'demolish' }) && id) {
      scene.addFloat(`+${formatMoney(BUILDINGS[id].cost / 2)}`, cell.x, cell.z, '#9be08f')
    }
    return
  }
  const def = BUILDINGS[state.selectedBuilding]
  if (act(new PlaceFacilityAction(cell.x, cell.z, state.selectedBuilding), { toast: false, sound: 'build' })) {
    scene.addFloat(`-${formatMoney(def.cost)}`, cell.x, cell.z, '#ffd27a')
  }
}

function sameCell(a: Cell | null, b: Cell): boolean {
  return a !== null && a.x === b.x && a.z === b.z
}

scene.onTileTap = (cell, touch) => {
  if (mode !== 'playing' || state.scenario.status !== 'active') return
  sound.unlock()
  // Fingers are imprecise: the first tap previews, the second one commits.
  if (touch && !sameCell(state.ghostPos, cell)) {
    state.ghostPos = cell
    ui.setHint('Tap the same tile again to confirm')
    return
  }
  state.ghostPos = touch ? null : cell
  useTool(cell)
  if (touch) ui.setHint(DEFAULT_HINT)
}

scene.onTileHover = (cell) => {
  if (mode !== 'playing') return
  state.ghostPos = cell
  if (!cell) {
    ui.setHint(DEFAULT_HINT)
    return
  }
  const facility = state.map.getFacility(cell.x, cell.z)
  if (facility) {
    const def = BUILDINGS[facility]
    ui.setHint(`${def.label}: ${def.blurb}`)
    return
  }
  const info = ZONE_INFO[state.map.getZone(cell.x, cell.z)]
  ui.setHint(`${info.label}: ${info.hint}`)
}

ui.onSelectBuilding = (id) => {
  state.selectedBuilding = id
  state.ghostPos = null
  refresh()
}
ui.onSetToolMode = (toolMode) => {
  state.toolMode = toolMode
  state.ghostPos = null
  refresh()
}
ui.onCancelTool = () => {
  state.toolMode = 'build'
  state.ghostPos = null
  ui.setTab('park')
  refresh()
}
ui.onUndo = () => act(new UndoAction(), { sound: 'click' })
ui.onFundResearch = (id) => act(new FundResearchAction(id), { sound: 'cash' })
ui.onHireStaff = (role) => act(new HireStaffAction(role), { sound: 'cash' })
ui.onFireStaff = (role) => act(new FireStaffAction(role), { sound: 'click' })
ui.onStartMarketing = (id) => act(new StartMarketingAction(id), { sound: 'cash' })
ui.onSignPlayer = (kind) => act(new SignPlayerAction(kind), { sound: 'cash' })
ui.onBorrow = () => act(new TakeLoanAction(), { sound: 'cash' })
ui.onRepay = () => act(new RepayLoanAction(), { sound: 'cash' })
ui.onSetFoodPrice = (price) => act(new SetFoodPriceAction(price), { toast: false })
ui.onSetTicketPrice = (price) => {
  const clamped = Math.max(MIN_TICKET_PRICE, Math.min(MAX_TICKET_PRICE, Math.round(price)))
  act(new SetTicketPriceAction(clamped), { toast: false })
}

ui.onSave = () => {
  const ok = mode === 'playing' && saveToStorage(state)
  ui.notify(ok ? 'Season saved.' : 'Could not save in this browser.', ok ? 'success' : 'error')
}

ui.onSetSpeed = (speed) => {
  state.gameSpeed = speed
  state.paused = false
  pausedByMenu = false
  refresh()
}
ui.onTogglePause = () => {
  state.paused = !state.paused
  pausedByMenu = false
  refresh()
}
ui.onToggleSound = () => {
  sound.unlock()
  sound.setMuted(!sound.muted)
  ui.setSoundIcon(sound.muted)
}
ui.onUiClick = () => {
  sound.unlock()
  sound.play('click')
}
ui.onTabChange = () => refresh()
ui.onZoomIn = () => scene.zoomIn()
ui.onZoomOut = () => scene.zoomOut()
ui.onResetView = () => scene.resetView()

// ── Game events ──────────────────────────────────────────────────────────

gameEvents.on('news:added', ({ message }) => {
  if (mode === 'playing') ui.notify(message)
})

gameEvents.on('day:started', ({ home }) => {
  // Give phones the whole screen for the game; tapping a tab brings the panel back.
  if (mode === 'playing' && home) ui.foldSheet()
})

gameEvents.on('game:firstPitch', () => {
  if (mode === 'playing') sound.play('organ')
})

gameEvents.on('game:runs', ({ runs, byPlayer }) => {
  if (mode !== 'playing' || !state.today?.home) return
  sound.play('bat')
  if (byPlayer) {
    sound.play('cheer')
    scene.addFloat(runs === 1 ? 'Run scores!' : `${runs} runs score!`, HOME.x - 2, HOME.z - 2, '#ffffff')
  }
})

gameEvents.on('game:finished', ({ home, won }) => {
  if (mode !== 'playing') return
  if (home && state.lastHome) {
    const profit = state.lastHome.profit
    sound.play(won ? 'cheer' : 'groan')
    sound.play('cash')
    scene.addFloat(
      `${profit >= 0 ? '+' : '-'}${formatMoney(Math.abs(profit))}`,
      ENTRANCE.x, ENTRANCE.z - 2,
      profit >= 0 ? '#9be08f' : '#ff9d8a',
    )
  }
  saveToStorage(state)
  saveDirty = false
  refresh()
})

gameEvents.on('scenario:ended', () => {
  if (mode !== 'playing') return
  const finished = state
  window.setTimeout(() => {
    if (state === finished && mode === 'playing') endSeason()
  }, 1400)
})

// ── Keyboard ─────────────────────────────────────────────────────────────

const PAN_STEP = 60

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const key = event.key.toLowerCase()

  if (key === 'escape') {
    if (!ui.closeTopOverlay() && mode === 'playing') ui.onCancelTool()
    return
  }
  if (key === 'm') {
    ui.onToggleSound()
    return
  }
  if (mode !== 'playing' || ui.isOverlayOpen()) return

  switch (key) {
    case ' ':
      event.preventDefault()
      if (state.paused && state.season.gamesPlayed === 0 && state.phase === 'idle') ui.onPlayBall()
      else ui.onTogglePause()
      break
    case '1': ui.onSetSpeed(1); break
    case '2': ui.onSetSpeed(2); break
    case '3': ui.onSetSpeed(4); break
    case 'b': ui.onSetToolMode('build'); ui.setTab('build'); break
    case 'x': ui.onSetToolMode('demolish'); break
    case 'u': ui.onUndo(); break
    case '+':
    case '=': scene.zoomIn(); break
    case '-': scene.zoomOut(); break
    case 'arrowleft':
    case 'a': scene.panBy(PAN_STEP, 0); break
    case 'arrowright':
    case 'd': scene.panBy(-PAN_STEP, 0); break
    case 'arrowup':
    case 'w': scene.panBy(0, PAN_STEP); break
    case 'arrowdown':
    case 's': scene.panBy(0, -PAN_STEP); break
  }
})

document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'playing' && state.scenario.status === 'active') saveToStorage(state)
})

// ── Boot ─────────────────────────────────────────────────────────────────

function crowdLevel(): number {
  const today = state.today
  if (mode !== 'playing' || state.paused || !today?.home) return 0
  if (state.phase !== 'pregame' && state.phase !== 'live') return 0
  const seats = getParkStats(state.map).seats
  return seats > 0 ? 0.3 + 0.7 * Math.min(1, today.attendance / seats) : 0
}

function animate(now: number): void {
  // The demo season behind the title screen starts over when it runs out.
  if (mode === 'title' && state.scenario.status !== 'active') useState(createAttractState())
  gameLoop.tick(now)
  frame += 1
  if (frame % 8 === 0) {
    refresh()
    sound.setCrowdLevel(crowdLevel())
  }
  if (saveDirty && now - lastSave > 3_000 && state.scenario.status === 'active') {
    saveToStorage(state)
    saveDirty = false
    lastSave = now
  }
  scene.render(now)
  requestAnimationFrame(animate)
}

if (import.meta.env.DEV) {
  window.__tycoon = {
    state: () => state,
    tick: (ticks) => {
      for (let i = 0; i < ticks; i += 1) gameStateUpdateLogic(state)
      refresh()
      scene.render(performance.now())
    },
    tileToClient: (x, z) => scene.tileToClient(x, z),
  }
}

ui.setSoundIcon(sound.muted)
ui.setHint(DEFAULT_HINT)
scene.syncFromState(state)

if (params.get('portal') === 'true') {
  // Arriving through a portal: skip the title and drop straight into play,
  // picking up a season in progress rather than wiping it.
  ui.setPortalBack(portalBack)
  const saved = loadFromStorage()
  if (saved && saved.scenario.status === 'active') {
    saved.paused = false
    enterGame(saved)
  } else {
    startScenario('turn_it_around', false)
  }
} else {
  showTitle()
}

requestAnimationFrame(animate)
