import { PrismaClient } from '@prisma/client';
import { EventClassificationRule, EntityId, RuleMatchType } from '../../domain/entities';
import {
  EventClassificationRuleRepository,
  CreateClassificationRuleInput,
  UpdateClassificationRuleInput,
} from '../../domain/repositories';

function toRule(record: any): EventClassificationRule {
  return {
    id: record.id,
    userId: record.userId,
    matchType: record.matchType as RuleMatchType,
    matchValue: record.matchValue,
    cardId: record.cardId,
    priority: record.priority,
    isActive: record.isActive,
    createdAt: record.createdAt,
  };
}

export class PrismaClassificationRuleRepository implements EventClassificationRuleRepository {
  constructor(private prisma: PrismaClient) {}

  async findAll(userId: EntityId): Promise<EventClassificationRule[]> {
    const records = await this.prisma.eventClassificationRule.findMany({
      where: { userId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return records.map(toRule);
  }

  async findActive(userId: EntityId): Promise<EventClassificationRule[]> {
    const records = await this.prisma.eventClassificationRule.findMany({
      where: { userId, isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return records.map(toRule);
  }

  async findById(userId: EntityId, id: string): Promise<EventClassificationRule | null> {
    const record = await this.prisma.eventClassificationRule.findFirst({
      where: { id, userId },
    });
    return record ? toRule(record) : null;
  }

  async findByCard(userId: EntityId, cardId: EntityId): Promise<EventClassificationRule[]> {
    const records = await this.prisma.eventClassificationRule.findMany({
      where: { userId, cardId },
      orderBy: { priority: 'desc' },
    });
    return records.map(toRule);
  }


  async create(userId: EntityId, input: CreateClassificationRuleInput): Promise<EventClassificationRule> {
    const record = await this.prisma.eventClassificationRule.create({
      data: {
        userId,
        matchType: input.matchType,
        matchValue: input.matchValue,
        cardId: input.cardId,
        priority: input.priority ?? 0,
      },
    });
    return toRule(record);
  }

  async update(
    userId: EntityId,
    id: string,
    input: UpdateClassificationRuleInput
  ): Promise<EventClassificationRule> {
    const existing = await this.findById(userId, id);
    if (!existing) {
      throw new Error('Classification rule not found');
    }
    const record = await this.prisma.eventClassificationRule.update({
      where: { id },
      data: {
        ...(input.matchValue !== undefined && { matchValue: input.matchValue }),
        ...(input.cardId !== undefined && { cardId: input.cardId }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
    return toRule(record);
  }

  async delete(userId: EntityId, id: string): Promise<void> {
    const existing = await this.findById(userId, id);
    if (!existing) {
      throw new Error('Classification rule not found');
    }
    await this.prisma.eventClassificationRule.delete({ where: { id } });
  }
}
