import { Prisma } from '@prisma/client'
import db from '../lib/db'

const prisma = db

// v4 EventType enum values from schema
type EventType = 
  | 'gate_started' | 'gate_completed' | 'gate_failed'
  | 'experiment_started' | 'experiment_completed' | 'experiment_failed' | 'experiment_pivoted'
  | 'criteria_graded'
  | 'routine_started' | 'routine_replaced'
  | 'ops_started' | 'ops_completed'
  | 'veto_added' | 'veto_violated'
  | 'time_logged'
  | 'week_planned'
  | 'season_started' | 'season_ended'

export interface LogEventInput {
  userId: number
  eventType: EventType
  cardId?: number
  payload?: Record<string, unknown>
  idempotencyKey?: string
}

export class EventService {
  /**
   * Log a new event
   */
  async log(data: LogEventInput) {
    // Check for idempotency
    if (data.idempotencyKey) {
      const existing = await prisma.event.findFirst({
        where: {
          userId: data.userId,
          idempotencyKey: data.idempotencyKey,
        },
      })

      if (existing) {
        return existing
      }
    }

    return prisma.event.create({
      data: {
        userId: data.userId,
        eventType: data.eventType,
        cardId: data.cardId,
        payload: (data.payload as Prisma.InputJsonValue) ?? {},
        idempotencyKey: data.idempotencyKey,
      },
    })
  }

  /**
   * Get events for a specific card
   */
  async getByCard(cardId: number, userId: number) {
    return prisma.event.findMany({
      where: {
        cardId,
        userId,
      },
      orderBy: {
        occurredAt: 'desc',
      },
    })
  }

  /**
   * Get events by type for a user
   */
  async getByType(userId: number, eventType: EventType) {
    return prisma.event.findMany({
      where: {
        userId,
        eventType,
      },
      orderBy: {
        occurredAt: 'desc',
      },
    })
  }

  /**
   * Get events within a time range
   */
  async getByTimeRange(userId: number, start: Date, end: Date) {
    return prisma.event.findMany({
      where: {
        userId,
        occurredAt: {
          gte: start,
          lte: end,
        },
      },
      orderBy: {
        occurredAt: 'desc',
      },
    })
  }

  /**
   * Get recent events for a user
   */
  async getRecent(userId: number, limit: number = 50) {
    return prisma.event.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    })
  }

  /**
   * Get event by ID
   */
  async getById(id: bigint, userId: number) {
    return prisma.event.findFirst({
      where: {
        id,
        userId,
      },
    })
  }

  /**
   * Calculate condition score for a theme using exponential decay (τ = 7 days)
   * Formula: 100 * SUM(minutes * e^(-days/7)) / SUM(60 * e^(-days/7))
   * This gives a score where 60 minutes/day = 100%
   */
  async getThemeCondition(themeId: number, userId: number): Promise<{ conditionScore: number; lastActivity: Date | null }> {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // Get all time_logged events for this theme and its children
    const descendants = await this.getThemeDescendants(themeId, userId)
    const cardIds = [themeId, ...descendants.map(d => d.id)]

    const events = await prisma.event.findMany({
      where: {
        userId,
        eventType: 'time_logged',
        cardId: { in: cardIds },
        occurredAt: { gte: thirtyDaysAgo },
      },
      orderBy: { occurredAt: 'desc' },
    })

    if (events.length === 0) {
      return { conditionScore: 0, lastActivity: null }
    }

    const now = new Date()
    const TAU = 7 // decay constant in days

    let weightedMinutes = 0
    let weightedBaseline = 0

    for (const event of events) {
      const payload = event.payload as { minutes?: number; date?: string }
      const minutes = payload.minutes || 0
      
      // Use event date from payload if available, otherwise use occurredAt
      const eventDate = payload.date ? new Date(payload.date) : event.occurredAt
      const daysSince = (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24)
      
      const decayFactor = Math.exp(-daysSince / TAU)
      weightedMinutes += minutes * decayFactor
      weightedBaseline += 60 * decayFactor // 60 minutes/day is the baseline
    }

    const conditionScore = weightedBaseline > 0 
      ? Math.min(100, Math.round(100 * weightedMinutes / weightedBaseline))
      : 0

    return {
      conditionScore,
      lastActivity: events[0]?.occurredAt || null,
    }
  }

  /**
   * Get all condition scores for all themes for a user (optimized batch query)
   */
  async getAllThemeConditions(userId: number): Promise<Map<number, { conditionScore: number; lastActivity: Date | null }>> {
    const themes = await prisma.card.findMany({
      where: { userId, unitType: 'THEME' },
      select: { id: true },
    })

    if (themes.length === 0) {
      return new Map()
    }

    const themeIds = themes.map((t: { id: number }) => t.id)
    
    // Get all descendants for all themes in one batch
    const descendantsMap = await this.getAllThemeDescendantsBatch(themeIds, userId)
    
    // Collect all card IDs we need events for
    const allCardIds = new Set<number>()
    for (const themeId of themeIds) {
      allCardIds.add(themeId)
      const descendants = descendantsMap.get(themeId) || []
      descendants.forEach(id => allCardIds.add(id))
    }

    // Get all time_logged events in one query
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const events = await prisma.event.findMany({
      where: {
        userId,
        eventType: 'time_logged',
        cardId: { in: Array.from(allCardIds) },
        occurredAt: { gte: thirtyDaysAgo },
      },
      orderBy: { occurredAt: 'desc' },
    })

    // Group events by card ID
    const eventsByCard = new Map<number, typeof events>()
    for (const event of events) {
      if (event.cardId) {
        const cardEvents = eventsByCard.get(event.cardId) || []
        cardEvents.push(event)
        eventsByCard.set(event.cardId, cardEvents)
      }
    }

    // Calculate condition for each theme
    const conditions = new Map<number, { conditionScore: number; lastActivity: Date | null }>()
    const now = new Date()
    const TAU = 7

    for (const themeId of themeIds) {
      const cardIds = [themeId, ...(descendantsMap.get(themeId) || [])]
      
      // Collect all events for this theme's cards
      const themeEvents: typeof events = []
      for (const cardId of cardIds) {
        const cardEvents = eventsByCard.get(cardId) || []
        themeEvents.push(...cardEvents)
      }

      if (themeEvents.length === 0) {
        conditions.set(themeId, { conditionScore: 0, lastActivity: null })
        continue
      }

      // Sort by date to get most recent
      themeEvents.sort((a: { occurredAt: Date }, b: { occurredAt: Date }) => b.occurredAt.getTime() - a.occurredAt.getTime())

      let weightedMinutes = 0
      let weightedBaseline = 0

      for (const event of themeEvents) {
        const payload = event.payload as { minutes?: number; date?: string }
        const minutes = payload.minutes || 0
        const eventDate = payload.date ? new Date(payload.date) : event.occurredAt
        const daysSince = (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24)
        const decayFactor = Math.exp(-daysSince / TAU)
        weightedMinutes += minutes * decayFactor
        weightedBaseline += 60 * decayFactor
      }

      const conditionScore = weightedBaseline > 0 
        ? Math.min(100, Math.round(100 * weightedMinutes / weightedBaseline))
        : 0

      conditions.set(themeId, {
        conditionScore,
        lastActivity: themeEvents[0]?.occurredAt || null,
      })
    }

    return conditions
  }

  /**
   * Get all descendant cards of a theme (gates, experiments, routines, ops, tasks, criteria)
   * Optimized: single recursive CTE query
   */
  private async getThemeDescendants(themeId: number, userId: number): Promise<{ id: number }[]> {
    // Use raw SQL with recursive CTE for efficiency
    const result = await prisma.$queryRaw<{ id: number }[]>`
      WITH RECURSIVE descendants AS (
        SELECT id FROM "Card" WHERE "parentId" = ${themeId} AND "userId" = ${userId}
        UNION ALL
        SELECT c.id FROM "Card" c
        INNER JOIN descendants d ON c."parentId" = d.id
        WHERE c."userId" = ${userId}
      )
      SELECT id FROM descendants
    `
    return result
  }

  /**
   * Get all descendant IDs for multiple themes at once (batch operation)
   */
  private async getAllThemeDescendantsBatch(themeIds: number[], userId: number): Promise<Map<number, number[]>> {
    if (themeIds.length === 0) return new Map()

    // Get all cards that could be descendants
    const allCards = await prisma.card.findMany({
      where: { userId },
      select: { id: true, parentId: true },
    })

    // Build parent->children map
    const childrenMap = new Map<number, number[]>()
    for (const card of allCards) {
      if (card.parentId) {
        const children = childrenMap.get(card.parentId) || []
        children.push(card.id)
        childrenMap.set(card.parentId, children)
      }
    }

    // For each theme, collect all descendants
    const result = new Map<number, number[]>()
    
    for (const themeId of themeIds) {
      const descendants: number[] = []
      const queue = [themeId]
      
      while (queue.length > 0) {
        const current = queue.shift()!
        const children = childrenMap.get(current) || []
        for (const childId of children) {
          descendants.push(childId)
          queue.push(childId)
        }
      }
      
      result.set(themeId, descendants)
    }

    return result
  }

  /**
   * Log time spent on a card (v4 API)
   */
  async logTime(userId: number, cardId: number, minutes: number, date?: string) {
    return this.log({
      userId,
      eventType: 'time_logged',
      cardId,
      payload: {
        minutes,
        date: date || new Date().toISOString().split('T')[0],
      },
    })
  }

  /**
   * Grade criteria for an action (season grading)
   * Creates an immutable event with the full grading snapshot
   */
  async gradeSeasonCriteria(
    userId: number,
    cardId: number,
    gradingType: 'mid_season' | 'end_season',
    results: { criterion: string; passed: boolean }[],
    notes?: string
  ) {
    const overallPassed = results.every(r => r.passed)
    
    return this.log({
      userId,
      eventType: 'criteria_graded',
      cardId,
      payload: {
        grading_type: gradingType,
        results,
        overall_passed: overallPassed,
        notes: notes || null,
      },
    })
  }

  /**
   * @deprecated Use gradeSeasonCriteria instead
   */
  async gradeCriteria(userId: number, criteriaId: number, passed: boolean) {
    console.warn('gradeCriteria is deprecated. Use gradeSeasonCriteria instead.')
    return this.log({
      userId,
      eventType: 'criteria_graded',
      cardId: criteriaId,
      payload: { passed },
    })
  }

  /**
   * Log veto violation
   */
  async logVetoViolation(userId: number, vetoId: number, reason?: string) {
    return this.log({
      userId,
      eventType: 'veto_violated',
      cardId: vetoId,
      payload: { reason },
    })
  }

  /**
   * Log gate lifecycle events
   */
  async logGateStarted(userId: number, cardId: number) {
    return this.log({ userId, eventType: 'gate_started', cardId, payload: {} })
  }

  async logGateCompleted(userId: number, cardId: number) {
    return this.log({ userId, eventType: 'gate_completed', cardId, payload: {} })
  }

  async logGateFailed(userId: number, cardId: number) {
    return this.log({ userId, eventType: 'gate_failed', cardId, payload: {} })
  }

  /**
   * Log experiment lifecycle events
   */
  async logExperimentStarted(userId: number, cardId: number) {
    return this.log({ userId, eventType: 'experiment_started', cardId, payload: {} })
  }

  async logExperimentCompleted(userId: number, cardId: number) {
    return this.log({ userId, eventType: 'experiment_completed', cardId, payload: {} })
  }

  async logExperimentFailed(userId: number, cardId: number) {
    return this.log({ userId, eventType: 'experiment_failed', cardId, payload: {} })
  }

  async logExperimentPivoted(userId: number, cardId: number) {
    return this.log({ userId, eventType: 'experiment_pivoted', cardId, payload: {} })
  }

  /**
   * Log routine lifecycle events
   */
  async logRoutineStarted(userId: number, cardId: number) {
    return this.log({ userId, eventType: 'routine_started', cardId, payload: {} })
  }

  async logRoutineReplaced(userId: number, cardId: number) {
    return this.log({ userId, eventType: 'routine_replaced', cardId, payload: {} })
  }

  /**
   * Log ops lifecycle events
   */
  async logOpsStarted(userId: number, cardId: number) {
    return this.log({ userId, eventType: 'ops_started', cardId, payload: {} })
  }

  async logOpsCompleted(userId: number, cardId: number) {
    return this.log({ userId, eventType: 'ops_completed', cardId, payload: {} })
  }

  /**
   * Get actual hours logged for a theme (Property 6: Time Aggregation)
   * Sum of time_logged events for theme and all descendant cards
   */
  async getThemeActualHours(themeId: number, userId: number, seasonId?: number): Promise<number> {
    let startDate: Date | undefined
    let endDate: Date | undefined

    if (seasonId) {
      const season = await prisma.season.findFirst({ where: { id: seasonId, userId } })
      if (season) {
        startDate = season.startDate
        endDate = new Date(season.startDate)
        endDate.setDate(endDate.getDate() + season.durationWeeks * 7)
      }
    }

    const result = await prisma.$queryRaw<any[]>`
      WITH RECURSIVE descendants AS (
        SELECT id FROM "cards" WHERE id = ${themeId} AND "user_id" = ${userId}
        UNION ALL
        SELECT c.id FROM "cards" c
        INNER JOIN descendants d ON c."parent_id" = d.id
        WHERE c."user_id" = ${userId}
      )
      SELECT COALESCE(SUM((payload->>'minutes')::float), 0) / 60.0 as hours
      FROM "events"
      WHERE "user_id" = ${userId}
        AND "event_type" = 'time_logged'
        AND "card_id" IN (SELECT id FROM descendants)
        ${startDate && endDate ? Prisma.raw(`AND "occurred_at" BETWEEN '${startDate.toISOString()}' AND '${endDate.toISOString()}'`) : Prisma.raw('')}
    `

    return Number(result[0]?.hours || 0)
  }

  /**
   * Get actual hours for all themes for a user (optimized batch query)
   */
  async getAllThemeHours(userId: number, seasonId?: number): Promise<Map<number, number>> {
    let startDate: Date | undefined
    let endDate: Date | undefined

    if (seasonId) {
      const season = await prisma.season.findFirst({ where: { id: seasonId, userId } })
      if (season) {
        startDate = season.startDate
        endDate = new Date(season.startDate)
        endDate.setDate(endDate.getDate() + season.durationWeeks * 7)
      }
    }

    const result = await prisma.$queryRaw<any[]>`
      WITH RECURSIVE descendants AS (
        -- Base case: all themes for the user
        SELECT id as theme_id, id as card_id
        FROM "cards"
        WHERE "user_id" = ${userId} AND "unit_type" = 'THEME'
        
        UNION ALL
        
        -- Recursive step: get children of cards already in descendants
        SELECT d.theme_id, c.id
        FROM "cards" c
        INNER JOIN descendants d ON c."parent_id" = d.card_id
        WHERE c."user_id" = ${userId}
      )
      SELECT 
        d.theme_id,
        COALESCE(SUM((e.payload->>'minutes')::float), 0) / 60.0 as actual_hours
      FROM descendants d
      LEFT JOIN "events" e ON d.card_id = e.card_id
      WHERE e."user_id" = ${userId}
        AND e."event_type" = 'time_logged'
        ${startDate && endDate ? Prisma.raw(`AND e."occurred_at" BETWEEN '${startDate.toISOString()}' AND '${endDate.toISOString()}'`) : Prisma.raw('')}
      GROUP BY d.theme_id
    `

    const hoursMap = new Map<number, number>()
    result.forEach((row: any) => {
      hoursMap.set(Number(row.theme_id), Number(row.actual_hours || 0))
    })

    // Ensure all themes are present in the map, even if they have 0 hours
    const themes = await prisma.card.findMany({
      where: { userId, unitType: 'THEME' },
      select: { id: true },
    })

    for (const theme of themes) {
      if (!hoursMap.has(theme.id)) {
        hoursMap.set(theme.id, 0)
      }
    }

    return hoursMap
  }
}

export const eventService = new EventService()
