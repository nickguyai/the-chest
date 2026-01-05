import { Router, Request, Response, NextFunction } from 'express'
import { UnitType, TaskStatus } from '@prisma/client'
import { catalog } from '../../services/catalog'
import { validateCreateCard, validateUpdateCard, formatValidationErrors } from '../../lib/validation'
import {
  Theme,
  ThemeWithStats,
  Action,
  Task,
  Veto,
} from '../../domain/entities'
import { actionTypeToUnitType, isActionUnitType } from '../../repositories/prisma/mappers'

const router = Router()

// For MVP, use a fixed user ID (would come from auth in production)
const DEFAULT_USER_ID = 1

// Helper to create API errors
function createError(statusCode: number, code: string, message: string, details?: Record<string, string[]>) {
  const error = new Error(message) as Error & { statusCode: number; code: string; details?: Record<string, string[]> }
  error.statusCode = statusCode
  error.code = code
  if (details) error.details = details
  return error
}

// =============================================================================
// CARD RESPONSE TYPES (unified API shape)
// =============================================================================

interface CardResponse {
  id: number
  userId: number
  parentId: number | null
  title: string
  description: string | null
  unitType: UnitType
  status: TaskStatus
  targetDate: Date | null
  completionDate: Date | null
  startDate: Date | null
  seasonId: number | null
  lagWeeks: number | null
  criteria: string[]
  tags: Record<string, string>
  createdAt: Date
  updatedAt: Date
  // Optional computed fields
  actionCount?: number
  children?: CardResponse[]
}

// =============================================================================
// MAPPERS: Domain entities -> Card API response
// =============================================================================

function themeToCard(theme: Theme | ThemeWithStats): CardResponse {
  return {
    id: theme.id,
    userId: theme.userId,
    parentId: null,
    title: theme.title,
    description: theme.description,
    unitType: 'THEME',
    status: 'not_started',
    targetDate: null,
    completionDate: null,
    startDate: null,
    seasonId: null,
    lagWeeks: null,
    criteria: [],
    tags: {},
    createdAt: theme.createdAt,
    updatedAt: theme.updatedAt,
    actionCount: 'activeActionCount' in theme ? theme.activeActionCount : undefined,
  }
}

function actionToCard(action: Action): CardResponse {
  const unitType = actionTypeToUnitType(action.actionType)
  return {
    id: action.id,
    userId: action.userId,
    parentId: action.parentId,
    title: action.title,
    description: action.description,
    unitType,
    status: action.status as TaskStatus,
    targetDate: 'targetDate' in action ? action.targetDate : null,
    completionDate: 'completionDate' in action ? action.completionDate : null,
    startDate: action.startDate,
    seasonId: action.seasonId,
    lagWeeks: action.actionType === 'experiment' ? action.lagWeeks : null,
    criteria: 'criteria' in action ? action.criteria : [],
    tags: {},
    createdAt: action.createdAt,
    updatedAt: action.updatedAt,
  }
}

function taskToCard(task: Task): CardResponse {
  return {
    id: task.id,
    userId: task.userId,
    parentId: task.actionId,
    title: task.title,
    description: task.description,
    unitType: 'TASK',
    status: task.status as TaskStatus,
    targetDate: task.targetDate,
    completionDate: task.completionDate,
    startDate: null,
    seasonId: null,
    lagWeeks: null,
    criteria: [],
    tags: {},
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

function vetoToCard(veto: Veto): CardResponse {
  return {
    id: veto.id,
    userId: veto.userId,
    parentId: null,
    title: veto.title,
    description: veto.description,
    unitType: 'VETO',
    status: 'not_started',
    targetDate: null,
    completionDate: null,
    startDate: null,
    seasonId: null,
    lagWeeks: null,
    criteria: [],
    tags: {},
    createdAt: veto.createdAt,
    updatedAt: veto.updatedAt,
  }
}

// =============================================================================
// ROUTES
// =============================================================================

// GET /api/cards - List cards (with optional type filter)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type } = req.query
    
    if (type) {
      const unitType = type as UnitType
      let cards: CardResponse[]
      
      if (unitType === 'THEME') {
        const themes = await catalog.themes.findAll(DEFAULT_USER_ID)
        cards = themes.map(themeToCard)
      } else if (isActionUnitType(unitType)) {
        const actions = await catalog.actions.findAll(DEFAULT_USER_ID)
        cards = actions
          .filter(a => actionTypeToUnitType(a.actionType) === unitType)
          .map(actionToCard)
      } else if (unitType === 'TASK') {
        // Tasks require a parent - return empty for now
        cards = []
      } else if (unitType === 'VETO') {
        const vetoes = await catalog.vetoes.findAll(DEFAULT_USER_ID)
        cards = vetoes.map(vetoToCard)
      } else {
        cards = []
      }
      
      return res.json(cards)
    }

    // Return themes with stats by default
    const themes = await catalog.themes.findAllWithStats(DEFAULT_USER_ID)
    res.json(themes.map(themeToCard))
  } catch (error) {
    next(error)
  }
})

// GET /api/cards/vetoes - Get global vetoes (Don't-Do List)
router.get('/vetoes', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const vetoes = await catalog.vetoes.findAll(DEFAULT_USER_ID)
    res.json(vetoes.map(vetoToCard))
  } catch (error) {
    next(error)
  }
})

// GET /api/cards/active-actions - Get active actions with parent theme info
router.get('/active-actions', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const actions = await catalog.actions.findActive(DEFAULT_USER_ID)
    
    // Fetch parent theme info for each action
    const actionsWithTheme = await Promise.all(
      actions.map(async (action) => {
        const card = actionToCard(action)
        if (action.parentId) {
          const parent = await catalog.themes.findById(DEFAULT_USER_ID, action.parentId)
          return {
            ...card,
            parentTheme: parent ? { id: parent.id, title: parent.title } : null,
          }
        }
        return { ...card, parentTheme: null }
      })
    )
    
    res.json(actionsWithTheme)
  } catch (error) {
    next(error)
  }
})

// GET /api/cards/themes/:id/backlog - Get backlog items for a theme
router.get('/themes/:id/backlog', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      throw createError(400, 'INVALID_ID', 'Invalid theme ID')
    }

    const actions = await catalog.actions.findBacklog(DEFAULT_USER_ID, id)
    res.json(actions.map(actionToCard))
  } catch (error) {
    next(error)
  }
})


// GET /api/cards/:id - Get card by ID (dispatches based on unitType lookup)
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      throw createError(400, 'INVALID_ID', 'Invalid card ID')
    }

    // Try each repository in order: theme -> action -> task -> veto
    const theme = await catalog.themes.findByIdWithChildren(DEFAULT_USER_ID, id)
    if (theme) {
      const card = themeToCard(theme)
      card.children = theme.children.map(actionToCard)
      return res.json(card)
    }

    const actionWithChildren = await catalog.actions.findByIdWithChildren(DEFAULT_USER_ID, id)
    if (actionWithChildren) {
      const card = actionToCard(actionWithChildren.action)
      card.children = actionWithChildren.children.map(taskToCard)
      return res.json(card)
    }

    const task = await catalog.tasks.findById(DEFAULT_USER_ID, id)
    if (task) {
      return res.json(taskToCard(task))
    }

    const veto = await catalog.vetoes.findById(DEFAULT_USER_ID, id)
    if (veto) {
      return res.json(vetoToCard(veto))
    }

    throw createError(404, 'NOT_FOUND', 'Card not found')
  } catch (error) {
    next(error)
  }
})

// GET /api/cards/:id/children - Get children of a card
router.get('/:id/children', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      throw createError(400, 'INVALID_ID', 'Invalid card ID')
    }

    const { type, status } = req.query

    // Check if it's a theme (children are actions)
    const theme = await catalog.themes.findById(DEFAULT_USER_ID, id)
    if (theme) {
      if (type && isActionUnitType(type as UnitType)) {
        // Filter by action type
        const actionType = unitTypeToActionType(type as UnitType)
        if (actionType) {
          const actions = await catalog.actions.findByParentAndType(DEFAULT_USER_ID, id, actionType)
          return res.json(actions.map(actionToCard))
        }
      }
      const actions = await catalog.actions.findByParent(DEFAULT_USER_ID, id)
      return res.json(actions.map(actionToCard))
    }

    // Check if it's an action (children are tasks)
    const action = await catalog.actions.findById(DEFAULT_USER_ID, id)
    if (action) {
      if (status) {
        const tasks = await catalog.actions.findChildrenByStatus(DEFAULT_USER_ID, id, status as TaskStatus)
        return res.json(tasks.map(taskToCard))
      }
      const tasks = await catalog.tasks.findByAction(DEFAULT_USER_ID, id)
      return res.json(tasks.map(taskToCard))
    }

    // Tasks and vetoes have no children
    throw createError(404, 'NOT_FOUND', 'Card not found or has no children')
  } catch (error) {
    next(error)
  }
})

// Helper to convert UnitType to actionType
function unitTypeToActionType(unitType: UnitType): Action['actionType'] | null {
  switch (unitType) {
    case 'ACTION_GATE': return 'gate'
    case 'ACTION_EXPERIMENT': return 'experiment'
    case 'ACTION_ROUTINE': return 'routine'
    case 'ACTION_OPS': return 'ops'
    default: return null
  }
}

// GET /api/cards/:id/hierarchy - Get hierarchy path
router.get('/:id/hierarchy', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      throw createError(400, 'INVALID_ID', 'Invalid card ID')
    }

    // Try each repository to find the entity and get its hierarchy
    const theme = await catalog.themes.findById(DEFAULT_USER_ID, id)
    if (theme) {
      const hierarchy = await catalog.themes.getHierarchy(DEFAULT_USER_ID, id)
      return res.json(hierarchy.map(themeToCard))
    }

    const action = await catalog.actions.findById(DEFAULT_USER_ID, id)
    if (action) {
      const hierarchy = await catalog.actions.getHierarchy(DEFAULT_USER_ID, id)
      return res.json(hierarchy.map(item => {
        if ('actionType' in item) return actionToCard(item as Action)
        return themeToCard(item as Theme)
      }))
    }

    const task = await catalog.tasks.findById(DEFAULT_USER_ID, id)
    if (task) {
      const hierarchy = await catalog.tasks.getHierarchy(DEFAULT_USER_ID, id)
      return res.json(hierarchy.map(item => {
        if ('actionId' in item) return taskToCard(item as Task)
        if ('actionType' in item) return actionToCard(item as Action)
        return themeToCard(item as Theme)
      }))
    }

    const veto = await catalog.vetoes.findById(DEFAULT_USER_ID, id)
    if (veto) {
      return res.json([vetoToCard(veto)])
    }

    throw createError(404, 'NOT_FOUND', 'Card not found')
  } catch (error) {
    next(error)
  }
})


// POST /api/cards - Create new card
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = validateCreateCard(req.body)
    if (!validation.valid) {
      throw createError(400, 'VALIDATION_ERROR', 'Validation failed', formatValidationErrors(validation.errors))
    }

    const { unitType, title, description, parentId, status, targetDate, startDate, seasonId, lagWeeks, criteria } = req.body

    let card: CardResponse

    if (unitType === 'THEME') {
      const theme = await catalog.themes.create(DEFAULT_USER_ID, {
        title,
        description,
      })
      card = themeToCard(theme)
    } else if (isActionUnitType(unitType as UnitType)) {
      const actionType = unitTypeToActionType(unitType as UnitType)
      if (!actionType || !parentId) {
        throw createError(400, 'VALIDATION_ERROR', 'Actions require a parentId')
      }
      
      const baseInput = {
        parentId,
        title,
        description,
        status: status || 'not_started',
        startDate: startDate ? new Date(startDate) : undefined,
        seasonId,
      }

      let action: Action
      if (actionType === 'experiment') {
        action = await catalog.actions.create(DEFAULT_USER_ID, {
          ...baseInput,
          actionType: 'experiment',
          targetDate: targetDate ? new Date(targetDate) : undefined,
          lagWeeks: lagWeeks ?? 6,
          criteria: criteria || [],
        })
      } else if (actionType === 'gate') {
        action = await catalog.actions.create(DEFAULT_USER_ID, {
          ...baseInput,
          actionType: 'gate',
          targetDate: targetDate ? new Date(targetDate) : undefined,
          criteria: criteria || [],
        })
      } else if (actionType === 'routine') {
        action = await catalog.actions.create(DEFAULT_USER_ID, {
          ...baseInput,
          actionType: 'routine',
        })
      } else {
        action = await catalog.actions.create(DEFAULT_USER_ID, {
          ...baseInput,
          actionType: 'ops',
          targetDate: targetDate ? new Date(targetDate) : undefined,
        })
      }
      card = actionToCard(action)
    } else if (unitType === 'TASK') {
      if (!parentId) {
        throw createError(400, 'VALIDATION_ERROR', 'Tasks require a parentId (actionId)')
      }
      const task = await catalog.tasks.create(DEFAULT_USER_ID, {
        actionId: parentId,
        title,
        description,
        status: status || 'not_started',
        targetDate: targetDate ? new Date(targetDate) : undefined,
      })
      card = taskToCard(task)
    } else if (unitType === 'VETO') {
      const veto = await catalog.vetoes.create(DEFAULT_USER_ID, {
        title,
        description,
      })
      card = vetoToCard(veto)
    } else {
      throw createError(400, 'VALIDATION_ERROR', `Unknown unitType: ${unitType}`)
    }

    res.status(201).json(card)
  } catch (error) {
    if (error instanceof Error && error.message.includes('WIP limit')) {
      next(createError(400, 'WIP_LIMIT_REACHED', error.message))
    } else {
      next(error)
    }
  }
})

// PUT /api/cards/:id - Update card
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      throw createError(400, 'INVALID_ID', 'Invalid card ID')
    }

    const validation = validateUpdateCard(req.body)
    if (!validation.valid) {
      throw createError(400, 'VALIDATION_ERROR', 'Validation failed', formatValidationErrors(validation.errors))
    }

    const { title, description, status, targetDate, startDate, completionDate, seasonId, lagWeeks, criteria } = req.body

    // Try each repository to find and update
    const theme = await catalog.themes.findById(DEFAULT_USER_ID, id)
    if (theme) {
      const updated = await catalog.themes.update(DEFAULT_USER_ID, id, {
        title,
        description,
      })
      return res.json(themeToCard(updated))
    }

    const action = await catalog.actions.findById(DEFAULT_USER_ID, id)
    if (action) {
      const updated = await catalog.actions.update(DEFAULT_USER_ID, id, {
        title,
        description,
        status,
        startDate: startDate !== undefined ? (startDate ? new Date(startDate) : null) : undefined,
        targetDate: targetDate !== undefined ? (targetDate ? new Date(targetDate) : null) : undefined,
        completionDate: completionDate !== undefined ? (completionDate ? new Date(completionDate) : null) : undefined,
        seasonId,
        lagWeeks,
        criteria,
      })
      return res.json(actionToCard(updated))
    }

    const task = await catalog.tasks.findById(DEFAULT_USER_ID, id)
    if (task) {
      const updated = await catalog.tasks.update(DEFAULT_USER_ID, id, {
        title,
        description,
        status,
        targetDate: targetDate !== undefined ? (targetDate ? new Date(targetDate) : null) : undefined,
        completionDate: completionDate !== undefined ? (completionDate ? new Date(completionDate) : null) : undefined,
      })
      return res.json(taskToCard(updated))
    }

    const veto = await catalog.vetoes.findById(DEFAULT_USER_ID, id)
    if (veto) {
      const updated = await catalog.vetoes.update(DEFAULT_USER_ID, id, {
        title,
        description,
      })
      return res.json(vetoToCard(updated))
    }

    throw createError(404, 'NOT_FOUND', 'Card not found')
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        next(createError(404, 'NOT_FOUND', 'Card not found'))
      } else if (error.message.includes('WIP limit')) {
        next(createError(400, 'WIP_LIMIT_REACHED', error.message))
      } else {
        next(error)
      }
    } else {
      next(error)
    }
  }
})

// DELETE /api/cards/:id - Delete card
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      throw createError(400, 'INVALID_ID', 'Invalid card ID')
    }

    // Try each repository to find and delete
    const theme = await catalog.themes.findById(DEFAULT_USER_ID, id)
    if (theme) {
      await catalog.themes.delete(DEFAULT_USER_ID, id)
      return res.status(204).send()
    }

    const action = await catalog.actions.findById(DEFAULT_USER_ID, id)
    if (action) {
      await catalog.actions.delete(DEFAULT_USER_ID, id)
      return res.status(204).send()
    }

    const task = await catalog.tasks.findById(DEFAULT_USER_ID, id)
    if (task) {
      await catalog.tasks.delete(DEFAULT_USER_ID, id)
      return res.status(204).send()
    }

    const veto = await catalog.vetoes.findById(DEFAULT_USER_ID, id)
    if (veto) {
      await catalog.vetoes.delete(DEFAULT_USER_ID, id)
      return res.status(204).send()
    }

    throw createError(404, 'NOT_FOUND', 'Card not found')
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        next(createError(404, 'NOT_FOUND', 'Card not found'))
      } else if (error.message.includes('with children')) {
        next(createError(400, 'HAS_CHILDREN', 'Cannot delete card with children'))
      } else {
        next(error)
      }
    } else {
      next(error)
    }
  }
})

export default router
