import { useState } from 'react'
import { Card, Badge, Button, Input } from './ui'
import { Season } from '../lib/api'

interface SeasonPanelProps {
  season: Season | null
  onUpdate?: (id: number, data: { name?: string; startDate?: string; durationWeeks?: number; utilityRate?: number }) => void
  onCreate?: (data: { name: string; startDate: string; durationWeeks: number; utilityRate?: number }) => void
}

export function SeasonPanel({ season, onUpdate, onCreate }: SeasonPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  
  // Edit form state
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [durationWeeks, setDurationWeeks] = useState('')
  const [utilityRate, setUtilityRate] = useState('')

  const startEditing = () => {
    if (season) {
      setName(season.name)
      setStartDate(season.startDate.split('T')[0])
      setDurationWeeks(String(season.durationWeeks))
      setUtilityRate(String(season.utilityRate))
      setIsEditing(true)
    }
  }

  const startCreating = () => {
    setName('')
    setStartDate(new Date().toISOString().split('T')[0])
    setDurationWeeks('12')
    setUtilityRate('40')
    setIsCreating(true)
  }

  const handleSave = () => {
    if (isEditing && season && onUpdate) {
      onUpdate(season.id, {
        name,
        startDate,
        durationWeeks: parseInt(durationWeeks, 10),
        utilityRate: parseFloat(utilityRate),
      })
      setIsEditing(false)
    } else if (isCreating && onCreate) {
      onCreate({
        name,
        startDate,
        durationWeeks: parseInt(durationWeeks, 10),
        utilityRate: parseFloat(utilityRate),
      })
      setIsCreating(false)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setIsCreating(false)
  }

  // Create/Edit form
  if (isEditing || isCreating) {
    return (
      <Card>
        <h3 className="text-md font-semibold" style={{ marginBottom: 'var(--space-4)' }}>
          {isEditing ? 'Edit Season' : 'Create Season'}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Q1 2025"
          />
          <Input
            label="Start Date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            label="Duration (weeks)"
            type="number"
            min="1"
            max="52"
            value={durationWeeks}
            onChange={(e) => setDurationWeeks(e.target.value)}
          />
          <Input
            label="Utility Rate (hours/week)"
            type="number"
            min="1"
            max="168"
            value={utilityRate}
            onChange={(e) => setUtilityRate(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
            <Button variant="secondary" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave}>
              {isEditing ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  if (!season) {
    return (
      <Card>
        <h3 className="text-md font-semibold" style={{ marginBottom: 'var(--space-2)' }}>
          Active Season
        </h3>
        <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>
          No active season. Create a season to start planning.
        </p>
        {onCreate && (
          <Button variant="primary" size="sm" onClick={startCreating}>
            Create Season
          </Button>
        )}
      </Card>
    )
  }

  const seasonStartDate = new Date(season.startDate)
  const seasonEndDate = new Date(season.endDate)
  const now = new Date()
  
  // Calculate weeks remaining
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const weeksRemaining = Math.max(0, Math.ceil((seasonEndDate.getTime() - now.getTime()) / msPerWeek))
  const weeksElapsed = season.durationWeeks - weeksRemaining
  const progress = (weeksElapsed / season.durationWeeks) * 100

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-4)' }}>
        <div>
          <h3 className="text-md font-semibold">{season.name}</h3>
          <p className="text-sm text-secondary">
            {formatDate(seasonStartDate)} — {formatDate(seasonEndDate)}
          </p>
        </div>
        <Badge variant="sage">Active</Badge>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div
          style={{
            height: '8px',
            background: 'var(--color-sage-light)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: 'var(--color-sage)',
              borderRadius: '4px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
        <div>
          <span className="text-xs text-muted uppercase">Weeks Left</span>
          <p className="text-lg font-semibold">{weeksRemaining}</p>
        </div>
        <div>
          <span className="text-xs text-muted uppercase">Utility Rate</span>
          <p className="text-lg font-semibold">{season.utilityRate}h/wk</p>
        </div>
        <div>
          <span className="text-xs text-muted uppercase">Total Hours</span>
          <p className="text-lg font-semibold">{season.totalHours}h</p>
        </div>
      </div>

      {/* Edit button */}
      {onUpdate && (
        <div style={{ marginTop: 'var(--space-4)', textAlign: 'right' }}>
          <Button variant="ghost" size="sm" onClick={startEditing}>
            Edit Season
          </Button>
        </div>
      )}
    </Card>
  )
}
