export type ScenarioId = 'turn_it_around' | 'short_season' | 'sandbox'

export interface ScenarioGoals {
  /** Cash in the bank after loans are repaid. */
  cash: number
  happiness: number
  wins: number
}

export interface ScenarioDef {
  id: ScenarioId
  name: string
  tagline: string
  objective: string
  seasonGames: number
  startCash: number
  goals: ScenarioGoals
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'turn_it_around',
    name: 'Turn It Around',
    tagline: 'The full 72-game season',
    objective:
      'You just bought the last-place Haymakers and their tired old ballpark. Win back the fans, the standings and the bank manager in one season.',
    seasonGames: 72,
    startCash: 40_000,
    goals: { cash: 400_000, happiness: 70, wins: 36 },
  },
  {
    id: 'short_season',
    name: 'Spring Sprint',
    tagline: 'A quick 24-game season',
    objective: 'Short on time? You have 24 games to get the turnstiles spinning.',
    seasonGames: 24,
    startCash: 40_000,
    goals: { cash: 55_000, happiness: 60, wins: 8 },
  },
  {
    id: 'sandbox',
    name: 'Sandbox Season',
    tagline: 'Deep pockets, no pressure',
    objective: 'A rich uncle left you $400,000. Build the ballpark of your dreams over 72 games.',
    seasonGames: 72,
    startCash: 400_000,
    goals: { cash: 0, happiness: 0, wins: 0 },
  },
]

export function isScenarioId(id: string | undefined): id is ScenarioId {
  return SCENARIOS.some((s) => s.id === id)
}

export function getScenarioDef(id: ScenarioId): ScenarioDef {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]
}
