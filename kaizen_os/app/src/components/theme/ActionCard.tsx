import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, UnitType } from '../../lib/api'

interface ActionCardProps {
  card: Card
  unitType: UnitType
  onClick?: () => void
}

const typeColors: Record<string, string> = {
  ACTION_GATE: 'rgba(139, 148, 190, 0.08)',
  ACTION_EXPERIMENT: 'rgba(229, 115, 115, 0.08)',
  ACTION_ROUTINE: 'rgba(255, 183, 77, 0.08)',
  ACTION_OPS: 'rgba(77, 182, 172, 0.08)',
}

const statusColors: Record<string, { bg: string; text: string }> = {
  in_progress: { bg: 'rgba(139, 148, 190, 0.15)', text: '#4A5568' },
  not_started: { bg: 'rgba(139, 148, 103, 0.1)', text: '#666666' },
  completed: { bg: 'rgba(39, 174, 96, 0.15)', text: '#27AE60' },
  backlog: { bg: 'rgba(0, 0, 0, 0.05)', text: '#999999' },
}

export function ActionCard({ card, unitType, onClick }: ActionCardProps) {
  const navigate = useNavigate()
  const [isHovered, setIsHovered] = useState(false)
  const bgColor = typeColors[unitType] || 'rgba(139, 148, 103, 0.08)'
  const statusStyle = statusColors[card.status] || statusColors.not_started

  const handleClick = () => {
    if (onClick) {
      onClick()
    } else {
      navigate(`/contract/${card.id}`)
    }
  }

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: 180,
        height: 180,
        borderRadius: 16,
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        position: 'relative',
        border: '1px solid rgba(139, 148, 103, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        padding: 16,
        background: bgColor,
        transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: isHovered ? '0 8px 24px rgba(0, 0, 0, 0.08)' : 'none',
      }}
    >
      {/* Title - 2 lines with line-clamp */}
      <div style={{
        fontSize: 16,
        fontWeight: 600,
        color: '#1A1A1A',
        marginBottom: 12,
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        lineHeight: '1.3',
        minHeight: '2.6em',
      }}>
        {card.title}
      </div>
      
      {/* Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {card.targetDate && (
          <CardDetail
            label="Due"
            value={new Date(card.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          />
        )}
        {unitType === 'ACTION_EXPERIMENT' && card.lagWeeks && (
          <CardDetail label="Lag" value={`${card.lagWeeks}w`} />
        )}
      </div>

      {/* Bottom: Status badge + Type tag */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
        <span style={{
          fontSize: 10,
          padding: '4px 10px',
          background: statusStyle.bg,
          borderRadius: 8,
          color: statusStyle.text,
          fontWeight: 600,
          textTransform: 'uppercase',
        }}>
          {card.status.replace('_', ' ')}
        </span>
        <span style={{
          fontSize: 9,
          padding: '3px 8px',
          background: 'rgba(139, 148, 103, 0.12)',
          borderRadius: 8,
          color: '#666666',
        }}>
          #{unitType.replace('ACTION_', '').slice(0, 3)}
        </span>
      </div>
    </div>
  )
}

function CardDetail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      fontSize: 12,
      color: '#666666',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <span style={{
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        fontSize: 10,
        color: '#999999',
      }}>
        {label}
      </span>
      <span style={{ fontWeight: 600, color: '#2C2C2C' }}>{value}</span>
    </div>
  )
}
