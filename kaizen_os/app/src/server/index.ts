import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import cardsRouter from './routes/cards'
import seasonsRouter from './routes/seasons'
import eventsRouter from './routes/events'
import themeAllocationsRouter from './routes/themeAllocations'
import usersRouter from './routes/users'
import agentRouter from './routes/agent'
import calendarRouter from './routes/calendar'

const app = express()
const PORT = process.env.API_PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`)
  next()
})

// Routes
app.use('/api/cards', cardsRouter)
app.use('/api/seasons', seasonsRouter)
app.use('/api/events', eventsRouter)
app.use('/api/allocations', themeAllocationsRouter)
app.use('/api/users', usersRouter)
app.use('/api/agent', agentRouter)
app.use('/api/calendar', calendarRouter)

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Error handling middleware
interface ApiError extends Error {
  statusCode?: number
  code?: string
  details?: Record<string, string[]>
}

app.use((err: ApiError, _req: Request, res: Response, _next: NextFunction) => {
  // _next is required by Express error handler signature but not used
  void _next
  console.error('API Error:', err)

  const statusCode = err.statusCode || 500
  const code = err.code || 'INTERNAL_ERROR'
  const message = err.message || 'An unexpected error occurred'

  res.status(statusCode).json({
    error: {
      code,
      message,
      ...(err.details && { details: err.details }),
    },
  })
})

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`)
})

export default app
