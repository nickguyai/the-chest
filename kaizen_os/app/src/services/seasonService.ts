import { PrismaClient, Season } from '@prisma/client'

const prisma = new PrismaClient()

export interface CreateSeasonInput {
  userId: number
  name: string
  startDate: Date
  durationWeeks: number
  utilityRate?: number
  themeAllocations?: Record<string, number>
}

export interface SeasonWithComputed extends Season {
  endDate: Date
  totalHours: number
}

export class SeasonService {
  /**
   * Compute end date and total hours for a season.
   * isActive is stored in database and NOT computed from dates.
   */
  private computeFields(season: Season): SeasonWithComputed {
    const endDate = new Date(season.startDate)
    endDate.setDate(endDate.getDate() + season.durationWeeks * 7)
    
    const totalHours = season.durationWeeks * season.utilityRate

    return {
      ...season,
      endDate,
      totalHours,
      // Keep stored isActive value - do NOT override with date computation
    }
  }

  /**
   * Create a new season
   */
  async create(data: CreateSeasonInput): Promise<SeasonWithComputed> {
    const season = await prisma.season.create({
      data: {
        userId: data.userId,
        name: data.name,
        startDate: data.startDate,
        durationWeeks: data.durationWeeks,
        utilityRate: data.utilityRate ?? 40.0,
        themeAllocations: data.themeAllocations ?? {},
        isActive: false,
      },
    })

    return this.computeFields(season)
  }

  /**
   * Get a season by ID
   */
  async getById(id: number, userId: number): Promise<SeasonWithComputed | null> {
    const season = await prisma.season.findFirst({
      where: {
        id,
        userId,
      },
    })

    return season ? this.computeFields(season) : null
  }

  /**
   * Get the active season for a user (season with isActive=true in database)
   */
  async getActive(userId: number): Promise<SeasonWithComputed | null> {
    const season = await prisma.season.findFirst({
      where: { userId, isActive: true },
    })

    return season ? this.computeFields(season) : null
  }

  /**
   * Activate a season (deactivates any previously active season)
   */
  async activate(id: number, userId: number): Promise<SeasonWithComputed> {
    // Verify ownership
    const season = await this.getById(id, userId)
    if (!season) {
      throw new Error('Season not found')
    }

    // Deactivate all other seasons for this user
    await prisma.season.updateMany({
      where: {
        userId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    })

    // Activate the requested season
    const updated = await prisma.season.update({
      where: { id },
      data: { isActive: true },
    })

    return this.computeFields(updated)
  }

  /**
   * Deactivate a season
   */
  async deactivate(id: number, userId: number): Promise<SeasonWithComputed> {
    // Verify ownership
    const season = await this.getById(id, userId)
    if (!season) {
      throw new Error('Season not found')
    }

    const updated = await prisma.season.update({
      where: { id },
      data: { isActive: false },
    })

    return this.computeFields(updated)
  }

  /**
   * Get all seasons for a user
   */
  async getAll(userId: number): Promise<SeasonWithComputed[]> {
    const seasons = await prisma.season.findMany({
      where: { userId },
      orderBy: { startDate: 'desc' },
    })

    return seasons.map(s => this.computeFields(s))
  }

  /**
   * Update a season
   */
  async update(
    id: number,
    userId: number,
    data: Partial<Omit<CreateSeasonInput, 'userId'>>
  ): Promise<SeasonWithComputed> {
    // Verify ownership
    const existing = await this.getById(id, userId)
    if (!existing) {
      throw new Error('Season not found')
    }

    const updated = await prisma.season.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.startDate !== undefined && { startDate: data.startDate }),
        ...(data.durationWeeks !== undefined && { durationWeeks: data.durationWeeks }),
        ...(data.utilityRate !== undefined && { utilityRate: data.utilityRate }),
        ...(data.themeAllocations !== undefined && { themeAllocations: data.themeAllocations }),
      },
    })

    return this.computeFields(updated)
  }

  /**
   * Delete a season
   */
  async delete(id: number, userId: number): Promise<void> {
    // Verify ownership
    const existing = await this.getById(id, userId)
    if (!existing) {
      throw new Error('Season not found')
    }

    await prisma.season.delete({
      where: { id },
    })
  }

  /**
   * Calculate theme budget based on season hours and allocation weight
   * Property 7: Season Budget Calculation
   * theme_budget = season_hours × weight
   */
  calculateThemeBudget(seasonHours: number, weight: number): number {
    return seasonHours * weight
  }
}

export const seasonService = new SeasonService()
