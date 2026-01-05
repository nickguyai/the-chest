import { google, calendar_v3 } from 'googleapis';
import {
  CalendarProvider,
  CalendarEvent,
  CalendarInfo,
  CreateEventInput,
  PatchEventInput,
} from './CalendarProvider';
import { getAuthenticatedClient } from './tokenService';

export class GoogleCalendarProvider implements CalendarProvider {
  readonly providerName = 'google';

  private async getCalendarClient(accountId: string): Promise<calendar_v3.Calendar> {
    const auth = await getAuthenticatedClient(accountId);
    return google.calendar({ version: 'v3', auth });
  }

  async listCalendars(accountId: string): Promise<CalendarInfo[]> {
    const calendar = await this.getCalendarClient(accountId);
    const response = await calendar.calendarList.list();

    return (response.data.items || []).map((cal) => ({
      id: cal.id!,
      summary: cal.summary || 'Untitled',
      description: cal.description || undefined,
      timeZone: cal.timeZone || undefined,
      accessRole: cal.accessRole as CalendarInfo['accessRole'],
      primary: cal.primary || false,
      backgroundColor: cal.backgroundColor || undefined,
    }));
  }

  async getEvent(
    accountId: string,
    calendarId: string,
    eventId: string
  ): Promise<CalendarEvent | null> {
    try {
      const calendar = await this.getCalendarClient(accountId);
      const response = await calendar.events.get({ calendarId, eventId });
      return this.normalizeEvent(calendarId, response.data);
    } catch (error: any) {
      if (error.code === 404) return null;
      throw error;
    }
  }

  async listEvents(
    accountId: string,
    calendarId: string,
    timeMin: string,
    timeMax: string
  ): Promise<CalendarEvent[]> {
    const calendar = await this.getCalendarClient(accountId);
    const events: CalendarEvent[] = [];
    let pageToken: string | undefined;

    do {
      const response = await calendar.events.list({
        calendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
        pageToken,
      });

      for (const item of response.data.items || []) {
        events.push(this.normalizeEvent(calendarId, item));
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return events;
  }


  async createEvent(
    accountId: string,
    calendarId: string,
    event: CreateEventInput
  ): Promise<CalendarEvent> {
    const calendar = await this.getCalendarClient(accountId);

    const requestBody: any = {
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: event.start,
      end: event.end,
      extendedProperties: event.extendedProperties,
    };

    // FR-003: Add attendees if provided
    if (event.attendees && event.attendees.length > 0) {
      requestBody.attendees = event.attendees.map(a => ({
        email: a.email,
        displayName: a.displayName,
      }));
    }

    // FR-003: Add conference data if provided (for video links)
    if (event.conferenceData) {
      requestBody.conferenceData = event.conferenceData;
    }

    const response = await calendar.events.insert({
      calendarId,
      requestBody,
      conferenceDataVersion: event.conferenceData ? 1 : undefined,
    });

    return this.normalizeEvent(calendarId, response.data);
  }

  async patchEvent(
    accountId: string,
    calendarId: string,
    eventId: string,
    patch: PatchEventInput,
    _etag?: string
  ): Promise<CalendarEvent> {
    const calendar = await this.getCalendarClient(accountId);

    // Build request body, handling attendees specially
    const requestBody: any = { ...patch };
    if (patch.attendees) {
      requestBody.attendees = patch.attendees.map(a => ({
        email: a.email,
        displayName: a.displayName,
      }));
    }

    // Note: If-Match header for etag would need to be set via request interceptor
    // For now, we skip optimistic concurrency - can add later if needed
    const response = await calendar.events.patch({
      calendarId,
      eventId,
      requestBody,
    });

    return this.normalizeEvent(calendarId, response.data);
  }

  async deleteEvent(
    accountId: string,
    calendarId: string,
    eventId: string
  ): Promise<void> {
    const calendar = await this.getCalendarClient(accountId);
    await calendar.events.delete({ calendarId, eventId });
  }

  // FR-002: Create recurring event
  async createRecurringEvent(
    accountId: string,
    calendarId: string,
    event: {
      summary: string;
      description?: string;
      recurrence: string[]; // RFC 5545 format: ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"]
      startTime: string;    // HH:MM
      duration: number;     // minutes
      location?: string;
      attendees?: Array<{ email: string; displayName?: string }>;
      timeZone?: string;
    }
  ): Promise<CalendarEvent> {
    const calendar = await this.getCalendarClient(accountId);
    
    // Parse start time and create start/end datetimes
    const [hours, minutes] = event.startTime.split(':').map(Number);
    const today = new Date();
    const startDateTime = new Date(today);
    startDateTime.setHours(hours, minutes, 0, 0);

    const endDateTime = new Date(startDateTime);
    endDateTime.setMinutes(endDateTime.getMinutes() + event.duration);

    const timeZone = event.timeZone || 'America/Los_Angeles';

    const requestBody: any = {
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone,
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone,
      },
      recurrence: event.recurrence,
    };

    if (event.attendees && event.attendees.length > 0) {
      requestBody.attendees = event.attendees.map(a => ({
        email: a.email,
        displayName: a.displayName,
      }));
    }

    const response = await calendar.events.insert({
      calendarId,
      requestBody,
    });

    return this.normalizeEvent(calendarId, response.data);
  }

  private normalizeEvent(
    calendarId: string,
    item: calendar_v3.Schema$Event
  ): CalendarEvent {
    const instanceKey =
      item.originalStartTime?.dateTime ||
      item.originalStartTime?.date ||
      item.start?.dateTime ||
      item.start?.date ||
      '';

    return {
      id: item.id!,
      calendarId,
      iCalUID: item.iCalUID!,
      recurringEventId: item.recurringEventId || undefined,
      originalStartTime:
        item.originalStartTime?.dateTime || item.originalStartTime?.date || undefined,
      instanceKey,

      summary: item.summary || '(No title)',
      description: item.description || undefined,
      location: item.location || undefined,

      start: {
        dateTime: item.start?.dateTime || undefined,
        date: item.start?.date || undefined,
        timeZone: item.start?.timeZone || undefined,
      },
      end: {
        dateTime: item.end?.dateTime || undefined,
        date: item.end?.date || undefined,
        timeZone: item.end?.timeZone || undefined,
      },

      organizer: item.organizer
        ? {
            email: item.organizer.email!,
            displayName: item.organizer.displayName || undefined,
          }
        : undefined,

      attendees: item.attendees?.map((a) => ({
        email: a.email!,
        responseStatus: a.responseStatus || undefined,
      })),

      status: (item.status as CalendarEvent['status']) || 'confirmed',
      visibility: item.visibility as CalendarEvent['visibility'],

      etag: item.etag || undefined,
      htmlLink: item.htmlLink || undefined,

      extendedProperties: item.extendedProperties
        ? {
            private: item.extendedProperties.private || undefined,
            shared: item.extendedProperties.shared || undefined,
          }
        : undefined,
    };
  }
}
