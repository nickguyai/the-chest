import { useEffect, useRef, useState } from 'react'
import { CalendarEvent, GcalAssignment } from './CalendarPanel'
import { format } from 'date-fns'

interface EventPopoverProps {
  event: CalendarEvent
  assignment?: GcalAssignment
  currentActionId?: number | null
  currentActionTitle?: string
  position: { x: number; y: number }
  onClose: () => void
  onAssign: () => void
  onDeassign: () => void
  onEdit: () => void
}

export function EventPopover({
  event,
  assignment,
  currentActionId,
  currentActionTitle,
  position,
  onClose,
  onAssign,
  onDeassign,
  onEdit,
}: EventPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [adjustedPosition, setAdjustedPosition] = useState(position)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // Adjust position to stay within viewport
  useEffect(() => {
    if (popoverRef.current) {
      const rect = popoverRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      
      let x = position.x
      let y = position.y
      
      // Adjust horizontal position
      if (x + rect.width > viewportWidth - 20) {
        x = position.x - rect.width - 10
      }
      // Adjust vertical position
      if (y + rect.height > viewportHeight - 20) {
        y = viewportHeight - rect.height - 20
      }
      if (y < 20) y = 20
      
      setAdjustedPosition({ x, y })
    }
  }, [position])

  const isGcalEvent = event.source === 'gcal'
  const isAssignedToCurrent = assignment?.actionId === currentActionId
  const isAssignedToOther = assignment && assignment.actionId !== currentActionId

  const formatTime = (date: Date) => format(date, 'h:mm a')
  const formatDate = (date: Date) => format(date, 'EEE, MMM d')

  return (
    <div
      ref={popoverRef}
      className="event-popover"
      style={{
        position: 'fixed',
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 1000,
      }}
    >
      <div className="event-popover-header">
        <h4 className="event-popover-title">{event.title}</h4>
        <button className="event-popover-close" onClick={onClose}>×</button>
      </div>
      
      <div className="event-popover-time">
        <span className="event-popover-icon">🕐</span>
        <span>
          {formatDate(event.start)} · {formatTime(event.start)} - {formatTime(event.end)}
        </span>
      </div>

      {event.location && (
        <div className="event-popover-location">
          <span className="event-popover-icon">📍</span>
          <span>{event.location}</span>
        </div>
      )}

      {event.description && (
        <div className="event-popover-description">
          <span className="event-popover-icon">📝</span>
          <span>{event.description.slice(0, 100)}{event.description.length > 100 ? '...' : ''}</span>
        </div>
      )}

      <div className="event-popover-divider" />

      <div className="event-popover-assignment">
        <span className="event-popover-label">Assignment:</span>
        {assignment ? (
          <span className="event-popover-assigned">
            {assignment.actionTitle}
            {isAssignedToCurrent && <span className="badge-current">current</span>}
          </span>
        ) : (
          <span className="event-popover-unassigned">Not assigned</span>
        )}
      </div>

      <div className="event-popover-actions">
        {isGcalEvent && currentActionId && (
          <>
            {!assignment && (
              <button className="popover-btn assign" onClick={onAssign}>
                Assign to {currentActionTitle || 'current action'}
              </button>
            )}
            {isAssignedToCurrent && (
              <button className="popover-btn deassign" onClick={onDeassign}>
                Remove assignment
              </button>
            )}
            {isAssignedToOther && (
              <button className="popover-btn reassign" onClick={onAssign}>
                Reassign to {currentActionTitle || 'current action'}
              </button>
            )}
          </>
        )}
        <button className="popover-btn edit" onClick={onEdit}>
          Edit event
        </button>
      </div>
    </div>
  )
}
