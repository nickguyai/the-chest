import { prisma } from '../../lib/db';
import { getProviderForAccount } from './providerFactory';
import { parsePlanText } from './planParser';
import { DateTime } from 'luxon';

// ============================================
// Weekly Planned Hours (FR-001)
// ============================================

export interface WeeklyPlannedHoursResult {
  plannedHours: number;
  utilityRate: number;
  percentUtilized: number;
  status: 'under' | 'at' | 'over';
}

export async function getWeeklyPlannedHours(
  userId: number,
  weekStart: string
): Promise<WeeklyPlannedHoursResult> {
  // Get user's timezone and active season
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const tz = user?.timezone || 'America/Los_Angeles';

  const season = await prisma.season.findFirst({
    where: { userId, isActive: true },
  });
  const utilityRate = season?.utilityRate || 40;

  // Parse week boundaries
  const weekStartDt = DateTime.fromISO(weekStart, { zone: tz }).startOf('day');
  const weekEndDt = weekStartDt.plus({ days: 7 });

  // Get all calendar accounts
  const accounts = await prisma.calendarAccount.findMany({
    where: { userId },
  });

  // Fetch events from all calendars for the week
  // Use a Map keyed by iCalUID+instanceKey to deduplicate events across calendars
  const seenEvents = new Map<string, { start: Date; end: Date }>();
  const timeMin = weekStartDt.toISO()!;
  const timeMax = weekEndDt.toISO()!;

  for (const account of accounts) {
    const selectedCalendars = (account.selectedCalendarIds || ['primary']) as string[];
    for (const calendarId of selectedCalendars) {
      try {
        const provider = await getProviderForAccount(account.id);
        const events = await provider.listEvents(account.id, calendarId, timeMin, timeMax);
        
        for (const event of events) {
          // Only count events with dateTime (not all-day events)
          if (event.start?.dateTime && event.end?.dateTime) {
            // Deduplicate by iCalUID + instanceKey (for recurring event instances)
            const dedupeKey = `${event.iCalUID}:${event.instanceKey || event.start.dateTime}`;
            if (!seenEvents.has(dedupeKey)) {
              seenEvents.set(dedupeKey, {
                start: new Date(event.start.dateTime),
                end: new Date(event.end.dateTime),
              });
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch events for calendar ${calendarId}:`, err);
      }
    }
  }

  // Sum up durations from deduplicated events
  let totalMinutes = 0;
  for (const { start, end } of seenEvents.values()) {
    totalMinutes += (end.getTime() - start.getTime()) / (1000 * 60);
  }

  const plannedHours = Math.round((totalMinutes / 60) * 10) / 10;
  const percentUtilized = utilityRate > 0 ? Math.round((plannedHours / utilityRate) * 100) : 0;

  let status: 'under' | 'at' | 'over' = 'under';
  if (percentUtilized >= 100) status = 'over';
  else if (percentUtilized >= 90) status = 'at';

  return { plannedHours, utilityRate, percentUtilized, status };
}

// ============================================
// Preview Types (matching UI mock)
// ============================================

export interface PreviewBlock {
  dayOffset: number;
  dayName: string;
  dayDate: string; // "Dec 30"
  startTime: string;
  endTime: string;
  startDateTime: string;
  endDateTime: string;
  cardId: number | null;
  cardTitle: string;
  description?: string;
  isMatched: boolean;
}

export interface PlanPreviewResponse {
  blocks: PreviewBlock[];
  errors: string[];
  summary: {
    blocksParsed: number;
    unmatchedCards: number;
    errorCount: number;
  };
  unmatchedCardNames: string[];
  userCards: Array<{ id: number; title: string }>;
}

// ============================================
// Preview Plan
// ============================================

export async function previewPlan(
  userId: number,
  text: string,
  weekStart: string
): Promise<PlanPreviewResponse> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const tz = user?.timezone || 'America/Los_Angeles';
  const weekStartDt = DateTime.fromISO(weekStart, { zone: tz }).startOf('day');

  const { blocks, errors, unmatchedCount } = await parsePlanText(userId, text);


  // Convert to full datetimes
  const previewBlocks: PreviewBlock[] = blocks.map((block) => {
    const day = weekStartDt.plus({ days: block.dayOffset });
    const [startH, startM] = block.startTime.split(':').map(Number);
    const [endH, endM] = block.endTime.split(':').map(Number);

    const startDt = day.set({ hour: startH, minute: startM });
    const endDt = day.set({ hour: endH, minute: endM });

    return {
      dayOffset: block.dayOffset,
      dayName: block.dayName,
      dayDate: day.toFormat('LLL d'),
      startTime: block.startTime,
      endTime: block.endTime,
      startDateTime: startDt.toISO()!,
      endDateTime: endDt.toISO()!,
      cardId: block.cardId,
      cardTitle: block.cardTitle,
      description: block.description,
      isMatched: block.isMatched,
    };
  });

  // Get unmatched card names
  const unmatchedCardNames = [...new Set(blocks.filter((b) => !b.isMatched).map((b) => b.cardTitle))];

  // Get user's cards for suggestions
  const userCards = await prisma.card.findMany({
    where: {
      userId,
      unitType: { in: ['ACTION_GATE', 'ACTION_EXPERIMENT', 'ACTION_ROUTINE', 'ACTION_OPS'] },
      status: { in: ['in_progress', 'not_started'] },
    },
    select: { id: true, title: true },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });

  return {
    blocks: previewBlocks,
    errors,
    summary: {
      blocksParsed: blocks.length,
      unmatchedCards: unmatchedCount,
      errorCount: errors.length,
    },
    unmatchedCardNames,
    userCards,
  };
}

// ============================================
// Commit Plan
// ============================================

export interface GcalAssignmentInput {
  eventId: string;
  eventTitle: string;
  cardId: number;
  createRule: boolean;
  accountId: string;
  calendarId: string;
  modifiedStart?: string;
  modifiedEnd?: string;
}

export interface CommitPlanInput {
  weekStart?: string;
  actionType?: string; // Optional: filter to commit only blocks for this action type
  blocks: Array<{
    cardId: number | null;
    cardTitle: string;
    startDateTime: string;
    endDateTime: string;
    description?: string;
    actionType?: string; // Action type of the card
    // FR-003: Extended event details
    location?: string;
    attendees?: Array<{ email: string; displayName?: string }>;
  }>;
  assignments?: GcalAssignmentInput[];
}

export interface CommitPlanResult {
  created: number;
  linked: number;
  rulesCreated: number;
}

// FR-003: Generate Kaizen deep link for event description
function generateKaizenLink(cardId: number | null, weekStart?: string): string {
  if (!cardId) return '';
  const baseUrl = 'https://kaizen.gehirn.ai';
  const weekParam = weekStart ? `?week=${weekStart}` : '';
  return `\n\n---\n[Open in Kaizen](${baseUrl}/card/${cardId}${weekParam})`;
}

export async function commitPlan(
  userId: number,
  input: CommitPlanInput
): Promise<CommitPlanResult> {
  let created = 0;
  let linked = 0;
  let rulesCreated = 0;

  // Filter blocks by actionType if provided
  const blocksToCommit = input.actionType 
    ? input.blocks.filter(b => b.actionType === input.actionType)
    : input.blocks;

  // Only create calendar events if there are blocks to create
  if (blocksToCommit && blocksToCommit.length > 0) {
    const account = await prisma.calendarAccount.findFirst({
      where: { userId, writeCalendarId: { not: null } },
    });

    if (!account || !account.writeCalendarId) {
      throw new Error('No write calendar configured. Please connect a Google account first.');
    }

    const provider = await getProviderForAccount(account.id);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const tz = user?.timezone || 'America/Los_Angeles';

    for (const block of blocksToCommit) {
      // Create event in Google Calendar
      const summary = block.cardId ? `[Kaizen] ${block.cardTitle}` : block.cardTitle;
      
      // FR-003: Add Kaizen deep link to description
      const kaizenLink = generateKaizenLink(block.cardId, input.weekStart);
      const fullDescription = block.description 
        ? `${block.description}${kaizenLink}`
        : kaizenLink.trim();

      const event = await provider.createEvent(account.id, account.writeCalendarId, {
        summary,
        description: fullDescription || undefined,
        location: block.location, // FR-003
        start: { dateTime: block.startDateTime, timeZone: tz },
        end: { dateTime: block.endDateTime, timeZone: tz },
        attendees: block.attendees, // FR-003
        extendedProperties: block.cardId
          ? {
              private: {
                kz_card_id: String(block.cardId),
                ...(input.weekStart && { kz_plan_week: input.weekStart }),
              },
            }
          : undefined,
      });

      created++;

      // Store annotation if linked to card
      if (block.cardId) {
        await prisma.calendarEventAnnotation.create({
          data: {
            userId,
            accountId: account.id,
            calendarId: account.writeCalendarId,
            eventId: event.id,
            instanceKey: block.startDateTime,
            cardId: block.cardId,
            source: 'metadata',
            confidence: 1.0,
          },
        });
        linked++;
      }
    }

    // Create per-type event for tracking (uses week_planned event type with per-type idempotency key)
    if (input.weekStart) {
      const idempotencyKey = input.actionType 
        ? `type_planned:${input.actionType}:${input.weekStart}`
        : `week_planned:${userId}-${input.weekStart}`;
      
      const existing = await prisma.event.findFirst({
        where: { userId, idempotencyKey },
      });

      if (existing) {
        await prisma.event.update({
          where: { id: existing.id },
          data: {
            payload: {
              weekStart: input.weekStart,
              actionType: input.actionType || null,
              blockCount: blocksToCommit.length,
              linkedCount: linked,
              committedAt: new Date().toISOString(),
            },
          },
        });
      } else {
        await prisma.event.create({
          data: {
            userId,
            eventType: 'week_planned', // Use existing enum value
            idempotencyKey,
            payload: {
              weekStart: input.weekStart,
              actionType: input.actionType || null,
              blockCount: blocksToCommit.length,
              linkedCount: linked,
              committedAt: new Date().toISOString(),
            },
          },
        });
      }
    }
  }

  // Handle GCal event assignments and rule creation
  if (input.assignments && input.assignments.length > 0) {
    for (const assignment of input.assignments) {
      // Only create annotation if there's an actual action assignment (cardId > 0)
      if (assignment.cardId > 0 && assignment.accountId && assignment.calendarId) {
        await prisma.calendarEventAnnotation.upsert({
          where: {
            userId_accountId_calendarId_eventId_instanceKey: {
              userId,
              accountId: assignment.accountId,
              calendarId: assignment.calendarId,
              eventId: assignment.eventId,
              instanceKey: input.weekStart || 'default',
            },
          },
          update: {
            cardId: assignment.cardId,
            source: 'planning',
            confidence: 1.0,
          },
          create: {
            userId,
            accountId: assignment.accountId,
            calendarId: assignment.calendarId,
            eventId: assignment.eventId,
            instanceKey: input.weekStart || 'default',
            cardId: assignment.cardId,
            source: 'planning',
            confidence: 1.0,
          },
        });
        linked++;
      }

      // Create classification rule if user checked "remember"
      if (assignment.createRule && assignment.eventTitle) {
        // Trim the event title to avoid whitespace mismatches
        const trimmedTitle = assignment.eventTitle.trim();
        await prisma.eventClassificationRule.upsert({
          where: {
            userId_matchType_matchValue: {
              userId,
              matchType: 'title_exact',
              matchValue: trimmedTitle,
            },
          },
          update: {
            cardId: assignment.cardId,
            isActive: true,
          },
          create: {
            userId,
            matchType: 'title_exact',
            matchValue: trimmedTitle,
            cardId: assignment.cardId,
            priority: 0,
            isActive: true,
          },
        });
        rulesCreated++;
      }
    }
  }

  // Update GCal event times if modified (drag/resize in planning mode)
  if (input.assignments && input.assignments.length > 0) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const tz = user?.timezone || 'America/Los_Angeles';

    for (const assignment of input.assignments) {
      if ((assignment.modifiedStart || assignment.modifiedEnd) && assignment.accountId && assignment.calendarId) {
        try {
          const provider = await getProviderForAccount(assignment.accountId);
          const patch: { start?: { dateTime: string; timeZone: string }; end?: { dateTime: string; timeZone: string } } = {};
          
          if (assignment.modifiedStart) {
            patch.start = { dateTime: assignment.modifiedStart, timeZone: tz };
          }
          if (assignment.modifiedEnd) {
            patch.end = { dateTime: assignment.modifiedEnd, timeZone: tz };
          }
          
          await provider.patchEvent(assignment.accountId, assignment.calendarId, assignment.eventId, patch);
        } catch (error) {
          console.error(`Failed to update GCal event ${assignment.eventId}:`, error);
          // Continue with other assignments even if one fails
        }
      }
    }
  }

  return { created, linked, rulesCreated };
}

// ============================================
// Get Submitted Types for a Week
// ============================================

export async function getSubmittedTypes(
  userId: number,
  weekStart: string
): Promise<string[]> {
  // Query for week_planned events with type_planned idempotency key pattern for this week
  const events = await prisma.event.findMany({
    where: {
      userId,
      eventType: 'week_planned',
      idempotencyKey: {
        startsWith: 'type_planned:',
        endsWith: `:${weekStart}`,
      },
    },
    select: {
      idempotencyKey: true,
    },
  });

  // Extract action types from idempotency keys
  // Format: type_planned:{actionType}:{weekStart}
  const submittedTypes = events.map(e => {
    if (!e.idempotencyKey) return null;
    const parts = e.idempotencyKey.split(':');
    return parts[1]; // actionType is the second part
  }).filter((t): t is string => t !== null);

  return submittedTypes;
}
