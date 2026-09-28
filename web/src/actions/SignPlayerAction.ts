import { gameEvents } from '../core/events'
import { financePayment } from '../management/Finance'
import { getLeagueTeam, PLAYER_TEAM_ID } from '../season/League'
import { MAX_SIGNINGS, signFreeAgent, signingCost, teamRatings, type SigningKind } from '../season/Team'
import { formatMoney } from '../world/facilities'
import type { GameState } from '../core/GameState'
import type { ActionResult, GameAction } from './types'

export class SignPlayerAction implements GameAction {
  readonly type = 'signPlayer'
  readonly kind: SigningKind

  constructor(kind: SigningKind) {
    this.kind = kind
  }

  query(state: GameState): ActionResult {
    if (state.team.signings >= MAX_SIGNINGS) {
      return { ok: false, message: 'The roster is full of free agents already.' }
    }
    const cost = signingCost(state.team)
    if (state.park.cash < cost) {
      return { ok: false, message: `Need ${formatMoney(cost)} to sign a free agent.` }
    }
    return { ok: true, message: 'Can sign a free agent.' }
  }

  execute(state: GameState): ActionResult {
    const check = this.query(state)
    if (!check.ok) return check

    financePayment(state, signingCost(state.team), 'signings')
    const player = signFreeAgent(state, state.team, this.kind)
    const ratings = teamRatings(state.team)
    const entry = getLeagueTeam(state.league, PLAYER_TEAM_ID)
    entry.hitting = ratings.hitting
    entry.pitching = ratings.pitching

    gameEvents.emit('cash:updated', { cash: state.park.cash })
    const role = this.kind === 'ace' ? 'pitcher' : 'slugger'
    return { ok: true, message: `Signed ${role} ${player.name} (${Math.round(player.rating)} rating).` }
  }
}
