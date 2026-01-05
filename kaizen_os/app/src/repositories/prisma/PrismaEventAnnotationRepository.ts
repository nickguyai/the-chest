import { PrismaClient } from '@prisma/client';
import { CalendarEventAnnotation, EntityId, ClassificationSource } from '../../domain/entities';
import {
  CalendarEventAnnotationRepository,
  CreateEventAnnotationInput,
  UpdateEventAnnotationInput,
} from '../../domain/repositories';

function toAnnotation(record: any): CalendarEventAnnotation {
  return {
    id: record.id,
    userId: record.userId,
    accountId: record.accountId,
    calendarId: record.calendarId,
    eventId: record.eventId,
    instanceKey: record.instanceKey,
    cardId: record.cardId,
    source: record.source as ClassificationSource,
    confidence: record.confidence,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class PrismaEventAnnotationRepository implements CalendarEventAnnotationRepository {
  constructor(private prisma: PrismaClient) {}

  async findByUser(userId: EntityId): Promise<CalendarEventAnnotation[]> {
    const records = await this.prisma.calendarEventAnnotation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(toAnnotation);
  }

  async findByAccount(userId: EntityId, accountId: string): Promise<CalendarEventAnnotation[]> {
    const records = await this.prisma.calendarEventAnnotation.findMany({
      where: { userId, accountId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(toAnnotation);
  }

  async findByEvent(
    userId: EntityId,
    accountId: string,
    calendarId: string,
    eventId: string
  ): Promise<CalendarEventAnnotation[]> {
    const records = await this.prisma.calendarEventAnnotation.findMany({
      where: { userId, accountId, calendarId, eventId },
    });
    return records.map(toAnnotation);
  }

  async findByEventInstance(
    userId: EntityId,
    accountId: string,
    calendarId: string,
    eventId: string,
    instanceKey: string
  ): Promise<CalendarEventAnnotation | null> {
    const record = await this.prisma.calendarEventAnnotation.findFirst({
      where: { userId, accountId, calendarId, eventId, instanceKey },
    });
    return record ? toAnnotation(record) : null;
  }


  async findByCard(userId: EntityId, cardId: EntityId): Promise<CalendarEventAnnotation[]> {
    const records = await this.prisma.calendarEventAnnotation.findMany({
      where: { userId, cardId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(toAnnotation);
  }

  async create(userId: EntityId, input: CreateEventAnnotationInput): Promise<CalendarEventAnnotation> {
    const record = await this.prisma.calendarEventAnnotation.create({
      data: {
        userId,
        accountId: input.accountId,
        calendarId: input.calendarId,
        eventId: input.eventId,
        instanceKey: input.instanceKey,
        cardId: input.cardId,
        source: input.source ?? 'manual',
        confidence: input.confidence ?? 1.0,
      },
    });
    return toAnnotation(record);
  }

  async upsert(userId: EntityId, input: CreateEventAnnotationInput): Promise<CalendarEventAnnotation> {
    const record = await this.prisma.calendarEventAnnotation.upsert({
      where: {
        userId_accountId_calendarId_eventId_instanceKey: {
          userId,
          accountId: input.accountId,
          calendarId: input.calendarId,
          eventId: input.eventId,
          instanceKey: input.instanceKey,
        },
      },
      update: {
        cardId: input.cardId,
        source: input.source ?? 'manual',
        confidence: input.confidence ?? 1.0,
      },
      create: {
        userId,
        accountId: input.accountId,
        calendarId: input.calendarId,
        eventId: input.eventId,
        instanceKey: input.instanceKey,
        cardId: input.cardId,
        source: input.source ?? 'manual',
        confidence: input.confidence ?? 1.0,
      },
    });
    return toAnnotation(record);
  }

  async update(
    _userId: EntityId,
    id: string,
    input: UpdateEventAnnotationInput
  ): Promise<CalendarEventAnnotation> {
    const record = await this.prisma.calendarEventAnnotation.update({
      where: { id },
      data: {
        ...(input.cardId !== undefined && { cardId: input.cardId }),
        ...(input.source !== undefined && { source: input.source }),
        ...(input.confidence !== undefined && { confidence: input.confidence }),
      },
    });
    return toAnnotation(record);
  }

  async delete(_userId: EntityId, id: string): Promise<void> {
    await this.prisma.calendarEventAnnotation.delete({ where: { id } });
  }
}
