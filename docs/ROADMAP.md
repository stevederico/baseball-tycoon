# Baseball Tycoon — Roadmap

## Phase 0 — Design

- [x] Core concept and tycoon-to-baseball mapping
- [x] MVP facility list and economy sketch
- [x] Finalize art style (isometric 2D canvas)
- [x] Pick engine (Canvas 2D + Vite — `web/`)
- [x] Facility stat table — [FACILITIES.md](FACILITIES.md)
- [x] Choose project license (MIT)

## Phase 1 — Vertical slice ✅

**Goal:** Prove the loop is fun in 2–4 weeks.

- [x] Vite project scaffold (`web/`)
- [x] Place 7 facility types on a grid
- [x] "Play home game" button
- [x] Attendance + revenue calculation
- [x] Multi-scenario seasons (10–72 games)
- [x] Retro tycoon-style UI: money, guests, fan happiness

**Deliverable:** Playable browser prototype — http://localhost:5174

## Phase 2 — MVP ✅

**Goal:** One complete scenario worth sharing.

- [x] Full facility set (17 types + upgrade gates)
- [x] 72-game AA season scenario
- [x] Roster screen (14 players, one rating each)
- [x] Fan thoughts / concession buying / leaving
- [x] Three season types with picker
- [x] Save / load
- [x] Sound (synthesized)
- [x] Procedural 2D canvas art

**Deliverable:** Demo build for friends / itch.io.

## Phase 3 — Polish & content

- [ ] Original isometric tile art (replace placeholders)
- [ ] More scenarios (3 today)
- [ ] Offseason upgrade flow
- [ ] Playoffs
- [x] Balance pass (bot seasons in `web/tests/`)
- [x] In-game advice line (scenario-aware)
- [ ] Guided tutorial

## Phase 4 — Depth (optional)

- [ ] Farm system / prospects
- [ ] Draft and trades
- [ ] Multiple stadiums
- [x] Staff hiring
- [ ] Staff traits
- [x] Marketing campaigns
- [x] Weather (rain lowers crowds)
- [ ] Dynamic events (rainout, star player injury, food poisoning)

---

## Later list (separate products / content packs)

Ideas to revisit **after** Baseball Tycoon MVP ships. Same engine architecture possible, different theme packs.

### Casino Owner Tycoon

- Slot machines, table games, sportsbook, bars, hotel wings
- Gamblers instead of fans; house edge instead of ticket sales
- Security, comps, cheating risk, casino prestige
- Likely **faster MVP** than baseball (no season sim) — good second project on shared engine

### Other tycoon themes (brainstorm)

- Race track / motorsport venue
- Concert venue / amphitheater
- Ski resort
- Aquarium / zoo sports crossover (?)

### Shared engine (if multiple games ship)

Extract common systems from Baseball Tycoon:

- Placement grid
- Visitor simulation
- Economy / finance tick
- Facility definitions (data-driven)
- Scenario framework
- Save / load

Theme packs: `baseball`, `casino`, etc.

---

## Milestones summary

| Milestone | Target | Status |
|-----------|--------|--------|
| Design docs | — | Done |
| Vertical slice | Phase 1 | Done |
| MVP | Phase 2 | Done (0.6.0), rebalanced 0.8.0 |
| Public demo | Phase 2 end | Not started |
| Casino tycoon | After MVP | Deferred |