import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Input, Select, Textarea } from '../components/ui'
import { useUserSettings, useUpdateUserSettings } from '../hooks/useUserSettings'
import { KAIZEN_DB_TOOLS, BUILT_IN_TOOLS, KaizenDbTool, UserSettings, DEFAULT_USER_SETTINGS } from '../services/userService'
import { CalendarSettings } from '../components/settings/CalendarSettings'
import { MenuCard } from '../components/MenuCard'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { data: settings, isLoading } = useUserSettings()
  const updateSettings = useUpdateUserSettings()
  const [form, setForm] = useState<UserSettings>(DEFAULT_USER_SETTINGS)

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync(form)
      navigate('/')
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }

  const handleChange = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleBuiltinToolToggle = (tool: string) => {
    const tools = form.agentBuiltinTools.includes(tool)
      ? form.agentBuiltinTools.filter(t => t !== tool)
      : [...form.agentBuiltinTools, tool]
    handleChange('agentBuiltinTools', tools)
  }

  const handleMcpToolToggle = (toolKey: string) => {
    const tools = form.agentAllowedTools.includes(toolKey)
      ? form.agentAllowedTools.filter(t => t !== toolKey)
      : [...form.agentAllowedTools, toolKey]
    handleChange('agentAllowedTools', tools)
  }

  const readTools = Object.entries(KAIZEN_DB_TOOLS).filter(
    ([key]) => KAIZEN_DB_TOOLS[key as KaizenDbTool].category === 'read'
  )
  const writeTools = Object.entries(KAIZEN_DB_TOOLS).filter(
    ([key]) => KAIZEN_DB_TOOLS[key as KaizenDbTool].category === 'write'
  )

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: 16 }}>
      <div style={{ maxWidth: 300, marginBottom: 16 }}>
        <MenuCard currentPage="settings" />
      </div>

      <main className="container" style={{ padding: 'var(--space-8) var(--space-6)', maxWidth: '1100px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>Settings</h1>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-6)' }}>
          
          {/* CLUSTER 1: Limits */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
              Limits
            </h2>
            
            <Card>
              <h3 className="text-md font-semibold" style={{ marginBottom: 'var(--space-3)' }}>WIP Limits</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <Input label="Max Themes" type="number" value={form.maxThemes} onChange={(e) => handleChange('maxThemes', parseInt(e.target.value))} />
                <Input label="Max Gates/Theme" type="number" value={form.maxGatesPerTheme} onChange={(e) => handleChange('maxGatesPerTheme', parseInt(e.target.value))} />
                <Input label="Max Experiments/Theme" type="number" value={form.maxExperimentsPerTheme} onChange={(e) => handleChange('maxExperimentsPerTheme', parseInt(e.target.value))} />
                <Input label="Max Routines/Theme" type="number" value={form.maxRoutinesPerTheme} onChange={(e) => handleChange('maxRoutinesPerTheme', parseInt(e.target.value))} />
                <Input label="Max Ops/Theme" type="number" value={form.maxOpsPerTheme} onChange={(e) => handleChange('maxOpsPerTheme', parseInt(e.target.value))} />
              </div>
            </Card>

            <Card>
              <h3 className="text-md font-semibold" style={{ marginBottom: 'var(--space-3)' }}>Requirements</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <Input label="Min Criteria/Experiment" type="number" value={form.minCriteriaPerExperiment} onChange={(e) => handleChange('minCriteriaPerExperiment', parseInt(e.target.value))} />
                <Input label="Min Criteria/Gate" type="number" value={form.minCriteriaPerGate} onChange={(e) => handleChange('minCriteriaPerGate', parseInt(e.target.value))} />
              </div>
            </Card>

            <Card>
              <h3 className="text-md font-semibold" style={{ marginBottom: 'var(--space-3)' }}>Season Defaults</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <Input label="Duration (Weeks)" type="number" value={form.defaultSeasonWeeks} onChange={(e) => handleChange('defaultSeasonWeeks', parseInt(e.target.value))} />
                <Input label="Lag (Weeks)" type="number" value={form.defaultLagWeeks} onChange={(e) => handleChange('defaultLagWeeks', parseInt(e.target.value))} />
              </div>
            </Card>
          </div>

          {/* CLUSTER 2: Agent Configuration */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
              Agent
            </h2>
            
            <Card>
              <h3 className="text-md font-semibold" style={{ marginBottom: 'var(--space-3)' }}>Tools</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div>
                  <label className="text-xs font-medium text-secondary uppercase mb-2 block">Built-in</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, background: 'var(--color-bg-secondary)', borderRadius: 6, fontSize: 13 }}>
                    {Object.entries(BUILT_IN_TOOLS).map(([key, tool]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={form.agentBuiltinTools.includes(key)} onChange={() => handleBuiltinToolToggle(key)} />
                        <span style={{ fontWeight: 500 }}>{tool.name}</span>
                        {!tool.safe && <span style={{ color: 'var(--color-warning)', fontSize: 10 }}>⚠️</span>}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-secondary uppercase mb-2 block">DB Read</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, background: 'var(--color-bg-secondary)', borderRadius: 6, fontSize: 13 }}>
                    {readTools.map(([key, tool]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={form.agentAllowedTools.includes(key)} onChange={() => handleMcpToolToggle(key)} />
                        <span style={{ fontWeight: 500 }}>{tool.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-secondary uppercase mb-2 block">
                    DB Write <span style={{ color: 'var(--color-warning)', fontSize: 10 }}>⚠️</span>
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, background: 'var(--color-bg-secondary)', borderRadius: 6, fontSize: 13, border: '1px solid #e5a00d33' }}>
                    {writeTools.map(([key, tool]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={form.agentAllowedTools.includes(key)} onChange={() => handleMcpToolToggle(key)} />
                        <span style={{ fontWeight: 500 }}>{tool.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-md font-semibold" style={{ marginBottom: 'var(--space-3)' }}>Permissions</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ padding: 12, background: '#ff000008', borderRadius: 6, border: '1px solid #ff000022' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={form.agentAllowBash} onChange={(e) => handleChange('agentAllowBash', e.target.checked)} style={{ marginTop: 2 }} />
                    <div>
                      <span style={{ fontWeight: 500 }}>Allow Bash</span>
                      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>⚠️ Cannot be rolled back</p>
                    </div>
                  </label>
                </div>

                <Select
                  label="Permission Mode"
                  value={form.agentPermissionMode}
                  onChange={(e) => handleChange('agentPermissionMode', e.target.value as UserSettings['agentPermissionMode'])}
                  options={[
                    { value: 'default', label: 'Default' },
                    { value: 'acceptEdits', label: 'Accept Edits' },
                    { value: 'bypassPermissions', label: 'Bypass All' }
                  ]}
                />

                <Textarea
                  label="Custom System Prompt"
                  value={form.agentSystemPrompt}
                  onChange={(e) => handleChange('agentSystemPrompt', e.target.value)}
                  placeholder="Optional custom instructions..."
                  rows={2}
                />
              </div>
            </Card>
          </div>

          {/* CLUSTER 3: App Configuration */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
              App
            </h2>
            
            <CalendarSettings />

            <Card>
              <h3 className="text-md font-semibold" style={{ marginBottom: 'var(--space-3)' }}>Classification Rules</h3>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
                Auto-assign calendar events to actions based on title patterns.
              </p>
              <Button variant="secondary" onClick={() => navigate('/settings/rules')}>
                Manage Rules →
              </Button>
            </Card>

            <Card>
              <h3 className="text-md font-semibold" style={{ marginBottom: 'var(--space-3)' }}>Developer</h3>
              <div style={{ padding: 12, background: 'var(--color-bg-secondary)', borderRadius: 6 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input 
                    type="checkbox" 
                    checked={form.debugMode} 
                    onChange={(e) => handleChange('debugMode', e.target.checked)} 
                    style={{ marginTop: 2 }} 
                  />
                  <div>
                    <span style={{ fontWeight: 500 }}>🔧 Debug Mode</span>
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      Show event classification details in planning view.
                    </p>
                  </div>
                </label>
              </div>
            </Card>
          </div>
        </div>

        <div style={{ marginTop: 32, display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
          <Button variant="secondary" onClick={() => navigate('/')}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>Save Settings</Button>
        </div>
      </main>
    </div>
  )
}
