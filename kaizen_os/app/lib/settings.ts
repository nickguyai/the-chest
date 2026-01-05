/**
 * User Settings - WIP limits and configuration
 */

export interface UserSettings {
  // WIP limits
  maxThemes: number;
  maxGatesPerTheme: number;
  maxExperimentsPerTheme: number;
  maxRoutinesPerTheme: number;
  maxOpsPerTheme: number;

  // Criteria requirements
  minCriteriaPerExperiment: number;
  minCriteriaPerGate: number;

  // Season defaults
  defaultSeasonWeeks: number;
  defaultLagWeeks: number;

  // Optional settings
  weekStartDay?: 'sunday' | 'monday';
  timezone?: string;
  
  // Debug mode
  debugMode?: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  maxThemes: 4,
  maxGatesPerTheme: 2,
  maxExperimentsPerTheme: 1,
  maxRoutinesPerTheme: 5,
  maxOpsPerTheme: 3,
  minCriteriaPerExperiment: 2,
  minCriteriaPerGate: 1,
  defaultSeasonWeeks: 11,
  defaultLagWeeks: 6,
  weekStartDay: 'monday',
};

/**
 * Get user settings with defaults applied
 */
export function getUserSettings(userSettings: unknown): UserSettings {
  return {
    ...DEFAULT_USER_SETTINGS,
    ...(userSettings as Partial<UserSettings>),
  };
}
