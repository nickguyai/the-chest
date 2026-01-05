import { PrismaClient } from '@prisma/client';
import { RoutineCalendarLink, EntityId } from '../../domain/entities';
import {
  RoutineCalendarLinkRepository,
  CreateRoutineLinkInput,
} from '../../domain/repositories';

function toRoutineLink(record: any): RoutineCalendarLink {
  return {
    id: record.id,
    userId: record.userId,
    cardId: record.cardId,
    accountId: record.accountId,
    calendarId: record.calendarId,
    recurringEventId: record.recurringEventId,
    iCalUid: record.iCalUid,
    createdAt: record.createdAt,
  };
}

export class PrismaRoutineLinkRepository implements RoutineCalendarLinkRepository {
  constructor(private prisma: PrismaClient) {}

  async findAll(userId: EntityId): Promise<RoutineCalendarLink[]> {
    const records = await this.prisma.routineCalendarLink.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(toRoutineLink);
  }

  async findByCard(userId: EntityId, cardId: EntityId): Promise<RoutineCalendarLink | null> {
    const record = await this.prisma.routineCalendarLink.findFirst({
      where: { userId, cardId },
    });
    return record ? toRoutineLink(record) : null;
  }

  async findByRecurringEvent(
    userId: EntityId,
    recurringEventId: string
  ): Promise<RoutineCalendarLink | null> {
    const record = await this.prisma.routineCalendarLink.findFirst({
      where: { userId, recurringEventId },
    });
    return record ? toRoutineLink(record) : null;
  }

  async create(userId: EntityId, input: CreateRoutineLinkInput): Promise<RoutineCalendarLink> {
    const record = await this.prisma.routineCalendarLink.create({
      data: {
        userId,
        cardId: input.cardId,
        accountId: input.accountId,
        calendarId: input.calendarId,
        recurringEventId: input.recurringEventId,
        iCalUid: input.iCalUid,
      },
    });
    return toRoutineLink(record);
  }

  async delete(userId: EntityId, cardId: EntityId): Promise<void> {
    await this.prisma.routineCalendarLink.deleteMany({
      where: { userId, cardId },
    });
  }

  async deleteByRecurringEvent(
    userId: EntityId,
    accountId: string,
    recurringEventId: string
  ): Promise<void> {
    await this.prisma.routineCalendarLink.deleteMany({
      where: { userId, accountId, recurringEventId },
    });
  }
}
