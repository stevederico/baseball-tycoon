import type { GameState, FoodPrice, Weather } from '../core/GameState'
import { clamp } from '../core/rng'
import { BUILDINGS, type BuildingId } from '../world/facilities'
import type { MapStore } from '../world/Map'
import { INTEREST_PER_GAME } from './Finance'
import { getActiveCampaign } from './Marketing'
import { hasResearch } from './Research'
import { getStaffWages } from './Staff'

export interface ParkStats {
  seats: number
  premiumSeats: number
  /** Seat-weighted comfort, 0..1. */
  comfort: number
  foodCapacity: number
  foodTypes: number
  /** Capacity-weighted spend multiplier across the food stands. */
  foodSpend: number
  restroomCapacity: number
  merchCapacity: number
  parkingCars: number
  fun: number
  beauty: number
  upkeep: number
  facilityTypes: number
  facilityCount: number
  counts: Partial<Record<BuildingId, number>>
}

const statsCache = new WeakMap<MapStore, { version: number; stats: ParkStats }>()

export function getParkStats(map: MapStore): ParkStats {
  const cached = statsCache.get(map)
  if (cached && cached.version === map.version) return cached.stats

  const stats: ParkStats = {
    seats: 0, premiumSeats: 0, comfort: 0, foodCapacity: 0, foodTypes: 0, foodSpend: 1,
    restroomCapacity: 0, merchCapacity: 0, parkingCars: 0, fun: 0, beauty: 0, upkeep: 0,
    facilityTypes: 0, facilityCount: 0, counts: {},
  }
  let comfortSum = 0
  let spendSum = 0
  const foodTypes = new Set<string>()
  const funSeen = new Map<BuildingId, number>()

  for (const id of map.getAllFacilities().values()) {
    const def = BUILDINGS[id]
    stats.counts[id] = (stats.counts[id] ?? 0) + 1
    stats.facilityCount += 1
    stats.upkeep += def.upkeep
    if (def.seats) {
      stats.seats += def.seats
      comfortSum += def.seats * (def.comfort ?? 0)
      if (def.premium) stats.premiumSeats += def.seats
    }
    if (def.serves) {
      stats.foodCapacity += def.serves
      spendSum += def.serves * (def.spend ?? 1)
      if (def.foodType) foodTypes.add(def.foodType)
    }
    stats.restroomCapacity += def.restroom ?? 0
    stats.merchCapacity += def.merch ?? 0
    stats.parkingCars += def.cars ?? 0
    stats.beauty += def.beauty ?? 0
    if (def.fun) {
      // Repeats of the same attraction are worth half as much each time.
      const seen = funSeen.get(id) ?? 0
      stats.fun += def.fun / 2 ** seen
      funSeen.set(id, seen + 1)
    }
  }

  stats.comfort = stats.seats > 0 ? comfortSum / stats.seats : 0
  stats.foodSpend = stats.foodCapacity > 0 ? spendSum / stats.foodCapacity : 1
  stats.foodTypes = foodTypes.size
  stats.facilityTypes = Object.keys(stats.counts).length
  statsCache.set(map, { version: map.version, stats })
  return stats
}

/** 0..1 buzz around the club: season record blended with the last ten games. */
export function teamHype(season: GameState['season']): number {
  const games = season.wins + season.losses
  const overall = (season.wins + 3.5) / (games + 10)
  const recent = season.recentResults
  const recentWins = recent.filter(Boolean).length
  const form = (recentWins + 1.75) / (recent.length + 5)
  return overall * 0.5 + form * 0.5
}

export function computeRating(state: GameState): number {
  const stats = getParkStats(state.map)
  const rating =
    150 +
    state.park.fanHappiness * 3.5 +
    stats.facilityTypes * 22 +
    Math.min(stats.seats / 25, 240) +
    Math.min(stats.beauty * 2, 80) +
    Math.min(state.staff.groundskeeper * 15, 60)
  return Math.round(clamp(rating, 0, 999))
}

/** What fans think a seat is worth right now. */
export function fairTicketPrice(state: GameState): number {
  const stats = getParkStats(state.map)
  const hype = teamHype(state.season)
  return 4 + (state.park.rating / 100) * 0.8 + (hype - 0.5) * 6 + stats.comfort * 1.5
}

const WEEKDAY_FACTOR = [0.85, 0.85, 0.85, 0.85, 1.05, 1.3, 1.2]
const WEATHER_FACTOR: Record<Weather, number> = { sunny: 1.05, cloudy: 0.96, hot: 0.95, rain: 0.6 }

/** People the park can physically get to the gate: walk-ups plus parked cars. */
export function accessCapacity(stats: ParkStats): number {
  return 2_400 + Math.round(stats.parkingCars * 2.5)
}

export interface DemandContext {
  weekday: number
  weather: Weather
  night: boolean
  openingDay: boolean
}

/** Fans who want a ticket for this game, before seats or parking limit them. */
export function computeDemand(state: GameState, ctx: DemandContext, noise = 1): number {
  const stats = getParkStats(state.map)
  const base = 800 + state.park.rating * 2.4
  const team = 0.75 + 0.7 * teamHype(state.season)
  const happy = 0.55 + (0.9 * state.park.fanHappiness) / 100
  const price = clamp(1.75 - 0.9 * (state.park.ticketPrice / fairTicketPrice(state)), 0.08, 1.3)
  let day = WEEKDAY_FACTOR[ctx.weekday] ?? 1
  if (ctx.night) day = Math.max(day, 1.08)
  let extras = 1
  if (hasResearch(state.research.unlocked, 'season_tickets')) extras += 0.08
  if ((stats.counts.kids_zone ?? 0) > 0) extras += 0.06
  if ((stats.counts.scoreboard ?? 0) > 0) extras += 0.05
  const campaign = getActiveCampaign(state.marketing)
  if (campaign) extras += campaign.attendanceBoost
  if (ctx.openingDay) extras += 0.3
  return Math.max(0, Math.round(base * team * happy * price * day * WEATHER_FACTOR[ctx.weather] * extras * noise))
}

export interface AttendanceResult {
  demand: number
  attendance: number
  /** What held the crowd down, if anything. */
  limit: 'demand' | 'seats' | 'parking'
}

export function computeAttendance(state: GameState, ctx: DemandContext, noise = 1): AttendanceResult {
  const stats = getParkStats(state.map)
  const demand = computeDemand(state, ctx, noise)
  const access = accessCapacity(stats)
  const attendance = Math.min(demand, stats.seats, access)
  let limit: AttendanceResult['limit'] = 'demand'
  if (attendance < demand) limit = stats.seats <= access ? 'seats' : 'parking'
  return { demand, attendance, limit }
}

const FOOD_PRICE: Record<FoodPrice, { spend: number; appetite: number }> = {
  low: { spend: 4.5, appetite: 1.1 },
  fair: { spend: 6.5, appetite: 1 },
  high: { spend: 8.5, appetite: 0.75 },
}

export interface GameRevenue {
  tickets: number
  food: number
  merch: number
  parking: number
  /** Fans who wanted food, and those who actually got served. */
  hungry: number
  served: number
}

export function foodCapacity(state: GameState): number {
  const stats = getParkStats(state.map)
  return Math.round(stats.foodCapacity * (1 + 0.15 * state.staff.vendor))
}

export interface GamePrices {
  ticketPrice: number
  foodPrice: FoodPrice
}

/** Revenue for one game. Prices default to the current ones; a game day passes its locked-in prices. */
export function computeRevenue(
  state: GameState,
  attendance: number,
  weather: Weather,
  prices: GamePrices = state.park,
): GameRevenue {
  const stats = getParkStats(state.map)
  const seats = Math.max(1, stats.seats)
  const premiumFans = Math.round(attendance * (stats.premiumSeats / seats))
  const regularFans = attendance - premiumFans
  const tickets = Math.round(regularFans * prices.ticketPrice + premiumFans * prices.ticketPrice * 5)

  const menu = FOOD_PRICE[prices.foodPrice]
  const appetite = (weather === 'hot' ? 0.8 : 0.7) * menu.appetite
  const hungry = Math.round(attendance * appetite)
  const served = Math.min(hungry, foodCapacity(state))
  const gourmet = hasResearch(state.research.unlocked, 'concessions_plus') ? 1.15 : 1
  const food = Math.round(served * menu.spend * stats.foodSpend * gourmet)

  const shoppers = Math.min(Math.round(attendance * 0.1 * (0.6 + teamHype(state.season))), stats.merchCapacity)
  const merch = shoppers * 16

  const cars = Math.min(Math.round(attendance / 2.6), stats.parkingCars)
  const parking = cars * 5

  return { tickets, food, merch, parking, hungry, served }
}

export interface GameCosts {
  upkeep: number
  staff: number
  payroll: number
  /** Gate staff, power and cleanup: a fixed cost plus a little per fan. */
  operations: number
  /** Buses and hotels on the road. */
  travel: number
  interest: number
}

export const OPERATIONS_BASE = 2_500
export const OPERATIONS_PER_FAN = 2.5
export const TRAVEL_PER_GAME = 1_000

/** The bills for one game day. Wages and payroll are paid on home game days. */
export function computeCosts(state: GameState, home: boolean, attendance = 0): GameCosts {
  const stats = getParkStats(state.map)
  return {
    upkeep: home ? stats.upkeep : 0,
    staff: home ? getStaffWages(state.staff) : 0,
    payroll: home ? state.team.payrollPerGame : 0,
    operations: home ? Math.round(OPERATIONS_BASE + attendance * OPERATIONS_PER_FAN) : 0,
    travel: home ? 0 : TRAVEL_PER_GAME,
    interest: Math.round(state.park.debt * INTEREST_PER_GAME),
  }
}

export function totalCosts(costs: GameCosts): number {
  return costs.upkeep + costs.staff + costs.payroll + costs.operations + costs.travel + costs.interest
}
