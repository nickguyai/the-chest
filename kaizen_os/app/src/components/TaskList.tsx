import { useState } from 'react'
import { Card } from '../lib/api'
import { Button, Input, StatusBadge } from './ui'

interface TaskListProps {
  tasks: Card[]
  onAdd: (title: string) => void
  onUpdate: (id: number, updates: { title?: string; status?: string }) => void
  onDelete: (id: number) => void
}

export function TaskList({ tasks, onAdd, onUpdate, onDelete }: TaskListProps) {
  const [newTask, setNewTask] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  const handleAdd = () => {
    if (newTask.trim()) {
      onAdd(newTask.trim())
      setNewTask('')
    }
  }

  const handleStartEdit = (task: Card) => {
    setEditingId(task.id)
    setEditValue(task.title)
  }

  const handleSaveEdit = (id: number) => {
    if (editValue.trim()) {
      onUpdate(id, { title: editValue.trim() })
    }
    setEditingId(null)
    setEditValue('')
  }

  const cycleStatus = (task: Card) => {
    const statusOrder = ['not_started', 'in_progress', 'completed'] as const
    const currentIndex = statusOrder.indexOf(task.status as typeof statusOrder[number])
    const nextIndex = (currentIndex + 1) % statusOrder.length
    onUpdate(task.id, { status: statusOrder[nextIndex] })
  }

  return (
    <div>
      <h3 className="text-md font-semibold" style={{ marginBottom: 'var(--space-4)' }}>
        Tasks
      </h3>
      <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-4)' }}>
        Work items to complete for this bet.
      </p>

      {/* Tasks List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        {tasks.map((task) => (
          <div
            key={task.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-3)',
              background: 'var(--color-bg)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {/* Status Badge (clickable) */}
            <div onClick={() => cycleStatus(task)} style={{ cursor: 'pointer' }}>
              <StatusBadge status={task.status} />
            </div>

            {/* Title */}
            {editingId === task.id ? (
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => handleSaveEdit(task.id)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(task.id)}
                className="input"
                style={{ flex: 1 }}
                autoFocus
              />
            ) : (
              <span
                style={{
                  flex: 1,
                  cursor: 'pointer',
                  textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                  color: task.status === 'completed' ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                }}
                onClick={() => handleStartEdit(task)}
              >
                {task.title}
              </span>
            )}

            {/* Delete button */}
            <button
              onClick={() => onDelete(task.id)}
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
        ))}

        {tasks.length === 0 && (
          <p className="text-sm text-muted" style={{ padding: 'var(--space-3)' }}>
            No tasks yet. Add tasks to track your work.
          </p>
        )}
      </div>

      {/* Add New Task */}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Input
          placeholder="Add task..."
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
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
