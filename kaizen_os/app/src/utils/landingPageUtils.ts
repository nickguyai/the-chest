/**
 * Pure utility functions for Landing Page
 * Extracted for testability
 */
import type { Card } from '../lib/api';

// Local isAction that works with API Card type
const isAction = (card: Card): boolean => card.unitType.startsWith('ACTION_');

export const ACTION_TYPES = ['ACTION_GATE', 'ACTION_EXPERIMENT', 'ACTION_ROUTINE', 'ACTION_OPS'] as const;
export type ActionType = typeof ACTION_TYPES[number];

export const TYPE_LABELS: Record<ActionType, string> = {
  ACTION_GATE: 'Gates',
  ACTION_EXPERIMENT: 'Experiments',
  ACTION_ROUTINE: 'Routines',
  ACTION_OPS: 'Ops',
};

export interface ActionCounts {
  ACTION_GATE: number;
  ACTION_EXPERIMENT: number;
  ACTION_ROUTINE: number;
  ACTION_OPS: number;
}

/**
 * Counts active actions by type.
 * Only counts in_progress and not_started as "active".
 */
export function countActionsByType(actions: Card[]): ActionCounts {
  const counts: ActionCounts = {
    ACTION_GATE: 0,
    ACTION_EXPERIMENT: 0,
    ACTION_ROUTINE: 0,
    ACTION_OPS: 0,
  };
  
  for (const action of actions) {
    if (isAction(action) && (action.status === 'in_progress' || action.status === 'not_started')) {
      const type = action.unitType as ActionType;
      if (type in counts) {
        counts[type]++;
      }
    }
  }
  
  return counts;
}

/**
 * Filters to only active actions (in_progress or not_started).
 */
export function filterActiveActions(actions: Card[]): Card[] {
  return actions.filter(a => 
    isAction(a) && (a.status === 'in_progress' || a.status === 'not_started')
  );
}

/**
 * Gets total active count across all types.
 */
export function getTotalActiveCount(counts: ActionCounts): number {
  return counts.ACTION_GATE + counts.ACTION_EXPERIMENT + counts.ACTION_ROUTINE + counts.ACTION_OPS;
}
