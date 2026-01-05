import { useState, useMemo, useCallback } from 'react';
import type { Card } from '../../lib/api';
import { 
  ACTION_TYPES, 
  TYPE_PRIORITY, 
  TYPE_LABELS_PLURAL,
  type ActionType,
} from '../../utils/guidedPlanningUtils';
import '../../styles/action-plan-panel.css';

const TYPE_LABELS: Record<string, string> = {
  ACTION_GATE: 'Gate',
  ACTION_EXPERIMENT: 'Experiment',
  ACTION_ROUTINE: 'Routine',
  ACTION_OPS: 'Ops',
};

const TYPE_CLASSES: Record<string, string> = {
  ACTION_GATE: 'gate',
  ACTION_EXPERIMENT: 'experiment',
  ACTION_ROUTINE: 'routine',
  ACTION_OPS: 'ops',
};

export interface ActionPlanState {
  status: 'pending' | 'completed' | 'skipped';
  tasks: PlannedTask[];
}

export interface PlannedTask {
  id: string;
  actionId: number;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  attendees?: string[];
}

export interface GcalAssignment {
  eventId: string;
  eventTitle: string;
  actionId: number;
  actionTitle: string;
  accountId: string;
  calendarId: string;
  // Modified times for drag/resize in planning mode
  modifiedStart?: Date;
  modifiedEnd?: Date;
}

interface RoutineLinkInfo {
  eventSummary: string | null;
  calendarName: string | null;
  eventRecurrence: string | null;
  htmlLink: string | null;
}

interface ActionPlanPanelProps {
  actions: Card[];
  actionStates: Map<number, ActionPlanState>;
  gcalAssignments: Map<string, GcalAssignment>;
  routineLinks: Map<number, RoutineLinkInfo>;
  currentAction: Card | null;
  currentActionType: ActionType;
  onActionSelect: (action: Card) => void;
  onActionTypeChange: (type: ActionType) => void;
  onRemoveTask: (actionId: number, taskId: string) => void;
  onSetupRoutine: (action: Card) => void;
  onUnlinkRoutine: (actionId: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onFinalize: () => void;
  loading?: boolean;
  plannedHoursData?: {
    plannedHours: number;
    utilityRate: number;
    percentUtilized: number;
    status: 'under' | 'at' | 'over';
  } | null;
}

export function ActionPlanPanel({
  actions,
  actionStates,
  currentAction,
  currentActionType,
  routineLinks,
  onActionSelect,
  onActionTypeChange,
  onRemoveTask,
  onSetupRoutine,
  onUnlinkRoutine,
  onNext,
  onPrev,
  onFinalize,
  loading = false,
  plannedHoursData,
}: ActionPlanPanelProps) {
  const [actionsExpanded, setActionsExpanded] = useState(false);

  // Sort actions by type priority
  const sortedActions = useMemo(() => {
    return [...actions].sort((a, b) => 
      (TYPE_PRIORITY[a.unitType as ActionType] || 99) - (TYPE_PRIORITY[b.unitType as ActionType] || 99)
    );
  }, [actions]);

  // Group actions by type
  const actionsByType = useMemo(() => {
    const groups = new Map<ActionType, Card[]>();
    for (const type of ACTION_TYPES) {
      groups.set(type, []);
    }
    for (const action of sortedActions) {
      const group = groups.get(action.unitType as ActionType);
      if (group) group.push(action);
    }
    return groups;
  }, [sortedActions]);

  // Get actions for current type
  const currentTypeActions = useMemo(() => {
    return actionsByType.get(currentActionType) || [];
  }, [actionsByType, currentActionType]);

  // Calculate progress for each type
  const typeProgress = useMemo(() => {
    const progress: Record<ActionType, { completed: number; total: number }> = {
      ACTION_GATE: { completed: 0, total: 0 },
      ACTION_EXPERIMENT: { completed: 0, total: 0 },
      ACTION_ROUTINE: { completed: 0, total: 0 },
      ACTION_OPS: { completed: 0, total: 0 },
    };
    for (const type of ACTION_TYPES) {
      const typeActions = actionsByType.get(type) || [];
      progress[type].total = typeActions.length;
      progress[type].completed = typeActions.filter(a => {
        const state = actionStates.get(a.id);
        return state?.status === 'completed' || state?.status === 'skipped';
      }).length;
    }
    return progress;
  }, [actionsByType, actionStates]);

  // Find current index
  const currentIndex = currentAction 
    ? currentTypeActions.findIndex(a => a.id === currentAction.id)
    : 0;

  // Check if we can go to previous
  const canGoPrev = currentIndex > 0 || ACTION_TYPES.indexOf(currentActionType) > 0;

  // Get current state
  const currentState = currentAction 
    ? actionStates.get(currentAction.id) || { status: 'pending' as const, tasks: [] }
    : { status: 'pending' as const, tasks: [] };

  const handleSelectAction = useCallback((action: Card, type?: ActionType) => {
    if (type && type !== currentActionType) {
      onActionTypeChange(type);
    }
    onActionSelect(action);
  }, [currentActionType, onActionSelect, onActionTypeChange]);

  if (sortedActions.length === 0) {
    return (
      <div className="action-plan-panel">
        <div className="action-plan-empty">
          <p>No active actions to plan.</p>
          <p className="hint">Create some gates, experiments, routines, or ops first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="action-plan-panel">
      {/* Header with submit button */}
      <div className="action-plan-header">
        <button
          className="submit-plan-btn"
          onClick={onFinalize}
          disabled={loading}
        >
          {loading ? 'Submitting...' : 'Submit Plan'}
        </button>

        {/* Planned Hours Summary */}
        {plannedHoursData && (
          <div className="hours-summary">
            <div className="hours-text">
              <span>Planned: <strong>{plannedHoursData.plannedHours}h</strong></span>
              <span className="hours-divider">/</span>
              <span>Utility: <strong>{plannedHoursData.utilityRate}h</strong></span>
              <span className={`status-badge ${plannedHoursData.status}`}>
                {plannedHoursData.percentUtilized}%
              </span>
            </div>
            <div className="hours-bar">
              <div 
                className={`hours-fill ${plannedHoursData.status}`}
                style={{ width: `${Math.min(100, plannedHoursData.percentUtilized)}%` }}
              />
            </div>
          </div>
        )}

        {/* Type tabs */}
        <div className="type-progress-tabs">
          {ACTION_TYPES.map(type => {
            const prog = typeProgress[type];
            const isActive = type === currentActionType;
            const hasActions = prog.total > 0;
            if (!hasActions) return null;
            return (
              <button
                key={type}
                className={`type-tab ${isActive ? 'active' : ''} ${prog.completed === prog.total ? 'complete' : ''}`}
                onClick={() => {
                  onActionTypeChange(type);
                  const typeActions = actionsByType.get(type) || [];
                  if (typeActions.length > 0) {
                    onActionSelect(typeActions[0]);
                  }
                }}
              >
                <span className="type-tab-label">{TYPE_LABELS_PLURAL[type]}</span>
                <span className="type-tab-progress">{prog.completed}/{prog.total}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Current action card */}
      <div className="action-card-container">
        {/* Navigation buttons */}
        <div className="action-nav">
          <button className="nav-btn prev" onClick={onPrev} disabled={!canGoPrev}>
            ← Prev
          </button>
          <button className="nav-btn next" onClick={onNext}>
            {currentIndex === currentTypeActions.length - 1 
              ? (ACTION_TYPES.indexOf(currentActionType) === ACTION_TYPES.length - 1 || 
                 ACTION_TYPES.slice(ACTION_TYPES.indexOf(currentActionType) + 1).every(t => (actionsByType.get(t) || []).length === 0)
                  ? 'Done' 
                  : 'Next Type →')
              : 'Next →'}
          </button>
        </div>

        {currentAction && (
          <ActionCard
            action={currentAction}
            state={currentState}
            onRemoveTask={(taskId) => onRemoveTask(currentAction.id, taskId)}
            routineLink={routineLinks.get(currentAction.id) || null}
            onSetupRoutine={() => onSetupRoutine(currentAction)}
            onUnlinkRoutine={() => onUnlinkRoutine(currentAction.id)}
          />
        )}
      </div>

      {/* Collapsible action list */}
      <div className="action-list">
        <div className="action-list-header" onClick={() => setActionsExpanded(!actionsExpanded)}>
          <span className="action-list-title">All Actions ({sortedActions.length})</span>
          <span className="expand-icon">{actionsExpanded ? '▼' : '▶'}</span>
        </div>
        {actionsExpanded && (
          <div className="action-list-items">
            {ACTION_TYPES.map(type => {
              const typeActions = actionsByType.get(type) || [];
              if (typeActions.length === 0) return null;
              return (
                <div key={type} className="action-list-type-group">
                  <div className="action-list-type-header">{TYPE_LABELS_PLURAL[type]}</div>
                  {typeActions.map((action) => {
                    const state = actionStates.get(action.id);
                    const statusClass = state?.status === 'completed' ? 'completed' : state?.status === 'skipped' ? 'skipped' : '';
                    const isActive = currentAction?.id === action.id;
                    return (
                      <div
                        key={action.id}
                        className={`action-list-item ${isActive ? 'active' : ''} ${statusClass}`}
                        onClick={() => handleSelectAction(action, type)}
                      >
                        <div className="status-icon">
                          {state?.status === 'completed' ? '✓' : state?.status === 'skipped' ? '–' : ''}
                        </div>
                        <span className="name">{action.title}</span>
                        <div className={`type-dot ${TYPE_CLASSES[action.unitType] || ''}`} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Action Card Component
interface ActionCardProps {
  action: Card & { parentTheme?: { id: number; title: string } | null };
  state: ActionPlanState;
  onRemoveTask: (taskId: string) => void;
  routineLink: RoutineLinkInfo | null;
  onSetupRoutine: () => void;
  onUnlinkRoutine: () => void;
}

function ActionCard({ action, state, onRemoveTask, routineLink, onSetupRoutine, onUnlinkRoutine }: ActionCardProps) {
  const typeClass = TYPE_CLASSES[action.unitType] || '';
  const typeLabel = TYPE_LABELS[action.unitType] || action.unitType;
  const themeName = action.parentTheme?.title || 'No Theme';
  const isRoutine = action.unitType === 'ACTION_ROUTINE';
  const isRoutineLinked = routineLink !== null;

  return (
    <div className="action-card">
      <div className="action-card-header">
        <div className={`action-type-badge ${typeClass}`}>
          {typeLabel}
        </div>
        <div className="theme-badge">{themeName}</div>
      </div>

      <div className="action-title">{action.title}</div>
      
      {action.description && (
        <div className="action-description">{action.description}</div>
      )}

      <div className="action-meta">
        {action.targetDate && (
          <div className="meta-item">
            📅 Due: {new Date(action.targetDate).toLocaleDateString()}
          </div>
        )}
        {isRoutine && (
          <div className="meta-item">
            {isRoutineLinked ? '✅ Linked to GCal' : '🔄 Recurring'}
          </div>
        )}
      </div>

      {/* Routine linking prompt */}
      {isRoutine && !isRoutineLinked && (
        <div className="routine-setup-prompt">
          <p>This routine isn't linked to Google Calendar yet.</p>
          <button className="setup-routine-btn" onClick={onSetupRoutine}>
            🔗 Link to Recurring Event
          </button>
        </div>
      )}

      {/* Routine linked info */}
      {isRoutine && isRoutineLinked && routineLink && (
        <div className="routine-linked-info">
          <div className="linked-event-details">
            <div className="linked-icon">🔗</div>
            <div className="linked-text">
              <div className="linked-title">{routineLink.eventSummary || 'Linked event'}</div>
              <div className="linked-meta">
                {routineLink.calendarName && routineLink.eventRecurrence
                  ? `${routineLink.calendarName} • ${routineLink.eventRecurrence}`
                  : routineLink.calendarName || routineLink.eventRecurrence || 'Google Calendar'}
              </div>
            </div>
            <div className="linked-actions">
              {routineLink.htmlLink && (
                <a 
                  href={routineLink.htmlLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="view-gcal-btn"
                  title="View in Google Calendar"
                >
                  ↗
                </a>
              )}
              <button className="unlink-btn" onClick={onUnlinkRoutine} title="Unlink from calendar">
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="planned-tasks">
        <div className="planned-tasks-title">
          Planned this week ({state.tasks.length})
        </div>
        {state.tasks.length === 0 ? (
          <div className="empty-planned">
            Click on calendar to add time blocks
          </div>
        ) : (
          state.tasks.map(task => (
            <div key={task.id} className="planned-task-item">
              <span className="time">
                {task.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
              <span className="day">
                {task.start.toLocaleDateString([], { weekday: 'short' })}
              </span>
              <button className="remove-btn" onClick={() => onRemoveTask(task.id)}>
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ActionPlanPanel;
