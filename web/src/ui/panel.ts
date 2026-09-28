import type { FoodPrice, GameState, ToolMode, Weather } from '../core/GameState'
import { MAX_TICKET_PRICE, MIN_TICKET_PRICE } from '../actions/PricingActions'
import { loadBestScores } from '../core/SaveLoad'
import { accessCapacity, fairTicketPrice, getParkStats, totalCosts } from '../management/Economy'
import { getAdvice } from '../management/Advice'
import { worstFactor } from '../management/FanExperience'
import {
  EXPENDITURE_LABELS, INCOME_LABELS, INTEREST_PER_GAME, LOAN_STEP, MAX_DEBT, netWorth, totalOf,
} from '../management/Finance'
import { getActiveCampaign, MARKETING_CAMPAIGNS } from '../management/Marketing'
import { getResearchDef, RESEARCH_TREE } from '../management/Research'
import { isStaffRole, STAFF_TYPES, type StaffRole } from '../management/Staff'
import { drawBuildingIcon } from '../render/buildings'
import { computeScore, goalProgress } from '../scenario/Scenario'
import { getScenarioDef, isScenarioId, SCENARIOS, type ScenarioId } from '../scenario/Scenarios'
import { halfInningsPlayed, scoreThrough } from '../season/GameSim'
import { getTeamDef, PLAYER_TEAM_ID, standings } from '../season/League'
import { getPlayerGame } from '../season/Schedule'
import { MAX_SIGNINGS, signingCost, teamRatings, type SigningKind } from '../season/Team'
import {
  BUILDING_IDS, BUILDINGS, CATEGORY_LABELS, formatMoney, isBuildingId, isBuildingUnlocked,
  type BuildingCategory, type BuildingId,
} from '../world/facilities'
import { drawSparkline } from './graph'
import { ICONS, type IconName } from './icons'
import { NotificationCenter, type NotificationTone } from './notifications'

type SidebarTab = 'park' | 'build' | 'money' | 'team' | 'office'

function isSidebarTab(v: string | undefined): v is SidebarTab {
  return v === 'park' || v === 'build' || v === 'money' || v === 'team' || v === 'office'
}

function isToolMode(v: string | undefined): v is ToolMode {
  return v === 'build' || v === 'demolish'
}

function isFoodPrice(v: string | undefined): v is FoodPrice {
  return v === 'low' || v === 'fair' || v === 'high'
}

function isIconName(v: string | undefined): v is IconName {
  return v !== undefined && Object.prototype.hasOwnProperty.call(ICONS, v)
}

const CATEGORY_ORDER: BuildingCategory[] = ['food', 'seating', 'fun', 'team', 'scenery']

const WEATHER_LABEL: Record<Weather, string> = {
  sunny: 'Sunny', cloudy: 'Cloudy', hot: 'Heat wave', rain: 'Rain',
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th', '13th', '14th', '15th']

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function scoreClass(score: number): string {
  return score >= 70 ? 'good' : score >= 45 ? 'okay' : 'bad'
}

function bar(value: number, max: number, tone: string): string {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))
  return `<div class="meter"><div class="meter-fill ${tone}" style="width:${pct.toFixed(0)}%"></div></div>`
}

export class UiPanel {
  private readonly notifications: NotificationCenter
  private readonly htmlCache = new Map<string, string>()
  private activeTab: SidebarTab = 'park'
  private titleScenario: ScenarioId = 'turn_it_around'

  onSelectBuilding: (id: BuildingId) => void = () => {}
  onSetToolMode: (mode: ToolMode) => void = () => {}
  onCancelTool: () => void = () => {}
  onPlayBall: () => void = () => {}
  onSave: () => void = () => {}
  onUndo: () => void = () => {}
  onZoomIn: () => void = () => {}
  onZoomOut: () => void = () => {}
  onResetView: () => void = () => {}
  onSetSpeed: (speed: 1 | 2 | 4) => void = () => {}
  onTogglePause: () => void = () => {}
  onToggleSound: () => void = () => {}
  onFundResearch: (id: string) => void = () => {}
  onHireStaff: (role: StaffRole) => void = () => {}
  onFireStaff: (role: StaffRole) => void = () => {}
  onStartMarketing: (id: string) => void = () => {}
  onSignPlayer: (kind: SigningKind) => void = () => {}
  onSetTicketPrice: (price: number) => void = () => {}
  onSetFoodPrice: (price: FoodPrice) => void = () => {}
  onBorrow: () => void = () => {}
  onRepay: () => void = () => {}
  onStartScenario: (id: ScenarioId) => void = () => {}
  onContinue: () => void = () => {}
  onQuitToTitle: () => void = () => {}
  onMenuToggle: (open: boolean) => void = () => {}
  onTabChange: () => void = () => {}
  /** Any button press, for the click sound. */
  onUiClick: () => void = () => {}

  constructor() {
    const stackEl = document.querySelector('#notification-stack')
    const inboxList = document.querySelector('#notif-inbox-list')
    const inboxPanel = document.querySelector('#notif-inbox')
    const badge = document.querySelector('#notif-badge')
    const bellBtn = document.querySelector('#btn-notifications')
    if (
      !(stackEl instanceof HTMLElement) ||
      !(inboxList instanceof HTMLElement) ||
      !(inboxPanel instanceof HTMLElement) ||
      !(badge instanceof HTMLElement) ||
      !(bellBtn instanceof HTMLButtonElement)
    ) {
      throw new Error('Notification UI elements missing')
    }
    this.notifications = new NotificationCenter(stackEl, inboxList, inboxPanel, badge, bellBtn)

    this.paintStaticIcons()
    this.buildBuildList()
    this.buildScenarioList()
    this.bindHeader()
    this.bindSidebar()
    this.bindOverlays()

    document.addEventListener('click', (event) => {
      const target = event.target
      if (target instanceof Element && target.closest('button')) this.onUiClick()
    })
  }

  // ── Setup ──────────────────────────────────────────────────────────────

  private on(selector: string, handler: () => void): void {
    document.querySelector(selector)?.addEventListener('click', handler)
  }

  private paintStaticIcons(): void {
    const put = (selector: string, icon: IconName): void => {
      const el = document.querySelector(selector)
      if (el) el.innerHTML = ICONS[icon]
    }
    put('#brand-ball', 'ball')
    put('#title-ball', 'ball')
    put('#bell-icon', 'bell')
    put('#btn-menu', 'menu')
    put('#zoom-in', 'plus')
    put('#zoom-out', 'minus')
    put('#btn-reset-view', 'target')
    put('.speed-btn[data-speed="1"]', 'play')
    put('.speed-btn[data-speed="2"]', 'fast')
    put('.speed-btn[data-speed="4"]', 'faster')
    document.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
      const name = el.dataset.icon
      if (isIconName(name)) el.innerHTML = ICONS[name]
    })
  }

  private bindHeader(): void {
    this.on('#btn-pause', () => this.onTogglePause())
    this.on('#btn-sound', () => this.onToggleSound())
    this.on('#btn-menu', () => this.showMenu())
    this.on('#btn-play-ball', () => this.onPlayBall())
    this.on('#btn-resume-pill', () => this.onTogglePause())
    this.on('#zoom-in', () => this.onZoomIn())
    this.on('#zoom-out', () => this.onZoomOut())
    this.on('#btn-reset-view', () => this.onResetView())
    this.on('#selection-cancel', () => this.onCancelTool())

    document.querySelectorAll<HTMLButtonElement>('.speed-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const speed = Number(button.dataset.speed)
        if (speed === 1 || speed === 2 || speed === 4) this.onSetSpeed(speed)
      })
    })
  }

  private bindSidebar(): void {
    document.querySelectorAll<HTMLButtonElement>('.sidebar-tab').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab
        if (!isSidebarTab(tab)) return
        const sidebar = document.querySelector('#sidebar')
        // On phones the panel is a sheet: tapping the open tab again folds it away.
        if (tab === this.activeTab && sidebar && !sidebar.classList.contains('collapsed')) {
          sidebar.classList.add('collapsed')
          this.onTabChange()
          return
        }
        this.setTab(tab)
      })
    })

    document.querySelectorAll<HTMLButtonElement>('.tool-mode[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.mode
        if (isToolMode(mode)) this.onSetToolMode(mode)
      })
    })
    this.on('#btn-undo', () => this.onUndo())

    const slider = document.querySelector<HTMLInputElement>('#ticket-price')
    if (slider) {
      slider.min = String(MIN_TICKET_PRICE)
      slider.max = String(MAX_TICKET_PRICE)
      slider.addEventListener('input', () => this.onSetTicketPrice(Number(slider.value)))
    }
    this.on('#ticket-down', () => this.onSetTicketPrice(Number(slider?.value ?? 8) - 1))
    this.on('#ticket-up', () => this.onSetTicketPrice(Number(slider?.value ?? 8) + 1))
    document.querySelectorAll<HTMLButtonElement>('#food-price [data-food]').forEach((button) => {
      button.addEventListener('click', () => {
        const price = button.dataset.food
        if (isFoodPrice(price)) this.onSetFoodPrice(price)
      })
    })
    this.on('#btn-borrow', () => this.onBorrow())
    this.on('#btn-repay', () => this.onRepay())

    const delegate = (selector: string, attr: string, handler: (value: string, el: HTMLElement) => void): void => {
      document.querySelector(selector)?.addEventListener('click', (event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        const button = target.closest<HTMLButtonElement>(`[data-${attr}]`)
        const value = button?.dataset[attr]
        if (button && value && !button.disabled) handler(value, button)
      })
    }
    delegate('#research-list', 'research', (id) => this.onFundResearch(id))
    delegate('#staff-list', 'hire', (role) => { if (isStaffRole(role)) this.onHireStaff(role) })
    delegate('#staff-list', 'fire', (role) => { if (isStaffRole(role)) this.onFireStaff(role) })
    delegate('#marketing-list', 'campaign', (id) => this.onStartMarketing(id))
    delegate('#signing-list', 'sign', (kind) => {
      if (kind === 'slugger' || kind === 'ace') this.onSignPlayer(kind)
    })
    delegate('#build-list', 'building', (id) => {
      if (!isBuildingId(id)) return
      this.onSetToolMode('build')
      this.onSelectBuilding(id)
      this.foldSheet()
    })
  }

  private bindOverlays(): void {
    this.on('#btn-new-season', () => this.onStartScenario(this.titleScenario))
    this.on('#btn-continue', () => this.onContinue())
    this.on('#btn-how-to', () => this.show('#howto-screen'))
    this.on('#btn-howto-close', () => this.hide('#howto-screen'))
    this.on('#btn-resume', () => this.hideMenu())
    this.on('#btn-save', () => {
      this.onSave()
      this.hideMenu()
    })
    this.on('#btn-menu-howto', () => this.show('#howto-screen'))
    this.on('#btn-quit', () => {
      this.hideMenu()
      this.onQuitToTitle()
    })
    this.on('#btn-play-again', () => {
      this.hide('#end-screen')
      this.onStartScenario(this.titleScenario)
    })
    this.on('#btn-end-title', () => {
      this.hide('#end-screen')
      this.onQuitToTitle()
    })
  }

  private buildBuildList(): void {
    const host = document.querySelector('#build-list')
    if (!host) return
    for (const category of CATEGORY_ORDER) {
      const label = document.createElement('div')
      label.className = 'section-label'
      label.textContent = CATEGORY_LABELS[category]
      host.appendChild(label)

      const grid = document.createElement('div')
      grid.className = 'build-grid'
      for (const id of BUILDING_IDS.filter((b) => BUILDINGS[b].category === category)) {
        const def = BUILDINGS[id]
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.building = id
        button.className = 'build-card'

        const icon = document.createElement('canvas')
        icon.width = 56
        icon.height = 64
        icon.className = 'build-icon'
        drawBuildingIcon(icon, id)
        button.appendChild(icon)

        const text = document.createElement('span')
        text.className = 'build-text'
        text.innerHTML = `<span class="build-name">${escapeHtml(def.label)}</span><span class="build-blurb" data-blurb>${escapeHtml(def.blurb)}</span>`
        button.appendChild(text)

        const cost = document.createElement('span')
        cost.className = 'build-cost'
        cost.textContent = formatMoney(def.cost)
        button.appendChild(cost)
        grid.appendChild(button)
      }
      host.appendChild(grid)
    }
  }

  private buildScenarioList(): void {
    const list = document.querySelector('#scenario-list')
    if (!list) return
    list.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const id = target.closest<HTMLElement>('[data-scenario]')?.dataset.scenario
      if (!isScenarioId(id)) return
      this.titleScenario = id
      this.renderScenarioList()
    })
    this.renderScenarioList()
  }

  private renderScenarioList(): void {
    const best = loadBestScores()
    const html = SCENARIOS.map((s) => {
      const goals = [
        s.goals.cash > 0 ? `${formatMoney(s.goals.cash)} in the bank` : '',
        s.goals.happiness > 0 ? `${s.goals.happiness}% fan happiness` : '',
        s.goals.wins > 0 ? `${s.goals.wins} wins` : '',
      ].filter(Boolean).join(' · ')
      const record = best[s.id] ? `<span class="scenario-best">Best ${best[s.id].toLocaleString('en-US')}</span>` : ''
      return `<button type="button" class="scenario-btn${s.id === this.titleScenario ? ' active' : ''}" data-scenario="${s.id}">
        <strong>${escapeHtml(s.name)} <em>${escapeHtml(s.tagline)}</em>${record}</strong>
        <span>${escapeHtml(s.objective)}</span>
        <span class="scenario-goals">${goals ? `Goals: ${goals}` : 'No goals. Just build.'}</span>
      </button>`
    }).join('')
    this.setHtml('#scenario-list', html)
  }

  // ── Overlays ───────────────────────────────────────────────────────────

  private show(selector: string): void {
    document.querySelector(selector)?.classList.remove('hidden')
  }

  private hide(selector: string): void {
    document.querySelector(selector)?.classList.add('hidden')
  }

  showTitle(canContinue: boolean, portalBack: string | null): void {
    this.renderScenarioList()
    document.querySelector('#btn-continue')?.classList.toggle('hidden', !canContinue)
    this.setPortalBack(portalBack)
    document.body.classList.add('on-title')
    this.show('#title-screen')
  }

  /** Show "back through the portal" links when the player arrived from another game. */
  setPortalBack(href: string | null): void {
    if (!href) return
    for (const selector of ['#portal-back', '#menu-portal-back']) {
      const link = document.querySelector<HTMLAnchorElement>(selector)
      if (!link) continue
      link.href = href
      link.classList.remove('hidden')
    }
  }

  hideTitle(): void {
    document.body.classList.remove('on-title')
    this.hide('#title-screen')
  }

  setPortalLinks(href: string): void {
    for (const selector of ['#portal-link', '#end-portal-link', '#menu-portal-link']) {
      const link = document.querySelector<HTMLAnchorElement>(selector)
      if (link) link.href = href
    }
  }

  showMenu(): void {
    this.show('#menu-screen')
    this.onMenuToggle(true)
  }

  hideMenu(): void {
    this.hide('#menu-screen')
    this.onMenuToggle(false)
  }

  isOverlayOpen(): boolean {
    return document.querySelector('.overlay:not(.hidden)') !== null
  }

  closeTopOverlay(): boolean {
    for (const selector of ['#howto-screen', '#menu-screen']) {
      const el = document.querySelector(selector)
      if (el && !el.classList.contains('hidden')) {
        if (selector === '#menu-screen') this.hideMenu()
        else this.hide(selector)
        return true
      }
    }
    return false
  }

  showEnd(state: GameState, newRecord: boolean): void {
    this.titleScenario = state.scenarioId
    const won = state.scenario.status === 'won'
    const score = computeScore(state)
    const best = loadBestScores()[state.scenarioId] ?? score.total
    this.setText('#end-title', won ? 'You turned it around!' : 'Season over')
    this.setText('#end-reason', state.scenario.reason)
    this.setHtml('#end-goals', this.goalsHtml(state))
    this.setText('#end-grade', score.grade)
    this.setText('#end-total', score.total.toLocaleString('en-US'))
    this.setText('#end-best', newRecord ? 'New best score!' : `Best: ${best.toLocaleString('en-US')}`)
    this.setHtml(
      '#end-lines',
      score.lines
        .filter((l) => l.points > 0)
        .map((l) => `<div class="stat-line"><span>${escapeHtml(l.label)}</span><strong>+${l.points.toLocaleString('en-US')}</strong></div>`)
        .join(''),
    )
    document.querySelector('#end-screen')?.classList.toggle('won', won)
    this.show('#end-screen')
  }

  hideEnd(): void {
    this.hide('#end-screen')
  }

  // ── Notifications ──────────────────────────────────────────────────────

  notify(message: string, tone?: NotificationTone): void {
    if (!message) return
    this.notifications.push(message, tone)
  }

  resetNews(messages: string[]): void {
    this.notifications.reset(messages)
  }

  // ── Panels ─────────────────────────────────────────────────────────────

  setTab(tab: SidebarTab): void {
    this.activeTab = tab
    document.querySelector('#sidebar')?.classList.remove('collapsed')
    document.querySelectorAll<HTMLButtonElement>('.sidebar-tab').forEach((el) => {
      el.classList.toggle('active', el.dataset.tab === tab)
    })
    document.querySelectorAll<HTMLElement>('.sidebar-panel').forEach((el) => {
      el.classList.toggle('active', el.dataset.panel === tab)
    })
    this.onTabChange()
  }

  /** On phones, fold the bottom sheet away so the park is in view. */
  foldSheet(): void {
    if (!window.matchMedia('(max-width: 760px)').matches) return
    document.querySelector('#sidebar')?.classList.add('collapsed')
    this.onTabChange()
  }

  setSoundIcon(muted: boolean): void {
    const el = document.querySelector('#btn-sound')
    if (el) el.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn
  }

  setHint(text: string): void {
    this.setText('#canvas-hint', text)
  }

  private setText(selector: string, value: string): void {
    const el = document.querySelector(selector)
    if (el && el.textContent !== value) el.textContent = value
  }

  /** innerHTML that only touches the DOM when the markup actually changed. */
  private setHtml(selector: string, html: string): void {
    if (this.htmlCache.get(selector) === html) return
    const el = document.querySelector(selector)
    if (!el) return
    el.innerHTML = html
    this.htmlCache.set(selector, html)
  }

  private goalsHtml(state: GameState): string {
    const goals = goalProgress(state)
    if (goals.length === 0) return '<div class="goal-row free">No goals this season. Build what you like.</div>'
    return goals.map((g) => `<div class="goal-row${g.met ? ' met' : ''}">
        <span class="goal-check">${g.met ? ICONS.check : ''}</span>
        <span class="goal-name">${escapeHtml(g.label)}</span>
        <strong>${escapeHtml(g.display)}</strong>
        ${bar(Math.max(0, g.value), g.target, g.met ? 'good' : 'okay')}
      </div>`).join('')
  }

  update(state: GameState): void {
    const def = getScenarioDef(state.scenarioId)
    const stats = getParkStats(state.map)
    const happiness = Math.round(state.park.fanHappiness)

    this.setText('#header-cash', formatMoney(state.park.cash))
    this.setText('#header-games', `${Math.min(state.season.gamesPlayed + 1, def.seasonGames)}/${def.seasonGames}`)
    this.setText('#header-record', `${state.season.wins}-${state.season.losses}`)
    this.setText('#header-happiness', `${happiness}%`)
    document.querySelector('#chip-cash')?.classList.toggle('negative', state.park.cash < 0)
    const fansChip = document.querySelector('#chip-fans')
    if (fansChip) fansChip.className = `hud-chip ${scoreClass(happiness)}`

    const pauseBtn = document.querySelector('#btn-pause')
    if (pauseBtn) {
      pauseBtn.classList.toggle('active', state.paused)
      const icon = state.paused ? ICONS.play : ICONS.pause
      if (this.htmlCache.get('#btn-pause') !== icon) {
        pauseBtn.innerHTML = icon
        this.htmlCache.set('#btn-pause', icon)
      }
    }
    document.querySelectorAll<HTMLButtonElement>('.speed-btn').forEach((button) => {
      button.classList.toggle('active', !state.paused && Number(button.dataset.speed) === state.gameSpeed)
    })
    const waiting = state.paused && state.season.gamesPlayed === 0 && state.phase === 'idle'
    const overlay = this.isOverlayOpen()
    document.querySelector('#btn-play-ball')?.classList.toggle('hidden', !waiting || overlay)
    const resumable = state.paused && !waiting && state.scenario.status === 'active'
    document.querySelector('#btn-resume-pill')?.classList.toggle('hidden', !resumable || overlay)

    this.updateScorebug(state)
    this.updateSelection(state)

    this.setText('#scenario-name', def.name)
    this.setHtml('#goal-list', this.goalsHtml(state))
    this.setText('#next-step', getAdvice(state).text)
    this.updateLastGame(state)
    this.updateFanReport(state)
    this.setHtml('#park-stats', [
      ['Park rating', `${state.park.rating} / 999`],
      ['Seats', stats.seats.toLocaleString('en-US')],
      ['Room at the gate', `${accessCapacity(stats).toLocaleString('en-US')} fans`],
      ['Season attendance', state.season.totalAttendance.toLocaleString('en-US')],
      ['Sellouts', String(state.season.sellouts)],
    ].map(([k, v]) => `<div class="stat-line"><span>${k}</span><strong>${v}</strong></div>`).join(''))

    this.updateBuild(state)
    this.updateMoney(state)
    this.updateTeam(state)
    this.updateOffice(state)
  }

  private updateScorebug(state: GameState): void {
    const el = document.querySelector('#scorebug')
    const today = state.today
    if (!el) return
    if (!today || state.phase === 'idle') {
      el.classList.add('hidden')
      return
    }
    el.classList.remove('hidden')
    const def = getScenarioDef(state.scenarioId)
    const rival = getTeamDef(today.opponentId)
    const mine = getTeamDef(PLAYER_TEAM_ID)
    const awayTeam = today.home ? rival : mine
    const homeTeam = today.home ? mine : rival
    const line = today.line
    const total = halfInningsPlayed(line)
    const shown = Math.min(today.halfInningsShown, total)
    const finished = today.completed
    const running = scoreThrough(line, finished ? total : shown)

    let status = ''
    if (state.phase === 'pregame') {
      status = `Gates open. ${today.attendance.toLocaleString('en-US')} fans on the way`
    } else if (state.phase === 'away' && !finished) {
      status = `On the road at ${rival.city}`
    } else if (finished) {
      const won = today.home ? line.homeRuns > line.awayRuns : line.awayRuns > line.homeRuns
      status = won ? 'Final. Haymakers win!' : `Final. ${rival.name} win`
    } else {
      const inning = Math.floor(Math.max(0, shown - 1) / 2)
      status = shown === 0 ? 'First pitch' : `${(shown - 1) % 2 === 0 ? 'Top' : 'Bottom'} of the ${ORDINALS[inning] ?? `${inning + 1}th`}`
    }

    const showLine = today.home || finished
    const innings = Math.max(9, line.away.length)
    const cells = (runs: number[], isHome: boolean): string => {
      let out = ''
      for (let i = 0; i < innings; i += 1) {
        const half = i * 2 + (isHome ? 1 : 0)
        const visible = showLine && (finished || half < shown)
        const value = runs[i]
        out += `<td class="inn">${visible && value !== undefined ? (value < 0 ? 'x' : value) : ''}</td>`
      }
      return out
    }
    const header = Array.from({ length: innings }, (_, i) => `<th class="inn">${i + 1}</th>`).join('')
    const weather = today.night ? ICONS.night : ICONS[today.weather]
    const crowd = today.home ? ` · ${today.attendance.toLocaleString('en-US')} fans` : ''

    this.setHtml('#scorebug', `
      <div class="bug-top">
        <span>Game ${today.gameIndex + 1} of ${def.seasonGames} · ${escapeHtml(today.dateLabel)}</span>
        <span class="bug-weather">${weather} ${today.night ? 'Night game' : WEATHER_LABEL[today.weather]}${crowd}</span>
      </div>
      <table class="bug-line">
        <tr><th></th>${header}<th>R</th><th class="hits">H</th></tr>
        <tr class="${today.home ? '' : 'mine'}"><td class="team"><i style="background:${awayTeam.color}"></i>${escapeHtml(awayTeam.name)}</td>${cells(line.away, false)}<td class="runs">${showLine ? running.away : '-'}</td><td class="hits">${finished ? line.awayHits : ''}</td></tr>
        <tr class="${today.home ? 'mine' : ''}"><td class="team"><i style="background:${homeTeam.color}"></i>${escapeHtml(homeTeam.name)}</td>${cells(line.home, true)}<td class="runs">${showLine ? running.home : '-'}</td><td class="hits">${finished ? line.homeHits : ''}</td></tr>
      </table>
      <div class="bug-status">${escapeHtml(status)}</div>`)
  }

  private updateSelection(state: GameState): void {
    const el = document.querySelector('#selection-bar')
    if (!el) return
    const active = state.scenario.status === 'active' && (this.activeTab === 'build' || state.toolMode === 'demolish')
    el.classList.toggle('hidden', !active)
    if (!active) return
    const def = BUILDINGS[state.selectedBuilding]
    this.setText(
      '#selection-text',
      state.toolMode === 'demolish'
        ? 'Bulldozer: pick a building to remove (half refund)'
        : `${def.label} ${formatMoney(def.cost)}: pick a concourse tile`,
    )
  }

  private updateLastGame(state: GameState): void {
    const r = state.lastHome
    if (!r) {
      this.setHtml('#last-game', '<div class="muted">No home game played yet.</div>')
      return
    }
    const rival = getTeamDef(r.opponentId)
    const revenue = r.revenue.tickets + r.revenue.food + r.revenue.merch + r.revenue.parking
    const limit = r.limit === 'seats' ? ' (sold out)' : r.limit === 'parking' ? ' (no more parking)' : ''
    const row = (k: string, v: string, tone = ''): string => `<div class="stat-line ${tone}"><span>${k}</span><strong>${v}</strong></div>`
    this.setHtml('#last-game', [
      row(`${r.won ? 'Won' : 'Lost'} ${r.runsFor}-${r.runsAgainst} vs ${escapeHtml(rival.name)}`, WEATHER_LABEL[r.weather]),
      row('Attendance', `${r.attendance.toLocaleString('en-US')} / ${r.seats.toLocaleString('en-US')}${limit}`),
      row('Tickets', formatMoney(r.revenue.tickets)),
      row('Food & drink', formatMoney(r.revenue.food)),
      r.revenue.merch + r.revenue.parking > 0 ? row('Merch & parking', formatMoney(r.revenue.merch + r.revenue.parking)) : '',
      row('Costs', formatMoney(-totalCosts(r.costs))),
      row('Profit', formatMoney(revenue - totalCosts(r.costs)), r.profit >= 0 ? 'good' : 'bad'),
    ].join(''))
  }

  private updateFanReport(state: GameState): void {
    const r = state.lastHome
    if (!r) {
      this.setHtml('#fan-report', '<div class="muted">Play a home game to hear from the fans.</div>')
      return
    }
    const worst = worstFactor(r.factors)
    this.setHtml('#fan-report', r.factors.map((f) => `<div class="factor${f.key === worst.key && f.score < 70 ? ' worst' : ''}">
        <span>${escapeHtml(f.label)}</span>
        ${bar(f.score, 100, scoreClass(f.score))}
        <strong>${Math.round(f.score)}</strong>
      </div>`).join(''))
  }

  private updateBuild(state: GameState): void {
    document.querySelectorAll<HTMLButtonElement>('.build-card').forEach((button) => {
      const id = button.dataset.building
      if (!isBuildingId(id)) return
      const def = BUILDINGS[id]
      const unlocked = isBuildingUnlocked(id, state.research.unlocked)
      button.classList.toggle('active', state.toolMode === 'build' && id === state.selectedBuilding)
      button.classList.toggle('locked', !unlocked)
      button.classList.toggle('pricey', unlocked && state.park.cash < def.cost)
      button.disabled = !unlocked
      const blurb = button.querySelector('[data-blurb]')
      const text = unlocked ? def.blurb : `Needs the ${getResearchDef(def.researchRequired ?? '')?.label ?? ''} upgrade`
      if (blurb && blurb.textContent !== text) blurb.textContent = text
    })
    document.querySelectorAll<HTMLButtonElement>('.tool-mode[data-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === state.toolMode)
    })
    const undo = document.querySelector<HTMLButtonElement>('#btn-undo')
    if (undo) undo.disabled = state.undoStack.length === 0
  }

  private updateMoney(state: GameState): void {
    const slider = document.querySelector<HTMLInputElement>('#ticket-price')
    if (slider && document.activeElement !== slider) slider.value = String(state.park.ticketPrice)
    this.setText('#ticket-price-label', `$${state.park.ticketPrice}`)
    const fair = fairTicketPrice(state)
    const ratio = state.park.ticketPrice / fair
    const verdict =
      ratio > 1.35 ? 'a rip-off'
      : ratio > 1.1 ? 'a bit steep'
      : ratio > 0.85 ? 'about right'
      : ratio > 0.6 ? 'a good deal'
      : 'a steal'
    this.setText('#ticket-hint', `Fans think a fair price is about $${Math.round(fair)}. Yours looks like ${verdict}.`)

    document.querySelectorAll<HTMLButtonElement>('#food-price [data-food]').forEach((button) => {
      button.classList.toggle('active', button.dataset.food === state.park.foodPrice)
    })
    const foodHints: Record<FoodPrice, string> = {
      low: 'Cheap food: fans buy more and love it, but each sale earns less.',
      fair: 'Fair prices: the balanced choice.',
      high: 'Pricey food: more money per sale, fewer buyers, grumpier fans.',
    }
    this.setText('#food-hint', foodHints[state.park.foodPrice])

    this.setText('#cash', formatMoney(state.park.cash))
    this.setText('#debt', formatMoney(state.park.debt))
    this.setText('#interest', formatMoney(Math.round(state.park.debt * INTEREST_PER_GAME)))
    const borrow = document.querySelector<HTMLButtonElement>('#btn-borrow')
    if (borrow) borrow.disabled = state.park.debt + LOAN_STEP > MAX_DEBT
    const repay = document.querySelector<HTMLButtonElement>('#btn-repay')
    if (repay) repay.disabled = state.park.debt <= 0 || state.park.cash < Math.min(LOAN_STEP, state.park.debt)

    const rows = (labels: Record<string, string>, values: Record<string, number>, sign: number): string =>
      Object.entries(labels)
        .filter(([key]) => (values[key] ?? 0) > 0)
        .map(([key, label]) => `<div class="stat-line"><span>${label}</span><strong>${formatMoney(sign * (values[key] ?? 0))}</strong></div>`)
        .join('')
    const income = totalOf(state.finance.income)
    const spending = totalOf(state.finance.expenditure)
    this.setHtml('#finance-summary', `
      <div class="ledger-head">Income</div>
      ${rows(INCOME_LABELS, state.finance.income, 1) || '<div class="muted">Nothing yet.</div>'}
      <div class="ledger-head">Spending</div>
      ${rows(EXPENDITURE_LABELS, state.finance.expenditure, -1) || '<div class="muted">Nothing yet.</div>'}
      <div class="stat-line total ${income - spending >= 0 ? 'good' : 'bad'}"><span>Season so far</span><strong>${formatMoney(income - spending)}</strong></div>
      <div class="stat-line"><span>In the bank after loans</span><strong>${formatMoney(netWorth(state))}</strong></div>`)

    const graph = document.querySelector<HTMLCanvasElement>('#profit-graph')
    if (graph && this.activeTab === 'money') drawSparkline(graph, state.history.profit)
  }

  private updateTeam(state: GameState): void {
    const ratings = teamRatings(state.team)
    const rivals = state.league.filter((t) => t.id !== PLAYER_TEAM_ID)
    const avg = (pick: (t: { hitting: number; pitching: number }) => number): number =>
      rivals.reduce((s, t) => s + pick(t), 0) / rivals.length
    const rating = (label: string, value: number, league: number): string => `<div class="factor">
        <span>${label}</span>${bar(value, 80, value >= league ? 'good' : value >= league - 6 ? 'okay' : 'bad')}
        <strong>${Math.round(value)}</strong>
      </div>`
    const streak = state.season.streak
    this.setHtml('#team-ratings', `
      ${rating('Hitting', ratings.hitting, avg((t) => t.hitting))}
      ${rating('Pitching', ratings.pitching, avg((t) => t.pitching))}
      <div class="stat-line"><span>League average</span><strong>${Math.round(avg((t) => (t.hitting + t.pitching) / 2))}</strong></div>
      <div class="stat-line"><span>Streak</span><strong>${streak === 0 ? 'None' : `${streak > 0 ? 'Won' : 'Lost'} ${Math.abs(streak)}`}</strong></div>
      <div class="stat-line"><span>Payroll per home game</span><strong>${formatMoney(state.team.payrollPerGame)}</strong></div>`)

    const full = state.team.signings >= MAX_SIGNINGS
    const cost = signingCost(state.team)
    const cantAfford = state.park.cash < cost
    const signing = (kind: SigningKind, title: string, text: string): string => `<div class="entry-card">
        <strong>${title}</strong>
        <p>${text}</p>
        <button type="button" data-sign="${kind}" ${full || cantAfford ? 'disabled' : ''}>${full ? 'Roster full' : `Sign for ${formatMoney(cost)}`}</button>
      </div>`
    this.setHtml('#signing-list', `
      ${signing('slugger', 'Sign a slugger', 'Replaces your weakest hitter with a proven bat.')}
      ${signing('ace', 'Sign an ace', 'Replaces your weakest pitcher with a proven arm.')}
      <div class="muted">${state.team.signings} of ${MAX_SIGNINGS} signings used. Each adds to payroll.</div>`)

    this.setHtml('#standings', `<table class="table">
      <tr><th></th><th class="left">Team</th><th>W</th><th>L</th></tr>
      ${standings(state.league).map((t, i) => {
        const def = getTeamDef(t.id)
        return `<tr class="${t.id === PLAYER_TEAM_ID ? 'mine' : ''}"><td>${i + 1}</td><td class="left"><i style="background:${def.color}"></i>${escapeHtml(def.name)}</td><td>${t.wins}</td><td>${t.losses}</td></tr>`
      }).join('')}
    </table>`)

    const season = getScenarioDef(state.scenarioId).seasonGames
    const upcoming: string[] = []
    for (let i = state.season.gamesPlayed; i < Math.min(season, state.season.gamesPlayed + 6); i += 1) {
      const game = getPlayerGame(i)
      const rival = getTeamDef(game.opponentId)
      upcoming.push(`<div class="stat-line"><span>${escapeHtml(game.dateLabel)}</span><strong>${game.home ? 'vs' : 'at'} ${escapeHtml(rival.name)}</strong></div>`)
    }
    this.setHtml('#schedule', upcoming.join('') || '<div class="muted">The season is over.</div>')

    this.setHtml('#roster', `<table class="table">
      <tr><th class="left">Pos</th><th class="left">Player</th><th>Rating</th></tr>
      ${state.team.roster.map((p) => `<tr><td class="left">${p.position}</td><td class="left">${escapeHtml(p.name)}${p.signed ? ' *' : ''}</td><td>${Math.round(p.rating)}</td></tr>`).join('')}
    </table><div class="muted">* signed this season</div>`)
  }

  private updateOffice(state: GameState): void {
    this.setHtml('#staff-list', STAFF_TYPES.map((s) => {
      const count = state.staff[s.role]
      const cantHire = count >= s.max || state.park.cash < s.hireCost
      return `<div class="entry-card">
        <strong>${escapeHtml(s.label)} <em>${count} / ${s.max}</em></strong>
        <p>${escapeHtml(s.description)}. ${formatMoney(s.wage)} per home game.</p>
        <div class="entry-actions">
          <button type="button" data-hire="${s.role}" ${cantHire ? 'disabled' : ''}>Hire ${formatMoney(s.hireCost)}</button>
          <button type="button" data-fire="${s.role}" ${count <= 0 ? 'disabled' : ''}>Let go</button>
        </div>
      </div>`
    }).join(''))

    const active = getActiveCampaign(state.marketing)
    this.setHtml('#marketing-list', MARKETING_CAMPAIGNS.map((c) => {
      const running = active?.id === c.id
      const blocked = active !== null || state.park.cash < c.cost
      const games = state.marketing.gamesRemaining
      return `<div class="entry-card${running ? ' running' : ''}">
        <strong>${escapeHtml(c.label)}</strong>
        <p>${escapeHtml(c.description)}</p>
        <button type="button" data-campaign="${c.id}" ${blocked ? 'disabled' : ''}>${running ? `Running: ${games} game${games === 1 ? '' : 's'} left` : `Launch ${formatMoney(c.cost)}`}</button>
      </div>`
    }).join(''))

    this.setHtml('#research-list', RESEARCH_TREE.map((r) => {
      const done = state.research.unlocked.includes(r.id)
      return `<div class="entry-card${done ? ' done' : ''}">
        <strong>${escapeHtml(r.label)}</strong>
        <p>${escapeHtml(r.description)}.</p>
        ${done ? '<span class="done-tag">Done</span>' : `<button type="button" data-research="${r.id}" ${state.park.cash < r.cost ? 'disabled' : ''}>Buy ${formatMoney(r.cost)}</button>`}
      </div>`
    }).join(''))
  }
}
