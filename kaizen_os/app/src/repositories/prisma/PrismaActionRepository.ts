import { PrismaClient } from '@prisma/client';
import { Action, ActionWithChildren, EntityId, Theme, Task, Status } from '../../domain/entities';
import { ActionRepository, CreateActionInput, UpdateActionInput } from '../../domain/repositories';
import { toAction, toTask, toTheme, actionTypeToUnitType, ACTION_UNIT_TYPES } from './mappers';

export class PrismaActionRepository implements ActionRepository {
  constructor(private prisma: PrismaClient) {}

  async findAll(userId: EntityId): Promise<Action[]> {
    const cards = await this.prisma.card.findMany({
      where: {
        userId,
        unitType: { in: ACTION_UNIT_TYPES },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return cards.map(toAction);
  }

  async findByParent(userId: EntityId, parentId: EntityId): Promise<Action[]> {
    const cards = await this.prisma.card.findMany({
      where: {
        userId,
        parentId,
        unitType: { in: ACTION_UNIT_TYPES },
      },
      orderBy: { createdAt: 'asc' },
    });
    return cards.map(toAction);
  }

  async findByParentAndType<T extends Action['actionType']>(
    userId: EntityId,
    parentId: EntityId,
    actionType: T
  ): Promise<Extract<Action, { actionType: T }>[]> {
    const unitType = actionTypeToUnitType(actionType);
    const cards = await this.prisma.card.findMany({
      where: { userId, parentId, unitType },
      orderBy: { createdAt: 'asc' },
    });
    return cards.map(toAction) as Extract<Action, { actionType: T }>[];
  }

  async findActive(userId: EntityId): Promise<Action[]> {
    const cards = await this.prisma.card.findMany({
      where: {
        userId,
        unitType: { in: ACTION_UNIT_TYPES },
        status: 'in_progress',
      },
      orderBy: { updatedAt: 'desc' },
    });
    return cards.map(toAction);
  }

  async findBacklog(userId: EntityId, parentId: EntityId): Promise<Action[]> {
    const cards = await this.prisma.card.findMany({
      where: {
        userId,
        parentId,
        unitType: { in: ACTION_UNIT_TYPES },
        status: 'backlog',
      },
      orderBy: { createdAt: 'asc' },
    });
    return cards.map(toAction);
  }

  async findById(userId: EntityId, id: EntityId): Promise<Action | null> {
    const card = await this.prisma.card.findFirst({
      where: {
        id,
        userId,
        unitType: { in: ACTION_UNIT_TYPES },
      },
    });
    return card ? toAction(card) : null;
  }

  async findByIdWithChildren(userId: EntityId, id: EntityId): Promise<ActionWithChildren | null> {
    const card = await this.prisma.card.findFirst({
      where: {
        id,
        userId,
        unitType: { in: ACTION_UNIT_TYPES },
      },
      include: {
        children: {
          where: { unitType: 'TASK' },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!card) return null;
    return {
      action: toAction(card),
      children: card.children.map(toTask),
    };
  }

  async create(userId: EntityId, input: CreateActionInput): Promise<Action> {
    if (!input.title?.trim()) {
      throw new Error('Title is required');
    }

    const unitType = actionTypeToUnitType(input.actionType);

    const card = await this.prisma.card.create({
      data: {
        userId,
        parentId: input.parentId,
        title: input.title.trim(),
        description: input.description,
        unitType,
        status: input.status || 'not_started',
        startDate: input.startDate,
        seasonId: input.seasonId,
        targetDate: 'targetDate' in input ? input.targetDate : undefined,
        lagWeeks: input.actionType === 'experiment' ? input.lagWeeks : undefined,
        criteria: 'criteria' in input ? input.criteria : [],
      },
    });
    return toAction(card);
  }

  async update(userId: EntityId, id: EntityId, input: UpdateActionInput): Promise<Action> {
    const existing = await this.findById(userId, id);
    if (!existing) {
      throw new Error('Action not found');
    }
    if (input.title !== undefined && !input.title?.trim()) {
      throw new Error('Title cannot be empty');
    }

    const card = await this.prisma.card.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title.trim() }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.startDate !== undefined && { startDate: input.startDate }),
        ...(input.targetDate !== undefined && { targetDate: input.targetDate }),
        ...(input.completionDate !== undefined && { completionDate: input.completionDate }),
        ...(input.seasonId !== undefined && { seasonId: input.seasonId }),
        ...(input.lagWeeks !== undefined && { lagWeeks: input.lagWeeks }),
        ...(input.criteria !== undefined && { criteria: input.criteria }),
      },
    });
    return toAction(card);
  }

  async delete(userId: EntityId, id: EntityId): Promise<void> {
    const existing = await this.findById(userId, id);
    if (!existing) {
      throw new Error('Action not found');
    }
    const children = await this.prisma.card.count({
      where: { parentId: id, userId },
    });
    if (children > 0) {
      throw new Error('Cannot delete action with children');
    }
    await this.prisma.card.delete({ where: { id } });
  }

  async getHierarchy(userId: EntityId, id: EntityId): Promise<(Theme | Action)[]> {
    const action = await this.findById(userId, id);
    if (!action) return [];

    const path: (Theme | Action)[] = [action];
    
    // Get parent theme
    if (action.parentId) {
      const parent = await this.prisma.card.findFirst({
        where: { id: action.parentId, userId, unitType: 'THEME' },
      });
      if (parent) {
        path.unshift(toTheme(parent));
      }
    }
    
    return path;
  }

  async findChildrenByStatus(userId: EntityId, actionId: EntityId, status: Status): Promise<Task[]> {
    const cards = await this.prisma.card.findMany({
      where: { userId, parentId: actionId, unitType: 'TASK', status },
      orderBy: { createdAt: 'asc' },
    });
    return cards.map(toTask);
  }
}
