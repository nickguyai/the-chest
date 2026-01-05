import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Season, Card } from '../../lib/api'

interface SeasonSidebarProps {
  season: Season | null
  activeActions: Card[]
  themeCount: number
  hoursLogged?: number
  avgCondition?: number
  vetoesTripped?: number
  totalVetoes?: number
  allSeasons?: Season[]
}

export function SeasonSidebar({
  season,
  activeActions,
  themeCount,
  hoursLogged = 0,
  avgCondition = 0,
  vetoesTripped = 0,
  totalVetoes = 0,
  allSeasons = [],
}: SeasonSidebarProps) {
  const navigate = useNavigate()
  const [actionsExpanded, setActionsExpanded] = useState(false)
  
  // No active season - show create option and past seasons
  if (!season) {
    const pastSeasons = allSeasons.filter(s => !s.isActive)
    
    return (
      <aside className="season-sidebar">
        <div className="no-season-state">
          <div className="no-season-icon">📅</div>
          <h3 className="no-season-title">No Active Season</h3>
          <p className="no-season-desc">Create a season to start tracking your progress</p>
          
          <button
            onClick={() => navigate('/seasons/new')}
            className="create-season-btn"
          >
            + Create New Season
          </button>
        </div>

        {/* Past Seasons */}
        {pastSeasons.length > 0 && (
          <div className="past-seasons-section">
            <div className="past-seasons-title">Past Seasons</div>
            <div className="past-seasons-list">
              {pastSeasons.slice(0, 5).map((s) => {
                const startDate = new Date(s.startDate)
                const endDate = new Date(startDate)
                endDate.setDate(endDate.getDate() + s.durationWeeks * 7)
                
                return (
                  <div
                    key={s.id}
                    className="past-season-item"
                    onClick={() => navigate(`/seasons/${s.id}`)}
                  >
                    <div className="past-season-name">{s.name}</div>
                    <div className="past-season-dates">
                      {startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                )
              })}
            </div>
            {pastSeasons.length > 5 && (
              <button
                onClick={() => navigate('/seasons')}
                className="view-all-seasons-btn"
              >
                View all {pastSeasons.length} seasons →
              </button>
            )}
          </div>
        )}
      </aside>
    )
  }

  const startDate = new Date(season.startDate)
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + season.durationWeeks * 7)

  const now = new Date()
  const totalDays = season.durationWeeks * 7
  const daysPassed = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
  const weeksPassed = Math.ceil(daysPassed / 7)
  const progressPercent = Math.min(100, Math.round((daysPassed / totalDays) * 100))

  const totalCapacity = season.durationWeeks * season.utilityRate

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const activeBets = activeActions.filter(a => a.unitType === 'ACTION_GATE' || a.unitType === 'ACTION_EXPERIMENT')

  // Count actions by type
  const actionCounts = {
    ACTION_GATE: activeActions.filter(a => a.unitType === 'ACTION_GATE').length,
    ACTION_EXPERIMENT: activeActions.filter(a => a.unitType === 'ACTION_EXPERIMENT').length,
    ACTION_ROUTINE: activeActions.filter(a => a.unitType === 'ACTION_ROUTINE').length,
    ACTION_OPS: activeActions.filter(a => a.unitType === 'ACTION_OPS').length,
  }

  const TYPE_LABELS: Record<string, string> = {
    ACTION_GATE: 'Gates',
    ACTION_EXPERIMENT: 'Experiments',
    ACTION_ROUTINE: 'Routines',
    ACTION_OPS: 'Ops',
  }

  const TYPE_COLORS: Record<string, string> = {
    ACTION_GATE: '#E74C3C',
    ACTION_EXPERIMENT: '#9B59B6',
    ACTION_ROUTINE: '#1ABC9C',
    ACTION_OPS: '#F39C12',
  }

  return (
    <aside className="season-sidebar">
      {/* Header */}
      <div className="season-header">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="season-name">{season.name}</span>
          <span className="season-dates">
            {formatDate(startDate)} - {formatDate(endDate)}
          </span>
        </div>
        <button
          onClick={() => navigate(`/seasons/${season.id}/edit`)}
          style={{
            background: 'rgba(139, 148, 103, 0.1)',
            border: 'none',
            borderRadius: 8,
            padding: '4px 8px',
            fontSize: 10,
            color: '#8B9467',
            cursor: 'pointer',
            fontWeight: 600,
            height: 'fit-content',
          }}
        >
          Edit
        </button>
      </div>

      {/* Progress */}
      <div className="season-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="progress-labels">
          <span>Week {weeksPassed} of {season.durationWeeks}</span>
          <span>{progressPercent}%</span>
        </div>
      </div>

      {/* Stats */}
      <div className="season-stats">
        <div className="stat-row">
          <span className="stat-label">Total Capacity</span>
          <span className="stat-value">{totalCapacity}h</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Hours Logged</span>
          <span className="stat-value sage">{hoursLogged}h</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Themes</span>
          <span className="stat-value">{themeCount}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Avg Condition</span>
          <span className="stat-value purple">{avgCondition}%</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Guardrails Tripped</span>
          <span className="stat-value">{vetoesTripped}/{totalVetoes}</span>
        </div>
      </div>

      {/* Season Grading Buttons */}
      <div style={{ 
        display: 'flex', 
        gap: 8, 
        marginTop: 16, 
        paddingTop: 16, 
        borderTop: '1px solid var(--color-sage-border-light)' 
      }}>
        <button
          onClick={() => navigate(`/seasons/${season.id}/grading?type=mid_season`)}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid rgba(243, 156, 18, 0.3)',
            background: 'rgba(243, 156, 18, 0.08)',
            color: '#D68910',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          Mid-Season
        </button>
        <button
          onClick={() => navigate(`/seasons/${season.id}/grading?type=end_season`)}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid rgba(139, 148, 103, 0.3)',
            background: 'rgba(139, 148, 103, 0.08)',
            color: '#8B9467',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          End-Season
        </button>
      </div>

      {/* Active Actions Section - Collapsible */}
      <div className="active-bets-section">
        <div className="action-counts-grid">
          {(['ACTION_GATE', 'ACTION_EXPERIMENT', 'ACTION_ROUTINE', 'ACTION_OPS'] as const).map(type => (
            <div key={type} className="action-count-item">
              <div 
                className="action-count-dot" 
                style={{ background: TYPE_COLORS[type] }}
              />
              <span className="action-count-label">{TYPE_LABELS[type]}</span>
              <span className="action-count-value">{actionCounts[type]}</span>
            </div>
          ))}
        </div>
        
        <div 
          className="active-actions-header"
          onClick={() => setActionsExpanded(!actionsExpanded)}
        >
          <div className="active-bets-title" style={{ marginBottom: 0 }}>
            Active Actions ({activeActions.length})
          </div>
          <span className="collapse-icon">{actionsExpanded ? '▼' : '▶'}</span>
        </div>
        
        {actionsExpanded && (
          <div className="active-bets-list">
            {activeBets.map((action) => (
              <div
                key={action.id}
                className="bet-item"
                onClick={() => navigate(`/contract/${action.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <div className="bet-title">{action.title}</div>
                <div className="bet-theme">{action.unitType.replace('ACTION_', '')}</div>
              </div>
            ))}
            {activeBets.length === 0 && (
              <div style={{ color: '#999999', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>
                No active gates or experiments
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
