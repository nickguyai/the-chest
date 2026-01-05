import { useNavigate } from 'react-router-dom'
import { Card, Badge, Button } from './ui'
import { CardWithActionCount } from '../lib/api'

interface ThemeCardProps {
  theme: CardWithActionCount
  conditionScore?: number
  lastActivity?: string | null
  onDelete?: (id: number) => void
}

export function ThemeCard({ theme, conditionScore = 0, lastActivity, onDelete }: ThemeCardProps) {
  const navigate = useNavigate()

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onDelete && confirm(`Delete theme "${theme.title}"? This cannot be undone.`)) {
      onDelete(theme.id)
    }
  }

  // Determine condition color based on score
  const getConditionColor = (score: number) => {
    if (score >= 70) return 'var(--color-sage)'
    if (score >= 40) return 'var(--color-warning, #f0ad4e)'
    return 'var(--color-critical)'
  }

  // Format last activity
  const formatLastActivity = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'No activity'
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return date.toLocaleDateString()
  }

  return (
    <Card
      hoverable
      onClick={() => navigate(`/theme/${theme.id}`)}
      style={{ cursor: 'pointer', position: 'relative' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 className="text-md font-semibold" style={{ marginBottom: 'var(--space-2)' }}>
            {theme.title}
          </h3>
          {theme.description && (
            <p className="text-sm text-secondary" style={{ marginBottom: 'var(--space-3)' }}>
              {theme.description}
            </p>
          )}
        </div>
        <Badge variant="sage">{theme.actionCount} Actions</Badge>
      </div>
      
      {/* Condition score - now real! */}
      <div style={{ marginTop: 'var(--space-4)' }}>
        <div
          style={{
            height: '6px',
            background: 'var(--color-sage-light)',
            borderRadius: '3px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${conditionScore}%`,
              height: '100%',
              background: getConditionColor(conditionScore),
              borderRadius: '3px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)' }}>
          <div>
            <span className="text-xs text-muted">
              Condition: {conditionScore}%
            </span>
            <span className="text-xs text-muted" style={{ marginLeft: 'var(--space-2)' }}>
              • {formatLastActivity(lastActivity)}
            </span>
          </div>
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              style={{ padding: 'var(--space-1) var(--space-2)', color: 'var(--color-critical)' }}
            >
              Delete
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
