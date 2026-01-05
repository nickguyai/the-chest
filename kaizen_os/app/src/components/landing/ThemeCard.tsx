import { useNavigate } from 'react-router-dom'
import { CardWithActionCount } from '../../lib/api'

interface ThemeCardProps {
  theme: CardWithActionCount
  actualHours?: number
  plannedHours?: number
}

export function ThemeCard({ theme, actualHours = 0, plannedHours = 0 }: ThemeCardProps) {
  const navigate = useNavigate()

  const handleClick = () => {
    navigate(`/theme/${theme.id}`)
  }

  return (
    <div
      onClick={handleClick}
      className="theme-card group relative"
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          navigate(`/card/${theme.id}/edit`)
        }}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-[rgba(139,148,103,0.1)] rounded-lg transition-all"
        title="Edit Theme"
      >
        <span style={{ fontSize: 12, color: '#8B9467', fontWeight: 600 }}>Edit</span>
      </button>
      <h3 className="theme-title">{theme.title}</h3>
      <div className="hours-display">
        <span className="actual-hours">{actualHours}h</span>
        <div className="hours-divider" />
        <span className="planned-hours">{plannedHours}h</span>
      </div>
    </div>
  )
}
