import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Input, Select } from '../components/ui';
import { getAuthenticatedUserId } from '../lib/auth';

interface ClassificationRule {
  id: string;
  matchType: string;
  matchValue: string;
  cardId: number;
  priority: number;
  isActive: boolean;
  card: { id: number; title: string; unitType: string };
}

interface ActionCard {
  id: number;
  title: string;
  unitType: string;
}

export default function ClassificationRulesPage() {
  const navigate = useNavigate();
  const [rules, setRules] = useState<ClassificationRule[]>([]);
  const [actions, setActions] = useState<ActionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<ClassificationRule | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  // Form state
  const [formMatchType, setFormMatchType] = useState('title_contains');
  const [formMatchValue, setFormMatchValue] = useState('');
  const [formCardId, setFormCardId] = useState<number | ''>('');
  const [formPriority, setFormPriority] = useState(0);
  const [formIsActive, setFormIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const [rulesRes, actionsRes] = await Promise.all([
          fetch('/api/calendar/rules', {
            headers: { 'x-user-id': String(getAuthenticatedUserId()) },
          }),
          fetch('/api/cards/active-actions', {
            headers: { 'x-user-id': String(getAuthenticatedUserId()) },
          }),
        ]);
        
        if (rulesRes.ok) setRules(await rulesRes.json());
        if (actionsRes.ok) setActions(await actionsRes.json());
      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const resetForm = () => {
    setFormMatchType('title_contains');
    setFormMatchValue('');
    setFormCardId('');
    setFormPriority(0);
    setFormIsActive(true);
    setEditingRule(null);
    setShowCreateForm(false);
  };

  const startEdit = (rule: ClassificationRule) => {
    setEditingRule(rule);
    setFormMatchType(rule.matchType);
    setFormMatchValue(rule.matchValue);
    setFormCardId(rule.cardId);
    setFormPriority(rule.priority);
    setFormIsActive(rule.isActive);
    setShowCreateForm(true);
  };

  const handleSave = async () => {
    if (!formMatchValue.trim() || !formCardId) return;
    
    setSaving(true);
    try {
      const payload = {
        matchType: formMatchType,
        matchValue: formMatchValue,
        cardId: formCardId,
        priority: formPriority,
        isActive: formIsActive,
      };

      const url = editingRule 
        ? `/api/calendar/rules/${editingRule.id}`
        : '/api/calendar/rules';
      
      const res = await fetch(url, {
        method: editingRule ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(getAuthenticatedUserId()),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const savedRule = await res.json();
        if (editingRule) {
          setRules(prev => prev.map(r => r.id === savedRule.id ? savedRule : r));
        } else {
          setRules(prev => [savedRule, ...prev]);
        }
        resetForm();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to save rule');
      }
    } catch (error) {
      console.error('Failed to save rule:', error);
      alert('Failed to save rule');
    }
    setSaving(false);
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm('Delete this classification rule?')) return;
    
    try {
      const res = await fetch(`/api/calendar/rules/${ruleId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': String(getAuthenticatedUserId()) },
      });
      
      if (res.ok) {
        setRules(prev => prev.filter(r => r.id !== ruleId));
      }
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const handleToggleActive = async (rule: ClassificationRule) => {
    try {
      const res = await fetch(`/api/calendar/rules/${rule.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(getAuthenticatedUserId()),
        },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      
      if (res.ok) {
        const updated = await res.json();
        setRules(prev => prev.map(r => r.id === updated.id ? updated : r));
      }
    } catch (error) {
      console.error('Failed to toggle rule:', error);
    }
  };

  const getMatchTypeLabel = (type: string) => {
    switch (type) {
      case 'title_exact': return 'Title equals';
      case 'title_contains': return 'Title contains';
      default: return type;
    }
  };

  const getActionTypeColor = (unitType: string) => {
    switch (unitType) {
      case 'ACTION_GATE': return '#E74C3C';
      case 'ACTION_EXPERIMENT': return '#9B59B6';
      case 'ACTION_ROUTINE': return '#1ABC9C';
      case 'ACTION_OPS': return '#F39C12';
      default: return '#95A5A6';
    }
  };

  const getActionTypeLabel = (unitType: string) => {
    return unitType.replace('ACTION_', '');
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={() => navigate('/settings')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span>←</span>
            <span>Settings</span>
          </button>
          <h1 className="text-2xl font-semibold">Classification Rules</h1>
        </div>
      </header>

      <main className="container" style={{ padding: 'var(--space-8) var(--space-6)', maxWidth: '800px' }}>
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-4)' }}>
            <div>
              <h2 className="text-lg font-semibold">Event Classification Rules</h2>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
                Auto-assign calendar events to actions based on title patterns. Rules are applied during weekly planning.
              </p>
            </div>
            {!showCreateForm && (
              <Button variant="primary" onClick={() => setShowCreateForm(true)}>
                + Add Rule
              </Button>
            )}
          </div>

          {/* Create/Edit Form */}
          {showCreateForm && (
            <div style={{ 
              padding: 'var(--space-5)', 
              background: 'var(--color-sage-light)', 
              borderRadius: 8,
              marginBottom: 'var(--space-5)',
              border: '1px solid var(--color-sage-border)',
            }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 'var(--space-4)' }}>
                {editingRule ? 'Edit Rule' : 'Create New Rule'}
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                <Select
                  label="Match Type"
                  value={formMatchType}
                  onChange={(e) => setFormMatchType(e.target.value)}
                  options={[
                    { value: 'title_contains', label: 'Title contains' },
                    { value: 'title_exact', label: 'Title equals' },
                  ]}
                />
                <Input
                  label="Match Value"
                  value={formMatchValue}
                  onChange={(e) => setFormMatchValue(e.target.value)}
                  placeholder="e.g., Team Standup, 1:1 with..."
                />
              </div>

              <div style={{ marginBottom: 'var(--space-4)' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
                  Assign to Action
                </label>
                <select
                  value={formCardId}
                  onChange={(e) => setFormCardId(e.target.value ? parseInt(e.target.value, 10) : '')}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--color-sage-border)',
                    borderRadius: 6,
                    fontSize: 14,
                    background: 'var(--color-white)',
                  }}
                >
                  <option value="">Select an action...</option>
                  {actions.map(action => (
                    <option key={action.id} value={action.id}>
                      [{getActionTypeLabel(action.unitType)}] {action.title}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                <Input
                  label="Priority (higher = checked first)"
                  type="number"
                  value={formPriority}
                  onChange={(e) => setFormPriority(parseInt(e.target.value, 10) || 0)}
                />
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
                    Status
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '10px 0' }}>
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                    />
                    <span style={{ fontSize: 14 }}>Active</span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={resetForm}>Cancel</Button>
                <Button 
                  variant="primary" 
                  onClick={handleSave}
                  disabled={saving || !formMatchValue.trim() || !formCardId}
                >
                  {saving ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
                </Button>
              </div>
            </div>
          )}

          {/* Rules List */}
          {rules.length === 0 ? (
            <div style={{ 
              padding: 'var(--space-8)', 
              textAlign: 'center', 
              color: 'var(--color-text-muted)',
              background: 'var(--color-bg-secondary)',
              borderRadius: 8,
            }}>
              <p style={{ fontSize: 15, marginBottom: 8 }}>No classification rules yet.</p>
              <p style={{ fontSize: 13 }}>
                Rules are automatically created when you check "Remember" in the planning finalize modal,
                or you can create them manually above.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rules.map(rule => (
                <div
                  key={rule.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-4)',
                    padding: 'var(--space-4)',
                    background: rule.isActive ? 'var(--color-white)' : 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-sage-border-light)',
                    borderRadius: 8,
                    opacity: rule.isActive ? 1 : 0.6,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ 
                        fontSize: 11, 
                        padding: '3px 8px', 
                        background: 'var(--color-sage-light)', 
                        borderRadius: 4,
                        color: 'var(--color-text-secondary)',
                        fontWeight: 500,
                      }}>
                        {getMatchTypeLabel(rule.matchType)}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>"{rule.matchValue}"</span>
                      {!rule.isActive && (
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>(disabled)</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                      <span 
                        style={{ 
                          width: 10, 
                          height: 10, 
                          borderRadius: 3, 
                          background: getActionTypeColor(rule.card.unitType),
                        }} 
                      />
                      <span style={{ fontWeight: 500 }}>{rule.card.title}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        ({getActionTypeLabel(rule.card.unitType)})
                      </span>
                      {rule.priority > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 8 }}>
                          Priority: {rule.priority}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleToggleActive(rule)}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid var(--color-sage-border)',
                        borderRadius: 6,
                        background: 'var(--color-white)',
                        cursor: 'pointer',
                        fontSize: 12,
                        color: rule.isActive ? 'var(--color-success)' : 'var(--color-text-muted)',
                      }}
                      title={rule.isActive ? 'Disable rule' : 'Enable rule'}
                    >
                      {rule.isActive ? 'Active' : 'Disabled'}
                    </button>
                    <button
                      onClick={() => startEdit(rule)}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid var(--color-sage-border)',
                        borderRadius: 6,
                        background: 'var(--color-white)',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid #E74C3C33',
                        borderRadius: 6,
                        background: 'var(--color-white)',
                        cursor: 'pointer',
                        fontSize: 12,
                        color: '#E74C3C',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
