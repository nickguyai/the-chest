import { prisma } from '../../lib/db';
import { getProviderForAccount } from './providerFactory';
import { CalendarEvent } from './CalendarProvider';
import { GoogleCalendarProvider } from './GoogleCalendarProvider';

export interface RoutineLinkWithCard {
  id: string;
  cardId: number;
  cardTitle: string;
  accountId: string;
  calendarId: string;
  calendarName: string | null;
  recurringEventId: string;
  iCalUid: string | null;
  createdAt: Date;
  // Event details for display
  eventSummary: string | null;
  eventRecurrence: string | null;
  htmlLink: string | null;
}

export interface RecurringEventOption {
  accountId: string;
  calendarId: string;
  calendarName: string;
  recurringEventId: string;
  iCalUid: string;
  summary: string;
  recurrenceDescription: string;
}

// FR-002: Input for creating a new recurring event
export interface CreateRecurringEventInput {
  summary: string;
  description?: string;
  recurrencePattern?: 'daily' | 'weekly' | 'monthly';
  daysOfWeek?: string[]; // For weekly: ['MO', 'TU', 'WE', 'TH', 'FR']
  rrule?: string;        // Raw RRULE string (takes precedence if provided)
  startTime: string;     // HH:MM
  duration: number;      // minutes
  location?: string;
}

/**
 * Link a routine card to a recurring Google Calendar event.
 * All future instances of this event will auto-classify to the card.
 */
export async function linkRoutineToEvent(
  userId: number,
  cardId: number,
  accountId: string,
  calendarId: string,
  recurringEventId: string,
  iCalUid?: string
) {
  // Verify the card is a routine
  const card = await prisma.card.findUnique({
    where: { id: cardId },
  });
  if (!card || card.unitType !== 'ACTION_ROUTINE') {
    throw new Error('Card must be a routine action');
  }

  return prisma.routineCalendarLink.create({
    data: {
      userId,
      cardId,
      accountId,
      calendarId,
      recurringEventId,
      iCalUid: iCalUid || null,
    },
  });
}

/**
 * Remove the link between a routine card and its calendar event.
 */
export async function unlinkRoutine(userId: number, cardId: number) {
  return prisma.routineCalendarLink.delete({
    where: {
      userId_cardId: { userId, cardId },
    },
  });
}

/**
 * Get all routine links for a user with card details.
 * Note: Does not fetch live event details for performance - use getRoutineLinkForCard for full details.
 */
export async function getRoutineLinks(userId: number): Promise<RoutineLinkWithCard[]> {
  const links = await prisma.routineCalendarLink.findMany({
    where: { userId },
    include: {
      card: { select: { id: true, title: true } },
    },
  });

  return links.map((link) => ({
    id: link.id,
    cardId: link.cardId,
    cardTitle: link.card.title,
    accountId: link.accountId,
    calendarId: link.calendarId,
    calendarName: null,
    recurringEventId: link.recurringEventId,
    iCalUid: link.iCalUid,
    createdAt: link.createdAt,
    eventSummary: null,
    eventRecurrence: null,
    htmlLink: null,
  }));
}

/**
 * Get the routine link for a specific card.
 */
export async function getRoutineLinkForCard(
  userId: number,
  cardId: number
): Promise<RoutineLinkWithCard | null> {
  const link = await prisma.routineCalendarLink.findUnique({
    where: {
      userId_cardId: { userId, cardId },
    },
    include: {
      card: { select: { id: true, title: true } },
    },
  });

  if (!link) return null;

  // Fetch event details and calendar name
  let eventSummary: string | null = null;
  let eventRecurrence: string | null = null;
  let calendarName: string | null = null;
  let htmlLink: string | null = null;

  try {
    const provider = await getProviderForAccount(link.accountId);
    
    // Get calendar name
    const calendars = await provider.listCalendars(link.accountId);
    const calendar = calendars.find(c => c.id === link.calendarId);
    calendarName = calendar?.summary || null;

    // Get event details (use the recurring event ID to get the master event)
    const event = await provider.getEvent(link.accountId, link.calendarId, link.recurringEventId);
    if (event) {
      eventSummary = event.summary;
      eventRecurrence = describeRecurrence(event);
      htmlLink = event.htmlLink || null;
    }
  } catch (error) {
    console.error('Failed to fetch event details for routine link:', error);
  }

  return {
    id: link.id,
    cardId: link.cardId,
    cardTitle: link.card.title,
    accountId: link.accountId,
    calendarId: link.calendarId,
    calendarName,
    recurringEventId: link.recurringEventId,
    iCalUid: link.iCalUid,
    createdAt: link.createdAt,
    eventSummary,
    eventRecurrence,
    htmlLink,
  };
}

/**
 * Fetch recurring events from all connected calendars for linking UI.
 * Returns unique recurring event series (not individual instances).
 */
export async function getRecurringEventsForLinking(
  userId: number
): Promise<RecurringEventOption[]> {
  // Get all connected accounts
  const accounts = await prisma.calendarAccount.findMany({
    where: { userId },
  });

  if (accounts.length === 0) {
    return [];
  }

  // Get existing links to exclude already-linked events
  const existingLinks = await prisma.routineCalendarLink.findMany({
    where: { userId },
  });
  const linkedEventIds = new Set(existingLinks.map((l) => l.recurringEventId));

  const options: RecurringEventOption[] = [];

  // Fetch events from each account
  for (const account of accounts) {
    try {
      const provider = await getProviderForAccount(account.id);
      const calendars = await provider.listCalendars(account.id);

      // Get events from the past month to find recurring series
      const now = new Date();
      const timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      for (const calendar of calendars) {
        const selectedIds = account.selectedCalendarIds as string[];
        if (!selectedIds.includes(calendar.id)) continue;

        const events = await provider.listEvents(account.id, calendar.id, timeMin, timeMax);

        // Find unique recurring event series
        const seenSeries = new Set<string>();

        for (const event of events) {
          if (!event.recurringEventId) continue;
          if (seenSeries.has(event.recurringEventId)) continue;
          if (linkedEventIds.has(event.recurringEventId)) continue;

          seenSeries.add(event.recurringEventId);

          options.push({
            accountId: account.id,
            calendarId: calendar.id,
            calendarName: calendar.summary,
            recurringEventId: event.recurringEventId,
            iCalUid: event.iCalUID,
            summary: event.summary,
            recurrenceDescription: describeRecurrence(event),
          });
        }
      }
    } catch (error) {
      console.error(`Failed to fetch events from account ${account.id}:`, error);
    }
  }

  // Sort by summary
  options.sort((a, b) => a.summary.localeCompare(b.summary));

  return options;
}

/**
 * Generate a human-readable description of the recurrence pattern.
 */
function describeRecurrence(event: CalendarEvent): string {
  // For now, just indicate it's recurring
  // Could parse RRULE in the future for more detail
  const startTime = event.start.dateTime
    ? new Date(event.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'All day';

  return `Recurring at ${startTime}`;
}

/**
 * FR-002: Create a new recurring event and link it to a routine card.
 */
export async function createRecurringEventForRoutine(
  userId: number,
  cardId: number,
  input: CreateRecurringEventInput
): Promise<RoutineLinkWithCard> {
  // Verify the card is a routine
  const card = await prisma.card.findUnique({
    where: { id: cardId, userId },
  });
  if (!card) {
    throw new Error(`Card ${cardId} not found`);
  }
  if (card.unitType !== 'ACTION_ROUTINE') {
    throw new Error(`Card ${cardId} is not a routine`);
  }

  // Get user's write calendar
  const account = await prisma.calendarAccount.findFirst({
    where: { userId, writeCalendarId: { not: null } },
  });
  if (!account || !account.writeCalendarId) {
    throw new Error('No write calendar configured. Please connect a Google account first.');
  }

  // Get user's timezone
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const timeZone = user?.timezone || 'America/Los_Angeles';

  // Build RRULE - use raw rrule if provided, otherwise build from pattern
  let rrule: string;
  if (input.rrule) {
    // Use raw RRULE, ensure it has the RRULE: prefix
    rrule = input.rrule.startsWith('RRULE:') ? input.rrule : `RRULE:${input.rrule}`;
  } else {
    // Build from pattern
    switch (input.recurrencePattern) {
      case 'daily':
        rrule = 'RRULE:FREQ=DAILY';
        break;
      case 'weekly':
        const days = input.daysOfWeek?.length ? input.daysOfWeek.join(',') : 'MO,TU,WE,TH,FR';
        rrule = `RRULE:FREQ=WEEKLY;BYDAY=${days}`;
        break;
      case 'monthly':
        rrule = 'RRULE:FREQ=MONTHLY';
        break;
      default:
        rrule = 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    }
  }

  // Create the recurring event
  const provider = await getProviderForAccount(account.id) as GoogleCalendarProvider;
  const event = await provider.createRecurringEvent(
    account.id,
    account.writeCalendarId,
    {
      summary: input.summary,
      description: input.description,
      recurrence: [rrule],
      startTime: input.startTime,
      duration: input.duration,
      location: input.location,
      timeZone,
    }
  );

  // Create the routine link
  const link = await prisma.routineCalendarLink.create({
    data: {
      userId,
      cardId,
      accountId: account.id,
      calendarId: account.writeCalendarId,
      recurringEventId: event.recurringEventId || event.id,
      iCalUid: event.iCalUID,
    },
    include: {
      card: { select: { id: true, title: true } },
    },
  });

  // Get calendar name for the response
  let calendarName: string | null = null;
  try {
    const calendars = await provider.listCalendars(account.id);
    const calendar = calendars.find(c => c.id === account.writeCalendarId);
    calendarName = calendar?.summary || null;
  } catch { /* ignore */ }

  return {
    id: link.id,
    cardId: link.cardId,
    cardTitle: link.card.title,
    accountId: link.accountId,
    calendarId: link.calendarId,
    calendarName,
    recurringEventId: link.recurringEventId,
    iCalUid: link.iCalUid,
    createdAt: link.createdAt,
    eventSummary: event.summary,
    eventRecurrence: describeRecurrence(event),
    htmlLink: event.htmlLink || null,
  };
}
