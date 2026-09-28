import { gameEvents } from '../core/events'
import { financePayment } from '../management/Finance'
import { getCampaign } from '../management/Marketing'
import { formatMoney } from '../world/facilities'
import type { ActionResult, GameAction } from './types'
import type { GameState } from '../core/GameState'

export class StartMarketingAction implements GameAction {
  readonly type = 'startMarketing'
  readonly campaignId: string

  constructor(campaignId: string) {
    this.campaignId = campaignId
  }

  query(state: GameState): ActionResult {
    const campaign = getCampaign(this.campaignId)
    if (!campaign) return { ok: false, message: 'Unknown promotion.' }
    if (state.marketing.campaignId && state.marketing.gamesRemaining > 0) {
      return { ok: false, message: 'A promotion is already running.' }
    }
    if (state.park.cash < campaign.cost) {
      return { ok: false, message: `Need ${formatMoney(campaign.cost)} for ${campaign.label}.` }
    }
    return { ok: true, message: `Can start ${campaign.label}.` }
  }

  execute(state: GameState): ActionResult {
    const check = this.query(state)
    if (!check.ok) return check

    const campaign = getCampaign(this.campaignId)
    if (!campaign) return { ok: false, message: 'Unknown promotion.' }
    financePayment(state, campaign.cost, 'marketing')
    state.marketing.campaignId = campaign.id
    state.marketing.gamesRemaining = campaign.games

    gameEvents.emit('cash:updated', { cash: state.park.cash })
    return { ok: true, message: `${campaign.label} is on!` }
  }
}
