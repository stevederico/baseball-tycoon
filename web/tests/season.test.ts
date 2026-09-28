import { describe, expect, it } from 'vitest'
import { nextRandom } from '../src/core/rng'
import { halfInningsPlayed, runsInHalfInning, scoreThrough, simulateGame } from '../src/season/GameSim'
import { createLeague, leaguePosition, standings, TEAM_DEFS } from '../src/season/League'
import { countHomeGames, getPlayerGame, seriesPairings } from '../src/season/Schedule'
import { createTeam, MAX_SIGNINGS, signFreeAgent, signingCost, teamRatings, trainTeam } from '../src/season/Team'

describe('rng', () => {
  it('replays the same sequence from the same seed', () => {
    const a = { rngState: 42 }
    const b = { rngState: 42 }
    const first = Array.from({ length: 20 }, () => nextRandom(a))
    const second = Array.from({ length: 20 }, () => nextRandom(b))
    expect(first).toEqual(second)
    expect(first.every((v) => v >= 0 && v < 1)).toBe(true)
  })
})

describe('schedule', () => {
  it('splits a 72-game season evenly between home and away', () => {
    expect(countHomeGames(72)).toBe(36)
    expect(countHomeGames(24)).toBe(12)
  })

  it('opens at home and alternates six-game homestands and road trips', () => {
    const pattern = Array.from({ length: 24 }, (_, i) => getPlayerGame(i).home)
    expect(pattern.slice(0, 6).every(Boolean)).toBe(true)
    expect(pattern.slice(6, 12).some(Boolean)).toBe(false)
    expect(pattern.slice(12, 18).every(Boolean)).toBe(true)
  })

  it('keeps one opponent for a whole three-game series', () => {
    for (let series = 0; series < 24; series += 1) {
      const rivals = [0, 1, 2].map((g) => getPlayerGame(series * 3 + g).opponentId)
      expect(new Set(rivals).size).toBe(1)
    }
  })

  it('meets every rival in each seven-series cycle', () => {
    const rivals = new Set(Array.from({ length: 21 }, (_, i) => getPlayerGame(i).opponentId))
    expect(rivals.size).toBe(TEAM_DEFS.length - 1)
  })

  it('puts every team in exactly one game per series', () => {
    for (let series = 0; series < 24; series += 1) {
      const teams = seriesPairings(series).flatMap((p) => [p.home, p.away])
      expect(teams.length).toBe(TEAM_DEFS.length)
      expect(new Set(teams).size).toBe(TEAM_DEFS.length)
    }
  })

  it('never schedules a game on a Monday', () => {
    for (let i = 0; i < 72; i += 1) expect(getPlayerGame(i).weekday).not.toBe(0)
  })
})

describe('game simulation', () => {
  const even = { hitting: 50, pitching: 50 }

  it('always produces a winner and a consistent line score', () => {
    const rng = { rngState: 7 }
    for (let i = 0; i < 500; i += 1) {
      const line = simulateGame(rng, even, even)
      expect(line.awayRuns).not.toBe(line.homeRuns)
      expect(line.away.reduce((s, r) => s + r, 0)).toBe(line.awayRuns)
      expect(line.home.filter((r) => r >= 0).reduce((s, r) => s + r, 0)).toBe(line.homeRuns)
      expect(line.away.length).toBeGreaterThanOrEqual(9)
      expect(line.awayHits).toBeGreaterThanOrEqual(line.awayRuns)
    }
  })

  it('skips the bottom of the ninth when the home team already leads', () => {
    const rng = { rngState: 11 }
    let skipped = 0
    for (let i = 0; i < 300; i += 1) {
      const line = simulateGame(rng, even, even)
      if (line.home[line.home.length - 1] === -1) {
        skipped += 1
        expect(line.homeRuns).toBeGreaterThan(line.awayRuns)
        expect(halfInningsPlayed(line)).toBe(line.away.length * 2 - 1)
      }
    }
    expect(skipped).toBeGreaterThan(0)
  })

  it('reveals the score half inning by half inning', () => {
    const line = simulateGame({ rngState: 3 }, even, even)
    const total = halfInningsPlayed(line)
    expect(scoreThrough(line, 0)).toEqual({ away: 0, home: 0 })
    expect(scoreThrough(line, total)).toEqual({ away: line.awayRuns, home: line.homeRuns })
    expect(runsInHalfInning(line, 0)).toBe(line.away[0])
  })

  it('rewards the better team', () => {
    const rng = { rngState: 99 }
    const strong = { hitting: 60, pitching: 60 }
    const weak = { hitting: 42, pitching: 42 }
    let strongWins = 0
    const games = 2_000
    for (let i = 0; i < games; i += 1) {
      const line = simulateGame(rng, weak, strong)
      if (line.homeRuns > line.awayRuns) strongWins += 1
    }
    expect(strongWins / games).toBeGreaterThan(0.65)
    expect(strongWins / games).toBeLessThan(0.95)
  })
})

describe('league', () => {
  it('ranks teams by winning percentage', () => {
    const league = createLeague()
    for (const team of league) {
      team.wins = 6
      team.losses = 6
    }
    league[3].wins = 10
    league[3].losses = 2
    league[0].wins = 1
    league[0].losses = 11
    expect(standings(league)[0].id).toBe(league[3].id)
    expect(leaguePosition(league, league[3].id)).toBe(1)
    expect(leaguePosition(league, league[0].id)).toBe(8)
  })
})

describe('team', () => {
  it('fields nine hitters and five pitchers with unique names', () => {
    const team = createTeam({ rngState: 5 }, 42)
    expect(team.roster.filter((p) => !p.pitcher)).toHaveLength(9)
    expect(team.roster.filter((p) => p.pitcher)).toHaveLength(5)
    expect(new Set(team.roster.map((p) => p.name)).size).toBe(14)
  })

  it('improves the rotation when an ace is signed', () => {
    const rng = { rngState: 5 }
    const team = createTeam(rng, 42)
    const before = teamRatings(team)
    const cost = signingCost(team)
    const ace = signFreeAgent(rng, team, 'ace')
    const after = teamRatings(team)
    expect(ace.pitcher).toBe(true)
    expect(after.pitching).toBeGreaterThan(before.pitching)
    expect(after.hitting).toBe(before.hitting)
    expect(team.roster).toHaveLength(14)
    expect(signingCost(team)).toBeGreaterThan(cost)
    expect(MAX_SIGNINGS).toBeGreaterThan(1)
  })

  it('trains faster with facilities and coaches', () => {
    const base = { battingCages: 0, bullpens: 0, clubhouses: 0, hittingCoaches: 0, pitchingCoaches: 0, playerDevelopment: false }
    const idle = createTeam({ rngState: 8 }, 42)
    const busy = createTeam({ rngState: 8 }, 42)
    const rngA = { rngState: 1 }
    const rngB = { rngState: 1 }
    for (let day = 0; day < 30; day += 1) {
      trainTeam(rngA, idle, base)
      trainTeam(rngB, busy, { ...base, battingCages: 2, hittingCoaches: 1 })
    }
    expect(teamRatings(busy).hitting).toBeGreaterThan(teamRatings(idle).hitting + 3)
    expect(teamRatings(busy).pitching).toBeCloseTo(teamRatings(idle).pitching, 5)
  })
})
