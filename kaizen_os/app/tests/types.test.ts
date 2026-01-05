/**
 * Property tests for type guards
 * 
 * **Property 1: Type Guard Correctness**
 * *For any* Card, type guard functions shall return true if and only if the Card's unitType matches.
 * **Validates: Requirements 2.3**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  Card,
  UnitType,
  TaskStatus,
  ALL_UNIT_TYPES,
  isTheme,
  isGate,
  isExperiment,
  isRoutine,
  isOps,
  isTask,
  isVeto,
  isAction,
} from '../src/types';

// Arbitrary for generating valid UnitType values
const unitTypeArb = fc.constantFrom(...ALL_UNIT_TYPES);

// Arbitrary for generating valid TaskStatus values
const taskStatusArb = fc.constantFrom<TaskStatus>('in_progress', 'not_started', 'completed', 'backlog');

// Arbitrary for generating Card objects with any unitType
const cardArb = (unitType?: UnitType): fc.Arbitrary<Card> =>
  fc.record({
    id: fc.integer({ min: 1 }),
    userId: fc.integer({ min: 1 }),
    parentId: fc.option(fc.integer({ min: 1 }), { nil: null }),
    title: fc.string({ minLength: 1, maxLength: 100 }),
    description: fc.option(fc.string(), { nil: null }),
    targetDate: fc.option(fc.date(), { nil: null }),
    completionDate: fc.option(fc.date(), { nil: null }),
    startDate: fc.option(fc.date(), { nil: null }),
    status: taskStatusArb,
    unitType: unitType ? fc.constant(unitType) : unitTypeArb,
    seasonId: fc.option(fc.integer({ min: 1 }), { nil: null }),
    lagWeeks: fc.option(fc.integer({ min: 1, max: 12 }), { nil: null }),
    criteria: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 5 }),
    createdAt: fc.date(),
    updatedAt: fc.date(),
  });

describe('Type Guards - Property 1: Type Guard Correctness', () => {
  /**
   * Feature: kaizen-v4-refactor, Property 1: Type Guard Correctness
   * For any Card, isTheme returns true iff unitType === 'THEME'
   */
  it('isTheme returns true iff unitType is THEME', () => {
    fc.assert(
      fc.property(cardArb(), (card) => {
        const result = isTheme(card);
        const expected = card.unitType === 'THEME';
        expect(result).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: kaizen-v4-refactor, Property 1: Type Guard Correctness
   * For any Card, isGate returns true iff unitType === 'ACTION_GATE'
   */
  it('isGate returns true iff unitType is ACTION_GATE', () => {
    fc.assert(
      fc.property(cardArb(), (card) => {
        const result = isGate(card);
        const expected = card.unitType === 'ACTION_GATE';
        expect(result).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: kaizen-v4-refactor, Property 1: Type Guard Correctness
   * For any Card, isExperiment returns true iff unitType === 'ACTION_EXPERIMENT'
   */
  it('isExperiment returns true iff unitType is ACTION_EXPERIMENT', () => {
    fc.assert(
      fc.property(cardArb(), (card) => {
        const result = isExperiment(card);
        const expected = card.unitType === 'ACTION_EXPERIMENT';
        expect(result).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: kaizen-v4-refactor, Property 1: Type Guard Correctness
   * For any Card, isRoutine returns true iff unitType === 'ACTION_ROUTINE'
   */
  it('isRoutine returns true iff unitType is ACTION_ROUTINE', () => {
    fc.assert(
      fc.property(cardArb(), (card) => {
        const result = isRoutine(card);
        const expected = card.unitType === 'ACTION_ROUTINE';
        expect(result).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: kaizen-v4-refactor, Property 1: Type Guard Correctness
   * For any Card, isOps returns true iff unitType === 'ACTION_OPS'
   */
  it('isOps returns true iff unitType is ACTION_OPS', () => {
    fc.assert(
      fc.property(cardArb(), (card) => {
        const result = isOps(card);
        const expected = card.unitType === 'ACTION_OPS';
        expect(result).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: kaizen-v4-refactor, Property 1: Type Guard Correctness
   * For any Card, isTask returns true iff unitType === 'TASK'
   */
  it('isTask returns true iff unitType is TASK', () => {
    fc.assert(
      fc.property(cardArb(), (card) => {
        const result = isTask(card);
        const expected = card.unitType === 'TASK';
        expect(result).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: kaizen-v4-refactor, Property 1: Type Guard Correctness
   * For any Card, isVeto returns true iff unitType === 'VETO'
   */
  it('isVeto returns true iff unitType is VETO', () => {
    fc.assert(
      fc.property(cardArb(), (card) => {
        const result = isVeto(card);
        const expected = card.unitType === 'VETO';
        expect(result).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: kaizen-v4-refactor, Property 1: Type Guard Correctness
   * For any Card, isAction returns true iff unitType starts with 'ACTION_'
   */
  it('isAction returns true iff unitType starts with ACTION_', () => {
    fc.assert(
      fc.property(cardArb(), (card) => {
        const result = isAction(card);
        const expected = card.unitType.startsWith('ACTION_');
        expect(result).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: kaizen-v4-refactor, Property 1: Type Guard Correctness
   * For any Card, exactly one of the specific type guards (excluding isAction) returns true
   */
  it('exactly one specific type guard returns true for any Card', () => {
    fc.assert(
      fc.property(cardArb(), (card) => {
        const guards = [
          isTheme(card),
          isGate(card),
          isExperiment(card),
          isRoutine(card),
          isOps(card),
          isTask(card),
          isVeto(card),
        ];
        const trueCount = guards.filter(Boolean).length;
        expect(trueCount).toBe(1);
      }),
      { numRuns: 100 }
    );
  });
});
