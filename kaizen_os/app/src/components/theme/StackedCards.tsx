import { useState } from 'react'

interface StackedCardsProps {
  count: number
  onClick: () => void
}

export function StackedCards({ count, onClick }: StackedCardsProps) {
  const [isHovered, setIsHovered] = useState(false)

  if (count === 0) return null

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        width: 180,
        height: 180,
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
      }}
    >
      {/* Back card 3 */}
      {count >= 3 && (
        <div style={{
          position: 'absolute',
          width: 180,
          height: 180,
          borderRadius: 16,
          border: '1px solid rgba(139, 148, 103, 0.15)',
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease',
          transform: isHovered ? 'translate(12px, 12px)' : 'translate(16px, 16px)',
          zIndex: 1,
          opacity: 0.4,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
        }} />
      )}
      
      {/* Back card 2 */}
      {count >= 2 && (
        <div style={{
          position: 'absolute',
          width: 180,
          height: 180,
          borderRadius: 16,
          border: '1px solid rgba(139, 148, 103, 0.15)',
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease',
          transform: isHovered ? 'translate(4px, 4px)' : 'translate(8px, 8px)',
          zIndex: 2,
          opacity: 0.7,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        }} />
      )}
      
      {/* Front card */}
      <div style={{
        position: 'absolute',
        width: 180,
        height: 180,
        borderRadius: 16,
        border: '1px solid rgba(139, 148, 103, 0.15)',
        background: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.3s ease',
        transform: isHovered ? 'translate(-4px, -4px)' : 'translate(0, 0)',
        zIndex: 3,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#666666' }}>Backlog</div>
          <div style={{ fontSize: 13, color: '#999999', marginTop: 4 }}>
            {count} item{count !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
