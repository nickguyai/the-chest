import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActiveSeason, useSeasons } from '../hooks/useSeasons'

interface MenuCardProps {
  currentPage?: 'home' | 'actions' | 'settings' | 'weekly' | 'review'
}

export function MenuCard({ currentPage }: MenuCardProps) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const { data: seasons } = useSeasons()
  const { data: activeSeason } = useActiveSeason()

  const handleSeasonChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const seasonId = e.target.value
    if (seasonId) {
      navigate(`/seasons/${seasonId}`)
    }
    setMenuOpen(false)
  }

  const menuItems = [
    { key: 'home', label: '🏠 Home', path: '/' },
    { key: 'actions', label: '📋 All Actions', path: '/actions' },
    { key: 'review', label: '📊 Review', path: '/review' },
    { key: 'settings', label: '⚙️ Settings', path: '/settings' },
  ]

  return (
    <div style={{ position: 'relative', marginBottom: 12 }}>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        style={{
          width: '100%',
          padding: '10px 16px',
          background: 'white',
          border: '1px solid rgba(139, 148, 103, 0.15)',
          borderRadius: 12,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 14,
          fontWeight: 500,
          color: '#666',
        }}
      >
        <span>☰ Menu</span>
        <span style={{ fontSize: 12 }}>{menuOpen ? '▲' : '▼'}</span>
      </button>
      
      {menuOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          background: 'white',
          border: '1px solid rgba(139, 148, 103, 0.15)',
          borderRadius: 12,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 100,
          overflow: 'hidden',
        }}>
          {menuItems.map((item) => (
            <button
              key={item.key}
              onClick={() => { navigate(item.path); setMenuOpen(false); }}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: currentPage === item.key ? 'rgba(139, 148, 103, 0.1)' : 'transparent',
                border: 'none',
                borderBottom: '1px solid rgba(139, 148, 103, 0.1)',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 14,
                color: currentPage === item.key ? '#8B9467' : '#333',
                fontWeight: currentPage === item.key ? 600 : 400,
              }}
            >
              {item.label}
            </button>
          ))}
          <div style={{ padding: '8px 16px' }}>
            <label style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 4 }}>Season</label>
            <select
              value={activeSeason?.id || ''}
              onChange={handleSeasonChange}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: 8,
                border: '1px solid rgba(139, 148, 103, 0.2)',
                fontSize: 13,
                background: 'white',
              }}
            >
              {seasons?.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
