import { useState } from 'react'
import { Card, api } from '../lib/api'
import { Button, Input } from './ui'

interface GuardrailListProps {
  guardrails: Card[]
  onAdd: (title: string) => void
  onUpdate: (id: number, updates: { title?: string; status?: string }) => void
  onDelete: (id: number) => void
}

export function GuardrailList({ guardrails, onAdd, onUpdate, onDelete }: GuardrailListProps) {
  const [newGuardrail, setNewGuardrail] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [tripReason, setTripReason] = useState('')
  const [showReasonInput, setShowReasonInput] = useState<number | null>(null)

  const handleAdd = () => {
    if (newGuardrail.trim()) {
      onAdd(newGuardrail.trim())
      setNewGuardrail('')
    }
  }

  const handleStartEdit = (guardrail: Card) => {
    setEditingId(guardrail.id)
    setEditValue(guardrail.title)
  }

  const handleSaveEdit = (id: number) => {
    if (editValue.trim()) {
      onUpdate(id, { title: editValue.trim() })
    }
    setEditingId(null)
    setEditValue('')
  }

  // Trip guardrail - logs event AND updates status
  const handleTrip = async (guardrail: Card) => {
    setTogglingId(guardrail.id)
    try {
      // Log the trip event
      await api.tripGuardrail(guardrail.id, tripReason || undefined)
      // Update the status to 'completed' (tripped)
      onUpdate(guardrail.id, { status: 'completed' })
      setTripReason('')
      setShowReasonInput(null)
    } catch (error) {
      console.error('Failed to trip guardrail:', error)
      alert('Failed to trip guardrail')
    } finally {
      setTogglingId(null)
    }
  }

  // Restore guardrail - logs event AND updates status
  const handleRestore = async (guardrail: Card) => {
    setTogglingId(guardrail.id)
    try {
      // Log the restore event
      await api.restoreGuardrail(guardrail.id)
      // Update the status back to 'in_progress' (active)
      onUpdate(guardrail.id, { status: 'in_progress' })
    } catch (error) {
      console.error('Failed to restore guardrail:', error)
      alert('Failed to restore guardrail')
    } finally {
      setTogglingId(null)
    }
  }

  const toggleTripped = (guardrail: Card) => {
    const isTripped = guardrail.status === 'completed'
    if (isTripped) {
      handleRestore(guardrail)
    } else {
      // Show reason input before tripping
      setShowReasonInput(guardrail.id)
    }
  }

  return (
    <div>
      <h3 className="text-md font-semibold" style={{ marginBottom: 'var(--space-4)' }}>
        🛡️ Guardrails
      </h3>
      <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-4)' }}>
        Non-negotiable constraints that force a pause if violated.
      </p>

      {/* Guardrails List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        {guardrails.map((guardrail) => {
          const isTripped = guardrail.status === 'completed'
          const isToggling = togglingId === guardrail.id
          const showingReason = showReasonInput === guardrail.id
          
          return (
            <div key={guardrail.id}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3)',
                  background: isTripped ? 'rgba(231, 76, 60, 0.05)' : 'var(--color-bg)',
                  borderRadius: showingReason ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)',
                  border: isTripped ? '1px solid rgba(231, 76, 60, 0.2)' : '1px solid transparent',
                }}
              >
                {/* Toggle Switch */}
                <button
                  onClick={() => toggleTripped(guardrail)}
                  disabled={isToggling}
                  style={{
                    width: '44px',
                    height: '24px',
                    borderRadius: '12px',
                    border: 'none',
                    background: isTripped ? 'var(--color-critical)' : 'var(--color-success)',
                    cursor: isToggling ? 'wait' : 'pointer',
                    position: 'relative',
                    transition: 'background var(--transition-fast)',
                    flexShrink: 0,
                    opacity: isToggling ? 0.7 : 1,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: isTripped ? '22px' : '2px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: 'white',
                      transition: 'left var(--transition-fast)',
                    }}
                  />
                </button>

                {/* Status Label */}
                <span
                  className="text-xs font-medium"
                  style={{
                    color: isTripped ? 'var(--color-critical)' : 'var(--color-success)',
                    width: '50px',
                  }}
                >
                  {isTripped ? '⚠️ Tripped' : '✓ Active'}
                </span>

                {/* Title */}
                {editingId === guardrail.id ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => handleSaveEdit(guardrail.id)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(guardrail.id)}
                    className="input"
                    style={{ flex: 1 }}
                    autoFocus
                  />
                ) : (
                  <span
                    style={{
                      flex: 1,
                      cursor: 'pointer',
                      color: isTripped ? 'var(--color-critical)' : 'var(--color-text-primary)',
                    }}
                    onClick={() => handleStartEdit(guardrail)}
                  >
                    {guardrail.title}
                  </span>
                )}

                {/* Delete button */}
                <button
                  onClick={() => onDelete(guardrail.id)}
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

              {/* Trip reason input */}
              {showingReason && (
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-3)',
                    background: 'rgba(231, 76, 60, 0.05)',
                    borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                    borderTop: 'none',
                  }}
                >
                  <Input
                    placeholder="Why is this guardrail being tripped? (optional)"
                    value={tripReason}
                    onChange={(e) => setTripReason(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleTrip(guardrail)}
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleTrip(guardrail)}
                    disabled={isToggling}
                    style={{ background: 'var(--color-critical)' }}
                  >
                    Trip
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowReasonInput(null)
                      setTripReason('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add New Guardrail */}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Input
          placeholder="Add guardrail..."
          value={newGuardrail}
          onChange={(e) => setNewGuardrail(e.target.value)}
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
