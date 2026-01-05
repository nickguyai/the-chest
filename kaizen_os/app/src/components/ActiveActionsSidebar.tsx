import { useNavigate } from 'react-router-dom'
import { Card as CardUI, StatusBadge } from './ui'
import { Card } from '../lib/api'

interface ActiveActionsSidebarProps {
  actions: Card[]
  isLoading?: boolean
}

export function ActiveActionsSidebar({ actions, isLoading }: ActiveActionsSidebarProps) {
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <CardUI>
        <h3 className="text-md font-semibold" style={{ marginBottom: 'var(--space-4)' }}>
          Active Actions
        </h3>
        <p className="text-muted">Loading...</p>
      </CardUI>
    )
  }

  if (actions.length === 0) {
    return (
      <CardUI>
        <h3 className="text-md font-semibold" style={{ marginBottom: 'var(--space-4)' }}>
          Active Actions
        </h3>
        <p className="text-muted">No active actions. Start an action to track your experiments.</p>
      </CardUI>
    )
  }

  return (
    <CardUI>
      <h3 className="text-md font-semibold" style={{ marginBottom: 'var(--space-4)' }}>
        Active Actions
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {actions.map((action) => (
          <div
            key={action.id}
            onClick={() => navigate(`/contract/${action.id}`)}
            style={{
              padding: 'var(--space-3)',
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
              <span className="text-sm font-medium">{action.title}</span>
              <StatusBadge status={action.status} />
            </div>
            {action.targetDate && (
              <span className="text-xs text-muted">
                Target: {new Date(action.targetDate).toLocaleDateString()}
              </span>
            )}
          </div>
        ))}
      </div>
    </CardUI>
  )
}
