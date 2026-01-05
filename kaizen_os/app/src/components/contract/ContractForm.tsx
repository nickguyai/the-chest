import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, UpdateCardInput } from '../../lib/api'
import { RoutineLinkSection } from './RoutineLinkSection'

interface ContractFormProps {
  card: Card
  onSave: (data: UpdateCardInput) => void
  onCancel: () => void
  onDelete?: () => void
  isCreateMode?: boolean
}

const typeIcons: Record<string, string> = {
  ACTION_GATE: '/assets/gate.png',
  ACTION_EXPERIMENT: '/assets/experiment.png',
  ACTION_ROUTINE: '/assets/routine.png',
  ACTION_OPS: '/assets/ops.png',
}

const statusOptions: Record<string, string[]> = {
  ACTION_GATE: ['not_started', 'in_progress', 'completed', 'backlog'],
  ACTION_EXPERIMENT: ['not_started', 'in_progress', 'completed', 'backlog'],
  ACTION_ROUTINE: ['not_started', 'in_progress', 'completed', 'backlog'],
  ACTION_OPS: ['not_started', 'in_progress', 'completed', 'backlog'],
}

export function ContractForm({ card, onSave, onCancel, onDelete, isCreateMode = false }: ContractFormProps) {
  const [title, setTitle] = useState(card.title)
  const [status, setStatus] = useState(card.status)
  const [targetDate, setTargetDate] = useState(card.targetDate ? card.targetDate.split('T')[0] : '')
  const [lagWeeks, setLagWeeks] = useState(card.lagWeeks || 0)
  const [plannedHours, setPlannedHours] = useState(0)
  const [actualHours, setActualHours] = useState(0)
  const [criteria, setCriteria] = useState<string[]>(card.criteria || [])
  const [newCriterion, setNewCriterion] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isExperiment = card.unitType === 'ACTION_EXPERIMENT'
  const isRoutine = card.unitType === 'ACTION_ROUTINE'
  const isOps = card.unitType === 'ACTION_OPS'
  const progressPercent = plannedHours > 0 ? Math.round((actualHours / plannedHours) * 100) : 0

  // Auto-save with debounce (only in edit mode)
  const triggerAutoSave = useCallback(() => {
    if (isCreateMode) return
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    setSaveStatus('saving')
    saveTimeoutRef.current = setTimeout(() => {
      onSave({
        title,
        status,
        targetDate: targetDate ? new Date(targetDate).toISOString() : null,
        lagWeeks: isExperiment ? lagWeeks : null,
        criteria,
      })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }, 500)
  }, [title, status, targetDate, lagWeeks, criteria, isExperiment, isCreateMode, onSave])

  // Trigger auto-save on field changes (not in create mode)
  useEffect(() => {
    if (!isCreateMode && (title !== card.title || status !== card.status || 
        targetDate !== (card.targetDate ? card.targetDate.split('T')[0] : '') ||
        lagWeeks !== (card.lagWeeks || 0) ||
        JSON.stringify(criteria) !== JSON.stringify(card.criteria || []))) {
      triggerAutoSave()
    }
  }, [title, status, targetDate, lagWeeks, criteria])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  const handleCreateSave = () => {
    onSave({
      title,
      status,
      targetDate: targetDate ? new Date(targetDate).toISOString() : null,
      lagWeeks: isExperiment ? lagWeeks : null,
      criteria,
    })
  }

  const handleAddCriteria = () => {
    if (newCriterion.trim()) {
      setCriteria([...criteria, newCriterion.trim()])
      setNewCriterion('')
    }
  }

  const handleUpdateCriterion = (index: number, value: string) => {
    const updated = [...criteria]
    updated[index] = value
    setCriteria(updated)
  }

  const handleRemoveCriterion = (index: number) => {
    setCriteria(criteria.filter((_, i) => i !== index))
  }

  const handleDelete = () => {
    if (onDelete) {
      onDelete()
    }
    setShowDeleteConfirm(false)
  }

  const getIconClass = () => {
    if (isExperiment) return 'experiment'
    if (isRoutine) return 'routine'
    if (isOps) return 'ops'
    return ''
  }

  const getProgressClass = () => {
    if (isExperiment) return 'experiment'
    if (isRoutine) return 'routine'
    if (isOps) return 'ops'
    return ''
  }

  return (
    <div className="contract-card">
      {/* Header with delete button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Save status indicator */}
          {!isCreateMode && (
            <span style={{ 
              fontSize: 12, 
              color: saveStatus === 'saving' ? '#F39C12' : saveStatus === 'saved' ? '#27AE60' : '#999',
              transition: 'color 0.2s ease'
            }}>
              {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? '✓ Saved' : ''}
            </span>
          )}
          {/* Delete button */}
          {!isCreateMode && onDelete && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                background: 'none',
                border: '1px solid rgba(231, 76, 60, 0.3)',
                borderRadius: 8,
                padding: '6px 12px',
                color: '#E74C3C',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(231, 76, 60, 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div style={{
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
        }}>
          <div style={{
            background: 'white',
            borderRadius: 16,
            padding: 24,
            maxWidth: 400,
            width: '90%',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Delete Action?</h3>
            <p style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>
              This will permanently delete "{card.title}". This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                style={{
                  background: '#E74C3C',
                  color: 'white',
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px 24px',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="contract-header">
        <div className={`icon-box ${getIconClass()}`}>
          <img src={typeIcons[card.unitType]} alt={card.unitType} style={{ width: 48, height: 48 }} />
        </div>
        <div className="status-box">
          <span className="status-label">Status</span>
          <select
            className="status-select"
            value={status}
            onChange={(e) => setStatus(e.target.value as Card['status'])}
          >
            {statusOptions[card.unitType]?.map((opt) => (
              <option key={opt} value={opt}>
                {opt.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-box">
        <label className="field-label">Statement</label>
        <input
          type="text"
          className="field-input"
          placeholder="What this is. (e.g., 'Launch Kaizen MVP')"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="field-box">
        <label className="field-label">Date</label>
        <input
          type="date"
          className="field-input"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
        <div className="field-hint">Due Date (for a Gate) or Evaluation Date (for an Experiment).</div>
      </div>

      <div className="field-box">
        <label className="field-label">Criteria</label>
        <div className="field-hint" style={{ marginBottom: 12 }}>
          The definition of done. How you know you've passed or failed.
        </div>
        <div className="criteria-list">
          {criteria.map((criterion, index) => (
            <div key={index} className="criteria-item">
              <span className="criteria-bullet"></span>
              <input
                type="text"
                className="criteria-input"
                value={criterion}
                onChange={(e) => handleUpdateCriterion(index, e.target.value)}
              />
              <button
                className="criteria-remove-btn"
                onClick={() => handleRemoveCriterion(index)}
                title="Remove criterion"
              >
                ×
              </button>
            </div>
          ))}
          <div className="criteria-item">
            <span className="criteria-bullet"></span>
            <input
              type="text"
              className="criteria-input"
              placeholder="Add criterion..."
              value={newCriterion}
              onChange={(e) => setNewCriterion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCriteria()}
            />
          </div>
        </div>
        <button className="add-criteria-btn" onClick={handleAddCriteria}>
          + Add Criterion
        </button>
      </div>

      {/* Lag field - only show for experiments */}
      {isExperiment && (
        <div className="field-box lag-box">
          <div className="lag-note">⚠️ Experiment Only</div>
          <label className="field-label">Lag</label>
          <input
            type="number"
            className="field-input"
            placeholder="e.g., 4"
            value={lagWeeks}
            onChange={(e) => setLagWeeks(parseInt(e.target.value) || 0)}
          />
          <div className="field-hint">How long you wait before judging the results (weeks).</div>
        </div>
      )}

      {/* Calendar Link - only show for routines (not in create mode) */}
      {isRoutine && !isCreateMode && card.id > 0 && (
        <RoutineLinkSection cardId={card.id} />
      )}

      <div className="allocation-box">
        <label className="field-label">Allocation</label>
        <div className="field-hint" style={{ marginBottom: 12 }}>Planned vs. Actual time (tracked weekly).</div>
        <div className="allocation-inputs">
          <div className="allocation-input-group">
            <span className="allocation-label">Planned (hrs/week)</span>
            <input
              type="number"
              className="allocation-value"
              value={plannedHours}
              onChange={(e) => setPlannedHours(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="allocation-input-group">
            <span className="allocation-label">Actual (hrs/week)</span>
            <input
              type="number"
              className="allocation-value"
              value={actualHours}
              onChange={(e) => setActualHours(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="progress-bar-container">
          <div
            className={`progress-bar-fill ${getProgressClass()}`}
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          ></div>
          <div className="progress-bar-text">
            {actualHours} / {plannedHours} hrs ({progressPercent}%)
          </div>
        </div>
      </div>

      {/* Only show save/cancel buttons in create mode */}
      {isCreateMode && (
        <div className="flex justify-end gap-3 mt-8">
          <button onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
          <button onClick={handleCreateSave} className="btn btn-primary">
            Create
          </button>
        </div>
      )}
    </div>
  )
}
