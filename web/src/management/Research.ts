export interface ResearchDef {
  id: string
  label: string
  cost: number
  description: string
}

export const RESEARCH_TREE: ResearchDef[] = [
  {
    id: 'concessions_plus', label: 'Gourmet Concessions', cost: 4_000,
    description: 'Unlocks the Smokehouse Grill. Fans spend 15% more on food',
  },
  {
    id: 'season_tickets', label: 'Season Ticket Office', cost: 5_000,
    description: '8% more fans want to come to every game',
  },
  {
    id: 'night_games', label: 'Night Games', cost: 6_000,
    description: 'Unlocks Light Towers for busy weekday nights',
  },
  {
    id: 'player_dev', label: 'Player Development', cost: 8_000,
    description: 'Unlocks the Clubhouse. All training is 25% faster',
  },
  {
    id: 'premium_seating', label: 'Premium Seating', cost: 10_000,
    description: 'Unlocks Luxury Boxes',
  },
]

export function getResearchDef(id: string): ResearchDef | undefined {
  return RESEARCH_TREE.find((r) => r.id === id)
}

export function hasResearch(unlocked: string[], id: string): boolean {
  return unlocked.includes(id)
}
