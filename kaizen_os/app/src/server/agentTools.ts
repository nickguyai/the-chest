import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import prisma from '../lib/db'

// Context passed to each tool call
export interface ToolContext {
  userId: number
  sessionId: string
  checkpointUuid?: string
  allowedTools?: string[]
}

// Factory to create tools with context
export function createAgentTools(context: ToolContext) {
  const allTools = [
      // READ: List cards (no audit needed)
      tool(
        'list_cards',
        'List cards with optional filters',
        {
          unitType: z.enum(['THEME', 'ACTION_GATE', 'ACTION_EXPERIMENT', 'ACTION_ROUTINE', 'ACTION_OPS', 'TASK', 'VETO']).optional(),
          parentId: z.number().optional(),
          status: z.enum(['not_started', 'in_progress', 'completed', 'backlog']).optional(),
          limit: z.number().default(20),
        },
        async (args) => {
          const cards = await prisma.card.findMany({
            where: {
              userId: context.userId,
              ...(args.unitType && { unitType: args.unitType }),
              ...(args.parentId && { parentId: args.parentId }),
              ...(args.status && { status: args.status }),
            },
            take: args.limit,
            orderBy: { updatedAt: 'desc' },
          })
          return { content: [{ type: 'text' as const, text: JSON.stringify(cards, null, 2) }] }
        }
      ),

      // READ: Get single card with children
      tool(
        'get_card',
        'Get a card by ID with its children',
        { cardId: z.number() },
        async (args) => {
          const card = await prisma.card.findFirst({
            where: { id: args.cardId, userId: context.userId },
            include: { children: true },
          })
          if (!card) return { content: [{ type: 'text' as const, text: 'Card not found' }] }
          return { content: [{ type: 'text' as const, text: JSON.stringify(card, null, 2) }] }
        }
      ),

      // WRITE: Create card (audited)
      tool(
        'create_card',
        'Create a new card. For criteria, use the criteria array field on ACTION_* cards instead of creating separate CRITERIA cards.',
        {
          title: z.string(),
          unitType: z.enum(['THEME', 'ACTION_GATE', 'ACTION_EXPERIMENT', 'ACTION_ROUTINE', 'ACTION_OPS', 'TASK', 'VETO']),
          parentId: z.number().optional(),
          description: z.string().optional(),
          status: z.enum(['not_started', 'in_progress', 'completed', 'backlog']).default('not_started'),
          criteria: z.array(z.string()).optional().describe('Array of criterion strings for ACTION_* cards'),
        },
        async (args) => {
          const card = await prisma.card.create({
            data: {
              userId: context.userId,
              title: args.title,
              unitType: args.unitType,
              parentId: args.parentId,
              description: args.description,
              status: args.status,
              criteria: args.criteria || [],
            },
          })

          // Audit log for rollback capability
          await prisma.event.create({
            data: {
              userId: context.userId,
              eventType: 'agent_mutation',
              cardId: card.id,
              payload: {
                operation: 'create',
                after: card,
                agentSessionId: context.sessionId,
                checkpointUuid: context.checkpointUuid,
              },
            },
          })

          return { content: [{ type: 'text' as const, text: `Created card ${card.id}: ${card.title}` }] }
        }
      ),

      // WRITE: Update card (audited)
      tool(
        'update_card',
        "Update a card's properties. Use criteria array to set/update criteria for ACTION_* cards. Use parentId to move a card to a different parent (or null for root level).",
        {
          cardId: z.number(),
          title: z.string().optional(),
          description: z.string().optional(),
          status: z.enum(['not_started', 'in_progress', 'completed', 'backlog']).optional(),
          targetDate: z.string().optional(),
          criteria: z.array(z.string()).optional().describe('Array of criterion strings for ACTION_* cards'),
          parentId: z.number().nullable().optional().describe('Parent card ID, or null to move to root level'),
        },
        async (args) => {
          const { cardId, ...updates } = args

          const before = await prisma.card.findFirst({
            where: { id: cardId, userId: context.userId },
          })
          if (!before) return { content: [{ type: 'text' as const, text: 'Card not found' }] }

          const after = await prisma.card.update({
            where: { id: cardId },
            data: {
              ...(updates.title && { title: updates.title }),
              ...(updates.description !== undefined && { description: updates.description }),
              ...(updates.status && { status: updates.status }),
              ...(updates.targetDate && { targetDate: new Date(updates.targetDate) }),
              ...(updates.criteria !== undefined && { criteria: updates.criteria }),
              ...(updates.parentId !== undefined && { parentId: updates.parentId }),
            },
          })

          await prisma.event.create({
            data: {
              userId: context.userId,
              eventType: 'agent_mutation',
              cardId,
              payload: {
                operation: 'update',
                before,
                after,
                agentSessionId: context.sessionId,
                checkpointUuid: context.checkpointUuid,
              },
            },
          })

          return { content: [{ type: 'text' as const, text: `Updated card ${cardId}` }] }
        }
      ),

      // WRITE: Delete card (audited)
      tool(
        'delete_card',
        'Delete a card (must have no children)',
        { cardId: z.number() },
        async (args) => {
          const card = await prisma.card.findFirst({
            where: { id: args.cardId, userId: context.userId },
            include: { children: true },
          })
          if (!card) return { content: [{ type: 'text' as const, text: 'Card not found' }] }
          if (card.children.length > 0) return { content: [{ type: 'text' as const, text: 'Cannot delete card with children' }] }

          await prisma.card.delete({ where: { id: args.cardId } })

          await prisma.event.create({
            data: {
              userId: context.userId,
              eventType: 'agent_mutation',
              cardId: args.cardId,
              payload: {
                operation: 'delete',
                before: card,
                agentSessionId: context.sessionId,
                checkpointUuid: context.checkpointUuid,
              },
            },
          })

          return { content: [{ type: 'text' as const, text: `Deleted card ${args.cardId}` }] }
        }
      ),

      // READ: Get active season
      tool(
        'get_active_season',
        'Get the current active season',
        {},
        async () => {
          const season = await prisma.season.findFirst({
            where: { userId: context.userId, isActive: true },
          })
          return { content: [{ type: 'text' as const, text: JSON.stringify(season, null, 2) }] }
        }
      ),

      // READ: Query recent events
      tool(
        'get_recent_events',
        'Get recent events for the user',
        { limit: z.number().default(10) },
        async (args) => {
          const events = await prisma.event.findMany({
            where: { userId: context.userId },
            orderBy: { occurredAt: 'desc' },
            take: args.limit,
          })
          return { content: [{ type: 'text' as const, text: JSON.stringify(events, null, 2) }] }
        }
      ),
    ]

  // Filter tools if allowedTools is specified
  const tools = context.allowedTools
    ? allTools.filter(t => context.allowedTools!.includes(t.name))
    : allTools

  return createSdkMcpServer({
    name: 'kaizen-db',
    version: '1.0.0',
    tools,
  })
}
