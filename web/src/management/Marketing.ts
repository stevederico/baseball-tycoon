export interface MarketingCampaign {
  id: string
  label: string
  cost: number
  /** Home games the promotion runs for. */
  games: number
  attendanceBoost: number
  funBoost: number
  description: string
}

export const MARKETING_CAMPAIGNS: MarketingCampaign[] = [
  {
    id: 'local_radio', label: 'Local Radio Ads', cost: 2_000, games: 4,
    attendanceBoost: 0.1, funBoost: 0,
    description: '+10% demand for 4 home games',
  },
  {
    id: 'fireworks', label: 'Fireworks Night', cost: 4_000, games: 2,
    attendanceBoost: 0.22, funBoost: 15,
    description: '+22% demand and happier fans for 2 home games',
  },
  {
    id: 'giveaway', label: 'Cap Giveaway', cost: 6_000, games: 1,
    attendanceBoost: 0.4, funBoost: 10,
    description: '+40% demand for the next home game',
  },
]

export function getCampaign(id: string | null): MarketingCampaign | null {
  if (!id) return null
  return MARKETING_CAMPAIGNS.find((c) => c.id === id) ?? null
}

export function getActiveCampaign(marketing: {
  campaignId: string | null
  gamesRemaining: number
}): MarketingCampaign | null {
  if (marketing.gamesRemaining <= 0) return null
  return getCampaign(marketing.campaignId)
}
