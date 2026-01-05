import { useNavigate } from 'react-router-dom'
import { useThemes, useAllThemeHours } from '../hooks/useCards'
import { useActiveSeason } from '../hooks/useSeasons'
import { useUserSettings } from '../hooks/useUserSettings'
import { ThemeCard } from '../components/landing'
import { AgentChat } from '../components/AgentChat'

export default function ThemesPage() {
  const navigate = useNavigate()
  const { data: themes } = useThemes()
  const { data: activeSeason } = useActiveSeason()
  const { data: themeHours } = useAllThemeHours(activeSeason?.id)
  const { data: userSettings } = useUserSettings()

  const themeCount = themes?.length || 0
  const maxThemes = userSettings?.maxThemes || 5
  const canAddTheme = themeCount < maxThemes

  return (
    <div className="app">
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div className="logo" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
            Kaizen OS
          </div>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-secondary)',
              fontSize: 14,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Home
          </button>
          <button
            onClick={() => navigate('/weekly')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-secondary)',
              fontSize: 14,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Weekly
          </button>
          <button
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-sage)',
              fontSize: 14,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Themes
          </button>
          <button
            onClick={() => navigate('/actions')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-secondary)',
              fontSize: 14,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            All Actions
          </button>
          <button
            onClick={() => navigate('/settings')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-secondary)',
              fontSize: 14,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Settings
          </button>
        </div>
      </header>

      <main className="themes-page-main">
        <div className="themes-page-header">
          <h1>Themes</h1>
          <p className="themes-page-subtitle">
            {themeCount} of {maxThemes} themes active
          </p>
        </div>

        <div className="themes-grid-page">
          {themes?.map((theme) => {
            const allocation = activeSeason?.themeAllocations?.[theme.id] ?? (themes.length > 0 ? 1 / themes.length : 0)
            const plannedHours = activeSeason ? Math.round(activeSeason.totalHours * allocation) : 0

            return (
              <ThemeCard
                key={theme.id}
                theme={theme}
                actualHours={themeHours?.[theme.id] || 0}
                plannedHours={plannedHours}
              />
            )
          })}
          {canAddTheme && (
            <div
              onClick={() => navigate('/create?type=THEME')}
              className="theme-card add-theme-card"
            >
              <span className="add-theme-text">+ Add Theme</span>
            </div>
          )}
        </div>
      </main>

      <AgentChat />
    </div>
  )
}
