/**
 * The Timberline League: eight fictional AA clubs. The player runs the
 * Haymakers, who start the season as the weakest team in the league.
 */
export const PLAYER_TEAM_ID = 'haymakers'
export const LEAGUE_NAME = 'Timberline League'

export interface TeamDef {
  id: string
  city: string
  name: string
  abbr: string
  color: string
  hitting: number
  pitching: number
}

export const TEAM_DEFS: TeamDef[] = [
  { id: 'haymakers', city: 'Harlow Creek', name: 'Haymakers', abbr: 'HAY', color: '#2f62ad', hitting: 42, pitching: 42 },
  { id: 'lanterns', city: 'Port Ember', name: 'Lanterns', abbr: 'PEL', color: '#d9822b', hitting: 58, pitching: 56 },
  { id: 'tinroofs', city: 'Tumbleton', name: 'Tin Roofs', abbr: 'TIN', color: '#7a8794', hitting: 54, pitching: 55 },
  { id: 'hammers', city: 'Quarry Hill', name: 'Hammers', abbr: 'QHH', color: '#8a4b2d', hitting: 53, pitching: 50 },
  { id: 'skippers', city: 'Saltgrass', name: 'Skippers', abbr: 'SKP', color: '#2a9d8f', hitting: 49, pitching: 52 },
  { id: 'rivets', city: 'Ironvale', name: 'Rivets', abbr: 'IRV', color: '#555b6e', hitting: 48, pitching: 49 },
  { id: 'kites', city: 'Marigold Bay', name: 'Kites', abbr: 'MBK', color: '#e9b83a', hitting: 47, pitching: 45 },
  { id: 'jackalopes', city: 'Dusty Fork', name: 'Jackalopes', abbr: 'JAX', color: '#a05a9c', hitting: 44, pitching: 45 },
]

export interface LeagueTeam {
  id: string
  wins: number
  losses: number
  hitting: number
  pitching: number
}

export function getTeamDef(id: string): TeamDef {
  return TEAM_DEFS.find((t) => t.id === id) ?? TEAM_DEFS[0]
}

export function teamLabel(id: string): string {
  const def = getTeamDef(id)
  return `${def.city} ${def.name}`
}

export function createLeague(): LeagueTeam[] {
  return TEAM_DEFS.map((t) => ({ id: t.id, wins: 0, losses: 0, hitting: t.hitting, pitching: t.pitching }))
}

export function getLeagueTeam(league: LeagueTeam[], id: string): LeagueTeam {
  const team = league.find((t) => t.id === id)
  if (!team) throw new Error(`Unknown team: ${id}`)
  return team
}

function winPct(team: LeagueTeam): number {
  const games = team.wins + team.losses
  return games === 0 ? 0 : team.wins / games
}

/** Best record first. Ties break toward more wins, then the listed order. */
export function standings(league: LeagueTeam[]): LeagueTeam[] {
  return [...league].sort((a, b) => winPct(b) - winPct(a) || b.wins - a.wins)
}

/** 1-based league position of a team. */
export function leaguePosition(league: LeagueTeam[], id: string): number {
  return standings(league).findIndex((t) => t.id === id) + 1
}
