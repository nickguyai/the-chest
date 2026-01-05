import { prisma } from '../../lib/db';
import type { Prisma } from '@prisma/client';

export interface ActionPlanState {
  status: 'pending' | 'completed' | 'skipped';
  tasks: PlannedTask[];
}

export interface PlannedTask {
  id: string;
  actionId: number;
  title: string;
  description?: string;
  start: string; // ISO string
  end: string; // ISO string
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
}

export interface PlanningSessionData {
  id: string;
  userId: number;
  weekStart: string;
  actionStates: Record<string, ActionPlanState>; // keyed by actionId
  gcalAssignments: Record<string, GcalAssignment>; // keyed by eventId
  status: 'in_progress' | 'committed';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get or create a planning session for a user and week.
 */
export async function getOrCreatePlanningSession(
  userId: number,
  weekStart: string
): Promise<PlanningSessionData> {
  const existing = await prisma.planningSession.findUnique({
    where: { userId_weekStart: { userId, weekStart } },
  });

  if (existing) {
    return {
      id: existing.id,
      userId: existing.userId,
      weekStart: existing.weekStart,
      actionStates: (existing.actionStates as Prisma.JsonObject || {}) as unknown as Record<string, ActionPlanState>,
      gcalAssignments: (existing.gcalAssignments as Prisma.JsonObject || {}) as unknown as Record<string, GcalAssignment>,
      status: existing.status,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    };
  }

  // Create new session
  const created = await prisma.planningSession.create({
    data: {
      userId,
      weekStart,
      actionStates: {},
      gcalAssignments: {},
      status: 'in_progress',
    },
  });

  return {
    id: created.id,
    userId: created.userId,
    weekStart: created.weekStart,
    actionStates: {},
    gcalAssignments: {},
    status: created.status,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
}

/**
 * Update a planning session's state.
 */
export async function updatePlanningSession(
  userId: number,
  weekStart: string,
  updates: {
    actionStates?: Record<string, ActionPlanState>;
    gcalAssignments?: Record<string, GcalAssignment>;
  }
): Promise<PlanningSessionData> {
  const updateData: Prisma.PlanningSessionUpdateInput = {};
  if (updates.actionStates !== undefined) {
    updateData.actionStates = updates.actionStates as unknown as Prisma.InputJsonValue;
  }
  if (updates.gcalAssignments !== undefined) {
    updateData.gcalAssignments = updates.gcalAssignments as unknown as Prisma.InputJsonValue;
  }

  const session = await prisma.planningSession.upsert({
    where: { userId_weekStart: { userId, weekStart } },
    update: updateData,
    create: {
      userId,
      weekStart,
      actionStates: (updates.actionStates || {}) as unknown as Prisma.InputJsonValue,
      gcalAssignments: (updates.gcalAssignments || {}) as unknown as Prisma.InputJsonValue,
      status: 'in_progress',
    },
  });

  return {
    id: session.id,
    userId: session.userId,
    weekStart: session.weekStart,
    actionStates: (session.actionStates as Prisma.JsonObject || {}) as unknown as Record<string, ActionPlanState>,
    gcalAssignments: (session.gcalAssignments as Prisma.JsonObject || {}) as unknown as Record<string, GcalAssignment>,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/**
 * Mark a planning session as committed.
 */
export async function commitPlanningSession(
  userId: number,
  weekStart: string
): Promise<PlanningSessionData> {
  const session = await prisma.planningSession.update({
    where: { userId_weekStart: { userId, weekStart } },
    data: { status: 'committed' },
  });

  return {
    id: session.id,
    userId: session.userId,
    weekStart: session.weekStart,
    actionStates: (session.actionStates as Prisma.JsonObject || {}) as unknown as Record<string, ActionPlanState>,
    gcalAssignments: (session.gcalAssignments as Prisma.JsonObject || {}) as unknown as Record<string, GcalAssignment>,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/**
 * Delete a planning session (e.g., to start fresh).
 */
export async function deletePlanningSession(
  userId: number,
  weekStart: string
): Promise<boolean> {
  try {
    await prisma.planningSession.delete({
      where: { userId_weekStart: { userId, weekStart } },
    });
    return true;
  } catch {
    return false;
  }
}
