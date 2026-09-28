export const GAME_UPDATE_FPS = 40
export const TICK_MS = 1000 / GAME_UPDATE_FPS
export const MAX_GAME_UPDATES = 8

export const GRID_W = 26
export const GRID_H = 26

/** Game-day phase lengths in ticks (40 ticks = 1s at normal speed). */
export const PREGAME_TICKS = 140
export const HALF_INNING_TICKS = 18
export const POSTGAME_TICKS = 130
export const AWAY_TICKS = 110

/** Cash below this, with no credit left at the bank, ends the scenario. */
export const BANKRUPTCY_FLOOR = -10_000
