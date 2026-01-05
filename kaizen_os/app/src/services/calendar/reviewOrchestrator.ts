import { prisma } from '../../lib/db';
import { getProviderForAccount } from './providerFactory';
import { classifyEvents, ClassifiedEvent, CardSuggestion } from './classificationService';
import { DateTime } from 'luxon';

// ============================================
// Response Types (matching UI mock)
// ============================================

export interface ReviewSummary {
  weekStart: string;
  weekEnd: string;
  totalEvents: number;
  totalHours: number;
  autoClassified: number;
  needsReview: number;
  coverage: number;
  // Backwards compat
  autoClassifiedCount: number;
  needsReviewCount: number;
  coveragePercent: number;
}

export interface ReviewEvent {
  accountId: string;
  calendarId: string;
  eventId: string;
  instanceKey: string;
  summary: string;
  date: string;
  timeRange: string;
  durationHours: number;
  status: 'classified' | 'pending';
  selectedCardId: number | null;
  selectedSkip: boolean;
  suggestions: CardSuggestion[];
  rememberChoice: boolean;
  ruleMatchValue: string;
  // For frontend ClassifiedEvent compatibility
  event?: {
    id: string;
    summary: string;
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
    calendarId: string;
  };
  cardId?: number | null;
  cardTitle?: string | null;
  source?: string;
  confidence?: number;
}

export interface ThemeSummary {
  themeId: number;
  themeName: string;
  color: string;
  actualHours: number;
  plannedHours: number;
  percentComplete: number;
}

export interface WeekReviewResponse {
  summary: ReviewSummary;
  events: ReviewEvent[];
  classified: ReviewEvent[];
  ambiguous: ReviewEvent[];
  themeSummaries: ThemeSummary[];
}

// ============================================
// Get Week Review
// ============================================

export interface GetWeekReviewOptions {
  forceAI?: boolean; // Force re-run AI classification for pending events
}

export async function getWeekReview(
  userId: number,
  weekStart: string,
  options: GetWeekReviewOptions = {}
): Promise<WeekReviewResponse> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const tz = user?.timezone || 'America/Los_Angeles';

  const start = DateTime.fromISO(weekStart, { zone: tz }).startOf('day');
  const end = start.plus({ days: 7 });


  // Get all connected accounts
  const accounts = await prisma.calendarAccount.findMany({
    where: { userId },
  });

  // Fetch events from all accounts/calendars
  const allEvents: Array<{ event: any; accountId: string }> = [];

  for (const account of accounts) {
    const provider = await getProviderForAccount(account.id);
    const calendarIds = (account.selectedCalendarIds as string[]) || ['primary'];

    for (const calendarId of calendarIds) {
      try {
        const events = await provider.listEvents(
          account.id,
          calendarId,
          start.toISO()!,
          end.toISO()!
        );
        allEvents.push(...events.map((e) => ({ event: e, accountId: account.id })));
      } catch (error) {
        console.error(`Failed to fetch events from ${calendarId}:`, error);
      }
    }
  }

  // Deduplicate events by iCalUID (same event can appear on multiple calendars)
  const seenUIDs = new Set<string>();
  const uniqueEvents = allEvents.filter(({ event }) => {
    const uid = event.iCalUID || `${event.id}-${event.start?.dateTime || event.start?.date}`;
    if (seenUIDs.has(uid)) {
      return false;
    }
    seenUIDs.add(uid);
    return true;
  });

  // Classify all events
  const classified = await classifyEvents(userId, uniqueEvents, { forceAI: options.forceAI });

  // Transform to UI format
  const reviewEvents = classified.map((c) => transformToReviewEvent(c, tz));

  // Calculate summary
  const totalHours = reviewEvents.reduce((sum, e) => sum + e.durationHours, 0);
  const autoClassifiedCount = reviewEvents.filter((e) => e.status === 'classified').length;
  const needsReviewCount = reviewEvents.filter((e) => e.status === 'pending').length;
  const coveragePercent =
    reviewEvents.length > 0 ? Math.round((autoClassifiedCount / reviewEvents.length) * 100) : 100;

  // Calculate theme summaries
  const themeSummaries = await calculateThemeSummaries(userId, classified);

  // Split into classified vs ambiguous for frontend
  const classifiedEvents = reviewEvents.filter((e) => e.status === 'classified');
  const ambiguousEvents = reviewEvents.filter((e) => e.status === 'pending');

  return {
    summary: {
      weekStart: start.toISODate()!,
      weekEnd: end.toISODate()!,
      totalEvents: reviewEvents.length,
      totalHours: Math.round(totalHours * 10) / 10,
      autoClassified: autoClassifiedCount,
      needsReview: needsReviewCount,
      coverage: coveragePercent,
      // Keep old names for backwards compat
      autoClassifiedCount,
      needsReviewCount,
      coveragePercent,
    },
    events: reviewEvents,
    // Frontend expects these split arrays
    classified: classifiedEvents,
    ambiguous: ambiguousEvents,
    themeSummaries,
  };
}

function transformToReviewEvent(classified: ClassifiedEvent, tz: string): ReviewEvent {
  const { event, accountId } = classified;

  // Parse start/end times
  const startDt = DateTime.fromISO(event.start.dateTime || event.start.date!, { zone: tz });
  const endDt = DateTime.fromISO(event.end.dateTime || event.end.date!, { zone: tz });
  const durationHours = endDt.diff(startDt, 'hours').hours;

  // Get card title from suggestions if available
  const cardTitle = classified.selectedCardId && classified.suggestions.length > 0
    ? classified.suggestions.find(s => s.cardId === classified.selectedCardId)?.cardTitle || null
    : null;

  return {
    accountId,
    calendarId: event.calendarId,
    eventId: event.id,
    instanceKey: event.instanceKey,
    summary: event.summary,
    date: startDt.toFormat('cccc, LLL d'),
    timeRange: `${startDt.toFormat('h:mm a')} - ${endDt.toFormat('h:mm a')}`,
    durationHours: Math.round(durationHours * 10) / 10,
    status: classified.status,
    selectedCardId: classified.selectedCardId,
    selectedSkip: classified.selectedSkip,
    suggestions: classified.suggestions,
    rememberChoice: false,
    ruleMatchValue: event.summary,
    // Frontend ClassifiedEvent compatibility
    event: {
      id: event.id,
      summary: event.summary,
      start: event.start,
      end: event.end,
      calendarId: event.calendarId,
    },
    cardId: classified.selectedCardId,
    cardTitle,
    source: classified.source,
    confidence: classified.confidence,
  };
}

async function calculateThemeSummaries(
  userId: number,
  classified: ClassifiedEvent[]
): Promise<ThemeSummary[]> {
  // Get themes
  const themes = await prisma.card.findMany({
    where: { userId, unitType: 'THEME' },
  });

  // Get card -> theme mapping
  const cards = await prisma.card.findMany({
    where: {
      userId,
      unitType: { in: ['ACTION_GATE', 'ACTION_EXPERIMENT', 'ACTION_ROUTINE', 'ACTION_OPS'] },
    },
    select: { id: true, parentId: true },
  });
  const cardToTheme = new Map(cards.map((c) => [c.id, c.parentId]));

  // Calculate actual hours per theme
  const themeHours = new Map<number, number>();
  for (const c of classified) {
    if (c.selectedCardId) {
      const themeId = cardToTheme.get(c.selectedCardId);
      if (themeId) {
        const startDt = DateTime.fromISO(c.event.start.dateTime || c.event.start.date!);
        const endDt = DateTime.fromISO(c.event.end.dateTime || c.event.end.date!);
        const hours = endDt.diff(startDt, 'hours').hours;
        themeHours.set(themeId, (themeHours.get(themeId) || 0) + hours);
      }
    }
  }

  const colors = ['#6B7FD7', '#27AE60', '#9B59B6', '#F39C12', '#E74C3C'];

  return themes.map((theme, i) => {
    const actualHours = Math.round((themeHours.get(theme.id) || 0) * 10) / 10;
    const plannedHours = 10; // TODO: Get from season allocations
    return {
      themeId: theme.id,
      themeName: theme.title,
      color: colors[i % colors.length],
      actualHours,
      plannedHours,
      percentComplete: plannedHours > 0 ? Math.round((actualHours / plannedHours) * 100) : 0,
    };
  });
}


// ============================================
// Commit Review
// ============================================

export interface CommitReviewInput {
  weekStart: string;
  decisions: Array<{
    accountId: string;
    calendarId: string;
    eventId: string;
    instanceKey: string;
    cardId: number | null; // null = skip
    skip?: boolean;
    // Can be boolean (use event title as match value) or object with explicit values
    createRule?: boolean | {
      matchType: string;
      matchValue: string;
    };
    eventTitle?: string; // Used when createRule is boolean
  }>;
}

export interface CommitReviewResult {
  timeLoggedCount: number;
  skippedCount: number;
  rulesCreated: number;
}

export async function commitReview(
  userId: number,
  input: CommitReviewInput
): Promise<CommitReviewResult> {
  let timeLoggedCount = 0;
  let skippedCount = 0;
  let rulesCreated = 0;

  for (const decision of input.decisions) {
    // 1. Upsert annotation
    await prisma.calendarEventAnnotation.upsert({
      where: {
        userId_accountId_calendarId_eventId_instanceKey: {
          userId,
          accountId: decision.accountId,
          calendarId: decision.calendarId,
          eventId: decision.eventId,
          instanceKey: decision.instanceKey,
        },
      },
      update: {
        cardId: decision.cardId,
        source: 'manual',
        confidence: 1.0,
      },
      create: {
        userId,
        accountId: decision.accountId,
        calendarId: decision.calendarId,
        eventId: decision.eventId,
        instanceKey: decision.instanceKey,
        cardId: decision.cardId,
        source: 'manual',
        confidence: 1.0,
      },
    });

    if (decision.skip || !decision.cardId) {
      skippedCount++;
      continue;
    }

    // 2. Create time_logged event (idempotent)
    const idempotencyKey = `time_logged:google:${decision.accountId}:${decision.calendarId}:${decision.eventId}:${decision.instanceKey}`;

    try {
      await prisma.event.create({
        data: {
          userId,
          cardId: decision.cardId,
          eventType: 'time_logged',
          idempotencyKey,
          payload: {
            provider: 'google',
            accountId: decision.accountId,
            calendarId: decision.calendarId,
            eventId: decision.eventId,
            instanceKey: decision.instanceKey,
            weekStart: input.weekStart,
          },
        },
      });
      timeLoggedCount++;
    } catch (e: any) {
      if (e.code !== 'P2002') throw e; // Ignore duplicate key
    }

    // 3. Optionally create rule
    if (decision.createRule && decision.cardId) {
      try {
        // Handle both boolean and object formats
        let matchType: string;
        let matchValue: string;
        
        if (typeof decision.createRule === 'boolean') {
          // Use event title as match value with title_contains
          matchType = 'title_contains';
          matchValue = decision.eventTitle || '';
        } else {
          matchType = decision.createRule.matchType;
          matchValue = decision.createRule.matchValue;
        }
        
        if (matchValue) {
          await prisma.eventClassificationRule.create({
            data: {
              userId,
              matchType,
              matchValue,
              cardId: decision.cardId,
            },
          });
          rulesCreated++;
        }
      } catch (e: any) {
        if (e.code !== 'P2002') throw e; // Ignore duplicate
      }
    }
  }

  return { timeLoggedCount, skippedCount, rulesCreated };
}
