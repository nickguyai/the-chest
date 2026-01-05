import { Router, Request, Response } from 'express'
import prisma from '../../lib/db'

const router = Router()
const DEFAULT_USER_ID = 1

// Get all allocations for a season
router.get('/season/:seasonId', async (req: Request, res: Response) => {
  try {
    const seasonId = parseInt(req.params.seasonId, 10)
    const season = await prisma.season.findFirst({
      where: { id: seasonId, userId: DEFAULT_USER_ID },
      select: { themeAllocations: true },
    })
    
    if (!season) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Season not found' } })
    }
    
    // Convert JSON to array format for API compatibility
    const allocations = season.themeAllocations as Record<string, number> || {}
    const result = Object.entries(allocations).map(([themeId, allocation]) => ({
      seasonId,
      themeId: parseInt(themeId, 10),
      allocation,
    }))
    
    res.json(result)
  } catch (error) {
    console.error('Failed to get allocations:', error)
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get allocations' } })
  }
})

// Get allocation for a specific theme in a season
router.get('/season/:seasonId/theme/:themeId', async (req: Request, res: Response) => {
  try {
    const seasonId = parseInt(req.params.seasonId, 10)
    const themeId = parseInt(req.params.themeId, 10)
    
    const season = await prisma.season.findFirst({
      where: { id: seasonId, userId: DEFAULT_USER_ID },
      select: { themeAllocations: true },
    })
    
    if (!season) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Season not found' } })
    }
    
    const allocations = season.themeAllocations as Record<string, number> || {}
    const allocation = allocations[themeId.toString()] ?? 0
    
    res.json({ seasonId, themeId, allocation })
  } catch (error) {
    console.error('Failed to get allocation:', error)
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get allocation' } })
  }
})

// Set/update allocation for a theme in a season
router.put('/season/:seasonId/theme/:themeId', async (req: Request, res: Response) => {
  try {
    const seasonId = parseInt(req.params.seasonId, 10)
    const themeId = parseInt(req.params.themeId, 10)
    const { allocation } = req.body
    
    if (typeof allocation !== 'number' || allocation < 0 || allocation > 1) {
      return res.status(400).json({ 
        error: { code: 'VALIDATION_ERROR', message: 'Allocation must be a number between 0 and 1' } 
      })
    }

    const season = await prisma.season.findFirst({
      where: { id: seasonId, userId: DEFAULT_USER_ID },
    })
    
    if (!season) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Season not found' } })
    }

    const currentAllocations = season.themeAllocations as Record<string, number> || {}
    const updatedAllocations = {
      ...currentAllocations,
      [themeId.toString()]: allocation,
    }

    await prisma.season.update({
      where: { id: seasonId },
      data: { themeAllocations: updatedAllocations },
    })
    
    res.json({ seasonId, themeId, allocation })
  } catch (error) {
    console.error('Failed to update allocation:', error)
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update allocation' } })
  }
})

export default router
