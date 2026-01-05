import { useMemo } from 'react';
import { WeekReview } from '../components/weekly/WeekReview';
import { AgentChat } from '../components/AgentChat';
import { MenuCard } from '../components/MenuCard';
import { getReviewWeekStart, formatWeekRange } from '../utils/dateUtils';

export default function ReviewPage() {
  // Use getReviewWeekStart which handles Sunday correctly
  const weekStart = useMemo(() => getReviewWeekStart(), []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: '16px' }}>
      {/* Menu Card */}
      <div style={{ maxWidth: 300, marginBottom: 16 }}>
        <MenuCard currentPage="review" />
      </div>

      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          marginBottom: 16,
          background: 'white',
          borderRadius: 12,
          border: '1px solid rgba(139, 148, 103, 0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#333' }}>
          📊 Weekly Review
        </h2>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: '#666' }}>
          Reviewing: {formatWeekRange(weekStart)}
        </span>
      </div>

      {/* Main Content */}
      <main style={{ maxWidth: 1000, margin: '0 auto' }}>
        <WeekReview weekStart={weekStart} />
      </main>

      <AgentChat />
    </div>
  );
}
