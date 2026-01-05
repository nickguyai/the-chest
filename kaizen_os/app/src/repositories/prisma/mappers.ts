/**
 * Mappers: Convert Prisma Card models to Domain entities
 */
import { Card as PrismaCard, UnitType } from '@prisma/client';
import {
  Theme,
  Goal,
  Action,
  GateAction,
  ExperimentAction,
  RoutineAction,
  OpsAction,
  Task,
  Veto,
} from '../../domain/entities';

// Default lag weeks for experiments if not set in DB
const DEFAULT_LAG_WEEKS = 6;

export function toTheme(card: PrismaCard): Theme {
  return {
    id: card.id,
    userId: card.userId,
    title: card.title,
    description: card.description,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

export function toGoal(card: PrismaCard): Goal {
  if (!card.parentId) {
    throw new Error(`Goal card ${card.id} must have a parentId (themeId)`);
  }
  return {
    id: card.id,
    userId: card.userId,
    themeId: card.parentId,
    title: card.title,
    description: card.description,
    targetDate: card.targetDate,
    status: card.status,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

export function toAction(card: PrismaCard): Action {
  if (!card.parentId) {
    throw new Error(`Action card ${card.id} must have a parentId`);
  }

  const base = {
    id: card.id,
    userId: card.userId,
    parentId: card.parentId,
    title: card.title,
    description: card.description,
    status: card.status,
    startDate: card.startDate,
    seasonId: card.seasonId,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };

  switch (card.unitType) {
    case 'ACTION_GATE':
      return {
        ...base,
        actionType: 'gate',
        targetDate: card.targetDate,
        completionDate: card.completionDate,
        criteria: card.criteria || [],
      } as GateAction;

    case 'ACTION_EXPERIMENT':
      return {
        ...base,
        actionType: 'experiment',
        targetDate: card.targetDate,
        completionDate: card.completionDate,
        lagWeeks: card.lagWeeks ?? DEFAULT_LAG_WEEKS,
        criteria: card.criteria || [],
      } as ExperimentAction;

    case 'ACTION_ROUTINE':
      return {
        ...base,
        actionType: 'routine',
      } as RoutineAction;

    case 'ACTION_OPS':
      return {
        ...base,
        actionType: 'ops',
        targetDate: card.targetDate,
        completionDate: card.completionDate,
      } as OpsAction;

    default:
      throw new Error(`Unknown action type: ${card.unitType}`);
  }
}

export function toTask(card: PrismaCard): Task {
  if (!card.parentId) {
    throw new Error(`Task card ${card.id} must have a parentId (actionId)`);
  }
  return {
    id: card.id,
    userId: card.userId,
    actionId: card.parentId,
    title: card.title,
    description: card.description,
    status: card.status,
    targetDate: card.targetDate,
    completionDate: card.completionDate,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

export function toVeto(card: PrismaCard): Veto {
  return {
    id: card.id,
    userId: card.userId,
    title: card.title,
    description: card.description,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

/** Map action type to DB unit type */
export function actionTypeToUnitType(actionType: Action['actionType']): UnitType {
  switch (actionType) {
    case 'gate': return 'ACTION_GATE';
    case 'experiment': return 'ACTION_EXPERIMENT';
    case 'routine': return 'ACTION_ROUTINE';
    case 'ops': return 'ACTION_OPS';
  }
}

/** Check if unit type is an action type */
export function isActionUnitType(unitType: UnitType): boolean {
  return ['ACTION_GATE', 'ACTION_EXPERIMENT', 'ACTION_ROUTINE', 'ACTION_OPS'].includes(unitType);
}

export const ACTION_UNIT_TYPES: UnitType[] = [
  'ACTION_GATE',
  'ACTION_EXPERIMENT',
  'ACTION_ROUTINE',
  'ACTION_OPS',
];
