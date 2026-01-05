// Landing Page - v3 redesign with 2-panel layout and planning mode
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useThemes, useGlobalVetoes, useActiveActions } from '../hooks/useCards'
import { useActiveSeason } from '../hooks/useSeasons'
import { useUserSettings } from '../hooks/useUserSettings'
import { LeftPanelCard, CalendarPanel } from '../components/landing'
import type { CalendarEvent } from '../components/landing/CalendarPanel'
import { ActionPlanPanel, EventEditModal, FinalizeModal } from '../components/planning'
import type { ActionPlanState, PlannedTask, GcalAssignment } from '../components/planning'
import { AgentChat } from '../components/AgentChat'
import { MenuCard } from '../components/MenuCard'
import { getAuthenticatedUserId } from '../lib/auth'
import { format, startOfWeek } from 'date-fns'
import type { SlotInfo } from 'react-big-calendar'
import { ACTION_TYPES, type ActionType } from '../utils/guidedPlanningUtils'

export default function LandingPage() {
  const navigate = useNavigate()
  const { data: themes } = useThemes()
  const { data: activeSeason } = useActiveSeason()
  const { data: globalVetoes } = useGlobalVetoes()
  const { data: actions = [] } = useActiveActions()
  const { data: userSettings } = useUserSettings()
  const debugMode = userSettings?.debugMode || false

  // Planning mode state
  const [planningMode, setPlanningMode] = useState(false)
  const [weekStart, setWeekStart] = useState(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 })
    return format(start, 'yyyy-MM-dd')
  })
  const [actionStates, setActionStates] = useState<Map<number, ActionPlanState>>(new Map())
  const [gcalAssignments, setGcalAssignments] = useState<Map<string, GcalAssignment>>(new Map())
  const [currentAction, setCurrentAction] = useState<typeof actions[0] | null>(null)
  const [routineLinks, setRoutineLinks] = useState<Map<number, {
    eventSummary: string | null;
    calendarName: string | null;
    eventRecurrence: string | null;
    htmlLink: string | null;
  }>>(new Map())
  const [loading, setLoading] = useState(false)
  const [plannedHoursData, setPlannedHoursData] = useState<{
    plannedHours: number;
    utilityRate: number;
    percentUtilized: number;
    status: 'under' | 'at' | 'over';
  } | null>(null)
  
  // Event edit modal state
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  
  // Finalize modal state
  const [showFinalizeModal, setShowFinalizeModal] = useState(false)
  const [existingRuleEventTitles, setExistingRuleEventTitles] = useState<Set<string>>(new Set())
  
  // Debug modal state
  const [showDebugModal, setShowDebugModal] = useState(false)
  const [debugCommitPlan, setDebugCommitPlan] = useState<any>(null)

  // Calendar sync state
  const [syncing, setSyncing] = useState(false)

  // Action type navigation state
  const [currentActionType, setCurrentActionType] = useState<ActionType>('ACTION_GATE')

  // Group actions by type
  const actionsByType = useMemo(() => {
    const groups = new Map<ActionType, typeof actions>()
    for (const type of ACTION_TYPES) {
      groups.set(type, [])
    }
    for (const action of actions) {
      const group = groups.get(action.unitType as ActionType)
      if (group) group.push(action)
    }
    return groups
  }, [actions])

  // Get actions for current type
  const currentTypeActions = useMemo(() => {
    return actionsByType.get(currentActionType) || []
  }, [actionsByType, currentActionType])

  // Set initial current action when actions load
  useEffect(() => {
    if (actions.length > 0 && !currentAction) {
      // Find first type with actions
      for (const type of ACTION_TYPES) {
        const typeActions = actionsByType.get(type) || []
        if (typeActions.length > 0) {
          setCurrentActionType(type)
          setCurrentAction(typeActions[0])
          break
        }
      }
    }
  }, [actions, currentAction, actionsByType])

  // Fetch existing classification rules (for pre-selecting in finalize modal)
  useEffect(() => {
    if (planningMode) {
      fetchExistingRules()
    }
  }, [planningMode])

  const fetchExistingRules = async () => {
    try {
      const res = await fetch('/api/calendar/rules', {
        headers: { 'x-user-id': String(getAuthenticatedUserId()) },
      })
      if (res.ok) {
        const rules = await res.json()
        const titles = new Set<string>(rules.map((r: any) => r.matchValue))
        setExistingRuleEventTitles(titles)
      }
    } catch (error) {
      console.error('Failed to fetch existing rules:', error)
    }
  }

  // Load planning session when entering plan mode
  useEffect(() => {
    if (planningMode) {
      loadPlanningSession()
      loadRoutineLinks()
      loadPlannedHours()
    }
  }, [planningMode, weekStart])

  const loadPlanningSession = async () => {
    try {
      const res = await fetch(`/api/calendar/planning/session?weekStart=${weekStart}`, {
        headers: { 'x-user-id': String(getAuthenticatedUserId()) },
      })
      if (res.ok) {
        const session = await res.json()
        if (session.actionStates && Object.keys(session.actionStates).length > 0) {
          // Convert from object to Map, parsing date strings back to Date objects
          const statesMap = new Map<number, ActionPlanState>()
          for (const [key, value] of Object.entries(session.actionStates)) {
            const state = value as ActionPlanState
            statesMap.set(parseInt(key), {
              ...state,
              tasks: state.tasks.map(t => ({
                ...t,
                start: new Date(t.start),
                end: new Date(t.end),
              })),
            })
          }
          setActionStates(statesMap)
        }
        if (session.gcalAssignments && Object.keys(session.gcalAssignments).length > 0) {
          // Parse modifiedStart/modifiedEnd back to Date objects
          const assignmentsMap = new Map<string, GcalAssignment>()
          for (const [key, value] of Object.entries(session.gcalAssignments)) {
            const assignment = value as GcalAssignment & { modifiedStart?: string; modifiedEnd?: string }
            assignmentsMap.set(key, {
              ...assignment,
              modifiedStart: assignment.modifiedStart ? new Date(assignment.modifiedStart) : undefined,
              modifiedEnd: assignment.modifiedEnd ? new Date(assignment.modifiedEnd) : undefined,
            })
          }
          setGcalAssignments(assignmentsMap)
        }
      }
    } catch (error) {
      console.error('Failed to load planning session:', error)
    }
  }

  const loadRoutineLinks = async () => {
    try {
      const res = await fetch('/api/calendar/routines/links', {
        headers: { 'x-user-id': String(getAuthenticatedUserId()) },
      })
      if (res.ok) {
        const links = await res.json()
        const linkMap = new Map<number, any>()
        links.forEach((link: any) => linkMap.set(link.cardId, {
          eventSummary: link.eventSummary,
          calendarName: link.calendarName,
          eventRecurrence: link.eventRecurrence,
          htmlLink: link.htmlLink,
        }))
        setRoutineLinks(linkMap)
      }
    } catch (error) {
      console.error('Failed to load routine links:', error)
    }
  }

  const loadPlannedHours = async () => {
    try {
      const res = await fetch(`/api/calendar/week/planned-hours?weekStart=${weekStart}`, {
        headers: { 'x-user-id': String(getAuthenticatedUserId()) },
      })
      if (res.ok) {
        const data = await res.json()
        setPlannedHoursData(data)
      }
    } catch (error) {
      console.error('Failed to load planned hours:', error)
    }
  }

  const savePlanningSession = useCallback(async (
    newActionStates: Map<number, ActionPlanState>,
    newGcalAssignments: Map<string, GcalAssignment>
  ) => {
    try {
      // Convert Maps to objects for JSON serialization
      const actionStatesObj: Record<string, ActionPlanState> = {}
      newActionStates.forEach((value, key) => {
        actionStatesObj[key] = {
          ...value,
          tasks: value.tasks.map(t => ({
            ...t,
            start: t.start instanceof Date ? t.start.toISOString() : t.start,
            end: t.end instanceof Date ? t.end.toISOString() : t.end,
          })) as any,
        }
      })

      await fetch('/api/calendar/planning/session', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(getAuthenticatedUserId()),
        },
        body: JSON.stringify({
          weekStart,
          actionStates: actionStatesObj,
          gcalAssignments: Object.fromEntries(newGcalAssignments),
        }),
      })
    } catch (error) {
      console.error('Failed to save planning session:', error)
    }
  }, [weekStart])

  // Convert action states to calendar events
  const planModeEvents = useMemo((): CalendarEvent[] => {
    const events: CalendarEvent[] = []
    actionStates.forEach((state, actionId) => {
      state.tasks.forEach(task => {
        events.push({
          id: task.id,
          title: task.title,
          start: task.start,
          end: task.end,
          source: currentAction?.id === actionId ? 'current' : 'planned',
          actionId,
          colorIndex: 0,
        })
      })
    })
    return events
  }, [actionStates, currentAction?.id])

  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    if (!currentAction) return

    const newTask: PlannedTask = {
      id: `task-${Date.now()}`,
      actionId: currentAction.id,
      title: currentAction.title,
      start: slotInfo.start,
      end: slotInfo.end,
    }

    setActionStates(prev => {
      const state = prev.get(currentAction.id) || { status: 'pending', tasks: [] }
      const newMap = new Map(prev)
      newMap.set(currentAction.id, {
        ...state,
        tasks: [...state.tasks, newTask],
      })
      savePlanningSession(newMap, gcalAssignments)
      return newMap
    })
  }, [currentAction, gcalAssignments, savePlanningSession])

  const handleRemoveTask = useCallback((actionId: number, taskId: string) => {
    setActionStates(prev => {
      const state = prev.get(actionId)
      if (!state) return prev
      const newMap = new Map(prev)
      newMap.set(actionId, {
        ...state,
        tasks: state.tasks.filter(t => t.id !== taskId),
      })
      savePlanningSession(newMap, gcalAssignments)
      return newMap
    })
  }, [gcalAssignments, savePlanningSession])

  const handleEventClick = useCallback((event: CalendarEvent) => {
    if (event.source === 'gcal' && currentAction) {
      // Assign GCal event to current action
      const existingAssignment = gcalAssignments.get(event.id)
      if (existingAssignment?.actionId === currentAction.id) {
        // Already assigned to this action - unassign
        setGcalAssignments(prev => {
          const newMap = new Map(prev)
          newMap.delete(event.id)
          savePlanningSession(actionStates, newMap)
          return newMap
        })
      } else {
        // Assign to current action
        setGcalAssignments(prev => {
          const newMap = new Map(prev)
          newMap.set(event.id, {
            eventId: event.id,
            eventTitle: event.title,
            actionId: currentAction.id,
            actionTitle: currentAction.title,
            accountId: event.accountId || '',
            calendarId: event.calendarId || '',
          })
          savePlanningSession(actionStates, newMap)
          return newMap
        })
      }
    }
  }, [currentAction, gcalAssignments, actionStates, savePlanningSession])

  // Handler for assigning event from popover
  const handleAssignEvent = useCallback((event: CalendarEvent) => {
    if (!currentAction) return
    setGcalAssignments(prev => {
      const newMap = new Map(prev)
      newMap.set(event.id, {
        eventId: event.id,
        eventTitle: event.title,
        actionId: currentAction.id,
        actionTitle: currentAction.title,
        accountId: event.accountId || '',
        calendarId: event.calendarId || '',
      })
      savePlanningSession(actionStates, newMap)
      return newMap
    })
  }, [currentAction, actionStates, savePlanningSession])

  // Handler for deassigning event from popover
  const handleDeassignEvent = useCallback((event: CalendarEvent) => {
    setGcalAssignments(prev => {
      const newMap = new Map(prev)
      newMap.delete(event.id)
      savePlanningSession(actionStates, newMap)
      return newMap
    })
  }, [actionStates, savePlanningSession])

  // Handler for editing event from popover
  const handleEditEvent = useCallback((event: CalendarEvent) => {
    setEditingEvent(event)
  }, [])

  const handleEventDrop = useCallback((args: { event: CalendarEvent; start: Date; end: Date }) => {
    const { event, start, end } = args
    
    if (event.source === 'planned' || event.source === 'current') {
      // Update planned task position
      setActionStates(prev => {
        const actionId = event.actionId
        if (!actionId) return prev
        
        const state = prev.get(actionId)
        if (!state) return prev
        
        const newMap = new Map(prev)
        newMap.set(actionId, {
          ...state,
          tasks: state.tasks.map(t => 
            t.id === event.id ? { ...t, start, end } : t
          ),
        })
        savePlanningSession(newMap, gcalAssignments)
        return newMap
      })
    } else if (event.source === 'gcal') {
      // Store GCal event modification locally - will be applied on commit
      setGcalAssignments(prev => {
        const newMap = new Map(prev)
        const existing = prev.get(event.id)
        newMap.set(event.id, {
          eventId: event.id,
          eventTitle: event.title,
          actionId: existing?.actionId || 0,
          actionTitle: existing?.actionTitle || '',
          accountId: event.accountId || existing?.accountId || '',
          calendarId: event.calendarId || existing?.calendarId || '',
          modifiedStart: start,
          modifiedEnd: end,
        })
        savePlanningSession(actionStates, newMap)
        return newMap
      })
    }
  }, [actionStates, gcalAssignments, savePlanningSession])

  const handleEventResize = useCallback((args: { event: CalendarEvent; start: Date; end: Date }) => {
    const { event, start, end } = args
    
    if (event.source === 'planned' || event.source === 'current') {
      // Update planned task duration
      setActionStates(prev => {
        const actionId = event.actionId
        if (!actionId) return prev
        
        const state = prev.get(actionId)
        if (!state) return prev
        
        const newMap = new Map(prev)
        newMap.set(actionId, {
          ...state,
          tasks: state.tasks.map(t => 
            t.id === event.id ? { ...t, start, end } : t
          ),
        })
        savePlanningSession(newMap, gcalAssignments)
        return newMap
      })
    } else if (event.source === 'gcal') {
      // Store GCal event modification locally - will be applied on commit
      setGcalAssignments(prev => {
        const newMap = new Map(prev)
        const existing = prev.get(event.id)
        newMap.set(event.id, {
          eventId: event.id,
          eventTitle: event.title,
          actionId: existing?.actionId || 0,
          actionTitle: existing?.actionTitle || '',
          accountId: event.accountId || existing?.accountId || '',
          calendarId: event.calendarId || existing?.calendarId || '',
          modifiedStart: start,
          modifiedEnd: end,
        })
        savePlanningSession(actionStates, newMap)
        return newMap
      })
    }
  }, [actionStates, gcalAssignments, savePlanningSession])

  const handleEventDoubleClick = useCallback((event: CalendarEvent) => {
    setEditingEvent(event)
  }, [])

  const handleEventSave = useCallback((updatedEvent: CalendarEvent) => {
    if (updatedEvent.source === 'planned' || updatedEvent.source === 'current') {
      // Update planned task
      setActionStates(prev => {
        const actionId = updatedEvent.actionId
        if (!actionId) return prev
        
        const state = prev.get(actionId)
        if (!state) return prev
        
        const newMap = new Map(prev)
        newMap.set(actionId, {
          ...state,
          tasks: state.tasks.map(t => 
            t.id === updatedEvent.id ? {
              ...t,
              title: updatedEvent.title,
              description: updatedEvent.description,
              location: updatedEvent.location,
              attendees: updatedEvent.attendees?.map(a => a.email),
            } : t
          ),
        })
        savePlanningSession(newMap, gcalAssignments)
        return newMap
      })
    }
    // For GCal events, we store edits locally (they'll be applied on commit)
    setEditingEvent(null)
  }, [gcalAssignments, savePlanningSession])

  const handleNext = useCallback(() => {
    if (!currentAction) return

    // Mark current action as reviewed
    setActionStates(prev => {
      const state = prev.get(currentAction.id) || { status: 'pending', tasks: [] }
      const newMap = new Map(prev)
      const newStatus = state.tasks.length > 0 ? 'completed' : 'skipped'
      newMap.set(currentAction.id, { ...state, status: newStatus })
      savePlanningSession(newMap, gcalAssignments)
      return newMap
    })

    // Navigate within same action type first
    const currentIndex = currentTypeActions.findIndex(a => a.id === currentAction.id)
    if (currentIndex < currentTypeActions.length - 1) {
      // More actions in current type
      setCurrentAction(currentTypeActions[currentIndex + 1])
    } else {
      // Move to next type with actions
      const currentTypeIndex = ACTION_TYPES.indexOf(currentActionType)
      for (let i = currentTypeIndex + 1; i < ACTION_TYPES.length; i++) {
        const nextType = ACTION_TYPES[i]
        const nextTypeActions = actionsByType.get(nextType) || []
        if (nextTypeActions.length > 0) {
          setCurrentActionType(nextType)
          setCurrentAction(nextTypeActions[0])
          return
        }
      }
      // All types exhausted - stay on last action
    }
  }, [currentAction, currentTypeActions, currentActionType, actionsByType, gcalAssignments, savePlanningSession])

  const handlePrev = useCallback(() => {
    if (!currentAction) return
    
    // Navigate within same action type first
    const currentIndex = currentTypeActions.findIndex(a => a.id === currentAction.id)
    if (currentIndex > 0) {
      // More actions before in current type
      setCurrentAction(currentTypeActions[currentIndex - 1])
    } else {
      // Move to previous type with actions
      const currentTypeIndex = ACTION_TYPES.indexOf(currentActionType)
      for (let i = currentTypeIndex - 1; i >= 0; i--) {
        const prevType = ACTION_TYPES[i]
        const prevTypeActions = actionsByType.get(prevType) || []
        if (prevTypeActions.length > 0) {
          setCurrentActionType(prevType)
          setCurrentAction(prevTypeActions[prevTypeActions.length - 1])
          return
        }
      }
      // At the beginning - stay on first action
    }
  }, [currentAction, currentTypeActions, currentActionType, actionsByType])

  const handleFinalize = useCallback(() => {
    // Get assignments that have actionId (actual assignments, not just time modifications)
    const newAssignments = Array.from(gcalAssignments.values()).filter(a => a.actionId > 0)
    
    // Build commit plan for debug mode
    if (debugMode) {
      const blocks: any[] = []
      actionStates.forEach((state, actionId) => {
        const action = actions.find(a => a.id === actionId)
        state.tasks.forEach(task => {
          blocks.push({
            cardId: actionId,
            cardTitle: task.title,
            description: task.description || '',
            startDateTime: task.start instanceof Date ? task.start.toISOString() : task.start,
            endDateTime: task.end instanceof Date ? task.end.toISOString() : task.end,
            actionType: action?.unitType,
          })
        })
      })
      
      const assignments = Array.from(gcalAssignments.values())
        .filter(a => a.actionId > 0 || a.modifiedStart || a.modifiedEnd)
        .map(a => ({
          eventId: a.eventId,
          eventTitle: a.eventTitle,
          cardId: a.actionId,
          actionTitle: a.actionTitle,
          modifiedStart: a.modifiedStart instanceof Date ? a.modifiedStart.toISOString() : a.modifiedStart,
          modifiedEnd: a.modifiedEnd instanceof Date ? a.modifiedEnd.toISOString() : a.modifiedEnd,
        }))
      
      setDebugCommitPlan({ blocks, assignments, weekStart })
      setShowDebugModal(true)
      return
    }
    
    if (newAssignments.length > 0) {
      // Show finalize modal to confirm rules
      setShowFinalizeModal(true)
    } else {
      // No new assignments, just commit
      handleCommit([])
    }
  }, [gcalAssignments, debugMode, actionStates, actions, weekStart])

  const handleCommit = useCallback(async (rulesToCreate: string[]) => {
    setLoading(true)
    try {
      // Collect all planned tasks
      const blocks: any[] = []
      actionStates.forEach((state, actionId) => {
        const action = actions.find(a => a.id === actionId)
        state.tasks.forEach(task => {
          blocks.push({
            cardId: actionId,
            cardTitle: task.title,
            description: task.description || '',
            startDateTime: task.start instanceof Date ? task.start.toISOString() : task.start,
            endDateTime: task.end instanceof Date ? task.end.toISOString() : task.end,
            actionType: action?.unitType,
            location: task.location,
            attendees: task.attendees?.map(email => ({ email })),
          })
        })
      })

      // Collect GCal assignments (those with actionId OR time modifications)
      const assignments = Array.from(gcalAssignments.values())
        .filter(a => a.actionId > 0 || a.modifiedStart || a.modifiedEnd)
        .map(a => ({
          eventId: a.eventId,
          cardId: a.actionId,
          createRule: rulesToCreate.includes(a.eventId),
          eventTitle: a.eventTitle,
          accountId: a.accountId,
          calendarId: a.calendarId,
          // Include modified times if present
          modifiedStart: a.modifiedStart instanceof Date ? a.modifiedStart.toISOString() : a.modifiedStart,
          modifiedEnd: a.modifiedEnd instanceof Date ? a.modifiedEnd.toISOString() : a.modifiedEnd,
        }))

      // Commit the plan
      await fetch('/api/calendar/plan/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(getAuthenticatedUserId()),
        },
        body: JSON.stringify({ blocks, assignments, weekStart }),
      })

      // Mark session as committed
      await fetch('/api/calendar/planning/session/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(getAuthenticatedUserId()),
        },
        body: JSON.stringify({ weekStart }),
      })

      // Exit plan mode
      setPlanningMode(false)
      setActionStates(new Map())
      setGcalAssignments(new Map())
      setShowFinalizeModal(false)
    } catch (error) {
      console.error('Failed to finalize plan:', error)
      alert('Failed to finalize plan')
    }
    setLoading(false)
  }, [actionStates, gcalAssignments, actions, weekStart])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(getAuthenticatedUserId()),
        },
        body: JSON.stringify({ weekStart }),
      })
      // Force refetch by invalidating cache - the CalendarPanel will refetch automatically
      // via react-query when the component re-renders
    } catch (error) {
      console.error('Failed to sync calendar:', error)
    }
    setSyncing(false)
  }, [weekStart])

  const handlePlanModeToggle = useCallback((enabled: boolean) => {
    setPlanningMode(enabled)
    if (!enabled) {
      // Reset state when exiting plan mode
      setActionStates(new Map())
      setGcalAssignments(new Map())
    }
  }, [])

  return (
    <div className="app" style={{ paddingTop: 0 }}>
      <main className="main-v3" style={{ paddingTop: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MenuCard currentPage="home" />
          {!planningMode ? (
            <LeftPanelCard
              vetoes={globalVetoes || []}
              season={activeSeason || null}
              themeCount={themes?.length || 0}
              onAddVeto={() => navigate('/create?type=VETO')}
              onMidSeasonGrade={() => navigate(`/seasons/${activeSeason?.id}/grade?type=mid_season`)}
              onEndSeasonGrade={() => navigate(`/seasons/${activeSeason?.id}/grade?type=end_season`)}
            />
          ) : (
            <ActionPlanPanel
              actions={actions}
              actionStates={actionStates}
              gcalAssignments={gcalAssignments}
              routineLinks={routineLinks}
              currentAction={currentAction}
              currentActionType={currentActionType}
              onActionSelect={setCurrentAction}
              onActionTypeChange={setCurrentActionType}
              onRemoveTask={handleRemoveTask}
              onSetupRoutine={() => {/* TODO: implement routine setup modal */}}
              onUnlinkRoutine={() => {/* TODO: implement unlink */}}
              onNext={handleNext}
              onPrev={handlePrev}
              onFinalize={handleFinalize}
              loading={loading}
              plannedHoursData={plannedHoursData}
            />
          )}
        </div>

        <CalendarPanel
          themes={themes || []}
          planMode={planningMode}
          planModeEvents={planModeEvents}
          currentActionId={currentAction?.id}
          currentActionTitle={currentAction?.title}
          gcalAssignments={gcalAssignments}
          onSelectSlot={handleSelectSlot}
          onEventClick={handleEventClick}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
          onEventDoubleClick={handleEventDoubleClick}
          onAssignEvent={handleAssignEvent}
          onDeassignEvent={handleDeassignEvent}
          onEditEvent={handleEditEvent}
          onPlanModeToggle={handlePlanModeToggle}
          onSync={handleSync}
          syncing={syncing}
          weekStart={weekStart}
          onWeekChange={setWeekStart}
        />

        <AgentChat />
        
        {editingEvent && (
          <EventEditModal
            event={editingEvent}
            onSave={handleEventSave}
            onClose={() => setEditingEvent(null)}
          />
        )}
        
        {showFinalizeModal && (
          <FinalizeModal
            assignments={Array.from(gcalAssignments.values()).filter(a => a.actionId > 0)}
            existingRuleEventTitles={existingRuleEventTitles}
            onConfirm={handleCommit}
            onCancel={() => setShowFinalizeModal(false)}
            loading={loading}
          />
        )}
        
        {showDebugModal && debugCommitPlan && (
          <div className="event-edit-overlay" onClick={() => setShowDebugModal(false)}>
            <div className="event-edit-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '80vh', overflow: 'auto' }}>
              <h4>Debug: Commit Plan Preview</h4>
              <div style={{ fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                <strong>Week Start:</strong> {debugCommitPlan.weekStart}
                
                <h5 style={{ marginTop: 16 }}>New Events to Create ({debugCommitPlan.blocks.length})</h5>
                {debugCommitPlan.blocks.map((b: any, i: number) => (
                  <div key={i} style={{ padding: '8px', background: '#f5f5f5', marginBottom: 4, borderRadius: 4 }}>
                    <div><strong>{b.cardTitle}</strong> ({b.actionType})</div>
                    <div>Start: {b.startDateTime}</div>
                    <div>End: {b.endDateTime}</div>
                  </div>
                ))}
                
                <h5 style={{ marginTop: 16 }}>GCal Assignments/Modifications ({debugCommitPlan.assignments.length})</h5>
                {debugCommitPlan.assignments.map((a: any, i: number) => (
                  <div key={i} style={{ padding: '8px', background: '#f0f8ff', marginBottom: 4, borderRadius: 4 }}>
                    <div><strong>"{a.eventTitle}"</strong></div>
                    {a.cardId > 0 && <div>→ Assigned to: {a.actionTitle} (ID: {a.cardId})</div>}
                    {a.modifiedStart && <div>⏰ New Start: {a.modifiedStart}</div>}
                    {a.modifiedEnd && <div>⏰ New End: {a.modifiedEnd}</div>}
                  </div>
                ))}
              </div>
              <div className="modal-actions" style={{ marginTop: 16 }}>
                <button className="modal-btn cancel" onClick={() => setShowDebugModal(false)}>Close</button>
                <button className="modal-btn save" onClick={() => {
                  setShowDebugModal(false)
                  const newAssignments = Array.from(gcalAssignments.values()).filter(a => a.actionId > 0)
                  if (newAssignments.length > 0) {
                    setShowFinalizeModal(true)
                  } else {
                    handleCommit([])
                  }
                }}>Continue to Submit</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
