import { useState, useEffect } from 'react';
import { Button, Card } from '../ui';
import { getAuthenticatedUserId } from '../../lib/auth';

interface CalendarAccount {
  id: string;
  provider: string;
  email: string;
  selectedCalendarIds: string[];
  writeCalendarId: string | null;
  createdAt: string;
}

interface CalendarInfo {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole: string;
  backgroundColor?: string;
}

export function CalendarSettings() {
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<Record<string, CalendarInfo[]>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    setLoading(true);
    try {
      const res = await fetch('/api/calendar/accounts', {
        headers: { 'x-user-id': String(getAuthenticatedUserId()) },
      });
      const data = await res.json();
      setAccounts(data);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
    setLoading(false);
  }

  async function fetchCalendars(accountId: string) {
    if (calendars[accountId]) return;
    try {
      const res = await fetch(`/api/calendar/accounts/${accountId}/calendars`, {
        headers: { 'x-user-id': String(getAuthenticatedUserId()) },
      });
      const data = await res.json();
      setCalendars((prev) => ({ ...prev, [accountId]: data }));
    } catch (error) {
      console.error('Failed to fetch calendars:', error);
    }
  }

  function handleConnect() {
    const userId = getAuthenticatedUserId();
    window.location.href = `/api/calendar/google/authorize?userId=${userId}`;
  }

  async function handleDisconnect(accountId: string) {
    if (!confirm('Disconnect this Google account? Event links will be preserved.')) return;
    try {
      await fetch(`/api/calendar/accounts/${accountId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': String(getAuthenticatedUserId()) },
      });
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  }

  async function handleToggleCalendar(accountId: string, calendarId: string) {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;

    const selected = account.selectedCalendarIds.includes(calendarId)
      ? account.selectedCalendarIds.filter((id) => id !== calendarId)
      : [...account.selectedCalendarIds, calendarId];

    await updatePreferences(accountId, { selectedCalendarIds: selected });
  }

  async function handleSetWriteCalendar(accountId: string, calendarId: string) {
    await updatePreferences(accountId, { writeCalendarId: calendarId });
  }

  async function updatePreferences(
    accountId: string,
    prefs: { selectedCalendarIds?: string[]; writeCalendarId?: string }
  ) {
    setSaving(true);
    try {
      const res = await fetch(`/api/calendar/accounts/${accountId}/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(getAuthenticatedUserId()),
        },
        body: JSON.stringify(prefs),
      });
      const updated = await res.json();
      setAccounts((prev) =>
        prev.map((a) => (a.id === accountId ? { ...a, ...updated } : a))
      );
    } catch (error) {
      console.error('Failed to update preferences:', error);
    }
    setSaving(false);
  }

  function toggleExpand(accountId: string) {
    if (expandedAccount === accountId) {
      setExpandedAccount(null);
    } else {
      setExpandedAccount(accountId);
      fetchCalendars(accountId);
    }
  }

  if (loading) {
    return <Card><p className="text-muted">Loading calendar accounts...</p></Card>;
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h2 className="text-lg font-semibold">Calendar Integration</h2>
        <Button variant="primary" size="sm" onClick={handleConnect}>
          + Connect Google Account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <div
          style={{
            padding: 'var(--space-8)',
            textAlign: 'center',
            background: 'var(--color-bg)',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--color-sage-border)',
          }}
        >
          <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>
            No calendar accounts connected.
          </p>
          <p className="text-sm text-muted">
            Connect your Google Calendar to sync events for weekly review and planning.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {accounts.map((account) => (
            <div
              key={account.id}
              style={{
                background: 'var(--color-bg)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-sage-border-light)',
                overflow: 'hidden',
              }}
            >
              {/* Account Header */}
              <div
                style={{
                  padding: 'var(--space-4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  cursor: 'pointer',
                }}
                onClick={() => toggleExpand(account.id)}
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
                    fontWeight: 600,
                  }}
                >
                  G
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{account.email}</div>
                  <div className="text-sm text-muted">
                    {account.selectedCalendarIds.length} calendar(s) synced
                  </div>
                </div>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {expandedAccount === account.id ? '▼' : '▶'}
                </span>
              </div>

              {/* Expanded Content */}
              {expandedAccount === account.id && (
                <div
                  style={{
                    padding: 'var(--space-4)',
                    borderTop: '1px solid var(--color-sage-border-light)',
                    background: 'var(--color-card)',
                  }}
                >
                  {/* Calendar Selection */}
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <label className="text-sm font-medium text-secondary uppercase mb-2 block">
                      Calendars to Sync
                    </label>
                    {calendars[account.id] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {calendars[account.id].map((cal) => (
                          <label
                            key={cal.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              cursor: 'pointer',
                              fontSize: 14,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={account.selectedCalendarIds.includes(cal.id)}
                              onChange={() => handleToggleCalendar(account.id, cal.id)}
                              disabled={saving}
                            />
                            <span
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: 2,
                                background: cal.backgroundColor || '#8B9467',
                              }}
                            />
                            <span>{cal.summary}</span>
                            {cal.primary && (
                              <span className="text-xs text-muted">(Primary)</span>
                            )}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted">Loading calendars...</p>
                    )}
                  </div>

                  {/* Write Calendar */}
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <label className="text-sm font-medium text-secondary uppercase mb-2 block">
                      Create Events In
                    </label>
                    <select
                      value={account.writeCalendarId || 'primary'}
                      onChange={(e) => handleSetWriteCalendar(account.id, e.target.value)}
                      disabled={saving || !calendars[account.id]}
                      style={{
                        width: '100%',
                        padding: 'var(--space-2) var(--space-3)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-sage-border)',
                        fontSize: 14,
                      }}
                    >
                      {calendars[account.id]?.map((cal) => (
                        <option key={cal.id} value={cal.id}>
                          {cal.summary}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                      New events from weekly planning will be created here.
                    </p>
                  </div>

                  {/* Disconnect */}
                  <div style={{ paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-sage-border-light)' }}>
                    <button
                      onClick={() => handleDisconnect(account.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#DC2626',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      Disconnect Account
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
