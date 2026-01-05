import { useState } from 'react'
import { Card } from '../lib/api'
import { Button, Input } from './ui'

interface AnchorOutcomeListProps {
  outcomes: Card[]
  onAdd: (title: string) => void
  onUpdate: (id: number, updates: { title?: string; status?: string }) => void
  onDelete: (id: number) => void
}

export function AnchorOutcomeList({ outcomes, onAdd, onUpdate, onDelete }: AnchorOutcomeListProps) {
  const [newOutcome, setNewOutcome] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [gradingId, setGradingId] = useState<number | null>(null)

  const handleAdd = () => {
    if (newOutcome.trim()) {
      onAdd(newOutcome.trim())
      setNewOutcome('')
    }
  }

  const handleStartEdit = (outcome: Card) => {
    setEditingId(outcome.id)
    setEditValue(outcome.title)
  }

  const handleSaveEdit = (id: number) => {
    if (editValue.trim()) {
      onUpdate(id, { title: editValue.trim() })
    }
    setEditingId(null)
    setEditValue('')
  }

  // Grade anchor outcome - updates status directly (grading is done via criteria)
  const handleGrade = async (outcome: Card, passed: boolean) => {
    setGradingId(outcome.id)
    try {
      // Update the status directly
      onUpdate(outcome.id, {
        status: passed ? 'completed' : 'backlog', // backlog = failed
      })
    } catch (error) {
      console.error('Failed to grade anchor:', error)
      alert('Failed to grade anchor outcome')
    } finally {
      setGradingId(null)
    }
  }

  // Get status display
  const getStatusDisplay = (outcome: Card) => {
    switch (outcome.status) {
      case 'completed':
        return { icon: '✅', label: 'Passed', color: 'var(--color-success)' }
      case 'backlog':
        return { icon: '❌', label: 'Failed', color: 'var(--color-critical)' }
      default:
        return { icon: '⏳', label: 'Pending', color: 'var(--color-text-muted)' }
    }
  }

  return (
    <div>
      <h3 className="text-md font-semibold" style={{ marginBottom: 'var(--space-4)' }}>
        🎯 Anchor Outcomes
      </h3>
      <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-4)' }}>
        Define 2-4 binary outcomes to measure success. Grade them when the lag period ends.
      </p>

      {/* Outcomes List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        {outcomes.map((outcome) => {
          const status = getStatusDisplay(outcome)
          const isGrading = gradingId === outcome.id
          const isGraded = outcome.status === 'completed' || outcome.status === 'backlog'

          return (
            <div
              key={outcome.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-3)',
                background: 'var(--color-bg)',
                borderRadius: 'var(--radius-md)',
                border: isGraded ? `1px solid ${status.color}` : '1px solid transparent',
              }}
            >
              {/* Status indicator */}
              <span style={{ fontSize: '18px', flexShrink: 0 }} title={status.label}>
                {status.icon}
              </span>

              {/* Title */}
              {editingId === outcome.id ? (
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => handleSaveEdit(outcome.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(outcome.id)}
                  className="input"
                  style={{ flex: 1 }}
                  autoFocus
                />
              ) : (
                <span
                  style={{
                    flex: 1,
                    textDecoration: outcome.status === 'completed' ? 'line-through' : 'none',
                    color: outcome.status === 'backlog' ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleStartEdit(outcome)}
                >
                  {outcome.title}
                </span>
              )}

              {/* Grade buttons - only show if not yet graded */}
              {!isGraded && (
                <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleGrade(outcome, true)}
                    disabled={isGrading}
                    style={{ 
                      padding: '4px 8px', 
                      color: 'var(--color-success)',
                      fontSize: '12px',
                    }}
                    title="Mark as passed"
                  >
                    ✓ Pass
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleGrade(outcome, false)}
                    disabled={isGrading}
                    style={{ 
                      padding: '4px 8px', 
                      color: 'var(--color-critical)',
                      fontSize: '12px',
                    }}
                    title="Mark as failed"
                  >
                    ✗ Fail
                  </Button>
                </div>
              )}

              {/* Reset button - show if graded */}
              {isGraded && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onUpdate(outcome.id, { status: 'not_started' })}
                  style={{ padding: '4px 8px', fontSize: '12px' }}
                  title="Reset grade"
                >
                  Reset
                </Button>
              )}

              {/* Delete button */}
              <button
                onClick={() => onDelete(outcome.id)}
                style={{
                  padding: 'var(--space-1) var(--space-2)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontSize: '16px',
                }}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {/* Add New Outcome */}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Input
          placeholder="Add anchor outcome..."
          value={newOutcome}
          onChange={(e) => setNewOutcome(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          style={{ flex: 1 }}
        />
        <Button variant="secondary" onClick={handleAdd}>
          Add
        </Button>
      </div>
    </div>
  )
}
