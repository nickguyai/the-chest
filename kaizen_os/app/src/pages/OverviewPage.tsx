// Overview Page - Themes Tab
// Shows all themes, WIGs, current season, and active bets

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useThemes, useActiveActions, useDeleteCard, useCreateCard } from '../hooks/useCards'
import { useActiveSeason, useUpdateSeason, useCreateSeason } from '../hooks/useSeasons'
import { ThemeCard } from '../components/ThemeCard'
import { SeasonPanel } from '../components/SeasonPanel'
import { ActiveActionsSidebar } from '../components/ActiveActionsSidebar'
import { CreateEntryModal } from '../components/CreateEntryModal'
import { Button } from '../components/ui'
import { api } from '../lib/api'

export default function OverviewPage() {
  const navigate = useNavigate()
  const [showCreateTheme, setShowCreateTheme] = useState(false)
  const [conditions, setConditions] = useState<Record<number, { conditionScore: number; lastActivity: string | null }>>({})
  
  const { data: themes, isLoading: themesLoading } = useThemes()
  const { data: season, isLoading: seasonLoading } = useActiveSeason()
  const { data: activeActions, isLoading: actionsLoading } = useActiveActions()
  const deleteMutation = useDeleteCard()
  const createMutation = useCreateCard()
  const updateSeasonMutation = useUpdateSeason()
  const createSeasonMutation = useCreateSeason()

  // Fetch condition scores for all themes
  useEffect(() => {
    const loadConditions = async () => {
      try {
        const data = await api.getAllConditions()
        setConditions(data)
      } catch (error) {
        console.error('Failed to load conditions:', error)
      }
    }
    loadConditions()
    
    // Refresh conditions every 30 seconds
    const interval = setInterval(loadConditions, 30000)
    return () => clearInterval(interval)
  }, [themes])

  const handleDeleteTheme = async (id: number) => {
    try {
      await deleteMutation.mutateAsync(id)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete theme')
    }
  }

  const handleUpdateSeason = async (id: number, data: { name?: string; startDate?: string; durationWeeks?: number; utilityRate?: number }) => {
    try {
      await updateSeasonMutation.mutateAsync({ id, data })
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update season')
    }
  }

  const handleCreateSeason = async (data: { name: string; startDate: string; durationWeeks: number; utilityRate?: number }) => {
    try {
      await createSeasonMutation.mutateAsync(data)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create season')
    }
  }

  const handleCreateTheme = async (data: { title: string; description?: string }) => {
    try {
      await createMutation.mutateAsync({
        title: data.title,
        description: data.description,
        unitType: 'THEME',
        status: 'in_progress',
      })
      setShowCreateTheme(false)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create theme')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Header */}
      <header
        style={{
          padding: 'var(--space-6)',
          borderBottom: '1px solid var(--color-sage-border-light)',
          background: 'var(--color-card)',
        }}
      >
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <button 
                onClick={() => navigate('/')}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  fontSize: '1rem',
                }}
              >
                ← Home
              </button>
              <div>
                <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-sage)' }}>
                  🎯 Themes
                </h1>
                <p className="text-secondary">Strategic Life Management</p>
              </div>
            </div>
            {season && (
              <div style={{ textAlign: 'right' }}>
                <span className="text-sm text-muted">Current Season</span>
                <p className="font-semibold">{season.name}</p>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container" style={{ padding: 'var(--space-8) var(--space-6)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 320px',
            gap: 'var(--space-8)',
          }}
        >
          {/* Left Column - Themes */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
              <h2 className="text-xl font-semibold">Themes</h2>
              <Button variant="secondary" size="sm" onClick={() => setShowCreateTheme(true)}>
                + Add Theme
              </Button>
            </div>

            {themesLoading ? (
              <p className="text-muted">Loading themes...</p>
            ) : themes && themes.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 'var(--space-4)',
                }}
              >
                {themes.map((theme) => (
                  <ThemeCard 
                    key={theme.id} 
                    theme={theme} 
                    conditionScore={conditions[theme.id]?.conditionScore ?? 0}
                    lastActivity={conditions[theme.id]?.lastActivity}
                    onDelete={handleDeleteTheme} 
                  />
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: 'var(--space-12)',
                  textAlign: 'center',
                  background: 'var(--color-card)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px dashed var(--color-sage-border)',
                }}
              >
                <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>
                  No themes yet. Create your first theme to get started.
                </p>
                <Button variant="primary" onClick={() => setShowCreateTheme(true)}>Create Theme</Button>
              </div>
            )}
          </div>

          {/* Right Column - Season & Active Bets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {seasonLoading ? (
              <p className="text-muted">Loading season...</p>
            ) : (
              <SeasonPanel 
                season={season ?? null} 
                onUpdate={handleUpdateSeason}
                onCreate={handleCreateSeason}
              />
            )}

            <ActiveActionsSidebar
              actions={activeActions ?? []}
              isLoading={actionsLoading}
            />
          </div>
        </div>
      </main>

      {/* Create Theme Modal */}
      <CreateEntryModal
        isOpen={showCreateTheme}
        onClose={() => setShowCreateTheme(false)}
        onSubmit={handleCreateTheme}
        title="Create Theme"
        entryType="Theme"
        isLoading={createMutation.isPending}
      />
    </div>
  )
}
