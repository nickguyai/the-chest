import { Router, Request, Response, NextFunction } from 'express'
import { userService } from '../../services/userService'

const router = Router()
const DEFAULT_USER_ID = 1

router.get('/settings', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await userService.getSettings(DEFAULT_USER_ID)
    res.json(settings)
  } catch (error) {
    next(error)
  }
})

router.put('/settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await userService.updateSettings(DEFAULT_USER_ID, req.body)
    res.json(settings)
  } catch (error) {
    next(error)
  }
})

export default router
