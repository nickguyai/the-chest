/**
 * Service Catalog: Central access point for all repositories.
 * Provides singleton instances backed by Prisma.
 */
import { PrismaClient } from '@prisma/client';
import {
  ThemeRepository,
  ActionRepository,
  TaskRepository,
  VetoRepository,
} from '../domain/repositories';
import {
  PrismaThemeRepository,
  PrismaActionRepository,
  PrismaTaskRepository,
  PrismaVetoRepository,
} from '../repositories/prisma';

// Singleton Prisma client
const prisma = new PrismaClient();

// Singleton repository instances
let _themes: ThemeRepository | null = null;
let _actions: ActionRepository | null = null;
let _tasks: TaskRepository | null = null;
let _vetoes: VetoRepository | null = null;

export const catalog = {
  get themes(): ThemeRepository {
    if (!_themes) _themes = new PrismaThemeRepository(prisma);
    return _themes;
  },

  get actions(): ActionRepository {
    if (!_actions) _actions = new PrismaActionRepository(prisma);
    return _actions;
  },

  get tasks(): TaskRepository {
    if (!_tasks) _tasks = new PrismaTaskRepository(prisma);
    return _tasks;
  },

  get vetoes(): VetoRepository {
    if (!_vetoes) _vetoes = new PrismaVetoRepository(prisma);
    return _vetoes;
  },

  /** Access to raw Prisma client for complex queries or migrations */
  get prisma(): PrismaClient {
    return prisma;
  },
};
