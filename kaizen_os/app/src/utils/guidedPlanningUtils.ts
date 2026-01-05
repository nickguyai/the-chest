/**
 * Pure utility functions for Guided Planning
 * Extracted for testability
 */
import type { Card } from '../lib/api';

// Local isAction that works with API Card type
const isAction = (card: Card): boolean => card.unitType.startsWith('ACTION_');

export const ACTION_TYPES = ['ACTION_GATE', 'ACTION_EXPERIMENT', 'ACTION_ROUTINE', 'ACTION_OPS'] as const;
export type ActionType = typeof ACTION_TYPES[number];

export const TYPE_PRIORITY: Record<ActionType, number> = {
  ACTION_GATE: 1,
  ACTION_EXPERIMENT: 2,
  ACTION_ROUTINE: 3,
  ACTION_OPS: 4,
};

export const TYPE_LABELS_PLURAL: Record<ActionType, string> = {
  ACTION_GATE: 'Gates',
  ACTION_EXPERIMENT: 'Experiments',
  ACTION_ROUTINE: 'Routines',
  ACTION_OPS: 'Ops',
};

export interface ActionPlanState {
  status: 'pending' | 'completed' | 'skipped';
  tasks: Array<{ id: string }>;
}

export interface GcalAssignment {
  eventId: string;
  eventTitle: string;
  actionId: number;
  actionTitle: string;
}

export interface TypeProgress {
  type: ActionType;
  label: string;
  completed: number;
  total: number;
}

export interface ReassignmentResult {
  isReassignment: boolean;
  fromAction?: string;
  toActionId?: number;
}

/**
 * Groups actions by type. Produces exactly 4 groups.
 */
export function groupActionsByType(actions: Card[]): Map<ActionType, Card[]> {
  const groups = new Map<ActionType, Card[]>();
  for (const type of ACTION_TYPES) {
    groups.set(type, []);
  }
  for (const action of actions) {
    if (isAction(action)) {
      const group = groups.get(action.unitType as ActionType);
      if (group) group.push(action);
    }
  }
  return groups;
}

/**
 * Sorts actions by type priority: Gates → Experiments → Routines → Ops
 */
export function sortActionsByType(actions: Card[]): Card[] {
  return [...actions].sort((a, b) => 
    (TYPE_PRIORITY[a.unitType as ActionType] || 99) - (TYPE_PRIORITY[b.unitType as ActionType] || 99)
  );
}

/**
 * Calculates progress for a specific action type
 */
export function calculateTypeProgress(
  actions: Card[],
  actionStates: Map<number, ActionPlanState>,
  actionType: ActionType
): TypeProgress {
  const typeActions = actions.filter(a => a.unitType === actionType);
  const completed = typeActions.filter(a => {
    const state = actionStates.get(a.id);
    return state?.status === 'completed' || state?.status === 'skipped';
  }).length;
  
  return {
    type: actionType,
    label: TYPE_LABELS_PLURAL[actionType],
    completed,
    total: typeActions.length,
  };
}

/**
 * Formats progress: "Gates 2/3"
 */
export function formatTypeProgress(progress: TypeProgress): string {
  return `${progress.label} ${progress.completed}/${progress.total}`;
}

/**
 * Detects if clicking event would reassign it to different action
 */
export function detectReassignment(
  eventId: string,
  currentActionId: number,
  gcalAssignments: Map<string, GcalAssignment>
): ReassignmentResult {
  const existing = gcalAssignments.get(eventId);
  if (!existing) return { isReassignment: false };
  if (existing.actionId === currentActionId) return { isReassignment: false };
  return {
    isReassignment: true,
    fromAction: existing.actionTitle,
    toActionId: currentActionId,
  };
}

/**
 * Gets all tasks for a specific action type from actionStates
 */
export function getTasksForType<T extends { id: string }>(
  cards: Card[],
  actionStates: Map<number, { status: string; tasks: T[] }>,
  actionType: ActionType
): T[] {
  return cards
    .filter(c => c.unitType === actionType)
    .flatMap(c => actionStates.get(c.id)?.tasks || []);
}
