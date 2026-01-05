import { PrismaClient } from '@prisma/client';
import { CalendarAccount, EntityId, CalendarProvider } from '../../domain/entities';
import {
  CalendarAccountRepository,
  CreateCalendarAccountInput,
  UpdateCalendarAccountInput,
} from '../../domain/repositories';

function toCalendarAccount(record: any): CalendarAccount {
  return {
    id: record.id,
    userId: record.userId,
    provider: record.provider as CalendarProvider,
    email: record.email,
    accessTokenEncrypted: record.accessTokenEncrypted,
    refreshTokenEncrypted: record.refreshTokenEncrypted,
    expiresAt: record.expiresAt,
    scopes: record.scopes as string[],
    selectedCalendarIds: record.selectedCalendarIds as string[],
    writeCalendarId: record.writeCalendarId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class PrismaCalendarAccountRepository implements CalendarAccountRepository {
  constructor(private prisma: PrismaClient) {}

  async findAll(userId: EntityId): Promise<CalendarAccount[]> {
    const records = await this.prisma.calendarAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(toCalendarAccount);
  }

  async findById(userId: EntityId, id: string): Promise<CalendarAccount | null> {
    const record = await this.prisma.calendarAccount.findFirst({
      where: { id, userId },
    });
    return record ? toCalendarAccount(record) : null;
  }

  async findByProviderEmail(
    userId: EntityId,
    provider: CalendarProvider,
    email: string
  ): Promise<CalendarAccount | null> {
    const record = await this.prisma.calendarAccount.findFirst({
      where: { userId, provider, email },
    });
    return record ? toCalendarAccount(record) : null;
  }

  async create(userId: EntityId, input: CreateCalendarAccountInput): Promise<CalendarAccount> {
    const record = await this.prisma.calendarAccount.create({
      data: {
        userId,
        provider: input.provider,
        email: input.email,
        accessTokenEncrypted: input.accessTokenEncrypted,
        refreshTokenEncrypted: input.refreshTokenEncrypted,
        expiresAt: input.expiresAt,
        scopes: input.scopes,
        selectedCalendarIds: input.selectedCalendarIds ?? ['primary'],
        writeCalendarId: input.writeCalendarId ?? 'primary',
      },
    });
    return toCalendarAccount(record);
  }


  async update(
    userId: EntityId,
    id: string,
    input: UpdateCalendarAccountInput
  ): Promise<CalendarAccount> {
    const existing = await this.findById(userId, id);
    if (!existing) {
      throw new Error('Calendar account not found');
    }
    const record = await this.prisma.calendarAccount.update({
      where: { id },
      data: {
        ...(input.accessTokenEncrypted !== undefined && {
          accessTokenEncrypted: input.accessTokenEncrypted,
        }),
        ...(input.refreshTokenEncrypted !== undefined && {
          refreshTokenEncrypted: input.refreshTokenEncrypted,
        }),
        ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
        ...(input.scopes !== undefined && { scopes: input.scopes }),
        ...(input.selectedCalendarIds !== undefined && {
          selectedCalendarIds: input.selectedCalendarIds,
        }),
        ...(input.writeCalendarId !== undefined && {
          writeCalendarId: input.writeCalendarId,
        }),
      },
    });
    return toCalendarAccount(record);
  }

  async delete(userId: EntityId, id: string): Promise<void> {
    const existing = await this.findById(userId, id);
    if (!existing) {
      throw new Error('Calendar account not found');
    }
    await this.prisma.calendarAccount.delete({ where: { id } });
  }
}
