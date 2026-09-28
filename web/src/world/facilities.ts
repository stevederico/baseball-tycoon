export type BuildingId =
  | 'bleachers'
  | 'grandstand'
  | 'luxury_boxes'
  | 'hotdog'
  | 'drinks'
  | 'grill'
  | 'restroom'
  | 'team_store'
  | 'parking'
  | 'scoreboard'
  | 'kids_zone'
  | 'lights'
  | 'batting_cage'
  | 'bullpen'
  | 'clubhouse'
  | 'tree'
  | 'fountain'

export type BuildingCategory = 'seating' | 'food' | 'fun' | 'team' | 'scenery'
export type FoodType = 'hotdog' | 'drinks' | 'grill'

export interface BuildingDef {
  id: BuildingId
  label: string
  category: BuildingCategory
  cost: number
  /** Running cost charged on every home game. */
  upkeep: number
  blurb: string
  seats?: number
  /** 0..1 — how comfortable the seats are. */
  comfort?: number
  /** Premium seats sell at a multiple of the ticket price. */
  premium?: boolean
  /** Fans a food stand can serve during one game. */
  serves?: number
  foodType?: FoodType
  /** Multiplier on what each served fan spends. */
  spend?: number
  /** Fans a restroom block can handle per game. */
  restroom?: number
  /** Shoppers a store can serve per game. */
  merch?: number
  /** Cars that fit in the lot. */
  cars?: number
  fun?: number
  beauty?: number
  researchRequired?: string
}

export const CATEGORY_LABELS: Record<BuildingCategory, string> = {
  seating: 'Seating',
  food: 'Food & shops',
  fun: 'Fan experience',
  team: 'Team facilities',
  scenery: 'Scenery',
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  bleachers: {
    id: 'bleachers', label: 'Bleachers', category: 'seating', cost: 4_500, upkeep: 60,
    blurb: '120 cheap bench seats', seats: 120, comfort: 0.35,
  },
  grandstand: {
    id: 'grandstand', label: 'Grandstand', category: 'seating', cost: 9_000, upkeep: 110,
    blurb: '100 comfortable seats', seats: 100, comfort: 0.8,
  },
  luxury_boxes: {
    id: 'luxury_boxes', label: 'Luxury Boxes', category: 'seating', cost: 22_000, upkeep: 300,
    blurb: '40 seats at 5x the ticket price', seats: 40, comfort: 1, premium: true,
    researchRequired: 'premium_seating',
  },
  hotdog: {
    id: 'hotdog', label: 'Hot Dog Stand', category: 'food', cost: 3_000, upkeep: 120,
    blurb: 'Feeds 300 fans a game', serves: 300, foodType: 'hotdog', spend: 1,
  },
  drinks: {
    id: 'drinks', label: 'Lemonade Stand', category: 'food', cost: 2_500, upkeep: 100,
    blurb: 'Serves 300 fans, busy on hot days', serves: 300, foodType: 'drinks', spend: 0.8,
  },
  grill: {
    id: 'grill', label: 'Smokehouse Grill', category: 'food', cost: 9_000, upkeep: 260,
    blurb: 'Feeds 450 fans who spend more', serves: 450, foodType: 'grill', spend: 1.6,
    researchRequired: 'concessions_plus',
  },
  restroom: {
    id: 'restroom', label: 'Restrooms', category: 'food', cost: 2_000, upkeep: 60,
    blurb: 'Enough for 450 fans', restroom: 450,
  },
  team_store: {
    id: 'team_store', label: 'Team Store', category: 'food', cost: 8_000, upkeep: 150,
    blurb: 'Sells caps and jerseys', merch: 300,
  },
  parking: {
    id: 'parking', label: 'Parking Lot', category: 'food', cost: 4_000, upkeep: 30,
    blurb: '150 cars, room for more fans', cars: 150,
  },
  scoreboard: {
    id: 'scoreboard', label: 'Video Board', category: 'fun', cost: 16_000, upkeep: 200,
    blurb: 'Replays and big entertainment', fun: 30,
  },
  kids_zone: {
    id: 'kids_zone', label: 'Kids Corner', category: 'fun', cost: 7_000, upkeep: 120,
    blurb: 'Brings families to the park', fun: 18,
  },
  lights: {
    id: 'lights', label: 'Light Towers', category: 'fun', cost: 10_000, upkeep: 180,
    blurb: 'Night games fill weekday seats', fun: 4,
    researchRequired: 'night_games',
  },
  batting_cage: {
    id: 'batting_cage', label: 'Batting Cage', category: 'team', cost: 8_000, upkeep: 100,
    blurb: 'Hitters improve faster',
  },
  bullpen: {
    id: 'bullpen', label: 'Bullpen', category: 'team', cost: 8_000, upkeep: 100,
    blurb: 'Pitchers improve faster',
  },
  clubhouse: {
    id: 'clubhouse', label: 'Clubhouse', category: 'team', cost: 15_000, upkeep: 200,
    blurb: 'The whole roster improves faster',
    researchRequired: 'player_dev',
  },
  tree: {
    id: 'tree', label: 'Shade Tree', category: 'scenery', cost: 250, upkeep: 0,
    blurb: 'A little beauty', beauty: 2,
  },
  fountain: {
    id: 'fountain', label: 'Fountain', category: 'scenery', cost: 2_500, upkeep: 20,
    blurb: 'A landmark fans love', beauty: 8, fun: 4,
  },
}

export const BUILDING_IDS: BuildingId[] = [
  'bleachers', 'grandstand', 'luxury_boxes',
  'hotdog', 'drinks', 'grill', 'restroom', 'team_store', 'parking',
  'scoreboard', 'kids_zone', 'lights',
  'batting_cage', 'bullpen', 'clubhouse',
  'tree', 'fountain',
]

export function isBuildingId(id: string | undefined): id is BuildingId {
  return id !== undefined && Object.prototype.hasOwnProperty.call(BUILDINGS, id)
}

export function formatMoney(amount: number): string {
  const rounded = Math.round(amount)
  return rounded < 0 ? `-$${Math.abs(rounded).toLocaleString('en-US')}` : `$${rounded.toLocaleString('en-US')}`
}

export function isBuildingUnlocked(id: BuildingId, unlockedResearch: string[]): boolean {
  const def = BUILDINGS[id]
  if (!def.researchRequired) return true
  return unlockedResearch.includes(def.researchRequired)
}
