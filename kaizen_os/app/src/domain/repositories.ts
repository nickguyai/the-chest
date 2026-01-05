import {
  EntityId,
  Theme,
  ThemeWithStats,
  ThemeWithChildren,
  Goal,
  Action,
  ActionWithChildren,
  Task,
  Veto,
  Status,
} from './entities';

// =============================================================================
// INPUT TYPES
// =============================================================================

/** Input for creating a new Theme */
export interface CreateThemeInput {
  title: string;
  description?: string;
}

/** Input for updating a Theme */
export interface UpdateThemeInput {
  title?: string;
  description?: string | null;
}

/** Input for creating a new Goal */
export interface CreateGoalInput {
  themeId: EntityId;
  title: string;
  description?: string;
  targetDate?: Date;
  status?: Status;
}

/** Input for updating a Goal */
export interface UpdateGoalInput {
  title?: string;
  description?: string | null;
  targetDate?: Date | null;
  status?: Status;
}

/** Base input for creating Actions */
interface CreateActionInputBase {
  parentId: EntityId; // Theme ID
  title: string;
  description?: string;
  status?: Status;
  startDate?: Date;
  seasonId?: EntityId;
}

export interface CreateGateInput extends CreateActionInputBase {
  actionType: 'gate';
  targetDate?: Date;
  criteria?: string[];
}

export interface CreateExperimentInput extends CreateActionInputBase {
  actionType: 'experiment';
  targetDate?: Date;
  lagWeeks: number; // Required for experiments
  criteria?: string[];
}

export interface CreateRoutineInput extends CreateActionInputBase {
  actionType: 'routine';
}

export interface CreateOpsInput extends CreateActionInputBase {
  actionType: 'ops';
  targetDate?: Date;
}

export type CreateActionInput =
  | CreateGateInput
  | CreateExperimentInput
  | CreateRoutineInput
  | CreateOpsInput;

/** Input for updating an Action */
export interface UpdateActionInput {
  title?: string;
  description?: string | null;
  status?: Status;
  startDate?: Date | null;
  targetDate?: Date | null;
  completionDate?: Date | null;
  seasonId?: EntityId | null;
  lagWeeks?: number | null;
  criteria?: string[];
}

/** Input for creating a Task */
export interface CreateTaskInput {
  actionId: EntityId;
  title: string;
  description?: string;
  status?: Status;
  targetDate?: Date;
}

/** Input for updating a Task */
export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: Status;
  targetDate?: Date | null;
  completionDate?: Date | null;
}

/** Input for creating a Veto */
export interface CreateVetoInput {
  title: string;
  description?: string;
}

/** Input for updating a Veto */
export interface UpdateVetoInput {
  title?: string;
  description?: string | null;
}

// =============================================================================
// REPOSITORY INTERFACES
// =============================================================================

/**
 * ThemeRepository: Manages Theme entities.
 */
export interface ThemeRepository {
  /** Get all themes for a user */
  findAll(userId: EntityId): Promise<Theme[]>;

  /** Get all themes with computed stats (action counts, condition scores) */
  findAllWithStats(userId: EntityId): Promise<ThemeWithStats[]>;

  /** Get a single theme by ID */
  findById(userId: EntityId, id: EntityId): Promise<Theme | null>;

  /** Get a single theme with its children (actions) */
  findByIdWithChildren(userId: EntityId, id: EntityId): Promise<ThemeWithChildren | null>;

  /** Create a new theme */
  create(userId: EntityId, input: CreateThemeInput): Promise<Theme>;

  /** Update an existing theme */
  update(userId: EntityId, id: EntityId, input: UpdateThemeInput): Promise<Theme>;

  /** Delete a theme (fails if has children) */
  delete(userId: EntityId, id: EntityId): Promise<void>;

  /** Get hierarchy path from root to a theme */
  getHierarchy(userId: EntityId, id: EntityId): Promise<Theme[]>;
}

/**
 * GoalRepository: Manages Goal entities.
 * NOTE: Goals are a new domain concept. In V4, they map to cards with unitType='GOAL'.
 */
export interface GoalRepository {
  /** Get all goals under a theme */
  findByTheme(userId: EntityId, themeId: EntityId): Promise<Goal[]>;

  /** Get a single goal by ID */
  findById(userId: EntityId, id: EntityId): Promise<Goal | null>;

  /** Create a new goal */
  create(userId: EntityId, input: CreateGoalInput): Promise<Goal>;

  /** Update an existing goal */
  update(userId: EntityId, id: EntityId, input: UpdateGoalInput): Promise<Goal>;

  /** Delete a goal (fails if has children) */
  delete(userId: EntityId, id: EntityId): Promise<void>;
}

/**
 * ActionRepository: Manages Action entities (Gate, Experiment, Routine, Ops).
 */
export interface ActionRepository {
  /** Get all actions for a user (all statuses) */
  findAll(userId: EntityId): Promise<Action[]>;

  /** Get all actions under a parent (Theme or Goal) */
  findByParent(userId: EntityId, parentId: EntityId): Promise<Action[]>;

  /** Get all actions of a specific type under a parent */
  findByParentAndType<T extends Action['actionType']>(
    userId: EntityId,
    parentId: EntityId,
    actionType: T
  ): Promise<Extract<Action, { actionType: T }>[]>;

  /** Get all active (in_progress) actions for a user */
  findActive(userId: EntityId): Promise<Action[]>;

  /** Get backlog actions for a parent */
  findBacklog(userId: EntityId, parentId: EntityId): Promise<Action[]>;

  /** Get a single action by ID */
  findById(userId: EntityId, id: EntityId): Promise<Action | null>;

  /** Get a single action with its children (tasks) */
  findByIdWithChildren(userId: EntityId, id: EntityId): Promise<ActionWithChildren | null>;

  /** Create a new action */
  create(userId: EntityId, input: CreateActionInput): Promise<Action>;

  /** Update an existing action */
  update(userId: EntityId, id: EntityId, input: UpdateActionInput): Promise<Action>;

  /** Delete an action (fails if has children) */
  delete(userId: EntityId, id: EntityId): Promise<void>;

  /** Get hierarchy path from root to an action */
  getHierarchy(userId: EntityId, id: EntityId): Promise<(Theme | Action)[]>;

  /** Get children filtered by status */
  findChildrenByStatus(userId: EntityId, actionId: EntityId, status: Status): Promise<Task[]>;
}

/**
 * TaskRepository: Manages Task entities.
 */
export interface TaskRepository {
  /** Get all tasks under an action */
  findByAction(userId: EntityId, actionId: EntityId): Promise<Task[]>;

  /** Get tasks by status under an action */
  findByActionAndStatus(
    userId: EntityId,
    actionId: EntityId,
    status: Status
  ): Promise<Task[]>;

  /** Get a single task by ID */
  findById(userId: EntityId, id: EntityId): Promise<Task | null>;

  /** Create a new task */
  create(userId: EntityId, input: CreateTaskInput): Promise<Task>;

  /** Update an existing task */
  update(userId: EntityId, id: EntityId, input: UpdateTaskInput): Promise<Task>;

  /** Delete a task */
  delete(userId: EntityId, id: EntityId): Promise<void>;

  /** Get hierarchy path from root to a task */
  getHierarchy(userId: EntityId, id: EntityId): Promise<(Theme | Action | Task)[]>;
}

/**
 * VetoRepository: Manages Veto entities (global guardrails).
 */
export interface VetoRepository {
  /** Get all vetoes for a user */
  findAll(userId: EntityId): Promise<Veto[]>;

  /** Get a single veto by ID */
  findById(userId: EntityId, id: EntityId): Promise<Veto | null>;

  /** Create a new veto */
  create(userId: EntityId, input: CreateVetoInput): Promise<Veto>;

  /** Update an existing veto */
  update(userId: EntityId, id: EntityId, input: UpdateVetoInput): Promise<Veto>;

  /** Delete a veto */
  delete(userId: EntityId, id: EntityId): Promise<void>;
}

// =============================================================================
// UNIT OF WORK (Optional - for transaction support)
// =============================================================================

/**
 * UnitOfWork: Provides transactional access to all repositories.
 * Use when operations need to span multiple repositories atomically.
 */
export interface UnitOfWork {
  readonly themes: ThemeRepository;
  readonly goals: GoalRepository;
  readonly actions: ActionRepository;
  readonly tasks: TaskRepository;
  readonly vetoes: VetoRepository;

  /** Execute a function within a transaction */
  transaction<T>(fn: (uow: UnitOfWork) => Promise<T>): Promise<T>;
}


// =============================================================================
// CALENDAR INTEGRATION REPOSITORIES (Phase 1)
// =============================================================================

import {
  CalendarAccount,
  CalendarEventAnnotation,
  EventClassificationRule,
  RoutineCalendarLink,
  CalendarProvider,
  ClassificationSource,
  RuleMatchType,
} from './entities';

/** Input for creating a calendar account */
export interface CreateCalendarAccountInput {
  provider: CalendarProvider;
  email: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  expiresAt: Date;
  scopes: string[];
  selectedCalendarIds?: string[];
  writeCalendarId?: string;
}

/** Input for updating a calendar account */
export interface UpdateCalendarAccountInput {
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
  expiresAt?: Date;
  scopes?: string[];
  selectedCalendarIds?: string[];
  writeCalendarId?: string | null;
}

/**
 * CalendarAccountRepository: Manages OAuth connections to calendar providers.
 */
export interface CalendarAccountRepository {
  findAll(userId: EntityId): Promise<CalendarAccount[]>;
  findById(userId: EntityId, id: string): Promise<CalendarAccount | null>;
  findByProviderEmail(userId: EntityId, provider: CalendarProvider, email: string): Promise<CalendarAccount | null>;
  create(userId: EntityId, input: CreateCalendarAccountInput): Promise<CalendarAccount>;
  update(userId: EntityId, id: string, input: UpdateCalendarAccountInput): Promise<CalendarAccount>;
  delete(userId: EntityId, id: string): Promise<void>;
}

/** Input for creating an event annotation */
export interface CreateEventAnnotationInput {
  accountId: string;
  calendarId: string;
  eventId: string;
  instanceKey: string;
  cardId?: EntityId;
  source?: ClassificationSource;
  confidence?: number;
}

/** Input for updating an event annotation */
export interface UpdateEventAnnotationInput {
  cardId?: EntityId | null;
  source?: ClassificationSource;
  confidence?: number;
}

/**
 * CalendarEventAnnotationRepository: Manages event→card links.
 */
export interface CalendarEventAnnotationRepository {
  findByUser(userId: EntityId): Promise<CalendarEventAnnotation[]>;
  findByAccount(userId: EntityId, accountId: string): Promise<CalendarEventAnnotation[]>;
  findByEvent(userId: EntityId, accountId: string, calendarId: string, eventId: string): Promise<CalendarEventAnnotation[]>;
  findByEventInstance(userId: EntityId, accountId: string, calendarId: string, eventId: string, instanceKey: string): Promise<CalendarEventAnnotation | null>;
  findByCard(userId: EntityId, cardId: EntityId): Promise<CalendarEventAnnotation[]>;
  create(userId: EntityId, input: CreateEventAnnotationInput): Promise<CalendarEventAnnotation>;
  upsert(userId: EntityId, input: CreateEventAnnotationInput): Promise<CalendarEventAnnotation>;
  update(userId: EntityId, id: string, input: UpdateEventAnnotationInput): Promise<CalendarEventAnnotation>;
  delete(userId: EntityId, id: string): Promise<void>;
}

/** Input for creating a classification rule */
export interface CreateClassificationRuleInput {
  matchType: RuleMatchType;
  matchValue: string;
  cardId: EntityId;
  priority?: number;
}

/** Input for updating a classification rule */
export interface UpdateClassificationRuleInput {
  matchValue?: string;
  cardId?: EntityId;
  priority?: number;
  isActive?: boolean;
}

/**
 * EventClassificationRuleRepository: Manages auto-classification rules.
 */
export interface EventClassificationRuleRepository {
  findAll(userId: EntityId): Promise<EventClassificationRule[]>;
  findActive(userId: EntityId): Promise<EventClassificationRule[]>;
  findById(userId: EntityId, id: string): Promise<EventClassificationRule | null>;
  findByCard(userId: EntityId, cardId: EntityId): Promise<EventClassificationRule[]>;
  create(userId: EntityId, input: CreateClassificationRuleInput): Promise<EventClassificationRule>;
  update(userId: EntityId, id: string, input: UpdateClassificationRuleInput): Promise<EventClassificationRule>;
  delete(userId: EntityId, id: string): Promise<void>;
}

/** Input for creating a routine calendar link */
export interface CreateRoutineLinkInput {
  cardId: EntityId;
  accountId: string;
  calendarId: string;
  recurringEventId: string;
  iCalUid?: string;
}

/**
 * RoutineCalendarLinkRepository: Manages routine→recurring event links.
 */
export interface RoutineCalendarLinkRepository {
  findAll(userId: EntityId): Promise<RoutineCalendarLink[]>;
  findByCard(userId: EntityId, cardId: EntityId): Promise<RoutineCalendarLink | null>;
  findByRecurringEvent(userId: EntityId, recurringEventId: string): Promise<RoutineCalendarLink | null>;
  create(userId: EntityId, input: CreateRoutineLinkInput): Promise<RoutineCalendarLink>;
  delete(userId: EntityId, cardId: EntityId): Promise<void>;
  deleteByRecurringEvent(userId: EntityId, accountId: string, recurringEventId: string): Promise<void>;
}
