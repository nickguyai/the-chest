import { useState } from 'react'
import type { CalendarEvent } from '../landing/CalendarPanel'

interface EventEditModalProps {
  event: CalendarEvent
  onSave: (event: CalendarEvent) => void
  onClose: () => void
}

export function EventEditModal({ event, onSave, onClose }: EventEditModalProps) {
  const [title, setTitle] = useState(event.title)
  const [description, setDescription] = useState(event.description || '')
  const [location, setLocation] = useState(event.location || '')
  const [attendeesText, setAttendeesText] = useState(
    event.attendees?.map(a => a.email).join(', ') || ''
  )

  const handleSave = () => {
    const attendees = attendeesText
      .split(',')
      .map(email => email.trim())
      .filter(email => email.length > 0)
      .map(email => ({ email }))

    onSave({
      ...event,
      title,
      description,
      location,
      attendees: attendees.length > 0 ? attendees : undefined,
    })
  }

  const isGcalEvent = event.source === 'gcal'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content event-edit-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isGcalEvent ? 'Edit Google Calendar Event' : 'Edit Planned Event'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          {isGcalEvent && (
            <div className="gcal-notice">
              Changes to Google Calendar events will be applied when you finalize the plan.
            </div>
          )}
          
          <div className="form-group">
            <label>Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Event title"
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Event description"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>Location</label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Event location"
            />
          </div>

          <div className="form-group">
            <label>Attendees (comma-separated emails)</label>
            <input
              type="text"
              value={attendeesText}
              onChange={e => setAttendeesText(e.target.value)}
              placeholder="email1@example.com, email2@example.com"
            />
          </div>

          <div className="event-time-info">
            <span>Start: {event.start.toLocaleString()}</span>
            <span>End: {event.end.toLocaleString()}</span>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>Save</button>
        </div>

        <style>{`
          .event-edit-modal {
            width: 400px;
            max-width: 90vw;
          }
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }
          .modal-content {
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          }
          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            border-bottom: 1px solid #eee;
          }
          .modal-header h3 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
          }
          .modal-close {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #666;
            padding: 0;
            line-height: 1;
          }
          .modal-body {
            padding: 20px;
          }
          .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding: 16px 20px;
            border-top: 1px solid #eee;
          }
          .gcal-notice {
            background: rgba(52, 152, 219, 0.1);
            border: 1px solid rgba(52, 152, 219, 0.3);
            border-radius: 6px;
            padding: 10px 12px;
            font-size: 12px;
            color: #2471a3;
            margin-bottom: 16px;
          }
          .form-group {
            margin-bottom: 16px;
          }
          .form-group label {
            display: block;
            font-size: 12px;
            font-weight: 500;
            color: #666;
            margin-bottom: 6px;
          }
          .form-group input,
          .form-group textarea {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
            box-sizing: border-box;
          }
          .form-group input:focus,
          .form-group textarea:focus {
            outline: none;
            border-color: #8B9467;
          }
          .event-time-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-size: 12px;
            color: #888;
            padding-top: 8px;
            border-top: 1px solid #eee;
          }
          .btn-primary {
            background: #8B9467;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          }
          .btn-primary:hover {
            background: #7a8359;
          }
          .btn-secondary {
            background: #f5f5f5;
            color: #666;
            border: 1px solid #ddd;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          }
          .btn-secondary:hover {
            background: #eee;
          }
        `}</style>
      </div>
    </div>
  )
}
