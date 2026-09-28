type EventMap = {
  'cash:updated': { cash: number }
  'park:updated': { rating: number; happiness: number }
  'season:updated': { wins: number; losses: number; gamesPlayed: number }
  'news:added': { message: string }
  'fans:updated': { count: number }
  'day:started': { gameIndex: number; home: boolean }
  'game:firstPitch': { gameIndex: number }
  'game:runs': { runs: number; byPlayer: boolean; inning: number }
  'game:finished': { home: boolean; won: boolean }
  'scenario:ended': { status: 'won' | 'lost' }
}

type Handler<T> = (payload: T) => void
type HandlerSets = { [K in keyof EventMap]: Set<Handler<EventMap[K]>> }

export class GameEventBus {
  private handlers: HandlerSets = {
    'cash:updated': new Set(),
    'park:updated': new Set(),
    'season:updated': new Set(),
    'news:added': new Set(),
    'fans:updated': new Set(),
    'day:started': new Set(),
    'game:firstPitch': new Set(),
    'game:runs': new Set(),
    'game:finished': new Set(),
    'scenario:ended': new Set(),
  }

  on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): void {
    this.handlers[event].add(handler)
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    for (const handler of this.handlers[event]) handler(payload)
  }
}

export const gameEvents = new GameEventBus()
