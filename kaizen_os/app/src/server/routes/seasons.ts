import { Router, Request, Response, NextFunction } from 'express'
import { seasonService } from '../../services/seasonService'
import { eventService } from '../../services/eventService'
import { validateCreateSeason, formatValidationErrors } from '../../lib/validation'

const router = Router()

// For MVP, use a fixed user ID
const DEFAULT_USER_ID = 1

// Helper to create API errors
function createError(statusCode: number, code: string, message: string, details?: Record<string, string[]>) {
  const error = new Error(message) as Error & { statusCode: number; code: string; details?: Record<string, string[]> }
  error.statusCode = statusCode
  error.code = code
  if (details) error.details = details
  return error
}

// GET /api/seasons - List all seasons
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const seasons = await seasonService.getAll(DEFAULT_USER_ID)
    res.json(seasons)
  } catch (error) {
    next(error)
  }
})

// GET /api/seasons/active - Get active season
router.get('/active', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const season = await seasonService.getActive(DEFAULT_USER_ID)
    if (!season) {
      return res.json(null)
    }
    res.json(season)
  } catch (error) {
    next(error)
  }
})

// GET /api/seasons/:id - Get season by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      throw createError(400, 'INVALID_ID', 'Invalid season ID')
    }

    const season = await seasonService.getById(id, DEFAULT_USER_ID)
    if (!season) {
      throw createError(404, 'NOT_FOUND', 'Season not found')
    }

    res.json(season)
  } catch (error) {
    next(error)
  }
})

// POST /api/seasons - Create new season
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = validateCreateSeason(req.body)
    if (!validation.valid) {
      throw createError(400, 'VALIDATION_ERROR', 'Validation failed', formatValidationErrors(validation.errors))
    }

    const season = await seasonService.create({
      userId: DEFAULT_USER_ID,
      name: req.body.name,
      startDate: new Date(req.body.startDate),
      durationWeeks: parseInt(req.body.durationWeeks, 10),
      utilityRate: req.body.utilityRate ? parseFloat(req.body.utilityRate) : undefined,
    })

    res.status(201).json(season)
  } catch (error) {
    next(error)
  }
})

// PUT /api/seasons/:id/activate - Activate a season
router.put('/:id/activate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      throw createError(400, 'INVALID_ID', 'Invalid season ID')
    }

    const season = await seasonService.activate(id, DEFAULT_USER_ID)
    
    // Log season_started event
    await eventService.log({
      userId: DEFAULT_USER_ID,
      eventType: 'season_started',
      payload: { season_id: id, season_name: season.name },
    })
    
    res.json(season)
  } catch (error) {
    if (error instanceof Error && error.message === 'Season not found') {
      next(createError(404, 'NOT_FOUND', 'Season not found'))
    } else {
      next(error)
    }
  }
})

// PUT /api/seasons/:id/deactivate - Deactivate a season
router.put('/:id/deactivate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      throw createError(400, 'INVALID_ID', 'Invalid season ID')
    }

    const season = await seasonService.deactivate(id, DEFAULT_USER_ID)
    
    // Log season_ended event
    await eventService.log({
      userId: DEFAULT_USER_ID,
      eventType: 'season_ended',
      payload: { season_id: id, season_name: season.name },
    })
    
    res.json(season)
  } catch (error) {
    if (error instanceof Error && error.message === 'Season not found') {
      next(createError(404, 'NOT_FOUND', 'Season not found'))
    } else {
      next(error)
    }
  }
})

// PUT /api/seasons/:id - Update season
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      throw createError(400, 'INVALID_ID', 'Invalid season ID')
    }

    const season = await seasonService.update(id, DEFAULT_USER_ID, {
      name: req.body.name,
      startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
      durationWeeks: req.body.durationWeeks !== undefined ? Number(req.body.durationWeeks) : undefined,
      utilityRate: req.body.utilityRate !== undefined ? Number(req.body.utilityRate) : undefined,
      themeAllocations: req.body.themeAllocations,
    })

    res.json(season)
  } catch (error) {
    if (error instanceof Error && error.message === 'Season not found') {
      next(createError(404, 'NOT_FOUND', 'Season not found'))
    } else {
      next(error)
    }
  }
})

// DELETE /api/seasons/:id - Delete season
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      throw createError(400, 'INVALID_ID', 'Invalid season ID')
    }

    await seasonService.delete(id, DEFAULT_USER_ID)
    res.status(204).send()
  } catch (error) {
    if (error instanceof Error && error.message === 'Season not found') {
      next(createError(404, 'NOT_FOUND', 'Season not found'))
    } else {
      next(error)
    }
  }
})

export default router
