// Core type definitions for Kaizen OS

// Enums matching database types (v4 schema)
export type TaskStatus = 'in_progress' | 'not_started' | 'completed' | 'backlog';
export type UnitType = 'THEME' | 'ACTION_GATE' | 'ACTION_EXPERIMENT' | 'ACTION_ROUTINE' | 'ACTION_OPS' | 'TASK' | 'VETO';
export type EventType =
  | 'gate_started'
  | 'gate_completed'
  | 'gate_failed'
  | 'experiment_started'
  | 'experiment_completed'
  | 'experiment_failed'
  | 'experiment_pivoted'
  | 'criteria_graded'
  | 'routine_started'
  | 'routine_replaced'
  | 'ops_started'
  | 'ops_completed'
  | 'veto_added'
  | 'veto_violated'
  | 'time_logged'
  | 'week_planned'
  | 'season_started'
  | 'season_ended';

// Core entity interfaces
export interface Card {
  id: number;
  userId: number;
  parentId: number | null;
  title: string;
  description: string | null;
  targetDate: Date | null;
  completionDate: Date | null;
  startDate: Date | null;
  status: TaskStatus;
  unitType: UnitType;
  seasonId: number | null;
  lagWeeks: number | null;
  criteria: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Type guards for Card types
export const isTheme = (card: Card): boolean => card.unitType === 'THEME';
export const isGate = (card: Card): boolean => card.unitType === 'ACTION_GATE';
export const isExperiment = (card: Card): boolean => card.unitType === 'ACTION_EXPERIMENT';
export const isRoutine = (card: Card): boolean => card.unitType === 'ACTION_ROUTINE';
export const isOps = (card: Card): boolean => card.unitType === 'ACTION_OPS';
export const isTask = (card: Card): boolean => card.unitType === 'TASK';
export const isVeto = (card: Card): boolean => card.unitType === 'VETO';
export const isAction = (card: Card): boolean => card.unitType.startsWith('ACTION_');

export interface Season {
  id: number;
  userId: number;
  name: string;
  startDate: Date;
  durationWeeks: number;
  endDate: Date;
  utilityRate: number;
  totalHours: number;
  themeAllocations: Record<string, number>; // { [themeId]: allocation (0-1) }
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Event {
  id: number;
  userId: number;
  eventType: EventType;
  entryId: number | null;
  payload: Record<string, unknown>;
  occurredAt: Date;
  idempotencyKey: string | null;
}

// Input DTOs
export interface CreateCardInput {
  userId: number;
  parentId?: number;
  title: string;
  description?: string;
  targetDate?: Date;
  startDate?: Date;
  status?: TaskStatus;
  unitType: UnitType;
  seasonId?: number;
  lagWeeks?: number;
  criteria?: string[];
}

export interface UpdateCardInput {
  title?: string;
  description?: string;
  targetDate?: Date;
  completionDate?: Date;
  startDate?: Date;
  status?: TaskStatus;
  seasonId?: number;
  lagWeeks?: number;
  criteria?: string[];
}

export interface CreateSeasonInput {
  userId: number;
  name: string;
  startDate: Date;
  durationWeeks: number;
  utilityRate?: number;
}

export interface LogEventInput {
  userId: number;
  eventType: EventType;
  cardId?: number;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

// Legacy alias
export interface LogEventInputLegacy {
  userId: number;
  eventType: EventType;
  entryId?: number;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

// API Response types
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

// Helper type for unit type labels
export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  THEME: 'Theme',
  ACTION_GATE: 'Gate',
  ACTION_EXPERIMENT: 'Experiment',
  ACTION_ROUTINE: 'Routine',
  ACTION_OPS: 'Ops',
  TASK: 'Task',
  VETO: 'Veto',
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  backlog: 'Backlog',
};

// WIP Status interface for theme view (used by ActionRow component)
export interface WipTypeStatus {
  active: number;
  max: number;
  canAdd: boolean;
}

// All UnitType values for iteration/testing
export const ALL_UNIT_TYPES: UnitType[] = [
  'THEME',
  'ACTION_GATE',
  'ACTION_EXPERIMENT',
  'ACTION_ROUTINE',
  'ACTION_OPS',
  'TASK',
  'VETO',
];

// Action types subset
export const ACTION_UNIT_TYPES: UnitType[] = [
  'ACTION_GATE',
  'ACTION_EXPERIMENT',
  'ACTION_ROUTINE',
  'ACTION_OPS',
];
