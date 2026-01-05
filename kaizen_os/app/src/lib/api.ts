const API_BASE = '/api'

interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, string[]>
  }
}

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE}${endpoint}`
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: { code: 'UNKNOWN', message: 'An error occurred' },
      }))
      throw new Error(error.error.message)
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T
    }

    return response.json()
  }

  // Cards (v4 API)
  async getThemes() {
    return this.request<CardWithActionCount[]>('/cards')
  }

  async getCard(id: number) {
    return this.request<CardWithChildren>(`/cards/${id}`)
  }

  async getCardChildren(id: number, type?: string, status?: string) {
    const params = new URLSearchParams()
    if (type) params.set('type', type)
    if (status) params.set('status', status)
    const query = params.toString()
    return this.request<Card[]>(`/cards/${id}/children${query ? `?${query}` : ''}`)
  }

  async getCardHierarchy(id: number) {
    return this.request<Card[]>(`/cards/${id}/hierarchy`)
  }

  async getCardsByType(type: string) {
    return this.request<Card[]>(`/cards?type=${type}`)
  }

  async getActiveActions() {
    return this.request<Card[]>('/cards/active-actions')
  }

  async getGlobalVetoes() {
    return this.request<Card[]>('/cards/vetoes')
  }

  async getBacklog(themeId: number) {
    return this.request<Card[]>(`/cards/themes/${themeId}/backlog`)
  }


  async createCard(data: CreateCardInput) {
    return this.request<Card>('/cards', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateCard(id: number, data: UpdateCardInput) {
    return this.request<Card>(`/cards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteCard(id: number) {
    return this.request<void>(`/cards/${id}`, {
      method: 'DELETE',
    })
  }

  // Seasons
  async getSeasons() {
    return this.request<Season[]>('/seasons')
  }

  async getActiveSeason() {
    return this.request<Season | null>('/seasons/active')
  }

  async getSeason(id: number) {
    return this.request<Season>(`/seasons/${id}`)
  }

  async createSeason(data: CreateSeasonInput) {
    return this.request<Season>('/seasons', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async activateSeason(id: number) {
    return this.request<Season>(`/seasons/${id}/activate`, {
      method: 'PUT',
    })
  }

  async deactivateSeason(id: number) {
    return this.request<Season>(`/seasons/${id}/deactivate`, {
      method: 'PUT',
    })
  }

  async updateSeason(id: number, data: Partial<CreateSeasonInput>) {
    return this.request<Season>(`/seasons/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }


  // Events
  async logEvent(data: LogEventInput) {
    return this.request<Event>('/events', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getEvents(params?: { cardId?: number; type?: string; limit?: number }) {
    const searchParams = new URLSearchParams()
    if (params?.cardId) searchParams.set('cardId', String(params.cardId))
    if (params?.type) searchParams.set('type', params.type)
    if (params?.limit) searchParams.set('limit', String(params.limit))
    
    const query = searchParams.toString()
    return this.request<Event[]>(`/events${query ? `?${query}` : ''}`)
  }

  // Condition Scores
  async getAllConditions() {
    return this.request<Record<number, { conditionScore: number; lastActivity: string | null }>>('/events/conditions')
  }

  async getThemeCondition(themeId: number) {
    return this.request<{ themeId: number; conditionScore: number; lastActivity: string | null }>(`/events/conditions/${themeId}`)
  }

  // Theme Hours (Property 6: Time Aggregation)
  async getAllThemeHours(seasonId?: number) {
    const query = seasonId ? `?seasonId=${seasonId}` : ''
    return this.request<Record<number, number>>(`/events/theme-hours${query}`)
  }

  async getThemeHours(themeId: number, seasonId?: number) {
    const query = seasonId ? `?seasonId=${seasonId}` : ''
    return this.request<{ themeId: number; actualHours: number }>(`/events/theme-hours/${themeId}${query}`)
  }

  // Time Logging (v4)
  async logTime(cardId: number, minutes: number, date?: string) {
    return this.request<Event>('/events/time', {
      method: 'POST',
      body: JSON.stringify({ cardId, minutes, date }),
    })
  }

  // Season Grading (v4) - grades all criteria for an action at once
  async gradeSeasonCriteria(cardId: number, gradingType: 'mid_season' | 'end_season', results: { criterion: string; passed: boolean }[], notes?: string) {
    return this.request<Event>('/events/criteria-grade', {
      method: 'POST',
      body: JSON.stringify({ cardId, gradingType, results, notes }),
    })
  }

  // Veto Management (v4)
  async logVetoViolation(vetoId: number, reason?: string) {
    return this.request<Event>('/events/veto-violated', {
      method: 'POST',
      body: JSON.stringify({ vetoId, reason }),
    })
  }

  // Legacy guardrail methods
  async tripGuardrail(guardrailId: number, reason?: string) {
    return this.logVetoViolation(guardrailId, reason)
  }

  async restoreGuardrail(guardrailId: number) {
    // In v4, vetoes don't have a restore concept - they're just tracked
    return this.request<Event>('/events', {
      method: 'POST',
      body: JSON.stringify({ eventType: 'veto_added', cardId: guardrailId }),
    })
  }

  // Action Lifecycle (v4)
  async logActionStarted(cardId: number, actionType: 'gate' | 'experiment' | 'routine' | 'ops') {
    return this.request<Event>(`/events/${actionType}-started`, {
      method: 'POST',
      body: JSON.stringify({ cardId }),
    })
  }

  async logActionCompleted(cardId: number, actionType: 'gate' | 'experiment' | 'ops') {
    return this.request<Event>(`/events/${actionType}-completed`, {
      method: 'POST',
      body: JSON.stringify({ cardId }),
    })
  }

  // Theme Allocations
  async getSeasonAllocations(seasonId: number) {
    return this.request<ThemeAllocation[]>(`/allocations/season/${seasonId}`)
  }

  async getThemeAllocation(seasonId: number, themeId: number) {
    return this.request<ThemeAllocation>(`/allocations/season/${seasonId}/theme/${themeId}`)
  }

  async setThemeAllocation(seasonId: number, themeId: number, allocation: number) {
    return this.request<ThemeAllocation>(`/allocations/season/${seasonId}/theme/${themeId}`, {
      method: 'PUT',
      body: JSON.stringify({ allocation }),
    })
  }

  // Users & Settings
  async getUserSettings() {
    return this.request<UserSettings>('/users/settings')
  }

  async updateUserSettings(settings: Partial<UserSettings>) {
    return this.request<UserSettings>('/users/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    })
  }
}


// Types (v4)
export type UnitType = 'THEME' | 'ACTION_GATE' | 'ACTION_EXPERIMENT' | 'ACTION_ROUTINE' | 'ACTION_OPS' | 'TASK' | 'VETO'
export type TaskStatus = 'in_progress' | 'not_started' | 'completed' | 'backlog'

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
  agentBuiltinTools: string[]
  agentAllowedTools: string[]
  agentAllowBash: boolean
  agentPermissionMode: 'default' | 'acceptEdits' | 'bypassPermissions'
  agentSystemPrompt: string
  debugMode: boolean
}

export interface Card {
  id: number
  userId: number
  parentId: number | null
  title: string
  description: string | null
  targetDate: string | null
  completionDate: string | null
  startDate: string | null
  status: TaskStatus
  unitType: UnitType
  seasonId: number | null
  lagWeeks: number | null
  criteria: string[]
  tags: Record<string, string> // Arbitrary key-value pairs for custom metadata
  createdAt: string
  updatedAt: string
}

export interface CardWithActionCount extends Card {
  actionCount: number
}

export interface CardWithChildren extends Card {
  children: Card[]
}

export interface WipTypeStatus {
  active: number
  max: number
  canAdd: boolean
}

export interface Season {
  id: number
  userId: number
  name: string
  startDate: string
  durationWeeks: number
  endDate: string
  utilityRate: number
  totalHours: number
  themeAllocations: Record<string, number> // { [themeId]: allocation (0-1) }
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Event {
  id: string
  userId: number
  eventType: string
  cardId: number | null
  payload: Record<string, unknown>
  occurredAt: string
  idempotencyKey: string | null
}

export interface CreateCardInput {
  title: string
  description?: string
  unitType: string
  status?: string
  parentId?: number
  seasonId?: number
  targetDate?: string
  startDate?: string
  lagWeeks?: number
  criteria?: string[]
}

export interface UpdateCardInput {
  title?: string
  description?: string
  status?: string
  targetDate?: string | null
  startDate?: string | null
  completionDate?: string | null
  seasonId?: number | null
  lagWeeks?: number | null
  criteria?: string[]
  tags?: Record<string, string>
}

export interface CreateSeasonInput {
  name: string
  startDate: string
  durationWeeks: number
  utilityRate?: number
  themeAllocations?: Record<string, number>
}

export interface LogEventInput {
  eventType: string
  cardId?: number
  payload?: Record<string, unknown>
  idempotencyKey?: string
}

export interface ThemeAllocation {
  id?: number
  userId?: number
  seasonId: number
  themeId: number
  allocation: number
  createdAt?: string
  updatedAt?: string
}

export const api = new ApiClient()

// Agent Session Types
export interface AgentSession {
  id: string
  title: string | null
  createdAt: string
  updatedAt: string
  messages: { content: string }[]
}

export interface AgentSessionWithMessages {
  id: string
  title: string | null
  claudeSession: string
  messages: AgentMessage[]
}

export interface AgentMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}
