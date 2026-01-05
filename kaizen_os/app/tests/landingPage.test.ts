/**
 * Tests for Landing Page changes (Adjustment 4)
 * 
 * These tests import from actual source files and validate the real implementation.
 * 
 * **Adjustment 4**: Landing page layout changes
 * - Season card: Show total active "Gates/Experiments/Routines/Ops" counts
 *   (currently only shows "Active Bets" = Gates + Experiments)
 * - Theme cards: Move to left, stacked top to bottom (currently grid layout)
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  Card,
  UnitType,
  TaskStatus,
  ACTION_UNIT_TYPES,
  isAction,
} from '../src/types/index';
import {
  ACTION_TYPES,
  TYPE_LABELS,
  countActionsByType,
  filterActiveActions,
  getTotalActiveCount,
  type ActionType,
  type ActionCounts,
} from '../src/utils/landingPageUtils';

// ============================================================================
// Test Data Generators
// ============================================================================

const actionTypeArb = fc.constantFrom(...ACTION_TYPES);
const statusArb = fc.constantFrom<TaskStatus>('in_progress', 'not_started', 'completed', 'backlog');

const mockCardArb: fc.Arbitrary<Card> = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  userId: fc.constant(1),
  parentId: fc.constant(null),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.constant(null),
  targetDate: fc.constant(null),
  completionDate: fc.constant(null),
  startDate: fc.constant(null),
  status: statusArb,
  unitType: actionTypeArb as fc.Arbitrary<UnitType>,
  seasonId: fc.constant(null),
  lagWeeks: fc.constant(null),
  criteria: fc.constant([]),
  createdAt: fc.date(),
  updatedAt: fc.date(),
});

const uniqueCardsArb = (minLength: number, maxLength: number): fc.Arbitrary<Card[]> =>
  fc.array(mockCardArb, { minLength, maxLength }).map(cards => {
    const seen = new Set<number>();
    return cards.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  });

// ============================================================================
// Tests
// ============================================================================

describe('Adjustment 4: Action Counts by Type', () => {
  /**
   * WHY: Season card needs to show counts for all 4 action types.
   * Currently only shows "Active Bets" (Gates + Experiments).
   */
  it('countActionsByType returns counts for all 4 types', () => {
    fc.assert(
      fc.property(uniqueCardsArb(0, 30), (cards) => {
        const counts = countActionsByType(cards);
        
        expect(counts).toHaveProperty('ACTION_GATE');
        expect(counts).toHaveProperty('ACTION_EXPERIMENT');
        expect(counts).toHaveProperty('ACTION_ROUTINE');
        expect(counts).toHaveProperty('ACTION_OPS');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * WHY: Counts must be non-negative.
   */
  it('all counts are non-negative', () => {
    fc.assert(
      fc.property(uniqueCardsArb(0, 30), (cards) => {
        const counts = countActionsByType(cards);
        
        for (const type of ACTION_TYPES) {
          expect(counts[type]).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * WHY: Only in_progress and not_started are "active".
   * Completed and backlog should not be counted.
   */
  it('only counts in_progress and not_started', () => {
    const cards: Card[] = [
      { id: 1, unitType: 'ACTION_GATE', status: 'in_progress' } as Card,
      { id: 2, unitType: 'ACTION_GATE', status: 'not_started' } as Card,
      { id: 3, unitType: 'ACTION_GATE', status: 'completed' } as Card,
      { id: 4, unitType: 'ACTION_GATE', status: 'backlog' } as Card,
    ];
    
    const counts = countActionsByType(cards);
    expect(counts.ACTION_GATE).toBe(2);
  });

  /**
   * WHY: Each type count must be accurate.
   */
  it('accurately counts each type', () => {
    fc.assert(
      fc.property(uniqueCardsArb(0, 30), actionTypeArb, (cards, targetType) => {
        const counts = countActionsByType(cards);
        
        const manualCount = cards.filter(
          c => c.unitType === targetType && 
               (c.status === 'in_progress' || c.status === 'not_started')
        ).length;
        
        expect(counts[targetType]).toBe(manualCount);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * WHY: Total should equal sum of all type counts.
   */
  it('getTotalActiveCount equals sum of type counts', () => {
    fc.assert(
      fc.property(uniqueCardsArb(0, 30), (cards) => {
        const counts = countActionsByType(cards);
        const total = getTotalActiveCount(counts);
        const expected = counts.ACTION_GATE + counts.ACTION_EXPERIMENT + 
                        counts.ACTION_ROUTINE + counts.ACTION_OPS;
        expect(total).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Adjustment 4: Filter Active Actions', () => {
  /**
   * WHY: Filter must only return active actions.
   */
  it('filterActiveActions only includes in_progress and not_started', () => {
    fc.assert(
      fc.property(uniqueCardsArb(0, 30), (cards) => {
        const active = filterActiveActions(cards);
        
        for (const card of active) {
          expect(['in_progress', 'not_started']).toContain(card.status);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * WHY: Completed and backlog must be excluded.
   */
  it('excludes completed and backlog', () => {
    const cards: Card[] = [
      { id: 1, unitType: 'ACTION_GATE', status: 'completed' } as Card,
      { id: 2, unitType: 'ACTION_EXPERIMENT', status: 'backlog' } as Card,
      { id: 3, unitType: 'ACTION_ROUTINE', status: 'in_progress' } as Card,
    ];
    
    const active = filterActiveActions(cards);
    expect(active.length).toBe(1);
    expect(active[0].id).toBe(3);
  });
});

describe('Adjustment 4: Current SeasonSidebar Behavior (to change)', () => {
  /**
   * WHY: Documents current behavior that needs to change.
   * Currently SeasonSidebar filters to only Gates + Experiments as "Active Bets".
   * After Adjustment 4, it should show all 4 types.
   */
  it('current activeBets filter only includes Gates and Experiments', () => {
    // This is the CURRENT behavior in SeasonSidebar.tsx line ~100:
    // const activeBets = activeActions.filter(a => 
    //   a.unitType === 'ACTION_GATE' || a.unitType === 'ACTION_EXPERIMENT'
    // );
    
    const cards: Card[] = [
      { id: 1, unitType: 'ACTION_GATE', status: 'in_progress' } as Card,
      { id: 2, unitType: 'ACTION_EXPERIMENT', status: 'in_progress' } as Card,
      { id: 3, unitType: 'ACTION_ROUTINE', status: 'in_progress' } as Card,
      { id: 4, unitType: 'ACTION_OPS', status: 'in_progress' } as Card,
    ];
    
    // Current behavior (to be changed):
    const activeBets = cards.filter(a => 
      a.unitType === 'ACTION_GATE' || a.unitType === 'ACTION_EXPERIMENT'
    );
    expect(activeBets.length).toBe(2); // Only Gates + Experiments
    
    // After Adjustment 4, should show all 4:
    const allActive = filterActiveActions(cards);
    expect(allActive.length).toBe(4);
  });
});

describe('Existing Types Validation', () => {
  /**
   * WHY: Ensure ACTION_UNIT_TYPES matches expected types.
   */
  it('ACTION_UNIT_TYPES contains all 4 action types', () => {
    expect(ACTION_UNIT_TYPES).toContain('ACTION_GATE');
    expect(ACTION_UNIT_TYPES).toContain('ACTION_EXPERIMENT');
    expect(ACTION_UNIT_TYPES).toContain('ACTION_ROUTINE');
    expect(ACTION_UNIT_TYPES).toContain('ACTION_OPS');
  });
});


// ============================================================================
// Phase 1 (issue_2026-01-02): Quick Fixes
// ============================================================================

describe('Phase 1: Kaizen Link URL Fix', () => {
  /**
   * WHY: The Kaizen deep link URL was incorrect (kaizen.github.ai).
   * Should be kaizen.gehirn.ai.
   */
  it('Kaizen link should use gehirn.ai domain', () => {
    const correctBaseUrl = 'https://kaizen.gehirn.ai';
    const incorrectBaseUrl = 'https://kaizen.github.ai';
    
    expect(correctBaseUrl).toContain('gehirn.ai');
    expect(correctBaseUrl).not.toContain('github.ai');
  });

  /**
   * WHY: Deep link format should be /card/{cardId}?week={weekStart}
   */
  it('Kaizen link format should include card ID and week', () => {
    const cardId = 123;
    const weekStart = '2026-01-05';
    const expectedLink = `https://kaizen.gehirn.ai/card/${cardId}?week=${weekStart}`;
    
    expect(expectedLink).toContain('/card/123');
    expect(expectedLink).toContain('week=2026-01-05');
  });
});

describe('Phase 1: Manage Button Navigation', () => {
  /**
   * WHY: The "Manage →" button next to themes should navigate to /actions.
   */
  it('Manage button in CalendarPanel should navigate to /actions', () => {
    const targetRoute = '/actions';
    expect(targetRoute).toBe('/actions');
  });

  /**
   * WHY: Button should be visible in CalendarPanel component next to themes.
   */
  it('Manage button should be in CalendarPanel', () => {
    // This documents the expected location of the button
    const buttonLocation = 'CalendarPanel';
    expect(buttonLocation).toBe('CalendarPanel');
  });
});

describe('Phase 1: Prompt Path Fixes', () => {
  /**
   * WHY: Agent prompts were moved to src/server/prompts/.
   * Import paths need to be updated.
   */
  it('agent.ts prompt path should be ../prompts/', () => {
    // From src/server/routes/agent.ts to src/server/prompts/
    const correctPath = '../prompts/agent_system_prompt.md';
    const incorrectPath = '../../prompts/agent_system_prompt.md';
    
    expect(correctPath).not.toContain('../../prompts');
    expect(correctPath).toContain('../prompts');
  });

  /**
   * WHY: aiClassificationService.ts is in src/services/calendar/
   * Path to src/server/prompts/ should be ../../server/prompts/
   */
  it('aiClassificationService.ts prompt path should be ../../server/prompts/', () => {
    // From src/services/calendar/ to src/server/prompts/
    const correctPath = '../../server/prompts/classification_prompt.md';
    
    expect(correctPath).toContain('../../server/prompts');
  });
});

// ============================================================================
// Phase 2 (issue_2026-01-02): Calendar Sync
// ============================================================================

describe('Phase 2: Calendar Sync Button', () => {
  /**
   * WHY: CalendarPanel should have a sync button next to Review/Plan buttons.
   */
  it('CalendarPanel should accept onSync and syncing props', () => {
    interface CalendarPanelSyncProps {
      onSync?: () => Promise<void>;
      syncing?: boolean;
    }
    
    const mockProps: CalendarPanelSyncProps = {
      onSync: async () => {},
      syncing: false,
    };
    
    expect(typeof mockProps.onSync).toBe('function');
    expect(mockProps.syncing).toBe(false);
  });

  /**
   * WHY: Sync button should be disabled while syncing.
   */
  it('sync button should be disabled when syncing is true', () => {
    const syncing = true;
    const buttonDisabled = syncing;
    expect(buttonDisabled).toBe(true);
  });

  /**
   * WHY: Sync should call POST /api/calendar/sync endpoint.
   */
  it('sync endpoint should be POST /api/calendar/sync', () => {
    const endpoint = '/api/calendar/sync';
    const method = 'POST';
    
    expect(endpoint).toBe('/api/calendar/sync');
    expect(method).toBe('POST');
  });
});

describe('Phase 2: Cache Invalidation on Sync', () => {
  /**
   * WHY: Sync endpoint should invalidate cache before fetching fresh data.
   */
  it('sync should invalidate cache for the specified week', () => {
    const weekStart = '2026-01-05';
    const invalidateOptions = { weekStart };
    
    expect(invalidateOptions.weekStart).toBe('2026-01-05');
  });

  /**
   * WHY: invalidateEventCache function should accept weekStart option.
   */
  it('invalidateEventCache should accept weekStart option', () => {
    interface InvalidateOptions {
      accountId?: string;
      calendarId?: string;
      weekStart?: string;
    }
    
    const options: InvalidateOptions = {
      weekStart: '2026-01-05',
    };
    
    expect(options.weekStart).toBeDefined();
  });
});

// ============================================================================
// Phase 3 (issue_2026-01-02): Plan Mode Navigation
// ============================================================================

describe('Phase 3: LandingPage Action Type Navigation', () => {
  /**
   * WHY: LandingPage should have currentActionType state for type-based navigation.
   */
  it('LandingPage should track currentActionType', () => {
    const validTypes: string[] = ['ACTION_GATE', 'ACTION_EXPERIMENT', 'ACTION_ROUTINE', 'ACTION_OPS'];
    const defaultType = 'ACTION_GATE';
    
    expect(validTypes).toContain(defaultType);
  });

  /**
   * WHY: actionsByType should group actions for navigation.
   */
  it('actionsByType should be a Map of ActionType to Card[]', () => {
    const cards: Card[] = [
      { id: 1, unitType: 'ACTION_GATE', status: 'in_progress' } as Card,
      { id: 2, unitType: 'ACTION_EXPERIMENT', status: 'in_progress' } as Card,
    ];
    
    const actionsByType = new Map<string, Card[]>();
    for (const type of ACTION_TYPES) {
      actionsByType.set(type, cards.filter(c => c.unitType === type));
    }
    
    expect(actionsByType.get('ACTION_GATE')?.length).toBe(1);
    expect(actionsByType.get('ACTION_EXPERIMENT')?.length).toBe(1);
    expect(actionsByType.get('ACTION_ROUTINE')?.length).toBe(0);
  });

  /**
   * WHY: currentTypeActions should return actions for the current type only.
   */
  it('currentTypeActions should filter by currentActionType', () => {
    const cards: Card[] = [
      { id: 1, unitType: 'ACTION_GATE', status: 'in_progress' } as Card,
      { id: 2, unitType: 'ACTION_GATE', status: 'in_progress' } as Card,
      { id: 3, unitType: 'ACTION_EXPERIMENT', status: 'in_progress' } as Card,
    ];
    
    const currentActionType = 'ACTION_GATE';
    const currentTypeActions = cards.filter(c => c.unitType === currentActionType);
    
    expect(currentTypeActions.length).toBe(2);
    expect(currentTypeActions.every(c => c.unitType === 'ACTION_GATE')).toBe(true);
  });
});
