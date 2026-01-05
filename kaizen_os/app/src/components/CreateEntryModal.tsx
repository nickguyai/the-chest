import { useState } from 'react'
import { Button, Input, Textarea } from './ui'

interface CreateEntryModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { title: string; description?: string }) => void
  title: string
  entryType: string
  isLoading?: boolean
}

export function CreateEntryModal({ isOpen, onClose, onSubmit, title, entryType, isLoading }: CreateEntryModalProps) {
  const [entryTitle, setEntryTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!entryTitle.trim()) {
      setError('Title is required')
      return
    }
    setError('')
    onSubmit({ title: entryTitle.trim(), description: description.trim() || undefined })
    setEntryTitle('')
    setDescription('')
  }

  const handleClose = () => {
    setEntryTitle('')
    setDescription('')
    setError('')
    onClose()
  }

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
      onClick={handleClose}
    >
      <div
        style={{
          background: 'var(--color-card)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
          width: '100%',
          maxWidth: '480px',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold" style={{ marginBottom: 'var(--space-6)' }}>
          {title}
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Input
              label={`${entryType} Title`}
              value={entryTitle}
              onChange={(e) => setEntryTitle(e.target.value)}
              placeholder={`Enter ${entryType.toLowerCase()} title...`}
              error={error}
              autoFocus
            />

            <Textarea
              label="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={`Describe this ${entryType.toLowerCase()}...`}
            />
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-6)' }}>
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isLoading}>
              {isLoading ? 'Creating...' : `Create ${entryType}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
