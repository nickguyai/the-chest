import { PrismaClient } from '@prisma/client';
import { Veto, EntityId } from '../../domain/entities';
import { VetoRepository, CreateVetoInput, UpdateVetoInput } from '../../domain/repositories';
import { toVeto } from './mappers';

export class PrismaVetoRepository implements VetoRepository {
  constructor(private prisma: PrismaClient) {}

  async findAll(userId: EntityId): Promise<Veto[]> {
    const cards = await this.prisma.card.findMany({
      where: { userId, unitType: 'VETO', parentId: null },
      orderBy: { createdAt: 'asc' },
    });
    return cards.map(toVeto);
  }

  async findById(userId: EntityId, id: EntityId): Promise<Veto | null> {
    const card = await this.prisma.card.findFirst({
      where: { id, userId, unitType: 'VETO' },
    });
    return card ? toVeto(card) : null;
  }

  async create(userId: EntityId, input: CreateVetoInput): Promise<Veto> {
    if (!input.title?.trim()) {
      throw new Error('Title is required');
    }
    const card = await this.prisma.card.create({
      data: {
        userId,
        title: input.title.trim(),
        description: input.description,
        unitType: 'VETO',
        status: 'not_started',
      },
    });
    return toVeto(card);
  }

  async update(userId: EntityId, id: EntityId, input: UpdateVetoInput): Promise<Veto> {
    const existing = await this.findById(userId, id);
    if (!existing) {
      throw new Error('Veto not found');
    }
    if (input.title !== undefined && !input.title?.trim()) {
      throw new Error('Title cannot be empty');
    }
    const card = await this.prisma.card.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title.trim() }),
        ...(input.description !== undefined && { description: input.description }),
      },
    });
    return toVeto(card);
  }

  async delete(userId: EntityId, id: EntityId): Promise<void> {
    const existing = await this.findById(userId, id);
    if (!existing) {
      throw new Error('Veto not found');
    }
    await this.prisma.card.delete({ where: { id } });
  }
}
