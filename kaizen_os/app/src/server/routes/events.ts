import { Router, Request, Response, NextFunction } from 'express'
import { eventService } from '../../services/eventService'

const router = Router()

// For MVP, use a fixed user ID
const DEFAULT_USER_ID = 1

// v4 EventType values
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

// Helper to create API errors
function createError(statusCode: number, code: string, message: string) {
  const error = new Error(message) as Error & { statusCode: number; code: string }
  error.statusCode = statusCode
  error.code = code
  return error
}

// Helper to serialize Event (BigInt id to string)
function serializeEvent(event: { id: bigint; [key: string]: unknown }) {
  return {
    ...event,
    id: event.id.toString(),
  }
}

function serializeEvents(events: Array<{ id: bigint; [key: string]: unknown }>) {
  return events.map(serializeEvent)
}

// GET /api/events/conditions - Get all theme condition scores
router.get('/conditions', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const conditions = await eventService.getAllThemeConditions(DEFAULT_USER_ID)
    // Convert Map to object for JSON serialization
    const result: Record<number, { conditionScore: number; lastActivity: string | null }> = {}
    conditions.forEach((value, key) => {
      result[key] = {
        conditionScore: value.conditionScore,
        lastActivity: value.lastActivity?.toISOString() || null,
      }
    })
    res.json(result)
  } catch (error) {
    next(error)
  }
})

// GET /api/events/theme-hours - Get actual hours for all themes
router.get('/theme-hours', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const seasonId = req.query.seasonId ? parseInt(req.query.seasonId as string, 10) : undefined
    const hoursMap = await eventService.getAllThemeHours(DEFAULT_USER_ID, seasonId)
    // Convert Map to object for JSON serialization
    const result: Record<number, number> = {}
    hoursMap.forEach((value, key) => {
      result[key] = value
    })
    res.json(result)
  } catch (error) {
    next(error)
  }
})

// GET /api/events/theme-hours/:themeId - Get actual hours for a specific theme
router.get('/theme-hours/:themeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const themeId = parseInt(req.params.themeId, 10)
    if (isNaN(themeId)) {
      throw createError(400, 'INVALID_ID', 'Invalid theme ID')
    }
    const seasonId = req.query.seasonId ? parseInt(req.query.seasonId as string, 10) : undefined
    const hours = await eventService.getThemeActualHours(themeId, DEFAULT_USER_ID, seasonId)
    res.json({ themeId, actualHours: hours })
  } catch (error) {
    next(error)
  }
})

// GET /api/events/conditions/:themeId - Get condition score for a specific theme
router.get('/conditions/:themeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const themeId = parseInt(req.params.themeId, 10)
    if (isNaN(themeId)) {
      throw createError(400, 'INVALID_ID', 'Invalid theme ID')
    }
    const condition = await eventService.getThemeCondition(themeId, DEFAULT_USER_ID)
    res.json({
      themeId,
      conditionScore: condition.conditionScore,
      lastActivity: condition.lastActivity?.toISOString() || null,
    })
  } catch (error) {
    next(error)
  }
})

// POST /api/events/time - Log time spent (v4 API)
router.post('/time', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardId, minutes, date } = req.body
    
    if (!cardId || typeof minutes !== 'number') {
      throw createError(400, 'VALIDATION_ERROR', 'cardId and minutes are required')
    }
    
    if (minutes <= 0) {
      throw createError(400, 'VALIDATION_ERROR', 'minutes must be positive')
    }

    const event = await eventService.logTime(DEFAULT_USER_ID, cardId, minutes, date)
    res.status(201).json(serializeEvent(event))
  } catch (error) {
    next(error)
  }
})

// POST /api/events/criteria-grade - Grade criteria for an action (v4 API - season grading)
router.post('/criteria-grade', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardId, gradingType, results, notes } = req.body
    
    if (!cardId || !gradingType || !Array.isArray(results)) {
      throw createError(400, 'VALIDATION_ERROR', 'cardId, gradingType, and results array are required')
    }

    if (!['mid_season', 'end_season'].includes(gradingType)) {
      throw createError(400, 'VALIDATION_ERROR', 'gradingType must be "mid_season" or "end_season"')
    }

    const event = await eventService.gradeSeasonCriteria(DEFAULT_USER_ID, cardId, gradingType, results, notes)
    res.status(201).json(serializeEvent(event))
  } catch (error) {
    next(error)
  }
})

// POST /api/events/veto-violated - Log veto violation (v4 API)
router.post('/veto-violated', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { vetoId, reason } = req.body
    
    if (!vetoId) {
      throw createError(400, 'VALIDATION_ERROR', 'vetoId is required')
    }

    const event = await eventService.logVetoViolation(DEFAULT_USER_ID, vetoId, reason)
    res.status(201).json(serializeEvent(event))
  } catch (error) {
    next(error)
  }
})

// POST /api/events/gate-started - Log gate started (v4 API)
router.post('/gate-started', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardId } = req.body
    if (!cardId) throw createError(400, 'VALIDATION_ERROR', 'cardId is required')
    const event = await eventService.logGateStarted(DEFAULT_USER_ID, cardId)
    res.status(201).json(serializeEvent(event))
  } catch (error) {
    next(error)
  }
})

// POST /api/events/gate-completed - Log gate completed (v4 API)
router.post('/gate-completed', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardId } = req.body
    if (!cardId) throw createError(400, 'VALIDATION_ERROR', 'cardId is required')
    const event = await eventService.logGateCompleted(DEFAULT_USER_ID, cardId)
    res.status(201).json(serializeEvent(event))
  } catch (error) {
    next(error)
  }
})

// POST /api/events/experiment-started - Log experiment started (v4 API)
router.post('/experiment-started', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardId } = req.body
    if (!cardId) throw createError(400, 'VALIDATION_ERROR', 'cardId is required')
    const event = await eventService.logExperimentStarted(DEFAULT_USER_ID, cardId)
    res.status(201).json(serializeEvent(event))
  } catch (error) {
    next(error)
  }
})

// POST /api/events/experiment-completed - Log experiment completed (v4 API)
router.post('/experiment-completed', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardId } = req.body
    if (!cardId) throw createError(400, 'VALIDATION_ERROR', 'cardId is required')
    const event = await eventService.logExperimentCompleted(DEFAULT_USER_ID, cardId)
    res.status(201).json(serializeEvent(event))
  } catch (error) {
    next(error)
  }
})

// POST /api/events/routine-started - Log routine started (v4 API)
router.post('/routine-started', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardId } = req.body
    if (!cardId) throw createError(400, 'VALIDATION_ERROR', 'cardId is required')
    const event = await eventService.logRoutineStarted(DEFAULT_USER_ID, cardId)
    res.status(201).json(serializeEvent(event))
  } catch (error) {
    next(error)
  }
})

// POST /api/events/ops-started - Log ops started (v4 API)
router.post('/ops-started', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardId } = req.body
    if (!cardId) throw createError(400, 'VALIDATION_ERROR', 'cardId is required')
    const event = await eventService.logOpsStarted(DEFAULT_USER_ID, cardId)
    res.status(201).json(serializeEvent(event))
  } catch (error) {
    next(error)
  }
})

// POST /api/events/ops-completed - Log ops completed (v4 API)
router.post('/ops-completed', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardId } = req.body
    if (!cardId) throw createError(400, 'VALIDATION_ERROR', 'cardId is required')
    const event = await eventService.logOpsCompleted(DEFAULT_USER_ID, cardId)
    res.status(201).json(serializeEvent(event))
  } catch (error) {
    next(error)
  }
})

// GET /api/events - List events with optional filters
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardId, type, start, end, limit } = req.query

    // Filter by card ID
    if (cardId) {
      const id = parseInt(cardId as string, 10)
      if (isNaN(id)) {
        throw createError(400, 'INVALID_ID', 'Invalid card ID')
      }
      const events = await eventService.getByCard(id, DEFAULT_USER_ID)
      return res.json(serializeEvents(events))
    }

    // Filter by event type
    if (type) {
      const events = await eventService.getByType(DEFAULT_USER_ID, type as EventType)
      return res.json(serializeEvents(events))
    }

    // Filter by time range
    if (start && end) {
      const startDate = new Date(start as string)
      const endDate = new Date(end as string)
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw createError(400, 'INVALID_DATE', 'Invalid date format')
      }
      const events = await eventService.getByTimeRange(DEFAULT_USER_ID, startDate, endDate)
      return res.json(serializeEvents(events))
    }

    // Default: return recent events
    const eventLimit = limit ? parseInt(limit as string, 10) : 50
    const events = await eventService.getRecent(DEFAULT_USER_ID, eventLimit)
    res.json(serializeEvents(events))
  } catch (error) {
    next(error)
  }
})

// POST /api/events - Log a new event
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventType, cardId, payload, idempotencyKey } = req.body

    if (!eventType) {
      throw createError(400, 'VALIDATION_ERROR', 'Event type is required')
    }

    const event = await eventService.log({
      userId: DEFAULT_USER_ID,
      eventType: eventType as EventType,
      cardId: cardId ? parseInt(cardId, 10) : undefined,
      payload: payload || {},
      idempotencyKey,
    })

    res.status(201).json(serializeEvent(event))
  } catch (error) {
    next(error)
  }
})

// GET /api/events/:id - Get event by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = BigInt(req.params.id)
    const event = await eventService.getById(id, DEFAULT_USER_ID)
    
    if (!event) {
      throw createError(404, 'NOT_FOUND', 'Event not found')
    }

    res.json(serializeEvent(event))
  } catch (error) {
    if (error instanceof SyntaxError) {
      next(createError(400, 'INVALID_ID', 'Invalid event ID'))
    } else {
      next(error)
    }
  }
})

export default router
