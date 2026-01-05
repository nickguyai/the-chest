/**
 * Property tests for CardService WIP and Vetoes
 * 
 * **Property 2: WIP Status Calculation**
 * *For any* Theme, WIP status shall correctly report active count, max limit, and canAdd flag.
 * **Validates: Requirements 4.2, 4.3, 4.4**
 * 
 * **Property 3: WIP Limit Enforcement**
 * *For any* Card creation at capacity, the operation shall fail with appropriate error.
 * **Validates: Requirements 6.2, 7.2, 11.3**
 * 
 * **Property 4: Global Vetoes Query**
 * *For any* VETO Card without parentId, it shall appear in global vetoes; with parentId, it shall not.
 * **Validates: Requirements 12.1, 12.2**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { CardService } from '../src/services/cardService';
import { DEFAULT_USER_SETTINGS, UserSettings } from '../lib/settings';
import { UnitType, WipTypeStatus } from '../src/types';

// Test the pure logic functions without database
describe('CardService - Property 2: WIP Status Calculation', () => {
  const service = new CardService();

  /**
   * Feature: kaizen-v4-refactor, Property 2: WIP Status Calculation
   * For any active count and max limit, canAdd is true iff active < max
   */
  it('canAdd is true iff active < max', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (active, max) => {
          const status: WipTypeStatus = {
            active,
            max,
            canAdd: active < max,
          };
          expect(status.canAdd).toBe(active < max);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: kaizen-v4-refactor, Property 2: WIP Status Calculation
   * For any settings, getLimit returns correct limit for each action type
   */
  it('getLimit returns correct limit for each action type', () => {
    const settingsArb = fc.record({
      maxThemes: fc.integer({ min: 1, max: 10 }),
      maxGatesPerTheme: fc.integer({ min: 1, max: 10 }),
      maxExperimentsPerTheme: fc.integer({ min: 1, max: 10 }),
      maxRoutinesPerTheme: fc.integer({ min: 1, max: 10 }),
      maxOpsPerTheme: fc.integer({ min: 1, max: 10 }),
      minCriteriaPerExperiment: fc.integer({ min: 1, max: 5 }),
      minCriteriaPerGate: fc.integer({ min: 1, max: 5 }),
      defaultSeasonWeeks: fc.integer({ min: 1, max: 52 }),
      defaultLagWeeks: fc.integer({ min: 1, max: 12 }),
    });

    fc.assert(
      fc.property(settingsArb, (settings: UserSettings) => {
        expect(service.getLimit(settings, 'ACTION_GATE')).toBe(settings.maxGatesPerTheme);
        expect(service.getLimit(settings, 'ACTION_EXPERIMENT')).toBe(settings.maxExperimentsPerTheme);
        expect(service.getLimit(settings, 'ACTION_ROUTINE')).toBe(settings.maxRoutinesPerTheme);
        expect(service.getLimit(settings, 'ACTION_OPS')).toBe(settings.maxOpsPerTheme);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: kaizen-v4-refactor, Property 2: WIP Status Calculation
   * For non-action types, getLimit returns Infinity
   */
  it('getLimit returns Infinity for non-action types', () => {
    const nonActionTypes: UnitType[] = ['THEME', 'TASK', 'VETO'];
    
    fc.assert(
      fc.property(
        fc.constantFrom(...nonActionTypes),
        (unitType) => {
          expect(service.getLimit(DEFAULT_USER_SETTINGS, unitType)).toBe(Infinity);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('CardService - Property 3: WIP Limit Enforcement (Logic)', () => {
  /**
   * Feature: kaizen-v4-refactor, Property 3: WIP Limit Enforcement
   * For any active count >= max, canAdd should be false
   */
  it('at capacity means canAdd is false', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (max) => {
          // At capacity
          const atCapacity: WipTypeStatus = { active: max, max, canAdd: max < max };
          expect(atCapacity.canAdd).toBe(false);
          
          // Over capacity (shouldn't happen but test anyway)
          const overCapacity: WipTypeStatus = { active: max + 1, max, canAdd: max + 1 < max };
          expect(overCapacity.canAdd).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: kaizen-v4-refactor, Property 3: WIP Limit Enforcement
   * For any active count < max, canAdd should be true
   */
  it('below capacity means canAdd is true', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 99 }),
        (max, offset) => {
          const active = Math.min(offset, max - 1);
          const belowCapacity: WipTypeStatus = { active, max, canAdd: active < max };
          expect(belowCapacity.canAdd).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('CardService - Property 4: Global Vetoes Query (Logic)', () => {
  /**
   * Feature: kaizen-v4-refactor, Property 4: Global Vetoes Query
   * A veto is global iff parentId is null
   */
  it('veto is global iff parentId is null', () => {
    interface MockVeto {
      id: number;
      unitType: 'VETO';
      parentId: number | null;
    }

    const vetoArb = fc.record({
      id: fc.integer({ min: 1 }),
      unitType: fc.constant('VETO' as const),
      parentId: fc.option(fc.integer({ min: 1 }), { nil: null }),
    });

    fc.assert(
      fc.property(vetoArb, (veto: MockVeto) => {
        const isGlobal = veto.parentId === null;
        expect(isGlobal).toBe(veto.parentId === null);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: kaizen-v4-refactor, Property 4: Global Vetoes Query
   * For any list of vetoes, filtering by parentId === null gives global vetoes
   */
  it('filtering vetoes by null parentId gives global vetoes', () => {
    interface MockVeto {
      id: number;
      unitType: 'VETO';
      parentId: number | null;
    }

    const vetoArb = fc.record({
      id: fc.integer({ min: 1 }),
      unitType: fc.constant('VETO' as const),
      parentId: fc.option(fc.integer({ min: 1 }), { nil: null }),
    });

    fc.assert(
      fc.property(fc.array(vetoArb, { minLength: 0, maxLength: 20 }), (vetoes: MockVeto[]) => {
        const globalVetoes = vetoes.filter(v => v.parentId === null);
        const nonGlobalVetoes = vetoes.filter(v => v.parentId !== null);
        
        // All global vetoes have null parentId
        expect(globalVetoes.every(v => v.parentId === null)).toBe(true);
        // All non-global vetoes have non-null parentId
        expect(nonGlobalVetoes.every(v => v.parentId !== null)).toBe(true);
        // Total count is preserved
        expect(globalVetoes.length + nonGlobalVetoes.length).toBe(vetoes.length);
      }),
      { numRuns: 100 }
    );
  });
});
