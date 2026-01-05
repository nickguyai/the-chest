import { useState, useEffect } from 'react';
import { getAuthenticatedUserId } from '../../lib/auth';

interface RoutineLink {
  id: string;
  cardId: number;
  cardTitle: string;
  accountId: string;
  calendarId: string;
  calendarName: string | null;
  recurringEventId: string;
  iCalUid: string | null;
  createdAt: string;
  eventSummary: string | null;
  eventRecurrence: string | null;
}

interface RecurringEventOption {
  accountId: string;
  calendarId: string;
  calendarName: string;
  recurringEventId: string;
  iCalUid: string;
  summary: string;
  recurrenceDescription: string;
}

interface Props {
  cardId: number;
}

export function RoutineLinkSection({ cardId }: Props) {
  const [link, setLink] = useState<RoutineLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [recurringEvents, setRecurringEvents] = useState<RecurringEventOption[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLink();
  }, [cardId]);

  async function fetchLink() {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar/routines/links/${cardId}`, {
        headers: { 'x-user-id': String(getAuthenticatedUserId()) },
      });
      const data = await res.json();
      setLink(data);
    } catch (error) {
      console.error('Failed to fetch routine link:', error);
    }
    setLoading(false);
  }

  async function fetchRecurringEvents() {
    setLoadingEvents(true);
    try {
      const res = await fetch('/api/calendar/routines/recurring-events', {
        headers: { 'x-user-id': String(getAuthenticatedUserId()) },
      });
      const data = await res.json();
      setRecurringEvents(data);
    } catch (error) {
      console.error('Failed to fetch recurring events:', error);
    }
    setLoadingEvents(false);
  }

  async function handleLink(event: RecurringEventOption) {
    setSaving(true);
    try {
      const res = await fetch('/api/calendar/routines/link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(getAuthenticatedUserId()),
        },
        body: JSON.stringify({
          cardId,
          accountId: event.accountId,
          calendarId: event.calendarId,
          recurringEventId: event.recurringEventId,
          iCalUid: event.iCalUid,
        }),
      });
      if (res.ok) {
        await fetchLink();
        setShowPicker(false);
      }
    } catch (error) {
      console.error('Failed to link routine:', error);
    }
    setSaving(false);
  }

  async function handleUnlink() {
    if (!confirm('Unlink this calendar event? Future instances will no longer auto-classify.')) return;
    setSaving(true);
    try {
      await fetch(`/api/calendar/routines/link/${cardId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': String(getAuthenticatedUserId()) },
      });
      setLink(null);
    } catch (error) {
      console.error('Failed to unlink routine:', error);
    }
    setSaving(false);
  }

  function openPicker() {
    setShowPicker(true);
    fetchRecurringEvents();
  }

  if (loading) {
    return (
      <div className="field-box">
        <label className="field-label">Calendar Link</label>
        <div style={{ color: '#999', fontSize: 13 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="field-box">
      <label className="field-label">Calendar Link</label>
      <div className="field-hint" style={{ marginBottom: 12 }}>
        Link to a recurring Google Calendar event. All instances will auto-classify to this routine.
      </div>

      {link ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            background: 'rgba(139, 148, 103, 0.1)',
            borderRadius: 8,
            border: '1px solid rgba(139, 148, 103, 0.2)',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #4285F4, #34A853)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 14,
            }}
          >
            🔗
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 14 }}>
              {link.eventSummary || 'Linked to recurring event'}
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>
              {link.calendarName && link.eventRecurrence
                ? `${link.calendarName} • ${link.eventRecurrence}`
                : link.calendarName || link.eventRecurrence || 'Calendar event'}
            </div>
          </div>
          <button
            onClick={handleUnlink}
            disabled={saving}
            style={{
              background: 'none',
              border: '1px solid rgba(231, 76, 60, 0.3)',
              borderRadius: 6,
              padding: '6px 12px',
              color: '#E74C3C',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {saving ? 'Unlinking...' : 'Unlink'}
          </button>
        </div>
      ) : (
        <button
          onClick={openPicker}
          style={{
            width: '100%',
            padding: 12,
            background: 'var(--color-bg)',
            border: '1px dashed var(--color-sage-border)',
            borderRadius: 8,
            color: 'var(--color-sage)',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <span>📅</span>
          Link to Calendar Event
        </button>
      )}

      {/* Event Picker Modal */}
      {showPicker && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setShowPicker(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 16,
              padding: 24,
              maxWidth: 500,
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              Link to Recurring Event
            </h3>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
              Select a recurring event from your connected calendars. All future instances will
              auto-classify to this routine.
            </p>

            {loadingEvents ? (
              <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
                Loading recurring events...
              </div>
            ) : recurringEvents.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: 24,
                  background: '#F5F1EB',
                  borderRadius: 8,
                }}
              >
                <p style={{ color: '#666', marginBottom: 8 }}>No recurring events found.</p>
                <p style={{ fontSize: 12, color: '#999' }}>
                  Create a recurring event in Google Calendar first, then come back here to link it.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recurringEvents.map((event) => (
                  <button
                    key={`${event.accountId}-${event.recurringEventId}`}
                    onClick={() => handleLink(event)}
                    disabled={saving}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-sage-border-light)',
                      borderRadius: 8,
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, #4285F4, #34A853)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: 18,
                      }}
                    >
                      🔄
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>{event.summary}</div>
                      <div style={{ fontSize: 12, color: '#666' }}>
                        {event.calendarName} • {event.recurrenceDescription}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowPicker(false)}
                style={{
                  background: 'none',
                  border: '1px solid var(--color-sage-border)',
                  borderRadius: 8,
                  padding: '8px 16px',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
