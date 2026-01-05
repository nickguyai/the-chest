import { useNavigate } from 'react-router-dom'
import { Card } from '../lib/api'
import { StatusBadge, Badge } from './ui'

const UNIT_TYPE_LABELS: Record<string, string> = {
  THEME: 'Theme',
  ACTION_GATE: 'Gate',
  ACTION_EXPERIMENT: 'Experiment',
  ACTION_ROUTINE: 'Routine',
  ACTION_OPS: 'Ops',
  TASK: 'Task',
  VETO: 'Guardrail',
}

interface ChildrenListProps {
  children: Card[]
  onNavigate?: (entry: Card) => void
}

export function ChildrenList({ children, onNavigate }: ChildrenListProps) {
  const navigate = useNavigate()

  const getEntryUrl = (entry: Card): string => {
    switch (entry.unitType) {
      case 'THEME':
        return `/theme/${entry.id}`
      case 'ACTION_GATE':
      case 'ACTION_EXPERIMENT':
      case 'ACTION_ROUTINE':
      case 'ACTION_OPS':
        return `/contract/${entry.id}`
      default:
        return `/card/${entry.id}/edit`
    }
  }

  const handleClick = (entry: Card) => {
    if (onNavigate) {
      onNavigate(entry)
    } else {
      navigate(getEntryUrl(entry))
    }
  }

  if (children.length === 0) {
    return (
      <p className="text-sm text-muted" style={{ padding: 'var(--space-4)' }}>
        No child entries.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {children.map((child) => (
        <div
          key={child.id}
          onClick={() => handleClick(child)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--color-bg)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-sage-lighter)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--color-bg)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Badge variant="default">
              {UNIT_TYPE_LABELS[child.unitType] || child.unitType}
            </Badge>
            <span className="font-medium">{child.title}</span>
          </div>
          <StatusBadge status={child.status} />
        </div>
      ))}
    </div>
  )
}
