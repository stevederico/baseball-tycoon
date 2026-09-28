# AGENTS.md

Project guidance for AI agents working with this repository.

Baseball Tycoon is a browser-based management sim where you build a ballpark and run a minor-league baseball franchise. Frontend-only, no backend.

## Development Commands

The playable app lives in `web/`. Run all commands from there:

```bash
cd web
npm install
npm run dev       # Vite dev server at http://localhost:5174
npm test          # vitest unit tests (web/tests/)
npm run build     # tsc typecheck, then vite build
npm run preview   # serve production build at http://localhost:8001
```

## Stack

- Vite + TypeScript (ES modules, strict bundler-mode tsconfig).
- Rendering: hand-written 2D canvas isometric renderer (`CanvasRenderingContext2D`, double-buffered offscreen canvas, sprite atlas). No 3D/WebGL/Three.js despite older doc references.
- UI: plain HTML/CSS overlay driven from TypeScript — no framework.
- Persistence: browser `localStorage` autosave. No server. The only network request is the Vibe Jam widget script in `index.html`.
- Sound: synthesized with WebAudio (`audio/Sound.ts`); no audio files.
- No runtime dependencies; `typescript`, `vite` and `vitest` as devDependencies.

## Architecture

Structure under `web/src/`:

- `main.ts` — entry point; wires canvas, game loop, UI, input, sound, title/end screens.
- `core/` — `GameState`, `GameLoop` (game-day phases), `events`, `rng` (seeded, stored on state), `SaveLoad`, `Undo`, `constants`.
- `season/` — `League` (8 fictional teams), `Schedule` (72-game series schedule), `GameSim` (inning-by-inning line scores), `Team` (roster, training, free agents).
- `actions/` — command pattern; all player mutations go through `submitAction` (build, demolish, staff, pricing, loans, signings, promotions, upgrades, undo).
- `management/` — `Economy` (demand, attendance, revenue, costs), `FanExperience` (post-game fan factors), `GameDay` (applies a game's result), `Finance`, `Park`, `Staff`, `Marketing`, `Research`.
- `world/` — `Map`, `facilities`, `zones`, `parkBounds`.
- `entity/` — walking `Fan` agents and `FanPathfinding` (visual only; the economy is aggregate).
- `render/` — `paint`, `buildings`, `sprites`, `palette`.
- `game/` — `scene` (camera, pointer/touch input, overlay text), `iso`, `field`.
- `scenario/` — scenario goals, win/lose rules, final score.
- `ui/` — `panel`, `notifications`, `graph`, `icons`.

## Key Patterns

- Mutations flow through the actions command pattern (`actions/GameActions.ts` `submitAction`), which enables undo — do not mutate `GameState` directly.
- Isometric coordinates: use `game/iso.ts` (`screenToGrid` and friends) for any screen/grid conversion.
- The sim must stay deterministic: use `core/rng.ts` with the state, not `Math.random`, for anything that affects results. `Math.random` is fine for visuals (fan walking, bubbles).
- Balance is guarded by bot seasons in `web/tests/gameday.test.ts`; rerun `npm test` after touching economy numbers.
- Older docs in `docs/` mention Three.js; trust the code — the renderer is 2D canvas.
- In dev, `window.__tycoon` exposes `state()`, `tick(n)` and `tileToClient(x, z)` for browser testing.

## Repo Notes

- `web/` is the app. There is no other build.
- `docs/` holds design and roadmap references (`DESIGN.md`, `ROADMAP.md`).
- Everything in the game is original: name, teams, art and sound are made in code. Do not add third-party assets.
- `SUMMARY.md` is a local hand-off note and is gitignored.
