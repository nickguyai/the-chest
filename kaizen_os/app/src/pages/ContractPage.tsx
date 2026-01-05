import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useCard, useUpdateCard, useCreateCard, useDeleteCard } from '../hooks/useCards'
import { ContractForm } from '../components/contract'
import { AgentChat } from '../components/AgentChat'
import { UpdateCardInput, Card, UnitType } from '../lib/api'

function ParentThemeLink({ id }: { id: number }) {
  const { data: parent } = useCard(id)
  if (!parent) return null
  return (
    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'flex', gap: 6, alignItems: 'center' }}>
      <span>Theme:</span>
      <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{parent.title}</span>
    </div>
  )
}

export default function ContractPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  
  const isCreateMode = id === 'create'
  const cardId = isCreateMode ? 0 : parseInt(id || '0', 10)
  const typeParam = searchParams.get('type') as UnitType
  const parentIdParam = searchParams.get('parentId')

  const { data: fetchedCard, isLoading: cardLoading } = useCard(cardId)
  const updateCard = useUpdateCard()
  const createCard = useCreateCard()
  const deleteCard = useDeleteCard()

  const isLoading = !isCreateMode && cardLoading

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F1EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#999999' }}>Loading...</div>
      </div>
    )
  }

  // Use fetched card or a mock one for create mode
  const card = isCreateMode ? {
    id: 0,
    userId: 0,
    title: '',
    description: null,
    targetDate: null,
    completionDate: null,
    startDate: null,
    unitType: typeParam || 'ACTION_GATE',
    status: 'backlog',
    parentId: parentIdParam ? parseInt(parentIdParam, 10) : null,
    seasonId: null,
    lagWeeks: null,
    criteria: [],
    tags: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Card : fetchedCard

  if (!card) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F1EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#999999' }}>Card not found</div>
      </div>
    )
  }

  const handleSave = async (data: UpdateCardInput) => {
    try {
      if (isCreateMode) {
        await createCard.mutateAsync({
          title: data.title || '',
          unitType: card.unitType,
          status: data.status,
          parentId: card.parentId || undefined,
          targetDate: data.targetDate || undefined,
          lagWeeks: data.lagWeeks || undefined,
          criteria: data.criteria,
        })
        navigate(-1)
      } else {
        await updateCard.mutateAsync({ id: cardId, data })
        // Don't navigate away on auto-save
      }
    } catch (error) {
      console.error('Failed to save:', error)
    }
  }

  const handleCancel = () => {
    navigate(-1)
  }

  const handleDelete = async () => {
    try {
      await deleteCard.mutateAsync(cardId)
      navigate(-1)
    } catch (error) {
      console.error('Failed to delete:', error)
    }
  }

  return (
    <div className="app">
      <div className="contract-container">
        {/* Header */}
        <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={handleCancel}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>←</span>
            <span>Back to Theme</span>
          </button>
          
          {card.parentId && (
            <ParentThemeLink id={card.parentId} />
          )}
        </div>

        {/* Contract Form */}
        <ContractForm
          card={card}
          onSave={handleSave}
          onCancel={handleCancel}
          onDelete={!isCreateMode ? handleDelete : undefined}
          isCreateMode={isCreateMode}
        />
      </div>
      <AgentChat />
    </div>
  )
}
