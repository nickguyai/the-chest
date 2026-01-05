/**
 * Get the start of a week (Monday) as YYYY-MM-DD string.
 * @param offsetWeeks - Number of weeks to offset (0 = current, -1 = last, 1 = next)
 */
export function getWeekStart(offsetWeeks: number = 0): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  // Adjust so Monday = 0
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const diff = now.getDate() + mondayOffset + offsetWeeks * 7;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), diff);
  return weekStart.toISOString().split('T')[0];
}

/**
 * Get the week start for review purposes.
 * On Sunday: returns current week (the week that just ended, Mon-Sun)
 * On other days: returns last completed week
 */
export function getReviewWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  // On Sunday, the week to review is the one that just ended (offset 0)
  // On other days, review the previous completed week (offset -1)
  const offset = dayOfWeek === 0 ? 0 : -1;
  return getWeekStart(offset);
}

/**
 * Check if today is Sunday (review day)
 */
export function isSunday(): boolean {
  return new Date().getDay() === 0;
}

/**
 * Format a date range for display.
 */
export function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `${startStr} - ${endStr}`;
}
