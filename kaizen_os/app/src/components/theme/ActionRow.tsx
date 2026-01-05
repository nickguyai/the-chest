import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, WipTypeStatus, UnitType } from '../../lib/api'
import { ActionCard } from './ActionCard'
import { StackedCards } from './StackedCards'

interface ActionRowProps {
  themeId: number
  label: string
  unitType: UnitType
  activeCards: Card[]
  backlogCards: Card[]
  wipStatus: WipTypeStatus
  onAddCard?: () => void
  noStack?: boolean
}

export function ActionRow({
  themeId,
  label,
  unitType,
  activeCards,
  backlogCards,
  wipStatus,
  onAddCard,
  noStack = false,
}: ActionRowProps) {
  const navigate = useNavigate()
  const [isHovered, setIsHovered] = useState(false)

  const canAdd = wipStatus.canAdd
  const backlogCount = backlogCards.length
  const isAtCapacity = activeCards.length >= wipStatus.max

  const handleStackClick = () => {
    navigate(`/theme/${themeId}/actions/${unitType}`)
  }

  /* Assets mapping */
  const UNIT_TYPE_ICONS: Record<string, string> = {
    ACTION_GATE: '/assets/gate.png',
    ACTION_EXPERIMENT: '/assets/experiment.png',
    ACTION_ROUTINE: '/assets/routine.png',
    ACTION_OPS: '/assets/ops.png',
  }

  const iconSrc = UNIT_TYPE_ICONS[unitType] || '/assets/gate.png'

  return (
    <>
      <div
        style={{
          background: isHovered ? 'rgba(139, 148, 103, 0.02)' : 'white',
          display: 'flex',
          alignItems: 'center',
          padding: '24px 32px',
          transition: 'background 0.2s ease',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Row Label - Vertical stack with icon, label, and limit badge */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          gap: 8, 
          minWidth: 120,
          marginRight: 24,
        }}>
          <div style={{
            width: 64,
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <img src={iconSrc} alt={label} style={{ width: 56, height: 56, objectFit: 'contain' }} />
          </div>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#2C2C2C', margin: 0, textAlign: 'center' }}>{label}</h2>
          {/* Limit Badge */}
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: isAtCapacity 
              ? 'linear-gradient(135deg, #E74C3C 0%, #C0392B 100%)' 
              : 'linear-gradient(135deg, #8B9467 0%, #9FAA7A 100%)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: isAtCapacity 
              ? '0 2px 8px rgba(231, 76, 60, 0.3)' 
              : '0 2px 8px rgba(139, 148, 103, 0.2)',
          }} title={`${activeCards.length} of ${wipStatus.max} active`}>
            {activeCards.length}/{wipStatus.max}
          </div>
        </div>

        {/* Cards */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
          {activeCards.map((card) => (
            <ActionCard key={card.id} card={card} unitType={unitType} />
          ))}

          {/* Add Button */}
          <AddButton canAdd={canAdd} label={label} onClick={onAddCard} isAtCapacity={isAtCapacity} />

          {/* Stacked Cards */}
          {!noStack && backlogCount > 0 && (
            <StackedCards count={backlogCount} onClick={handleStackClick} />
          )}
        </div>
      </div>
    </>
  )
}

function AddButton({ canAdd, label, onClick, isAtCapacity }: { canAdd: boolean; label: string; onClick?: () => void; isAtCapacity?: boolean }) {
  const [isHovered, setIsHovered] = useState(false)
  const atCapacity = isAtCapacity && !canAdd

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: 180,
        height: 180,
        border: `2px dashed ${atCapacity ? '#E74C3C' : isHovered ? '#8B9467' : 'rgba(139, 148, 103, 0.3)'}`,
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        background: atCapacity ? 'rgba(231, 76, 60, 0.03)' : isHovered ? 'rgba(139, 148, 103, 0.05)' : 'white',
        opacity: 1,
      }}
      title={canAdd ? `Add new ${label.toLowerCase()}` : `Add to ${label.toLowerCase()} backlog (active limit reached)`}
    >
      <span style={{
        fontSize: 28,
        color: atCapacity ? '#E74C3C' : '#8B9467',
        fontWeight: 300,
        opacity: canAdd ? 1 : 0.8
      }}>
        +
      </span>
    </div>
  )
}
