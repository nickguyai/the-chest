import prisma from '../lib/db'

export interface UserSettings {
  maxThemes: number
  maxGatesPerTheme: number
  maxExperimentsPerTheme: number
  maxRoutinesPerTheme: number
  maxOpsPerTheme: number
  minCriteriaPerExperiment: number
  minCriteriaPerGate: number
  defaultSeasonWeeks: number
  defaultLagWeeks: number
  // Agent configuration
  agentBuiltinTools: string[]
  agentAllowedTools: string[]
  agentAllowBash: boolean
  agentPermissionMode: 'default' | 'acceptEdits' | 'bypassPermissions'
  agentSystemPrompt: string
  // Debug mode (FR-004)
  debugMode: boolean
}

// All available kaizen-db MCP tools
export const KAIZEN_DB_TOOLS = {
  'mcp__kaizen-db__list_cards': { name: 'List Cards', description: 'Query cards with filters', category: 'read' },
  'mcp__kaizen-db__get_card': { name: 'Get Card', description: 'Get a single card with children', category: 'read' },
  'mcp__kaizen-db__get_active_season': { name: 'Get Season', description: 'Get current active season', category: 'read' },
  'mcp__kaizen-db__get_recent_events': { name: 'Get Events', description: 'View recent activity', category: 'read' },
  'mcp__kaizen-db__create_card': { name: 'Create Card', description: 'Create new cards', category: 'write' },
  'mcp__kaizen-db__update_card': { name: 'Update Card', description: 'Update card properties', category: 'write' },
  'mcp__kaizen-db__delete_card': { name: 'Delete Card', description: 'Delete cards', category: 'write' },
} as const

export type KaizenDbTool = keyof typeof KAIZEN_DB_TOOLS

export const BUILT_IN_TOOLS = {
  'Read': { name: 'Read Files', description: 'Read file contents', category: 'builtin', safe: true },
  'Glob': { name: 'Glob Search', description: 'Find files by pattern', category: 'builtin', safe: true },
  'Grep': { name: 'Grep Search', description: 'Search file contents', category: 'builtin', safe: true },
  'Edit': { name: 'Edit Files', description: 'Edit file contents', category: 'builtin', safe: false },
  'Write': { name: 'Write Files', description: 'Create/overwrite files', category: 'builtin', safe: false },
} as const

// Default prompt placeholder - actual prompt loaded from file in server/routes/agent.ts
export const DEFAULT_AGENT_SYSTEM_PROMPT = ''

export const DEFAULT_USER_SETTINGS: UserSettings = {
  maxThemes: 4,
  maxGatesPerTheme: 2,
  maxExperimentsPerTheme: 1,
  maxRoutinesPerTheme: 5,
  maxOpsPerTheme: 3,
  minCriteriaPerExperiment: 2,
  minCriteriaPerGate: 1,
  defaultSeasonWeeks: 11,
  defaultLagWeeks: 6,
  // Default: safe built-ins + all read MCP tools
  agentBuiltinTools: ['Read', 'Glob', 'Grep'],
  agentAllowedTools: [
    'mcp__kaizen-db__list_cards',
    'mcp__kaizen-db__get_card',
    'mcp__kaizen-db__get_active_season',
    'mcp__kaizen-db__get_recent_events',
  ],
  agentAllowBash: false,
  agentPermissionMode: 'acceptEdits',
  agentSystemPrompt: DEFAULT_AGENT_SYSTEM_PROMPT,
  // Debug mode off by default
  debugMode: false,
}

export const userService = {
  async getSettings(userId: number): Promise<UserSettings> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    })

    if (!user) {
      throw new Error('User not found')
    }

    return {
      ...DEFAULT_USER_SETTINGS,
      ...(user.settings as unknown as Partial<UserSettings>),
    }
  },

  async updateSettings(userId: number, settings: Partial<UserSettings>): Promise<UserSettings> {
    const currentSettings = await this.getSettings(userId)
    const newSettings = { ...currentSettings, ...settings }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        settings: newSettings as Parameters<typeof prisma.user.update>[0]['data']['settings'],
      },
    })

    return user.settings as unknown as UserSettings
  },
}
