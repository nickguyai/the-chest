import { Link } from 'react-router-dom'
import { Card } from '../lib/api'

interface BreadcrumbProps {
  path: Card[]
  onNavigate?: (entryId: number) => void
}

export function Breadcrumb({ path, onNavigate }: BreadcrumbProps) {
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

  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        flexWrap: 'wrap',
      }}
    >
      <Link
        to="/"
        style={{
          color: 'var(--color-text-secondary)',
          textDecoration: 'none',
          fontSize: 'var(--font-size-sm)',
        }}
      >
        Home
      </Link>

      {path.map((entry, index) => (
        <span key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ color: 'var(--color-text-muted)' }}>/</span>
          {index === path.length - 1 ? (
            <span
              style={{
                color: 'var(--color-text-primary)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 500,
              }}
            >
              {entry.title}
            </span>
          ) : (
            <Link
              to={getEntryUrl(entry)}
              onClick={(e) => {
                if (onNavigate) {
                  e.preventDefault()
                  onNavigate(entry.id)
                }
              }}
              style={{
                color: 'var(--color-text-secondary)',
                textDecoration: 'none',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              {entry.title}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
