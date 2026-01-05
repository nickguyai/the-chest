// =============================================================================
// COMMON TYPES
// =============================================================================

/** Unique identifier for domain entities */
export type EntityId = number;

/** Status applicable to all actionable items */
export type Status = 'not_started' | 'in_progress' | 'completed' | 'backlog';

/** Timestamps common to all entities */
export interface Timestamps {
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// =============================================================================
// THEME
// =============================================================================

/**
 * Theme: A high-level area of focus (e.g., "Health", "Career", "Side Projects").
 * Themes are top-level containers that hold Goals.
 */
export interface Theme extends Timestamps {
  readonly id: EntityId;
  readonly userId: EntityId;
  title: string;
  description: string | null;
}

/** Theme with computed aggregates for list views */
export interface ThemeWithStats extends Theme {
  /** Count of active (in_progress) actions under this theme */
  readonly activeActionCount: number;
  /** Condition score based on recent activity (0-100) */
  readonly conditionScore?: number;
}

/** Theme with children for detail view */
export interface ThemeWithChildren extends Theme {
  readonly children: Action[];
}

// =============================================================================
// GOAL (New Domain Concept)
// =============================================================================

/**
 * Goal: A specific objective within a Theme.
 * Goals contain Actions that work toward achieving the objective.
 *
 * NOTE: In V4 DB, Goals will be stored as `unitType = 'GOAL'` cards.
 * This requires adding 'GOAL' to the UnitType enum in schema.sql.
 */
export interface Goal extends Timestamps {
  readonly id: EntityId;
  readonly userId: EntityId;
  readonly themeId: EntityId;
  title: string;
  description: string | null;
  targetDate: Date | null;
  status: Status;
}

// =============================================================================
// ACTIONS (Discriminated Union)
// =============================================================================

/** Base properties shared by all Action types */
interface ActionBase extends Timestamps {
  readonly id: EntityId;
  readonly userId: EntityId;
  readonly parentId: EntityId; // Theme ID (or Goal ID in future)
  title: string;
  description: string | null;
  status: Status;
  startDate: Date | null;
  seasonId: EntityId | null;
}

/**
 * Gate: A binary pass/fail checkpoint.
 * Example: "Complete AWS certification exam"
 */
export interface GateAction extends ActionBase {
  readonly actionType: 'gate';
  targetDate: Date | null;
  completionDate: Date | null;
  /** Success criteria that must ALL pass for gate completion */
  criteria: string[];
}

/**
 * Experiment: A time-boxed hypothesis test with lag period for evaluation.
 * Example: "Try intermittent fasting for 6 weeks"
 */
export interface ExperimentAction extends ActionBase {
  readonly actionType: 'experiment';
  /** Evaluation date (when to assess results) */
  targetDate: Date | null;
  completionDate: Date | null;
  /** Weeks to wait before evaluating results (REQUIRED for experiments) */
  lagWeeks: number;
  /** Success criteria to evaluate after lag period */
  criteria: string[];
}

/**
 * Routine: An ongoing recurring activity with no end date.
 * Example: "Daily meditation practice"
 */
export interface RoutineAction extends ActionBase {
  readonly actionType: 'routine';
  // Routines don't have targetDate or completionDate - they're ongoing
}

/**
 * Ops: Operational/maintenance work that needs to get done.
 * Example: "File quarterly taxes"
 */
export interface OpsAction extends ActionBase {
  readonly actionType: 'ops';
  targetDate: Date | null;
  completionDate: Date | null;
}

/** Union type for all Action variants */
export type Action = GateAction | ExperimentAction | RoutineAction | OpsAction;

/** Action with children (tasks) for detail view */
export interface ActionWithChildren {
  action: Action;
  children: Task[];
}

/** Type guard helpers */
export const isGate = (a: Action): a is GateAction => a.actionType === 'gate';
export const isExperiment = (a: Action): a is ExperimentAction => a.actionType === 'experiment';
export const isRoutine = (a: Action): a is RoutineAction => a.actionType === 'routine';
export const isOps = (a: Action): a is OpsAction => a.actionType === 'ops';

// =============================================================================
// TASK
// =============================================================================

/**
 * Task: A concrete work item under an Action.
 * Example: "Read chapter 3 of study guide" (under a Gate)
 */
export interface Task extends Timestamps {
  readonly id: EntityId;
  readonly userId: EntityId;
  readonly actionId: EntityId;
  title: string;
  description: string | null;
  status: Status;
  targetDate: Date | null;
  completionDate: Date | null;
}

// =============================================================================
// VETO
// =============================================================================

/**
 * Veto: A "Don't Do" constraint (global guardrail).
 * Example: "No work emails after 8pm"
 */
export interface Veto extends Timestamps {
  readonly id: EntityId;
  readonly userId: EntityId;
  title: string;
  description: string | null;
}


// =============================================================================
// CALENDAR INTEGRATION (Phase 1)
// =============================================================================

/** Provider type for calendar accounts */
export type CalendarProvider = 'google' | 'microsoft' | 'caldav';

/** Source of event classification */
export type ClassificationSource = 'manual' | 'rule' | 'metadata' | 'routine_link' | 'llm';

/** Match type for classification rules */
export type RuleMatchType = 'title_contains' | 'title_equals' | 'title_regex' | 'organizer_email' | 'calendar_id';

/**
 * CalendarAccount: OAuth connection to an external calendar provider.
 * Supports multiple accounts per user (e.g., work + personal Gmail).
 */
export interface CalendarAccount extends Timestamps {
  readonly id: string;
  readonly userId: EntityId;
  provider: CalendarProvider;
  email: string;
  /** Encrypted access token */
  accessTokenEncrypted: string;
  /** Encrypted refresh token */
  refreshTokenEncrypted: string;
  expiresAt: Date;
  scopes: string[];
  /** Calendar IDs to sync (default: ["primary"]) */
  selectedCalendarIds: string[];
  /** Calendar ID to write new events to */
  writeCalendarId: string | null;
}

/**
 * CalendarEventAnnotation: Durable link between a calendar event and a Kaizen card.
 * Survives event moves/edits via stable identity (eventId + instanceKey).
 */
export interface CalendarEventAnnotation extends Timestamps {
  readonly id: string;
  readonly userId: EntityId;
  readonly accountId: string;
  calendarId: string;
  eventId: string;
  /** Unique instance identifier (originalStartTime for recurring, else start time) */
  instanceKey: string;
  cardId: EntityId | null;
  source: ClassificationSource;
  confidence: number;
}

/**
 * EventClassificationRule: Auto-classify events to cards based on patterns.
 * Avoids re-labelling the same meetings every week.
 */
export interface EventClassificationRule {
  readonly id: string;
  readonly userId: EntityId;
  matchType: RuleMatchType;
  matchValue: string;
  cardId: EntityId;
  priority: number;
  isActive: boolean;
  readonly createdAt: Date;
}

/**
 * RoutineCalendarLink: Links a routine card to a recurring Google Calendar event.
 * All instances of the series auto-classify to the linked card.
 */
export interface RoutineCalendarLink {
  readonly id: string;
  readonly userId: EntityId;
  readonly cardId: EntityId;
  readonly accountId: string;
  calendarId: string;
  recurringEventId: string;
  iCalUid: string | null;
  readonly createdAt: Date;
}
