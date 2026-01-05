import { useEffect, useState } from 'react';
import { useThemes, useCardsByType } from '../../hooks/useCards';
import { Button } from '../ui';
import { getAuthenticatedUserId } from '../../lib/auth';

interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  calendarId: string;
}

interface ClassifiedEvent {
  event: CalendarEvent;
  accountId: string;
  instanceKey: string;
  cardId: number | null;
  cardTitle: string | null;
  source: string;
  confidence: number;
  suggestions?: Array<{
    cardId: number;
    cardTitle: string;
    confidence: number;
    source: string;
  }>;
}

interface ThemeSummary {
  themeId: number;
  themeName: string;
  actualHours: number;
  plannedHours: number;
  color: string;
}

interface ReviewData {
  summary: {
    totalEvents: number;
    totalHours: number;
    autoClassified: number;
    needsReview: number;
    coverage: number;
  };
  classified: ClassifiedEvent[];
  ambiguous: ClassifiedEvent[];
  themeSummaries: ThemeSummary[];
}

interface Props {
  weekStart: string;
}

export function WeekReview({ weekStart }: Props) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [data, setData] = useState<ReviewData | null>(null);
  const [decisions, setDecisions] = useState<Record<string, number | null>>({});
  const [rememberChoices, setRememberChoices] = useState<Record<string, boolean>>({});

  const { data: themes } = useThemes();
  const { data: gates } = useCardsByType('ACTION_GATE');
  const { data: experiments } = useCardsByType('ACTION_EXPERIMENT');
  const { data: routines } = useCardsByType('ACTION_ROUTINE');
  const { data: ops } = useCardsByType('ACTION_OPS');

  const cards = [
    ...(themes || []).map(t => ({ ...t, unitType: 'THEME' })),
    ...(gates || []).map(g => ({ ...g, unitType: 'ACTION_GATE' })),
    ...(experiments || []).map(e => ({ ...e, unitType: 'ACTION_EXPERIMENT' })),
    ...(routines || []).map(r => ({ ...r, unitType: 'ACTION_ROUTINE' })),
    ...(ops || []).map(o => ({ ...o, unitType: 'ACTION_OPS' })),
  ];

  useEffect(() => {
    fetchReview();
  }, [weekStart]);

  async function fetchReview() {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar/review?weekStart=${weekStart}`, {
        headers: { 'x-user-id': String(getAuthenticatedUserId()) },
      });
      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error('Failed to fetch review:', error);
    }
    setLoading(false);
  }

  async function handleReclassify() {
    setReclassifying(true);
    try {
      const res = await fetch(`/api/calendar/review/reclassify?weekStart=${weekStart}`, {
        method: 'POST',
        headers: { 'x-user-id': String(getAuthenticatedUserId()) },
      });
      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error('Failed to reclassify:', error);
    }
    setReclassifying(false);
  }

  async function handleCommit() {
    if (!data) return;
    setSyncing(true);

    const payload = {
      weekStart,
      decisions: (data.ambiguous || [])
        .filter((e) => decisions[e.event.id] !== undefined)
        .map((e) => ({
          accountId: e.accountId,
          calendarId: e.event.calendarId,
          eventId: e.event.id,
          instanceKey: e.instanceKey,
          cardId: decisions[e.event.id],
          createRule: rememberChoices[e.event.id] || false,
          eventTitle: e.event.summary, // Include event title for rule creation
        })),
    };

    try {
      await fetch('/api/calendar/review/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(getAuthenticatedUserId()),
        },
        body: JSON.stringify(payload),
      });
      await fetchReview();
    } catch (error) {
      console.error('Failed to commit review:', error);
    }
    setSyncing(false);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-12)', gap: 'var(--space-4)' }}>
        <div style={{ fontSize: '24px' }}>✨</div>
        <span className="text-muted">Loading review & running AI classification...</span>
        <span style={{ fontSize: '12px', color: '#999' }}>This may take a few seconds</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        style={{
          padding: 'var(--space-4)',
          background: '#FEE2E2',
          borderRadius: 'var(--radius-md)',
          color: '#DC2626',
        }}
      >
        Failed to load review data
      </div>
    );
  }

  const allDecided = (data.ambiguous || []).every((e) => decisions[e.event.id] !== undefined);

  return (
    <div>
      {/* Reclassifying overlay */}
      {reclassifying && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(255, 255, 255, 0.9)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          gap: 'var(--space-4)',
        }}>
          <div style={{ fontSize: '48px', animation: 'pulse 1.5s infinite' }}>✨</div>
          <span style={{ fontSize: '18px', fontWeight: 600 }}>Running AI Classification...</span>
          <span style={{ fontSize: '14px', color: '#666' }}>Analyzing events with 5 parallel AI calls</span>
        </div>
      )}

      {/* Status Alert */}
      <div
        style={{
          padding: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
          borderRadius: 'var(--radius-md)',
          background: (data.ambiguous || []).length === 0 ? '#D1FAE5' : '#DBEAFE',
          color: (data.ambiguous || []).length === 0 ? '#065F46' : '#1E40AF',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
        }}
      >
        <span>{(data.ambiguous || []).length === 0 ? '✓' : '⚠'}</span>
        {(data.ambiguous || []).length === 0
          ? 'All events classified!'
          : `${(data.ambiguous || []).length} events need your review`}
      </div>

      {/* Summary Stats */}
      <div
        style={{
          background: 'var(--color-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-sage-border-light)',
          padding: 'var(--space-6)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <h3 className="text-lg font-semibold" style={{ marginBottom: 'var(--space-2)' }}>
          Week Summary
        </h3>
        <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-4)' }}>
          {data.summary.totalEvents} events synced from Google Calendar
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)' }}>
          <StatBox label="Total Time" value={`${data.summary.totalHours}h`} variant="highlight" />
          <StatBox label="Auto-Classified" value={data.summary.autoClassified} variant="success" />
          <StatBox label="Needs Review" value={data.summary.needsReview} variant="warning" />
          <StatBox label="Coverage" value={`${data.summary.coverage}%`} />
        </div>
      </div>

      {/* Events Needing Classification */}
      {(data.ambiguous || []).length > 0 && (
        <div
          style={{
            background: 'var(--color-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-sage-border-light)',
            padding: 'var(--space-6)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <h3 className="text-lg font-semibold">Events Needing Classification</h3>
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              <button
                onClick={handleReclassify}
                disabled={reclassifying}
                style={{
                  background: 'var(--color-sage-light)',
                  color: 'var(--color-sage)',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: '1px solid var(--color-sage-border)',
                  cursor: reclassifying ? 'not-allowed' : 'pointer',
                  opacity: reclassifying ? 0.6 : 1,
                }}
              >
                {reclassifying ? '✨ Classifying...' : '✨ Re-classify with AI'}
              </button>
              <span
                style={{
                  background: '#F39C12',
                  color: 'white',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {(data.ambiguous || []).length} remaining
              </span>
            </div>
          </div>

          {(data.ambiguous || []).map((item, index) => (
            <EventCard
              key={`ambiguous-${index}-${item.accountId}-${item.event.calendarId}-${item.event.id}`}
              item={item}
              cards={cards}
              selectedCardId={decisions[item.event.id]}
              onSelect={(cardId) => setDecisions((d) => ({ ...d, [item.event.id]: cardId }))}
              rememberChoice={rememberChoices[item.event.id] || false}
              onRememberChange={(checked) =>
                setRememberChoices((r) => ({ ...r, [item.event.id]: checked }))
              }
            />
          ))}

          <Button
            variant="primary"
            onClick={handleCommit}
            disabled={!allDecided || syncing}
            style={{ width: '100%', marginTop: 'var(--space-4)' }}
          >
            {syncing ? 'Saving...' : `Confirm & Log Time (${(data.ambiguous || []).length} pending)`}
          </Button>
        </div>
      )}

      {/* Theme Summary */}
      {(data.themeSummaries || []).length > 0 && (
        <div
          style={{
            background: 'var(--color-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-sage-border-light)',
            padding: 'var(--space-6)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <h3 className="text-lg font-semibold">Hours by Theme</h3>
            <span
              style={{
                background: '#27AE60',
                color: 'white',
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              Planned vs Actual
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-4)' }}>
            {(data.themeSummaries || []).map((theme) => (
              <ThemeCard key={theme.themeId} theme={theme} />
            ))}
          </div>
        </div>
      )}

      {/* Auto-Classified Events */}
      <div style={{ borderTop: '1px solid var(--color-sage-border-light)', paddingTop: 'var(--space-6)' }}>
        <h3 className="text-lg font-semibold text-muted" style={{ marginBottom: 'var(--space-4)' }}>
          Auto-Classified ({(data.classified || []).length})
        </h3>
        {(data.classified || []).slice(0, 10).map((item, index) => (
          <div
            key={`classified-${index}-${item.accountId}-${item.event.calendarId}-${item.event.id}`}
            style={{
              padding: 'var(--space-2) 0',
              display: 'flex',
              gap: 'var(--space-4)',
              alignItems: 'center',
            }}
          >
            <span style={{ flex: 1 }}>{item.event.summary}</span>
            <span
              style={{
                background: 'var(--color-sage-light)',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            >
              {item.cardTitle || '?'}
            </span>
          </div>
        ))}
        {(data.classified || []).length > 10 && (
          <p className="text-sm text-muted">+{(data.classified || []).length - 10} more</p>
        )}
      </div>
    </div>
  );
}


// Helper Components

function StatBox({
  label,
  value,
  variant,
}: {
  label: string;
  value: string | number;
  variant?: 'highlight' | 'success' | 'warning';
}) {
  const colors = {
    highlight: '#8B9467',
    success: '#27AE60',
    warning: '#F39C12',
    default: '#1A1A1A',
  };
  const color = colors[variant || 'default'];

  return (
    <div
      style={{
        background: 'var(--color-bg)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '28px', fontWeight: 600, fontFamily: 'monospace', color }}>
        {value}
      </div>
      <div style={{ fontSize: '12px', color: '#999' }}>{label}</div>
    </div>
  );
}

function EventCard({
  item,
  cards,
  selectedCardId,
  onSelect,
  rememberChoice,
  onRememberChange,
}: {
  item: ClassifiedEvent;
  cards: Array<{ id: number; title: string; unitType?: string; status?: string }>;
  selectedCardId?: number | null;
  onSelect: (cardId: number | null) => void;
  rememberChoice: boolean;
  onRememberChange: (checked: boolean) => void;
}) {
  const startTime = item.event.start.dateTime || item.event.start.date;
  const endTime = item.event.end?.dateTime || item.event.end?.date;
  const start = new Date(startTime!);
  const end = endTime ? new Date(endTime) : null;

  const timeStr = start.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const duration = end
    ? `${Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60))}h`
    : '';

  // Group cards by type and sort by status
  const groupedCards = {
    THEME: cards.filter(c => c.unitType === 'THEME'),
    ACTION_GATE: cards.filter(c => c.unitType === 'ACTION_GATE'),
    ACTION_EXPERIMENT: cards.filter(c => c.unitType === 'ACTION_EXPERIMENT'),
    ACTION_ROUTINE: cards.filter(c => c.unitType === 'ACTION_ROUTINE'),
    ACTION_OPS: cards.filter(c => c.unitType === 'ACTION_OPS'),
  };

  const typeLabels: Record<string, string> = {
    THEME: '🎯 Themes',
    ACTION_GATE: '🚪 Gates',
    ACTION_EXPERIMENT: '🧪 Experiments',
    ACTION_ROUTINE: '🔄 Routines',
    ACTION_OPS: '⚙️ Ops',
  };

  const statusOrder = ['in_progress', 'not_started', 'completed', 'abandoned'];
  const sortByStatus = (a: any, b: any) => {
    const aIdx = statusOrder.indexOf(a.status || 'not_started');
    const bIdx = statusOrder.indexOf(b.status || 'not_started');
    return aIdx - bIdx;
  };

  const formatStatus = (status?: string) => {
    if (!status) return '';
    const labels: Record<string, string> = {
      in_progress: '▶',
      not_started: '○',
      completed: '✓',
      abandoned: '✗',
    };
    return labels[status] || '';
  };

  return (
    <div
      style={{
        background: 'var(--color-bg)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        marginBottom: 'var(--space-4)',
        border: '1px solid var(--color-sage-border-light)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>{item.event.summary}</div>
          <div className="text-sm text-muted">{timeStr}</div>
        </div>
        {duration && (
          <span
            style={{
              background: 'white',
              padding: '2px 8px',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontWeight: 600,
              fontSize: '12px',
            }}
          >
            {duration}
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'var(--space-4)' }}>
          <span style={{ color: '#F39C12' }}>?</span>
          <span style={{ fontSize: '12px', color: '#F39C12', fontWeight: 500 }}>Pending</span>
        </div>
      </div>

      {/* Suggestions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {item.suggestions?.map((suggestion) => (
          <SuggestionOption
            key={suggestion.cardId}
            title={suggestion.cardTitle}
            confidence={suggestion.confidence}
            isAI={suggestion.source === 'llm'}
            selected={selectedCardId === suggestion.cardId}
            onClick={() => onSelect(suggestion.cardId)}
          />
        ))}
      </div>

      {/* Manual select - moved outside suggestions div */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: 'var(--space-3)',
          marginTop: 'var(--space-2)',
          background: 'white',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-sage-border-light)',
          overflow: 'hidden',
        }}
      >
        <span style={{ fontSize: '13px', color: '#666', whiteSpace: 'nowrap' }}>Or select:</span>
        <select
          value={selectedCardId ?? ''}
          onChange={(e) => onSelect(e.target.value === '' ? null : Number(e.target.value))}
          style={{
            flex: 1,
            minWidth: 0,
            padding: 'var(--space-2)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-sage-border)',
            fontSize: '14px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <option value="">Select card...</option>
          <option value="-1">⏭ Skip / Don't log</option>
          {Object.entries(groupedCards).map(([type, typeCards]) => {
            if (typeCards.length === 0) return null;
            const sorted = [...typeCards].sort(sortByStatus);
            return (
              <optgroup key={type} label={typeLabels[type] || type}>
                {sorted.map((c) => (
                  <option key={c.id} value={c.id}>
                    {formatStatus(c.status)} {c.title}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>

      {/* Remember choice */}
      <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-sage-border-light)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={rememberChoice}
            onChange={(e) => onRememberChange(e.target.checked)}
            style={{ accentColor: 'var(--color-sage)' }}
          />
          <span style={{ fontSize: '12px', color: '#666' }}>
            Remember this choice for future "{item.event.summary}" events
          </span>
        </label>
      </div>
    </div>
  );
}

function SuggestionOption({
  title,
  confidence,
  isAI,
  selected,
  onClick,
}: {
  title: string;
  confidence: number;
  isAI?: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        padding: 'var(--space-3)',
        background: selected ? 'rgba(139, 148, 103, 0.1)' : 'white',
        borderRadius: 'var(--radius-md)',
        border: selected ? '1px solid var(--color-sage)' : '1px solid var(--color-sage-border-light)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: '13px', fontWeight: 500 }}>{title}</span>
      </div>
      {isAI && <span style={{ fontSize: '10px', color: '#9B59B6' }}>✨ AI suggested</span>}
      <span
        style={{
          background: 'rgba(139, 148, 103, 0.1)',
          color: 'var(--color-sage)',
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '11px',
        }}
      >
        {Math.round(confidence * 100)}%
      </span>
    </div>
  );
}

function ThemeCard({ theme }: { theme: ThemeSummary }) {
  const percentage =
    theme.plannedHours > 0 ? Math.min(100, (theme.actualHours / theme.plannedHours) * 100) : 0;

  const colors: Record<string, string> = {
    blue: '#6B7FD7',
    green: '#27AE60',
    purple: '#9B59B6',
    orange: '#F39C12',
  };
  const color = colors[theme.color] || '#8B9467';

  return (
    <div
      style={{
        background: 'var(--color-bg)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        border: '1px solid var(--color-sage-border-light)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <div style={{ width: '4px', height: '24px', borderRadius: '2px', background: color }} />
        <span style={{ fontWeight: 600, fontSize: '14px' }}>{theme.themeName}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-2)' }}>
        <span style={{ fontSize: '24px', fontWeight: 600, fontFamily: 'monospace' }}>
          {theme.actualHours}h
        </span>
        <span style={{ fontSize: '13px', color: '#999' }}>of {theme.plannedHours}h planned</span>
      </div>
      <div
        style={{
          height: '6px',
          background: 'rgba(139, 148, 103, 0.1)',
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percentage}%`,
            background: color,
            borderRadius: '3px',
          }}
        />
      </div>
    </div>
  );
}
