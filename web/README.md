# Baseball Tycoon — web app

The playable game. See the [main README](../README.md) for the pitch, controls and screenshots.

## Run

```bash
npm install
npm run dev       # http://localhost:5174
npm test          # vitest unit and balance tests
npm run build     # typecheck, then static build in dist/
npm run preview   # serve dist/ at http://localhost:8001
```

## Stack

- Vite + TypeScript, no runtime dependencies
- 2D canvas isometric renderer (no WebGL)
- Plain HTML/CSS UI driven from TypeScript
- WebAudio synthesized sound

## Structure

```
src/
├── main.ts        wiring: canvas, loop, UI, input, sound, title and end screens
├── core/          GameState, GameLoop (40 Hz), events, seeded rng, save/load, undo
├── season/        league, schedule, game sim, roster and training
├── actions/       player actions (command pattern)
├── management/    economy, fan experience, game day, advice, finance, staff
├── world/         tile map, facilities, zones, park bounds
├── entity/        walking fans and pathfinding
├── scenario/      season goals, win and lose, score
├── render/        isometric painting, building art, tile atlas
├── game/          camera, touch and mouse input, field geometry
├── audio/         synthesized sound
└── ui/            panels, notifications, graphs, icons
tests/             unit tests and bot seasons
```
