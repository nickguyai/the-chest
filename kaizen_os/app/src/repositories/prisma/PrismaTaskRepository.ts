import { PrismaClient } from '@prisma/client';
import { Task, EntityId, Status, Theme, Action } from '../../domain/entities';
import { TaskRepository, CreateTaskInput, UpdateTaskInput } from '../../domain/repositories';
import { toTask, toTheme, toAction, ACTION_UNIT_TYPES } from './mappers';

export class PrismaTaskRepository implements TaskRepository {
  constructor(private prisma: PrismaClient) {}

  async findByAction(userId: EntityId, actionId: EntityId): Promise<Task[]> {
    const cards = await this.prisma.card.findMany({
      where: { userId, parentId: actionId, unitType: 'TASK' },
      orderBy: { createdAt: 'asc' },
    });
    return cards.map(toTask);
  }

  async findByActionAndStatus(
    userId: EntityId,
    actionId: EntityId,
    status: Status
  ): Promise<Task[]> {
    const cards = await this.prisma.card.findMany({
      where: { userId, parentId: actionId, unitType: 'TASK', status },
      orderBy: { createdAt: 'asc' },
    });
    return cards.map(toTask);
  }

  async findById(userId: EntityId, id: EntityId): Promise<Task | null> {
    const card = await this.prisma.card.findFirst({
      where: { id, userId, unitType: 'TASK' },
    });
    return card ? toTask(card) : null;
  }

  async create(userId: EntityId, input: CreateTaskInput): Promise<Task> {
    if (!input.title?.trim()) {
      throw new Error('Title is required');
    }
    const card = await this.prisma.card.create({
      data: {
        userId,
        parentId: input.actionId,
        title: input.title.trim(),
        description: input.description,
        unitType: 'TASK',
        status: input.status || 'not_started',
        targetDate: input.targetDate,
      },
    });
    return toTask(card);
  }

  async update(userId: EntityId, id: EntityId, input: UpdateTaskInput): Promise<Task> {
    const existing = await this.findById(userId, id);
    if (!existing) {
      throw new Error('Task not found');
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
        ...(input.targetDate !== undefined && { targetDate: input.targetDate }),
        ...(input.completionDate !== undefined && { completionDate: input.completionDate }),
      },
    });
    return toTask(card);
  }

  async delete(userId: EntityId, id: EntityId): Promise<void> {
    const existing = await this.findById(userId, id);
    if (!existing) {
      throw new Error('Task not found');
    }
    await this.prisma.card.delete({ where: { id } });
  }

  async getHierarchy(userId: EntityId, id: EntityId): Promise<(Theme | Action | Task)[]> {
    const task = await this.findById(userId, id);
    if (!task) return [];

    const path: (Theme | Action | Task)[] = [task];
    
    // Get parent action
    if (task.actionId) {
      const actionCard = await this.prisma.card.findFirst({
        where: { id: task.actionId, userId, unitType: { in: ACTION_UNIT_TYPES } },
      });
      if (actionCard) {
        const action = toAction(actionCard);
        path.unshift(action);
        
        // Get grandparent theme
        if (action.parentId) {
          const themeCard = await this.prisma.card.findFirst({
            where: { id: action.parentId, userId, unitType: 'THEME' },
          });
          if (themeCard) {
            path.unshift(toTheme(themeCard));
          }
        }
      }
    }
    
    return path;
  }
}
