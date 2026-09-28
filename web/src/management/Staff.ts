export type StaffRole =
  | 'janitor'
  | 'vendor'
  | 'usher'
  | 'groundskeeper'
  | 'mascot'
  | 'hitting_coach'
  | 'pitching_coach'

export interface StaffDef {
  role: StaffRole
  label: string
  hireCost: number
  /** Wage charged on every home game. */
  wage: number
  max: number
  description: string
}

export const STAFF_TYPES: StaffDef[] = [
  {
    role: 'janitor', label: 'Janitor', hireCost: 400, wage: 90, max: 12,
    description: 'Keeps the park clean for 700 more fans',
  },
  {
    role: 'vendor', label: 'Vendor', hireCost: 400, wage: 80, max: 6,
    description: 'Food stands serve 15% more fans',
  },
  {
    role: 'usher', label: 'Usher', hireCost: 300, wage: 70, max: 4,
    description: 'Fans find their seats and feel looked after',
  },
  {
    role: 'groundskeeper', label: 'Groundskeeper', hireCost: 500, wage: 100, max: 4,
    description: 'A prettier park and a better park rating',
  },
  {
    role: 'mascot', label: 'Mascot', hireCost: 1_500, wage: 150, max: 1,
    description: 'Hank the Haymaker keeps the crowd laughing',
  },
  {
    role: 'hitting_coach', label: 'Hitting Coach', hireCost: 3_000, wage: 300, max: 2,
    description: 'Hitters improve faster',
  },
  {
    role: 'pitching_coach', label: 'Pitching Coach', hireCost: 3_000, wage: 300, max: 2,
    description: 'Pitchers improve faster',
  },
]

export function isStaffRole(v: string | undefined): v is StaffRole {
  return STAFF_TYPES.some((s) => s.role === v)
}

export function getStaffDef(role: StaffRole): StaffDef {
  return STAFF_TYPES.find((s) => s.role === role) ?? STAFF_TYPES[0]
}

export function createStaff(): Record<StaffRole, number> {
  return {
    janitor: 0, vendor: 0, usher: 0, groundskeeper: 0, mascot: 0, hitting_coach: 0, pitching_coach: 0,
  }
}

export function getStaffWages(staff: Record<StaffRole, number>): number {
  return STAFF_TYPES.reduce((sum, def) => sum + staff[def.role] * def.wage, 0)
}
