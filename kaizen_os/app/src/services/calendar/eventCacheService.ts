import { prisma } from '../../lib/db';
import { createHash } from 'crypto';
import { getProviderForAccount } from './providerFactory';

const CACHE_TTL_MINUTES = 5;

interface CachedEvent {
  id: string;
  accountId: string;
  calendarId: string;
  eventId: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  startDateTime: Date;
  endDateTime: Date;
  isAllDay: boolean;
  attendees: any[];
  htmlLink: string | null;
  recurringEventId: string | null;
  iCalUID: string | null;
}

/**
 * Generate a content hash for change detection.
 * Hashes: summary, description, location, attendees
 */
function generateContentHash(event: {
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  attendees?: any[];
}): string {
  const content = JSON.stringify({
    summary: event.summary || '',
    description: event.description || '',
    location: event.location || '',
    attendees: (event.attendees || []).map((a: any) => a.email).sort(),
  });
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Get events for a week, using cache when available.
 * Returns cached events if fresh, otherwise fetches from Google and updates cache.
 */
export async function getWeekEventsWithCache(
  userId: number,
  weekStart: string,
  options: { forceRefresh?: boolean } = {}
): Promise<CachedEvent[]> {
  const { forceRefresh = false } = options;

  // Parse week boundaries
  const [year, month, day] = weekStart.split('-').map(Number);
  const startDate = new Date(Date.UTC(year, month - 1, day));
  const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Get user's calendar accounts
  const accounts = await prisma.calendarAccount.findMany({ where: { userId } });
  if (accounts.length === 0) return [];

  const now = new Date();
  const allEvents: CachedEvent[] = [];

  for (const account of accounts) {
    const selectedCalendars = (account.selectedCalendarIds || ['primary']) as string[];

    for (const calendarId of selectedCalendars) {
      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cachedEvents = await prisma.cachedCalendarEvent.findMany({
          where: {
            userId,
            accountId: account.id,
            calendarId,
            startDateTime: { gte: startDate },
            endDateTime: { lte: endDate },
            expiresAt: { gt: now },
          },
        });

        if (cachedEvents.length > 0) {
          // Cache hit - use cached events
          allEvents.push(
            ...cachedEvents.map((e) => ({
              id: e.id,
              accountId: e.accountId,
              calendarId: e.calendarId,
              eventId: e.eventId,
              summary: e.summary,
              description: e.description,
              location: e.location,
              startDateTime: e.startDateTime,
              endDateTime: e.endDateTime,
              isAllDay: e.isAllDay,
              attendees: e.attendees as any[],
              htmlLink: e.htmlLink,
              recurringEventId: e.recurringEventId,
              iCalUID: e.iCalUID,
            }))
          );
          continue;
        }
      }

      // Cache miss or force refresh - fetch from Google
      try {
        const provider = await getProviderForAccount(account.id);
        const events = await provider.listEvents(
          account.id,
          calendarId,
          startDate.toISOString(),
          endDate.toISOString()
        );

        const expiresAt = new Date(now.getTime() + CACHE_TTL_MINUTES * 60 * 1000);

        for (const event of events) {
          const startDt = event.start?.dateTime || event.start?.date;
          const endDt = event.end?.dateTime || event.end?.date;
          if (!startDt || !endDt) continue;

          const isAllDay = !event.start?.dateTime;
          const contentHash = generateContentHash({
            summary: event.summary,
            description: event.description,
            location: event.location,
            attendees: event.attendees,
          });

          // Upsert to cache
          const cached = await prisma.cachedCalendarEvent.upsert({
            where: {
              accountId_calendarId_eventId: {
                accountId: account.id,
                calendarId,
                eventId: event.id,
              },
            },
            update: {
              summary: event.summary || null,
              description: event.description || null,
              location: event.location || null,
              startDateTime: new Date(startDt),
              endDateTime: new Date(endDt),
              isAllDay,
              attendees: event.attendees || [],
              htmlLink: event.htmlLink || null,
              recurringEventId: event.recurringEventId || null,
              iCalUID: event.iCalUID || null,
              contentHash,
              fetchedAt: now,
              expiresAt,
            },
            create: {
              userId,
              accountId: account.id,
              calendarId,
              eventId: event.id,
              summary: event.summary || null,
              description: event.description || null,
              location: event.location || null,
              startDateTime: new Date(startDt),
              endDateTime: new Date(endDt),
              isAllDay,
              attendees: event.attendees || [],
              htmlLink: event.htmlLink || null,
              recurringEventId: event.recurringEventId || null,
              iCalUID: event.iCalUID || null,
              contentHash,
              fetchedAt: now,
              expiresAt,
            },
          });

          allEvents.push({
            id: cached.id,
            accountId: cached.accountId,
            calendarId: cached.calendarId,
            eventId: cached.eventId,
            summary: cached.summary,
            description: cached.description,
            location: cached.location,
            startDateTime: cached.startDateTime,
            endDateTime: cached.endDateTime,
            isAllDay: cached.isAllDay,
            attendees: cached.attendees as any[],
            htmlLink: cached.htmlLink,
            recurringEventId: cached.recurringEventId,
            iCalUID: cached.iCalUID,
          });
        }
      } catch (err) {
        console.error(`Failed to fetch events for calendar ${calendarId}:`, err);
      }
    }
  }

  return allEvents;
}

/**
 * Invalidate cache for a user's calendars.
 * Called on manual sync or when events are modified.
 */
export async function invalidateEventCache(
  userId: number,
  options: { accountId?: string; calendarId?: string; weekStart?: string } = {}
): Promise<number> {
  const where: any = { userId };

  if (options.accountId) where.accountId = options.accountId;
  if (options.calendarId) where.calendarId = options.calendarId;

  if (options.weekStart) {
    const [year, month, day] = options.weekStart.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, day));
    const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    where.startDateTime = { gte: startDate };
    where.endDateTime = { lte: endDate };
  }

  const result = await prisma.cachedCalendarEvent.deleteMany({ where });
  return result.count;
}
