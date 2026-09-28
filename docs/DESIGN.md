# Baseball Tycoon — Design

## Vision

A franchise management sim where the player builds and operates a baseball stadium, balances the budget, keeps fans happy, and tries to win — or at least stay profitable.

> This is the original design brief. For what shipped, see the README. Where they differ, the code wins.

## Core loop

1. **Build** — place stadium sections and support facilities
2. **Fans arrive** — attendance driven by team performance, stadium quality, and schedule
3. **Earn money** — tickets, concessions, merch
4. **Spend money** — payroll, upkeep, upgrades, staff
5. **Play games** — simple sim produces wins and losses
6. **Repeat** — improve the park between home stands

## What each part of the park does

| Park part | Role |
|-----|----------|
| Seating sections, fan zones, big screen | Draw the crowd and keep them happy |
| Concessions, merch, bars | Revenue per fan |
| Fan experience | Attendance and renewals |
| Coaches, scouts, trainers, grounds crew | Staff |
| Franchise prestige | Park rating |
| Scenarios | "Make playoffs in 3 years," "Fill the park nightly" |
| Sandbox | Build an expansion team from scratch |

## Facilities

### Fan-facing

| Facility | Effect |
|----------|--------|
| Bleachers | Cheap capacity |
| Reserved seating | Mid-tier capacity + comfort |
| Club level | High revenue per seat |
| Party deck / berm | Capacity + group appeal |
| Concession stand | Concession revenue |
| Beer garden | Revenue + happiness (adults) |
| Team store | Merch revenue |
| Big screen | Happiness boost |
| Kids zone | Family appeal |

### Player-facing

| Facility | Effect |
|----------|--------|
| Batting cage | Hitting boost |
| Bullpen | Pitching boost |
| Weight room | General performance |
| Film room | Strategy / consistency |
| Medical / training | Fewer injuries, faster recovery |

### Operations

| Facility | Effect |
|----------|--------|
| Scout office | Better future roster (post-MVP) |
| Coach offices | Staff capacity |
| Grounds crew shed | Stadium appeal upkeep |

Each facility: **build cost**, **upkeep**, **capacity or buff**, **fan or player effect**.

## Economy (v1)

```
Attendance = base × win%_factor × stadium_appeal × marketing × day_weather_factor
Ticket revenue = attendance × avg_ticket_price
Concession revenue = attendance × concession_spend_per_fan
Total revenue = tickets + concessions + merch
Profit = revenue − payroll − upkeep − debt_service
```

### Fan happiness drivers

- Team record (winning helps)
- Seat quality vs. crowd size (overcrowding hurts)
- Concession wait / variety
- Stadium cleanliness and upkeep
- Weather and day of week

### Fan complaints (thought bubbles)

- "Too expensive"
- "Long line for food"
- "Great view of the field"
- "This team is terrible"
- "Love the new scoreboard"

## Roster & games (MVP — keep simple)

- **14 players** (9 hitters, 5 pitchers), no full 40-man roster
- **One rating per player**; training facilities, coaches and free agents raise it
- **Team strength** = aggregate of lineup + pitching
- **Game result** = team strength vs. opponent strength + small random variance
- No play-by-play; the line score is simulated inning by inning and revealed live

## Season structure (MVP)

- **League:** AA, fictional teams
- **Schedule:** 72 games (~half home)
- **Home game** every few in-game days; player manages park between games
- **Offseason:** not in v1 (one season per run)
- **Playoffs:** top 4 teams (stretch goal, post-MVP)

## Scenarios (MVP — one)

**"Turn It Around"** — Inherit a losing team in a small, outdated stadium. By the last of 72 games, have $400,000 in the bank after loans, 70% fan happiness and 36 wins.

Also shipped: **Spring Sprint** (24 games) and **Sandbox Season** (no goals).

Future scenarios:

- Win the championship in 3 seasons
- Expand from 3k to 15k seats
- Develop a prospect into a star

## Art direction

- Isometric or top-down ballpark view
- Small scope: one stadium, not a city
- Original art only — no assets from other games, no MLB license
- Possible pipeline: low-poly 3D → rendered sprites, or clean 2D tiles

## Out of scope (v1)

- MLB license or real teams/players
- Full 162-game season
- Trade market, draft, waivers
- Play-by-play simulation
- Minor league tiers (AAA, A, etc.)
- Multiplayer
- Native mobile apps (the web build works on phones)

## Open questions

- [x] Isometric
- [x] Canvas 2D + Vite (see `web/`)
- [x] Real-time with pause and three speeds
- [ ] License for shipped game (MIT vs. GPL vs. proprietary)?