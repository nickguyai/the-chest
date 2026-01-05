import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Calendar, dateFnsLocalizer, Views, SlotInfo, EventProps } from 'react-big-calendar'
import withDragAndDrop, { EventInteractionArgs } from 'react-big-calendar/lib/addons/dragAndDrop'
import { format, parse, startOfWeek, getDay, isSunday } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { CardWithActionCount } from '../../lib/api'
import { getAuthenticatedUserId } from '../../lib/auth'
import type { GcalAssignment } from '../planning'
import { EventPopover } from './EventPopover'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import './CalendarPlanMode.css'

const DnDCalendar = withDragAndDrop<CalendarEvent>(Calendar)

const locales = { 'en-US': enUS }
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
})

// Theme colors matching the mock
const THEME_COLORS = [
  { bg: 'rgba(139, 148, 103, 0.2)', border: '#8B9467', text: '#5a6343' },
  { bg: 'rgba(155, 89, 182, 0.2)', border: '#9B59B6', text: '#7b4293' },
  { bg: 'rgba(52, 152, 219, 0.2)', border: '#3498DB', text: '#2471a3' },
  { bg: 'rgba(230, 126, 34, 0.2)', border: '#E67E22', text: '#a55a1a' },
  { bg: 'rgba(231, 76, 60, 0.2)', border: '#E74C3C', text: '#922b21' },
]

// Plan mode event colors
const PLAN_MODE_COLORS = {
  gcal: { bg: 'rgba(200, 200, 200, 0.3)', border: '#999', text: '#666' },
  current: { bg: 'rgba(139, 148, 103, 0.4)', border: '#8B9467', text: '#5a6343' },
  planned: { bg: 'rgba(52, 152, 219, 0.3)', border: '#3498DB', text: '#2471a3' },
}

export interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  themeId?: number
  colorIndex: number
  source?: 'gcal' | 'planned' | 'current'
  actionId?: number
  // GCal metadata for editing
  accountId?: string
  calendarId?: string
  description?: string
  location?: string
  attendees?: Array<{ email: string; responseStatus?: string }>
}

interface CalendarPanelProps {
  themes: CardWithActionCount[]
  // Plan mode props
  planMode?: boolean
  planModeEvents?: CalendarEvent[]
  currentActionId?: number | null
  currentActionTitle?: string
  gcalAssignments?: Map<string, GcalAssignment>
  onSelectSlot?: (slotInfo: SlotInfo) => void
  onEventClick?: (event: CalendarEvent) => void
  onEventDrop?: (args: { event: CalendarEvent; start: Date; end: Date }) => void
  onEventResize?: (args: { event: CalendarEvent; start: Date; end: Date }) => void
  onEventDoubleClick?: (event: CalendarEvent) => void
  onAssignEvent?: (event: CalendarEvent) => void
  onDeassignEvent?: (event: CalendarEvent) => void
  onEditEvent?: (event: CalendarEvent) => void
  onPlanModeToggle?: (enabled: boolean) => void
  onSync?: () => Promise<void>
  syncing?: boolean
  weekStart?: string
  onWeekChange?: (weekStart: string) => void
}

// Custom event component for plan mode
interface PlanModeEventProps extends EventProps<CalendarEvent> {
  gcalAssignments: Map<string, GcalAssignment>
  currentActionId: number | null
}

function PlanModeEventComponent({ 
  event, 
  title,
  gcalAssignments,
  currentActionId,
}: PlanModeEventProps) {
  const assignment = gcalAssignments.get(event.id)
  const isGcalEvent = event.source === 'gcal'
  const isAssignedToCurrent = assignment?.actionId === currentActionId
  const isAssignedToOther = assignment && assignment.actionId !== currentActionId
  
  return (
    <div className={`plan-event-wrapper ${isGcalEvent ? 'gcal-event' : ''} ${isAssignedToCurrent ? 'assigned-current' : ''} ${isAssignedToOther ? 'assigned-other' : ''}`}>
      <span className="event-title">{title}</span>
      {isGcalEvent && !assignment && (
        <span className="assignment-hint" title="Click to assign to current action">+</span>
      )}
      {isAssignedToCurrent && (
        <span className="assignment-badge current" title="Assigned to current action">✓</span>
      )}
      {isAssignedToOther && (
        <span className="assignment-badge other" title={`Assigned to: ${assignment.actionTitle}`}>
          →
        </span>
      )}
    </div>
  )
}

// Fetch function for calendar events
async function fetchCalendarEvents(weekStart: string): Promise<CalendarEvent[]> {
  const res = await fetch(`/api/calendar/events/week?weekStart=${weekStart}`, {
    headers: { 'x-user-id': String(getAuthenticatedUserId()) },
  })
  if (!res.ok) return []
  
  const data = await res.json()
  const seenIds = new Set<string>()
  const calEvents: CalendarEvent[] = []

  for (const e of data) {
    const eventId = e.id || `${e.summary}-${e.start?.dateTime || e.start}`
    if (!seenIds.has(eventId)) {
      seenIds.add(eventId)
      calEvents.push({
        id: eventId,
        title: e.summary || e.title,
        start: new Date(e.start?.dateTime || e.start?.date || e.start),
        end: new Date(e.end?.dateTime || e.end?.date || e.end),
        themeId: e.assignedThemeId || undefined,
        colorIndex: 0,
        source: 'gcal',
        accountId: e.accountId,
        calendarId: e.calendarId,
        description: e.description,
        location: e.location,
        attendees: e.attendees,
      })
    }
  }
  return calEvents
}

export function CalendarPanel({ 
  themes,
  planMode = false,
  planModeEvents = [],
  currentActionId = null,
  currentActionTitle = '',
  gcalAssignments = new Map(),
  onSelectSlot,
  onEventClick,
  onEventDrop,
  onEventResize,
  onEventDoubleClick,
  onAssignEvent,
  onDeassignEvent,
  onEditEvent,
  onPlanModeToggle,
  onSync,
  syncing = false,
  weekStart: controlledWeekStart,
  onWeekChange,
}: CalendarPanelProps) {
  const [selectedThemeId, setSelectedThemeId] = useState<number | null>(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [popoverEvent, setPopoverEvent] = useState<CalendarEvent | null>(null)
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 })
  const navigate = useNavigate()

  // Create theme ID to color index map
  const themeColorMap = useMemo(() => {
    const map: Record<number, number> = {}
    themes.forEach((theme, index) => {
      map[theme.id] = index % THEME_COLORS.length
    })
    return map
  }, [themes])

  // Get week start for current date
  const weekStart = useMemo(() => {
    if (controlledWeekStart) return controlledWeekStart
    const start = startOfWeek(currentDate, { weekStartsOn: 1 })
    return format(start, 'yyyy-MM-dd')
  }, [currentDate, controlledWeekStart])

  // Fetch calendar events with caching
  const { data: fetchedEvents = [] } = useQuery({
    queryKey: ['calendarEvents', weekStart],
    queryFn: () => fetchCalendarEvents(weekStart),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  })

  // Combine fetched events with plan mode events
  const events = useMemo(() => {
    if (planMode) {
      // In plan mode, merge gcal events with planned events
      // Apply any modified times from gcalAssignments
      const gcalEvents = fetchedEvents.map(e => {
        const assignment = gcalAssignments.get(e.id)
        if (assignment?.modifiedStart && assignment?.modifiedEnd) {
          return {
            ...e,
            source: 'gcal' as const,
            start: assignment.modifiedStart,
            end: assignment.modifiedEnd,
          }
        }
        return { ...e, source: 'gcal' as const }
      })
      return [...gcalEvents, ...planModeEvents]
    }
    return fetchedEvents
  }, [planMode, fetchedEvents, planModeEvents, gcalAssignments])

  const handleThemeClick = (themeId: number) => {
    setSelectedThemeId(prev => prev === themeId ? null : themeId)
  }

  const handleNavigate = useCallback((newDate: Date) => {
    setCurrentDate(newDate)
    if (onWeekChange) {
      const start = startOfWeek(newDate, { weekStartsOn: 1 })
      onWeekChange(format(start, 'yyyy-MM-dd'))
    }
  }, [onWeekChange])

  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    if (planMode && onSelectSlot) {
      onSelectSlot(slotInfo)
    }
  }, [planMode, onSelectSlot])

  const handleSelectEvent = useCallback((event: CalendarEvent, e: React.SyntheticEvent) => {
    if (planMode && event.source === 'gcal') {
      // Show popover for gcal events in plan mode
      const mouseEvent = e.nativeEvent as MouseEvent
      setPopoverEvent(event)
      setPopoverPosition({ x: mouseEvent.clientX + 10, y: mouseEvent.clientY + 10 })
    } else if (planMode && onEventClick) {
      // For planned tasks, use the original click handler
      onEventClick(event)
    }
  }, [planMode, onEventClick])

  const handlePopoverClose = useCallback(() => {
    setPopoverEvent(null)
  }, [])

  const handlePopoverAssign = useCallback(() => {
    if (popoverEvent && onAssignEvent) {
      onAssignEvent(popoverEvent)
    }
    setPopoverEvent(null)
  }, [popoverEvent, onAssignEvent])

  const handlePopoverDeassign = useCallback(() => {
    if (popoverEvent && onDeassignEvent) {
      onDeassignEvent(popoverEvent)
    }
    setPopoverEvent(null)
  }, [popoverEvent, onDeassignEvent])

  const handlePopoverEdit = useCallback(() => {
    if (popoverEvent && onEditEvent) {
      onEditEvent(popoverEvent)
    }
    setPopoverEvent(null)
  }, [popoverEvent, onEditEvent])

  const handleDoubleClickEvent = useCallback((event: CalendarEvent) => {
    if (planMode && onEventDoubleClick) {
      onEventDoubleClick(event)
    }
  }, [planMode, onEventDoubleClick])

  const handleEventDrop = useCallback((args: EventInteractionArgs<CalendarEvent>) => {
    if (planMode && onEventDrop && args.start && args.end) {
      onEventDrop({ event: args.event, start: args.start as Date, end: args.end as Date })
    }
  }, [planMode, onEventDrop])

  const handleEventResize = useCallback((args: EventInteractionArgs<CalendarEvent>) => {
    if (planMode && onEventResize && args.start && args.end) {
      onEventResize({ event: args.event, start: args.start as Date, end: args.end as Date })
    }
  }, [planMode, onEventResize])

  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    if (planMode) {
      // Plan mode styling
      let colors = PLAN_MODE_COLORS.gcal
      let isHighlighted = false
      
      // Check if this GCal event is assigned to the current action
      if (event.source === 'gcal') {
        const assignment = gcalAssignments.get(event.id)
        if (assignment?.actionId === currentActionId) {
          colors = PLAN_MODE_COLORS.current
          isHighlighted = true
        } else if (assignment) {
          colors = PLAN_MODE_COLORS.planned
        }
      } else if (event.source === 'current' || event.actionId === currentActionId) {
        colors = PLAN_MODE_COLORS.current
        isHighlighted = true
      } else if (event.source === 'planned') {
        colors = PLAN_MODE_COLORS.planned
      }
      
      return {
        style: {
          backgroundColor: colors.bg,
          borderLeft: `3px solid ${colors.border}`,
          color: colors.text,
          borderRadius: '4px',
          padding: '2px 6px',
          fontSize: '11px',
          fontWeight: isHighlighted ? 600 : 500,
          boxShadow: isHighlighted ? '0 2px 8px rgba(139, 148, 103, 0.4)' : 'none',
          transform: isHighlighted ? 'scale(1.02)' : 'none',
          zIndex: isHighlighted ? 10 : 1,
        }
      }
    }

    // Normal mode styling
    const colorIndex = event.themeId && themeColorMap[event.themeId] !== undefined 
      ? themeColorMap[event.themeId] % THEME_COLORS.length
      : 0
    const colors = THEME_COLORS[colorIndex]
    const isHighlighted = selectedThemeId === null || event.themeId === selectedThemeId

    return {
      style: {
        backgroundColor: isHighlighted ? colors.bg : 'rgba(200, 200, 200, 0.15)',
        borderLeft: `3px solid ${isHighlighted ? colors.border : '#ccc'}`,
        color: isHighlighted ? colors.text : '#999',
        opacity: 1,
        borderRadius: '4px',
        padding: '2px 6px',
        fontSize: '11px',
        fontWeight: isHighlighted ? 500 : 400,
        transform: isHighlighted && selectedThemeId !== null ? 'scale(1.02)' : 'none',
        boxShadow: isHighlighted && selectedThemeId !== null ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
      }
    }
  }, [planMode, currentActionId, gcalAssignments, themeColorMap, selectedThemeId])

  const formatWeekRange = (date: Date) => {
    const start = startOfWeek(date, { weekStartsOn: 1 })
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`
  }

  // Check if today is Sunday (planning day)
  const isPlanningDay = isSunday(new Date())

  // Calendar component to use
  const CalendarComponent = planMode ? DnDCalendar : Calendar

  return (
    <div className="right-panel">
      <div className="calendar-card">
        {/* Theme Chips Bar */}
        <div className="themes-bar">
          {!planMode && themes.map((theme, index) => {
            const colorIndex = index % THEME_COLORS.length
            const isActive = selectedThemeId === theme.id

            return (
              <div
                key={theme.id}
                className={`theme-chip ${isActive ? 'active' : ''}`}
                onClick={() => handleThemeClick(theme.id)}
                style={{
                  '--chip-color': THEME_COLORS[colorIndex].border,
                } as React.CSSProperties}
              >
                <span
                  className="theme-dot"
                  style={{ background: isActive ? 'white' : THEME_COLORS[colorIndex].border }}
                />
                <span className="theme-name">{theme.title}</span>
              </div>
            )
          })}
          
          {planMode && (
            <div className="plan-mode-legend">
              <div className="legend-item">
                <div className="legend-dot" style={{ background: PLAN_MODE_COLORS.gcal.border }} />
                <span>Google Calendar</span>
              </div>
              <div className="legend-item">
                <div className="legend-dot" style={{ background: PLAN_MODE_COLORS.current.border }} />
                <span>Current Action</span>
              </div>
              <div className="legend-item">
                <div className="legend-dot" style={{ background: PLAN_MODE_COLORS.planned.border }} />
                <span>Planned</span>
              </div>
            </div>
          )}
          
          {!planMode && (
            <div
              className="theme-chip add-theme-chip"
              onClick={() => navigate('/actions')}
            >
              <span className="theme-name">Manage →</span>
            </div>
          )}
          
          {/* Mode Buttons */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {!planMode && (
              <>
                {onSync && (
                  <button
                    onClick={onSync}
                    disabled={syncing}
                    className="mode-btn"
                    style={{
                      background: syncing ? 'rgba(149, 165, 166, 0.2)' : 'rgba(149, 165, 166, 0.1)',
                      border: '1px solid rgba(149, 165, 166, 0.3)',
                      borderRadius: 8,
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 500,
                      color: syncing ? '#95a5a6' : '#7f8c8d',
                      cursor: syncing ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {syncing ? '⏳' : '🔄'} {syncing ? 'Syncing...' : 'Sync'}
                  </button>
                )}
                <button
                  onClick={() => navigate('/review')}
                  className="mode-btn"
                  style={{
                    background: 'rgba(52, 152, 219, 0.1)',
                    border: '1px solid rgba(52, 152, 219, 0.3)',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#2471a3',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  📊 Review
                </button>
                <button
                  onClick={() => onPlanModeToggle?.(true)}
                  className="mode-btn"
                  style={{
                    background: isPlanningDay ? 'rgba(139, 148, 103, 0.2)' : 'rgba(139, 148, 103, 0.1)',
                    border: isPlanningDay ? '2px solid #8B9467' : '1px solid rgba(139, 148, 103, 0.3)',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#5a6343',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    animation: isPlanningDay ? 'pulse 2s infinite' : 'none',
                  }}
                >
                  📝 Plan {isPlanningDay && '✨'}
                </button>
              </>
            )}
            {planMode && (
              <button
                onClick={() => onPlanModeToggle?.(false)}
                className="mode-btn"
                style={{
                  background: 'rgba(231, 76, 60, 0.1)',
                  border: '1px solid rgba(231, 76, 60, 0.3)',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#c0392b',
                  cursor: 'pointer',
                }}
              >
                ✕ Exit Plan Mode
              </button>
            )}
          </div>
        </div>

        {/* Calendar Header */}
        <div className="calendar-header">
          <div className="calendar-nav">
            <button
              className="calendar-nav-btn"
              onClick={() => {
                const newDate = new Date(currentDate)
                newDate.setDate(newDate.getDate() - 7)
                handleNavigate(newDate)
              }}
            >
              ←
            </button>
            <span className="calendar-title">{formatWeekRange(currentDate)}</span>
            <button
              className="calendar-nav-btn"
              onClick={() => {
                const newDate = new Date(currentDate)
                newDate.setDate(newDate.getDate() + 7)
                handleNavigate(newDate)
              }}
            >
              →
            </button>
          </div>
          <div className="calendar-nav" style={{ gap: 8 }}>
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="calendar-nav-btn"
              style={{ textDecoration: 'none' }}
            >
              📅 View
            </a>
            <button
              className="calendar-nav-btn"
              onClick={() => handleNavigate(new Date())}
            >
              Today
            </button>
          </div>
        </div>

        {/* Calendar */}
        <div className={`calendar-container ${planMode ? 'plan-mode-calendar' : ''}`} style={{ 
          height: planMode ? 500 : 300, 
          overflow: 'auto',
        }}>
          <CalendarComponent
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            defaultView={Views.WEEK}
            date={currentDate}
            onNavigate={handleNavigate}
            toolbar={false}
            eventPropGetter={eventStyleGetter}
            min={new Date(0, 0, 0, 5, 0, 0)}
            max={new Date(0, 0, 0, 22, 0, 0)}
            step={30}
            timeslots={2}
            scrollToTime={new Date(0, 0, 0, 9, 0, 0)}
            selectable={planMode}
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            onDoubleClickEvent={planMode ? handleDoubleClickEvent : undefined}
            onEventDrop={planMode ? handleEventDrop : undefined}
            onEventResize={planMode ? handleEventResize : undefined}
            resizable={planMode}
            draggableAccessor={() => planMode}
            components={planMode ? {
              event: (props: EventProps<CalendarEvent>) => (
                <PlanModeEventComponent
                  {...props}
                  gcalAssignments={gcalAssignments}
                  currentActionId={currentActionId}
                />
              ),
            } : undefined}
          />
        </div>
      </div>

      {/* Event Popover */}
      {planMode && popoverEvent && (
        <EventPopover
          event={popoverEvent}
          assignment={gcalAssignments.get(popoverEvent.id)}
          currentActionId={currentActionId}
          currentActionTitle={currentActionTitle}
          position={popoverPosition}
          onClose={handlePopoverClose}
          onAssign={handlePopoverAssign}
          onDeassign={handlePopoverDeassign}
          onEdit={handlePopoverEdit}
        />
      )}
    </div>
  )
}
