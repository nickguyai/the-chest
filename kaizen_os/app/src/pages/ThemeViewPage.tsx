// Theme View Page - v4 redesign matching theme_view.html mock
import { useParams, useNavigate } from 'react-router-dom'
import { useCard, useCardChildren } from '../hooks/useCards'
import { useUserSettings } from '../hooks/useUserSettings'
import { ActionRow } from '../components/theme'
import { AgentChat } from '../components/AgentChat'
import { Card, UnitType, WipTypeStatus } from '../lib/api'

export default function ThemeViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const themeId = parseInt(id || '0', 10)

  const { data: theme, isLoading: themeLoading } = useCard(themeId)
  const { data: children } = useCardChildren(themeId)
  const { data: settings } = useUserSettings()

  if (themeLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F1EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#999999' }}>Loading...</div>
      </div>
    )
  }

  if (!theme) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F1EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#999999' }}>Theme not found</div>
      </div>
    )
  }

  // Filter children by type and status
  const filterByType = (type: UnitType) => children?.filter((c) => c.unitType === type) || []
  const filterActive = (cards: Card[]) => cards.filter((c) => c.status === 'in_progress' || c.status === 'not_started')
  const filterBacklog = (cards: Card[]) => cards.filter((c) => c.status === 'backlog')

  const gates = filterByType('ACTION_GATE')
  const experiments = filterByType('ACTION_EXPERIMENT')
  const routines = filterByType('ACTION_ROUTINE')
  const ops = filterByType('ACTION_OPS')

  // Compute WIP status client-side from children + settings
  const computeWipStatus = (cards: Card[], max: number): WipTypeStatus => {
    const active = cards.filter(c => c.status === 'in_progress').length
    return { active, max, canAdd: active < max }
  }

  const gatesWip = computeWipStatus(gates, settings?.maxGatesPerTheme ?? 2)
  const experimentsWip = computeWipStatus(experiments, settings?.maxExperimentsPerTheme ?? 1)
  const routinesWip = computeWipStatus(routines, settings?.maxRoutinesPerTheme ?? 5)
  const opsWip = computeWipStatus(ops, settings?.maxOpsPerTheme ?? 3)

  const handleAddCard = (unitType: UnitType) => {
    let isFull = false
    if (unitType === 'ACTION_GATE') isFull = !gatesWip.canAdd
    else if (unitType === 'ACTION_EXPERIMENT') isFull = !experimentsWip.canAdd
    else if (unitType === 'ACTION_ROUTINE') isFull = !routinesWip.canAdd
    else if (unitType === 'ACTION_OPS') isFull = !opsWip.canAdd
    const statusParam = isFull ? '&status=backlog' : ''
    navigate(`/create?type=${unitType}&parentId=${themeId}${statusParam}`)
  }

  return (
    <div style={{
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: '#F5F1EB',
      color: '#1A1A1A',
      padding: '48px 32px',
      lineHeight: 1.6,
      minHeight: '100vh',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#666666',
              fontSize: 14,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>←</span>
            <span>Back</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: '#1A1A1A', margin: 0 }}>
              {theme.title}
            </h1>
            <button
              onClick={() => navigate(`/card/${theme.id}/edit`)}
              style={{
                background: 'rgba(139, 148, 103, 0.1)',
                border: 'none',
                borderRadius: 8,
                padding: '4px 12px',
                fontSize: 12,
                color: '#8B9467',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Edit Theme
            </button>
          </div>
          {theme.description && (
            <p style={{ fontSize: 14, color: '#666666' }}>{theme.description}</p>
          )}
        </div>

        {/* Action Rows */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          background: 'rgba(139, 148, 103, 0.08)',
          borderRadius: 20,
          overflow: 'hidden',
        }}>
          <ActionRow
            themeId={themeId}
            label="Gates"
            unitType="ACTION_GATE"
            activeCards={filterActive(gates)}
            backlogCards={filterBacklog(gates)}
            wipStatus={gatesWip}
            onAddCard={() => handleAddCard('ACTION_GATE')}
          />
          <ActionRow
            themeId={themeId}
            label="Experiments"
            unitType="ACTION_EXPERIMENT"
            activeCards={filterActive(experiments)}
            backlogCards={filterBacklog(experiments)}
            wipStatus={experimentsWip}
            onAddCard={() => handleAddCard('ACTION_EXPERIMENT')}
          />
          <ActionRow
            themeId={themeId}
            label="Routines"
            unitType="ACTION_ROUTINE"
            activeCards={filterActive(routines)}
            backlogCards={filterBacklog(routines)}
            wipStatus={routinesWip}
            onAddCard={() => handleAddCard('ACTION_ROUTINE')}
            noStack
          />
          <ActionRow
            themeId={themeId}
            label="Ops"
            unitType="ACTION_OPS"
            activeCards={filterActive(ops)}
            backlogCards={filterBacklog(ops)}
            wipStatus={opsWip}
            onAddCard={() => handleAddCard('ACTION_OPS')}
          />
        </div>
      </div>
      <AgentChat />
    </div>
  )
}
