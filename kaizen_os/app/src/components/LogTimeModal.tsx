// Log Time Modal - For logging time spent on actions/tasks
import { useState } from 'react'
import { Button, Input, Card as CardUI } from './ui'
import { api, Card } from '../lib/api'

interface LogTimeModalProps {
  isOpen: boolean
  onClose: () => void
  entry: Card | null
  onSuccess?: () => void
}

export function LogTimeModal({ isOpen, onClose, entry, onSuccess }: LogTimeModalProps) {
  const [minutes, setMinutes] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen || !entry) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const mins = parseInt(minutes, 10)
    if (isNaN(mins) || mins <= 0) {
      setError('Please enter a valid number of minutes')
      return
    }

    setIsLoading(true)
    try {
      await api.logTime(entry.id, mins, date)
      setMinutes('')
      setDate(new Date().toISOString().split('T')[0])
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log time')
    } finally {
      setIsLoading(false)
    }
  }

  const quickMinutes = [15, 30, 45, 60, 90, 120]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <CardUI
        style={{ width: '100%', maxWidth: '400px', margin: 'var(--space-4)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold" style={{ marginBottom: 'var(--space-4)' }}>
          Log Time
        </h2>
        
        <p className="text-sm text-secondary" style={{ marginBottom: 'var(--space-4)' }}>
          {entry.title}
        </p>

        {error && (
          <div style={{ 
            padding: 'var(--space-3)', 
            background: 'rgba(231, 76, 60, 0.1)', 
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            color: 'var(--color-critical)'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Quick select buttons */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label className="text-sm text-muted" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
              Quick Select
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {quickMinutes.map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={minutes === String(m) ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setMinutes(String(m))}
                >
                  {m >= 60 ? `${m / 60}h` : `${m}m`}
                </Button>
              ))}
            </div>
          </div>

          <Input
            label="Minutes"
            type="number"
            min="1"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="Enter minutes..."
            style={{ marginBottom: 'var(--space-4)' }}
          />

          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ marginBottom: 'var(--space-6)' }}
          />

          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isLoading}>
              {isLoading ? 'Logging...' : 'Log Time'}
            </Button>
          </div>
        </form>
      </CardUI>
    </div>
  )
}
