import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSeason, useUpdateSeason } from '../hooks/useSeasons'
import { Button, Card, Input } from '../components/ui'

export default function SeasonEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const seasonId = parseInt(id || '0', 10)
  
  const { data: season, isLoading } = useSeason(seasonId)
  const updateSeason = useUpdateSeason()

  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [durationWeeks, setDurationWeeks] = useState(13)
  const [utilityRate, setUtilityRate] = useState(25)

  useEffect(() => {
    if (season) {
      setName(season.name)
      setStartDate(season.startDate.split('T')[0])
      setDurationWeeks(season.durationWeeks)
      setUtilityRate(season.utilityRate)
    }
  }, [season])

  const handleSave = async () => {
    try {
      await updateSeason.mutateAsync({
        id: seasonId,
        data: {
          name,
          startDate,
          durationWeeks,
          utilityRate,
        },
      })
      navigate('/')
    } catch (error) {
      console.error('Failed to update season:', error)
    }
  }

  if (isLoading) {
    return <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={() => navigate('/')}
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
            <span>Back</span>
          </button>
          <h1 className="text-2xl font-semibold">Edit Season</h1>
        </div>
      </header>

      <main className="container" style={{ padding: 'var(--space-8) var(--space-6)', maxWidth: '600px' }}>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <Input
              label="Season Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Winter 2025"
            />
            <Input
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              label="Duration (Weeks)"
              type="number"
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(parseInt(e.target.value, 10))}
            />
            <Input
              label="Weekly Capacity (Hours)"
              type="number"
              value={utilityRate}
              onChange={(e) => setUtilityRate(parseInt(e.target.value, 10))}
            />
            
            <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-4)' }}>
              <Button variant="secondary" onClick={() => navigate('/')}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSave}>
                Save Changes
              </Button>
            </div>
          </div>
        </Card>
      </main>
    </div>
  )
}
