// Card Edit Page
// Generic edit page for any card type (theme, gate, experiment, routine, ops, task, criteria, veto)

import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useCard, useUpdateCard, useDeleteCard, useCreateCard } from '../hooks/useCards'
import { Button, Card, Input, Textarea, Select } from '../components/ui'
import { UnitType } from '../lib/api'

const UNIT_TYPE_LABELS: Record<string, string> = {
  THEME: 'Theme',
  ACTION_GATE: 'Gate',
  ACTION_EXPERIMENT: 'Experiment',
  ACTION_ROUTINE: 'Routine',
  ACTION_OPS: 'Ops',
  TASK: 'Task',
  VETO: 'Veto',
}

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'backlog', label: 'Backlog' },
]

export default function CardEditPage() {
  const { entryId } = useParams<{ entryId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  
  const id = parseInt(entryId || '0', 10)
  const isCreateMode = !entryId
  const typeParam = searchParams.get('type') as UnitType
  const parentIdParam = searchParams.get('parentId')

  const { data: entry, isLoading: isEntryLoading } = useCard(id)
  const updateMutation = useUpdateCard()
  const createMutation = useCreateCard()
  const deleteMutation = useDeleteCard()

  const isLoading = !isCreateMode && isEntryLoading

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('not_started')
  const [targetDate, setTargetDate] = useState('')
  const [startDate, setStartDate] = useState('')
  const [completionDate, setCompletionDate] = useState('')

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Load entry data into form
  useEffect(() => {
    if (entry) {
      if (entry.unitType.startsWith('ACTION_')) {
        navigate(`/contract/${entry.id}`, { replace: true })
        return
      }
      setTitle(entry.title)
      setDescription(entry.description || '')
      setStatus(entry.status)
      setTargetDate(entry.targetDate ? entry.targetDate.split('T')[0] : '')
      setStartDate(entry.startDate ? entry.startDate.split('T')[0] : '')
      setCompletionDate(entry.completionDate ? entry.completionDate.split('T')[0] : '')
    }
  }, [entry])

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!title.trim()) {
      newErrors.title = 'Title is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return

    const data = {
      title: title.trim(),
      description: description.trim() || undefined,
      status: status as 'in_progress' | 'not_started' | 'completed' | 'backlog',
      targetDate: targetDate || undefined,
      startDate: startDate || undefined,
      completionDate: completionDate || undefined,
    }

    try {
      if (isCreateMode) {
        await createMutation.mutateAsync({
          ...data,
          unitType: typeParam || 'TASK',
          parentId: parentIdParam ? parseInt(parentIdParam, 10) : undefined,
        })
      } else {
        await updateMutation.mutateAsync({
          id,
          data,
        })
      }
      navigate(-1)
    } catch (error) {
      console.error('Failed to save:', error)
      setErrors({ form: 'Failed to save changes' })
    }
  }

  const handleDelete = async () => {
    if (isCreateMode) return
    const label = entry ? UNIT_TYPE_LABELS[entry.unitType] || entry.unitType : 'entry'
    if (!confirm(`Delete this ${label.toLowerCase()}? This cannot be undone.`)) return

    try {
      await deleteMutation.mutateAsync(id)
      navigate('/')
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : 'Failed to delete' })
    }
  }

  if (isLoading) {
    return (
      <div className="container" style={{ padding: 'var(--space-8) var(--space-6)' }}>
        <p className="text-muted">Loading...</p>
      </div>
    )
  }

  if (!isCreateMode && !entry) {
    return (
      <div className="container" style={{ padding: 'var(--space-8) var(--space-6)' }}>
        <p className="text-muted">Entry not found.</p>
        <Link to="/" className="btn btn-secondary" style={{ marginTop: 'var(--space-4)' }}>
          Back to Overview
        </Link>
      </div>
    )
  }

  const currentUnitType = isCreateMode ? typeParam : entry?.unitType
  const typeLabel = UNIT_TYPE_LABELS[currentUnitType || ''] || currentUnitType || 'Entry'
  const pageTitle = isCreateMode ? `Create ${typeLabel}` : `Edit ${typeLabel}`

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Header */}
      <header
        style={{
          padding: 'var(--space-6)',
          borderBottom: '1px solid var(--color-sage-border-light)',
          background: 'var(--color-card)',
        }}
      >
        <div className="container">
          <nav style={{ marginBottom: 'var(--space-4)' }}>
            <Link
              to="/"
              onClick={(e) => { e.preventDefault(); navigate(-1) }}
              style={{
                color: 'var(--color-text-secondary)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}
            >
              ← Back
            </Link>
          </nav>

          <h1 className="text-2xl font-semibold">{pageTitle}</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container" style={{ padding: 'var(--space-8) var(--space-6)', maxWidth: '600px' }}>
        {/* Form Error */}
        {errors.form && (
          <div
            style={{
              padding: 'var(--space-4)',
              background: 'rgba(231, 76, 60, 0.1)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-6)',
            }}
          >
            <p style={{ color: 'var(--color-critical)' }}>{errors.form}</p>
          </div>
        )}

        <Card>
          <form
            onSubmit={(e) => { e.preventDefault(); handleSave() }}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}
          >
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter title..."
              error={errors.title}
            />

            <Textarea
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter description..."
            />

            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={STATUS_OPTIONS}
            />

            {/* Date fields - show based on type */}
            {currentUnitType && (currentUnitType.startsWith('ACTION_') || currentUnitType === 'TASK') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <Input
                  label="Start Date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <Input
                  label="Target Date"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                />
              </div>
            )}

            {status === 'completed' && (
              <Input
                label="Completion Date"
                type="date"
                value={completionDate}
                onChange={(e) => setCompletionDate(e.target.value)}
              />
            )}

            {/* Actions */}
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-4)',
                justifyContent: 'space-between',
                marginTop: 'var(--space-4)',
              }}
            >
              {!isCreateMode ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  style={{ color: 'var(--color-critical)' }}
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </Button>
              ) : (
                <div /> // Spacer
              )}
              <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={updateMutation.isPending || createMutation.isPending}
                >
                  {updateMutation.isPending || createMutation.isPending 
                    ? 'Saving...' 
                    : isCreateMode ? `Create ${typeLabel}` : 'Save Changes'}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      </main>
    </div>
  )
}
