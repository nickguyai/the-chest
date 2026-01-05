import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useCard, useCardChildren, useThemes, useCardsByType, useDeleteCard, useCreateCard } from '../hooks/useCards'
import { AgentChat } from '../components/AgentChat'
import { MenuCard } from '../components/MenuCard'
import { Card, UnitType, api } from '../lib/api'
import { useState, useMemo } from 'react'

export default function ActionTableView() {
  const { id, type } = useParams<{ id?: string; type?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const themeId = id ? parseInt(id, 10) : null
  const unitType = type as UnitType | undefined || 'ACTION_GATE' // Default to Gates if not specified

  // Filter state from URL params (default to in_progress for status)
  const statusFilter = searchParams.get('status') || 'in_progress'
  const themeFilter = searchParams.get('theme') || 'all'
  const searchQuery = searchParams.get('q') || ''

  const { data: theme } = useCard(themeId || 0)
  const { data: themes } = useThemes()
  const { data: themeChildren, isLoading: loadingTheme } = useCardChildren(themeId || 0)
  const { data: allActions, isLoading: loadingGlobal } = useCardsByType(unitType)
  const deleteCard = useDeleteCard()
  const createCard = useCreateCard()

  const isLoading = themeId ? loadingTheme : loadingGlobal
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; title: string } | null>(null)
  const [addingToTheme, setAddingToTheme] = useState<number | null>(null)

  // Update filter in URL
  const updateFilter = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams)
    if (value === 'all' || value === '') {
      newParams.delete(key)
    } else {
      newParams.set(key, value)
    }
    setSearchParams(newParams)
  }

  // Prepare data: list of { theme: Card, actions: Card[] }
  const groups: { theme: Card; actions: Card[] }[] = useMemo(() => {
    const result: { theme: Card; actions: Card[] }[] = []

    if (themeId && theme) {
      const actions = themeChildren?.filter((c: Card) => c.unitType === unitType) || []
      result.push({ theme: theme, actions })
    } else if (!themeId && themes && allActions) {
      themes.forEach((t: Card) => {
        const actionsForTheme = allActions.filter((a: Card) => a.parentId === t.id)
        if (actionsForTheme.length > 0 || themeFilter === 'all') {
          result.push({ theme: t, actions: actionsForTheme })
        }
      })
    }

    // Apply filters
    return result
      .filter(g => themeFilter === 'all' || g.theme.id === parseInt(themeFilter))
      .map(g => ({
        ...g,
        actions: g.actions.filter(a => {
          // Status filter
          if (statusFilter !== 'all' && a.status !== statusFilter) return false
          // Search filter
          if (searchQuery && !a.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
          return true
        })
      }))
      .filter(g => g.actions.length > 0 || (themeFilter !== 'all' && g.theme.id === parseInt(themeFilter)))
  }, [themeId, theme, themeChildren, themes, allActions, unitType, statusFilter, themeFilter, searchQuery])

  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const toggleExpand = (id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDelete = async () => {
    if (deleteConfirm) {
      try {
        await deleteCard.mutateAsync(deleteConfirm.id)
        setDeleteConfirm(null)
      } catch (error) {
        console.error('Failed to delete:', error)
      }
    }
  }

  const handleAddAction = async (parentThemeId: number) => {
    setAddingToTheme(parentThemeId)
    try {
      await createCard.mutateAsync({
        title: `New ${unitType.replace('ACTION_', '')}`,
        unitType: unitType,
        parentId: parentThemeId,
        status: 'not_started',
      })
    } catch (error) {
      console.error('Failed to create action:', error)
    }
    setAddingToTheme(null)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: '16px' }}>
      {/* Fixed MenuCard - same position as landing page */}
      <div style={{ position: 'fixed', top: 16, left: 16, width: 300, zIndex: 50 }}>
        <MenuCard currentPage="actions" />
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
        }}>
          <div style={{
            background: 'white',
            borderRadius: 16,
            padding: 24,
            maxWidth: 400,
            width: '90%',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Delete Action?</h3>
            <p style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>
              This will permanently delete "{deleteConfirm.title}". This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(139, 148, 103, 0.2)',
                  borderRadius: 12,
                  padding: '10px 20px',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                style={{
                  background: '#E74C3C',
                  color: 'white',
                  border: 'none',
                  borderRadius: 12,
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: '0 auto', paddingTop: 60 }}>
        <header style={{ marginBottom: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: '#1A1A1A', margin: 0 }}>
              {theme ? `${theme.title} - ${unitType.replace('ACTION_', '')}` : `All ${unitType.replace('ACTION_', '')}s`}
            </h1>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {(['ACTION_GATE', 'ACTION_EXPERIMENT', 'ACTION_ROUTINE', 'ACTION_OPS'] as UnitType[]).map(t => (
              <button
                key={t}
                onClick={() => navigate(themeId ? `/theme/${themeId}/actions/${t}` : `/actions/${t}`)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1px solid rgba(139, 148, 103, 0.2)',
                  background: unitType === t ? '#8B9467' : 'white',
                  color: unitType === t ? 'white' : '#666',
                  cursor: 'pointer'
                }}
              >
                {t.replace('ACTION_', '')}
              </button>
            ))}
          </div>
        </header>

        {/* Filter Bar */}
        <div style={{ 
          display: 'flex', 
          gap: 16, 
          marginBottom: 24, 
          padding: 16, 
          background: 'white', 
          borderRadius: 12, 
          border: '1px solid rgba(139, 148, 103, 0.15)',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          {/* Search */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <input
              type="text"
              placeholder="Search actions..."
              value={searchQuery}
              onChange={(e) => updateFilter('q', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid rgba(139, 148, 103, 0.2)',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => updateFilter('status', e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid rgba(139, 148, 103, 0.2)',
                fontSize: 13,
                background: 'white',
                cursor: 'pointer',
              }}
            >
              <option value="all">All</option>
              <option value="in_progress">In Progress</option>
              <option value="not_started">Not Started</option>
              <option value="backlog">Backlog</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Theme Filter (only when not viewing single theme) */}
          {!themeId && themes && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Theme:</label>
              <select
                value={themeFilter}
                onChange={(e) => updateFilter('theme', e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(139, 148, 103, 0.2)',
                  fontSize: 13,
                  background: 'white',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Themes</option>
                {themes.map((t: Card) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* Clear Filters */}
          {(statusFilter !== 'all' || themeFilter !== 'all' || searchQuery) && (
            <button
              onClick={() => setSearchParams(new URLSearchParams())}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: 'none',
                background: 'rgba(231, 76, 60, 0.1)',
                color: '#E74C3C',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Clear Filters
            </button>
          )}
        </div>

        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {groups.map(group => (
              <div key={group.theme.id}>
                {!themeId && (
                  <h3 style={{ fontSize: 13, color: '#8B9467', fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Theme: {group.theme.title}
                  </h3>
                )}
                <div style={{ background: 'white', borderRadius: 16, border: '1px solid rgba(139, 148, 103, 0.15)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'rgba(139, 148, 103, 0.05)', borderBottom: '1px solid rgba(139, 148, 103, 0.15)' }}>
                        <th style={{ padding: '16px 24px', fontWeight: 600, fontSize: 12, color: '#666' }}>TITLE</th>
                        <th style={{ padding: '16px 24px', fontWeight: 600, fontSize: 12, color: '#666' }}>STATUS</th>
                        <th style={{ padding: '16px 24px', fontWeight: 600, fontSize: 12, color: '#666' }}>TARGET DATE</th>
                        <th style={{ padding: '16px 24px', fontWeight: 600, fontSize: 12, color: '#666' }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.actions.map(action => (
                        <ActionRow 
                          key={action.id} 
                          action={action} 
                          isExpanded={expandedRows.has(action.id)}
                          onToggle={() => toggleExpand(action.id)}
                          navigate={navigate}
                          onDelete={() => setDeleteConfirm({ id: action.id, title: action.title })}
                        />
                      ))}
                      {group.actions.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#999', fontSize: 13 }}>
                            No {unitType.replace('ACTION_', '').toLowerCase()}s in this theme
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {/* Add Action Button */}
                  <div style={{ 
                    padding: '12px 24px', 
                    borderTop: '1px solid rgba(139, 148, 103, 0.1)',
                    background: 'rgba(139, 148, 103, 0.02)'
                  }}>
                    <button
                      onClick={() => handleAddAction(group.theme.id)}
                      disabled={addingToTheme === group.theme.id}
                      style={{
                        background: 'transparent',
                        border: '1px dashed rgba(139, 148, 103, 0.3)',
                        borderRadius: 8,
                        padding: '8px 16px',
                        fontSize: 12,
                        fontWeight: 500,
                        color: '#8B9467',
                        cursor: addingToTheme === group.theme.id ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        opacity: addingToTheme === group.theme.id ? 0.6 : 1,
                      }}
                    >
                      {addingToTheme === group.theme.id ? (
                        '⏳ Adding...'
                      ) : (
                        <>+ Add {unitType.replace('ACTION_', '')}</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {groups.length === 0 && (
              <div style={{ padding: 48, textAlign: 'center', color: '#999', background: 'white', borderRadius: 16, border: '1px solid rgba(139, 148, 103, 0.15)' }}>
                No {unitType.replace('ACTION_', '').toLowerCase()}s found.
              </div>
            )}
          </div>
        )}
      </div>
      <AgentChat />
    </div>
  )
}

function ActionRow({ action, isExpanded, onToggle, navigate, onDelete }: { 
  action: Card, 
  isExpanded: boolean, 
  onToggle: () => void,
  navigate: (path: string) => void,
  onDelete: () => void
}) {
  // Only fetch children when expanded to avoid N+1 queries
  const { data: subItems } = useQuery({
    queryKey: ['cardChildren', action.id],
    queryFn: () => api.getCardChildren(action.id),
    enabled: isExpanded, // Only fetch when row is expanded
  })

  return (
    <>
      <tr style={{ borderBottom: '1px solid rgba(139, 148, 103, 0.08)', cursor: 'pointer' }} onClick={onToggle}>
        <td style={{ padding: '16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 10, color: '#999', width: 12 }}>{isExpanded ? '▼' : '▶'}</span>
            <span style={{ fontWeight: 500 }}>{action.title}</span>
          </div>
        </td>
        <td style={{ padding: '16px 24px' }}>
          <span style={{ 
            fontSize: 11, 
            padding: '2px 8px', 
            borderRadius: 6, 
            background: action.status === 'in_progress' ? 'rgba(139, 148, 190, 0.1)' : 'rgba(0,0,0,0.05)',
            color: action.status === 'in_progress' ? '#8B94BE' : '#666',
            textTransform: 'uppercase',
            fontWeight: 600
          }}>
            {action.status.replace('_', ' ')}
          </span>
        </td>
        <td style={{ padding: '16px 24px', color: '#666', fontSize: 13 }}>
          {action.targetDate ? new Date(action.targetDate).toLocaleDateString() : '-'}
        </td>
        <td style={{ padding: '16px 24px' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <button 
              onClick={(e) => { e.stopPropagation(); navigate(`/contract/${action.id}`) }}
              style={{ background: 'none', border: 'none', color: '#8B9467', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
            >
              Details
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              style={{ background: 'none', border: 'none', color: '#E74C3C', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
            >
              Delete
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && subItems?.map(item => (
        <tr key={item.id} style={{ background: 'rgba(139, 148, 103, 0.02)', borderBottom: '1px solid rgba(139, 148, 103, 0.04)' }}>
          <td style={{ padding: '12px 24px 12px 60px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#999' }}>∟</span>
              <span style={{ fontSize: 13, color: '#444' }}>{item.title}</span>
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(0,0,0,0.05)', color: '#888' }}>{item.unitType}</span>
            </div>
          </td>
          <td style={{ padding: '12px 24px', fontSize: 12, color: '#666' }}>{item.status.replace('_', ' ')}</td>
          <td style={{ padding: '12px 24px', fontSize: 12, color: '#999' }}>-</td>
          <td style={{ padding: '12px 24px' }}></td>
        </tr>
      ))}
    </>
  )
}
