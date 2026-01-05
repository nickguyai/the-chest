import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Season } from '../../lib/api'

interface LeftPanelCardProps {
  vetoes: Card[]
  season: Season | null
  themeCount?: number
  onAddVeto?: () => void
  onMidSeasonGrade?: () => void
  onEndSeasonGrade?: () => void
}

export function LeftPanelCard({ vetoes, season, themeCount = 0, onAddVeto, onMidSeasonGrade, onEndSeasonGrade }: LeftPanelCardProps) {
  const [activeTab, setActiveTab] = useState<'vetoes' | 'season'>('vetoes')
  const navigate = useNavigate()

  // Season calculations
  const startDate = season ? new Date(season.startDate) : new Date()
  const endDate = new Date(startDate)
  if (season) endDate.setDate(endDate.getDate() + season.durationWeeks * 7)

  const now = new Date()
  const totalDays = season ? season.durationWeeks * 7 : 1
  const daysPassed = season ? Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))) : 0
  const weeksPassed = Math.ceil(daysPassed / 7)
  const progressPercent = Math.min(100, Math.round((daysPassed / totalDays) * 100))
  const totalCapacity = season ? season.durationWeeks * season.utilityRate : 0
  
  // Determine if mid-season or end-season grading is available
  const isMidSeason = season && progressPercent >= 40 && progressPercent <= 60
  const isEndSeason = season && progressPercent >= 90

  const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="left-panel">
      <div className="panel-card">
        <div className="panel-tabs">
          <button
            className={`panel-tab ${activeTab === 'vetoes' ? 'active' : ''}`}
            onClick={() => setActiveTab('vetoes')}
          >
            Vetoes
          </button>
          <button
            className={`panel-tab ${activeTab === 'season' ? 'active' : ''}`}
            onClick={() => setActiveTab('season')}
          >
            Season
          </button>
        </div>

        {/* Vetoes Tab */}
        <div className={`panel-content ${activeTab === 'vetoes' ? 'active' : ''}`}>
          <div className="vetoes-content">
            {vetoes.map((veto, index) => (
              <div key={veto.id} className="veto-item">
                <span className="veto-number">{index + 1}</span>
                <span className="veto-text">{veto.title}</span>
              </div>
            ))}
            {onAddVeto && (
              <div className="veto-item add-veto" onClick={onAddVeto}>
                <span className="veto-text">+ Add Veto</span>
              </div>
            )}
          </div>
        </div>

        {/* Season Tab */}
        <div className={`panel-content ${activeTab === 'season' ? 'active' : ''}`}>
          {season ? (
            <div className="season-content">
              <div className="season-header-row">
                <div>
                  <div className="season-name-text">{season.name}</div>
                  <div className="season-dates-text">
                    {formatDate(startDate)} - {formatDate(endDate)}
                  </div>
                </div>
                <button
                  className="edit-btn"
                  onClick={() => navigate(`/seasons/${season.id}/edit`)}
                >
                  Edit
                </button>
              </div>

              <div className="progress-section">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
                </div>
                <div className="progress-labels">
                  <span>Week {weeksPassed} of {season.durationWeeks}</span>
                  <span>{progressPercent}%</span>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-box">
                  <div className="stat-value">{totalCapacity}h</div>
                  <div className="stat-label">Capacity</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value">--</div>
                  <div className="stat-label">Logged</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value">{themeCount}</div>
                  <div className="stat-label">Themes</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value">{vetoes.length}</div>
                  <div className="stat-label">Vetoes</div>
                </div>
              </div>

              {/* Grading Buttons */}
              <div className="grading-buttons">
                <button
                  className={`grading-btn mid-season ${isMidSeason ? 'available' : ''}`}
                  onClick={onMidSeasonGrade}
                  disabled={!isMidSeason}
                  title={isMidSeason ? 'Grade mid-season criteria' : 'Available at 40-60% progress'}
                >
                  📊 Mid-Season Grade
                </button>
                <button
                  className={`grading-btn end-season ${isEndSeason ? 'available' : ''}`}
                  onClick={onEndSeasonGrade}
                  disabled={!isEndSeason}
                  title={isEndSeason ? 'Grade end-of-season criteria' : 'Available at 90%+ progress'}
                >
                  🏆 End-Season Grade
                </button>
              </div>
            </div>
          ) : (
            <div className="no-season-content">
              <div className="no-season-icon">📅</div>
              <h3>No Active Season</h3>
              <p>Create a season to start tracking</p>
              <button
                className="create-season-btn"
                onClick={() => navigate('/seasons/new')}
              >
                + Create Season
              </button>
            </div>
          )}
        </div>
      </div>


    </div>
  )
}
