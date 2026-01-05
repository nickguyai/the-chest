import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import express, { Request } from 'express'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { createAgentTools, ToolContext } from '../agentTools'
import { userService } from '../../services/userService'
import prisma from '../../lib/db'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load agent system prompt from markdown file
const PROMPT_PATH = path.join(__dirname, '../prompts/agent_system_prompt.md')
const DEFAULT_AGENT_SYSTEM_PROMPT = fs.readFileSync(PROMPT_PATH, 'utf-8')

const router = express.Router()
const DEFAULT_USER_ID = 1

// Extend Request to include user
interface AuthRequest extends Request {
  user?: { id: number }
}

// Type for mutation payload
interface MutationPayload {
  operation: 'create' | 'update' | 'delete'
  agentSessionId: string
  checkpointUuid?: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}

// Type for message content block
interface ContentBlock {
  type: string
  text?: string
}

router.post('/chat', async (req: AuthRequest, res) => {
  const { message, sessionId: clientSessionId } = req.body
  const userId = req.user?.id || DEFAULT_USER_ID

  if (!message) {
    return res.status(400).json({ error: 'Message is required' })
  }

  const settings = await userService.getSettings(userId)

  let agentSession = clientSessionId
    ? await prisma.agentSession.findUnique({ where: { id: clientSessionId } })
    : null

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  let claudeSessionId: string | undefined
  let checkpointUuid: string | undefined

  async function* messageGenerator(): AsyncGenerator<{ type: 'user'; message: { role: 'user'; content: string } }> {
    yield {
      type: 'user' as const,
      message: { role: 'user' as const, content: message },
    }
  }

  const toolContext: ToolContext = {
    userId,
    sessionId: agentSession?.id || 'pending',
    checkpointUuid: undefined,
    allowedTools: settings.agentAllowedTools.map(t => t.replace('mcp__kaizen-db__', '')),
  }

  const allowedTools = [
    ...settings.agentBuiltinTools,
    ...settings.agentAllowedTools,
  ]

  const disallowedTools = settings.agentAllowBash ? [] : ['Bash']

  try {
    const agentStream = query({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prompt: messageGenerator() as any,
      options: {
        resume: agentSession?.claudeSession,
        mcpServers: {
          'kaizen-db': createAgentTools(toolContext),
        },
        allowedTools,
        disallowedTools,
        permissionMode: settings.agentPermissionMode,
        ...(settings.agentPermissionMode === 'bypassPermissions' && {
          allowDangerouslySkipPermissions: true,
        }),
        systemPrompt: settings.agentSystemPrompt || DEFAULT_AGENT_SYSTEM_PROMPT,
      },
    })

    let userMessageSaved = false

    // Save user message for existing sessions immediately
    if (agentSession && !userMessageSaved) {
      await prisma.agentMessage.create({
        data: {
          sessionId: agentSession.id,
          role: 'user',
          content: message,
        },
      })
      userMessageSaved = true
    }

    for await (const msg of agentStream) {
      if (msg.type === 'system' && msg.subtype === 'init') {
        claudeSessionId = msg.session_id

        if (!agentSession && claudeSessionId) {
          agentSession = await prisma.agentSession.create({
            data: {
              claudeSession: claudeSessionId,
              userId,
              title: message,
            },
          })
          toolContext.sessionId = agentSession.id
          res.write(`data: ${JSON.stringify({ type: 'session', sessionId: agentSession.id })}\n\n`)
          
          // Save user message immediately after session creation (before any assistant response)
          if (!userMessageSaved) {
            await prisma.agentMessage.create({
              data: {
                sessionId: agentSession.id,
                role: 'user',
                content: message,
              },
            })
            userMessageSaved = true
          }
        }
      }

      if (msg.type === 'user' && msg.uuid) {
        checkpointUuid = msg.uuid
        toolContext.checkpointUuid = checkpointUuid
        res.write(`data: ${JSON.stringify({ type: 'checkpoint', uuid: checkpointUuid })}\n\n`)
      }

      res.write(`data: ${JSON.stringify(msg)}\n\n`)

      if (msg.type === 'assistant' && agentSession) {
        const content = msg.message.content as ContentBlock[]
        const textContent = content
          .filter((c) => c.type === 'text')
          .map((c) => c.text || '')
          .join('\n')

        if (textContent) {
          await prisma.agentMessage.create({
            data: {
              sessionId: agentSession.id,
              role: 'assistant',
              content: textContent,
              checkpointUuid,
            },
          })
        }
      }
    }

    res.write('data: [DONE]\n\n')
    res.end()
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Agent error:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: errorMessage })
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`)
      res.end()
    }
  }
})


router.post('/rollback', async (req: AuthRequest, res) => {
  const { sessionId, checkpointUuid } = req.body
  const userId = req.user?.id || DEFAULT_USER_ID

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' })
  }

  try {
    const mutations = await prisma.event.findMany({
      where: {
        userId,
        eventType: 'agent_mutation',
      },
      orderBy: { occurredAt: 'desc' },
    })

    const toRollback: typeof mutations = []
    let foundCheckpoint = false

    for (const mutation of mutations) {
      const payload = mutation.payload as unknown as MutationPayload
      if (payload.agentSessionId !== sessionId) continue

      if (checkpointUuid) {
        if (payload.checkpointUuid === checkpointUuid) {
          foundCheckpoint = true
          break
        }
      }

      toRollback.push(mutation)
    }

    const results: Array<{ id: number | null; operation: string; error?: string; preservedId?: boolean }> = []
    
    for (const mutation of toRollback) {
      const payload = mutation.payload as unknown as MutationPayload

      try {
        if (payload.operation === 'create') {
          await prisma.card.deleteMany({
            where: { id: mutation.cardId!, userId },
          })
          results.push({ id: mutation.cardId, operation: 'delete (undo create)' })
        } else if (payload.operation === 'update' && payload.before) {
          const before = payload.before as Record<string, unknown>
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id, createdAt, updatedAt, ...restoreData } = before
          await prisma.card.updateMany({
            where: { id: mutation.cardId!, userId },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: restoreData as any,
          })
          results.push({ id: mutation.cardId, operation: 'restore (undo update)' })
        } else if (payload.operation === 'delete' && payload.before) {
          const before = payload.before as Record<string, unknown>
          await prisma.$executeRaw`
            INSERT INTO cards (id, user_id, parent_id, title, description, target_date,
              completion_date, start_date, status, unit_type, season_id, lag_weeks,
              passed, evaluated_at, created_at, updated_at)
            VALUES (${before.id}, ${before.userId}, ${before.parentId}, ${before.title},
              ${before.description}, ${before.targetDate}, ${before.completionDate},
              ${before.startDate}, ${before.status}::"TaskStatus", ${before.unitType}::"UnitType",
              ${before.seasonId}, ${before.lagWeeks}, ${before.passed}, ${before.evaluatedAt},
              ${before.createdAt}, NOW())
            ON CONFLICT (id) DO NOTHING
          `
          results.push({ id: mutation.cardId, operation: 'recreate (undo delete)', preservedId: true })
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        results.push({ id: mutation.cardId, operation: payload.operation, error: errorMessage })
      }
    }

    res.json({
      rolledBack: toRollback.length,
      results,
      checkpointFound: checkpointUuid ? foundCheckpoint : null,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: errorMessage })
  }
})

router.get('/sessions', async (req: AuthRequest, res) => {
  const userId = req.user?.id || DEFAULT_USER_ID

  const sessions = await prisma.agentSession.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  })

  res.json(sessions)
})

router.get('/sessions/:sessionId/messages', async (req: AuthRequest, res) => {
  const userId = req.user?.id || DEFAULT_USER_ID
  const { sessionId } = req.params

  const session = await prisma.agentSession.findFirst({
    where: { id: sessionId, userId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!session) {
    return res.status(404).json({ error: 'Session not found' })
  }

  res.json(session)
})

router.delete('/sessions/:sessionId', async (req: AuthRequest, res) => {
  const userId = req.user?.id || DEFAULT_USER_ID
  const { sessionId } = req.params

  const session = await prisma.agentSession.findFirst({
    where: { id: sessionId, userId },
  })

  if (!session) {
    return res.status(404).json({ error: 'Session not found' })
  }

  await prisma.agentSession.delete({
    where: { id: sessionId },
  })

  res.status(204).send()
})

export default router
