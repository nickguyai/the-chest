import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../../lib/api'

interface StackModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  items: Card[]
  onActivate?: (card: Card) => void
  canActivate?: boolean
}

export function StackModal({ isOpen, onClose, title, items, onActivate, canActivate = false }: StackModalProps) {
  if (!isOpen) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 20,
          padding: 32,
          maxWidth: 600,
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}>
          <h3 style={{ fontSize: 20, fontWeight: 600, color: '#1A1A1A', margin: 0 }}>{title}</h3>
          <CloseButton onClick={onClose} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999999', padding: '32px 0' }}>
              No items in backlog
            </div>
          ) : (
            items.map((item) => (
              <StackItem
                key={item.id}
                item={item}
                canActivate={canActivate}
                onActivate={onActivate}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function CloseButton({ onClick }: { onClick: () => void }) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: 'none',
        background: isHovered ? 'rgba(139, 148, 103, 0.2)' : 'rgba(139, 148, 103, 0.1)',
        color: '#666666',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
        transition: 'all 0.2s ease',
      }}
    >
      ✕
    </button>
  )
}

function StackItem({
  item,
  canActivate,
  onActivate,
}: {
  item: Card
  canActivate: boolean
  onActivate?: (card: Card) => void
}) {
  const [isHovered, setIsHovered] = useState(false)
  const navigate = useNavigate()

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => navigate(`/contract/${item.id}`)}
      style={{
        padding: 16,
        border: '1px solid rgba(139, 148, 103, 0.12)',
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        background: isHovered ? 'rgba(139, 148, 103, 0.05)' : 'white',
        transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 600, color: '#2C2C2C', marginBottom: 4 }}>{item.title}</div>
          <div style={{ fontSize: 12, color: '#999999' }}>
            Status: {item.status.replace('_', ' ')}
          </div>
        </div>
        {canActivate && onActivate && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onActivate(item)
            }}
            style={{
              opacity: isHovered ? 1 : 0,
              padding: '4px 12px',
              fontSize: 12,
              fontWeight: 500,
              background: 'linear-gradient(135deg, #8B9467 0%, #9FAA7A 100%)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            Activate
          </button>
        )}
      </div>
    </div>
  )
}
