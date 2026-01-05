/**
 * Calendar Provider Interface
 * Provider-agnostic abstraction for calendar operations.
 */

export interface CalendarEvent {
  id: string;
  calendarId: string;
  iCalUID: string;
  recurringEventId?: string;
  originalStartTime?: string;
  instanceKey: string; // Computed: originalStartTime || start

  summary: string;
  description?: string;
  location?: string;

  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };

  organizer?: { email: string; displayName?: string };
  attendees?: Array<{ email: string; responseStatus?: string }>;

  status: 'confirmed' | 'tentative' | 'cancelled';
  visibility?: 'default' | 'public' | 'private' | 'confidential';

  etag?: string;
  htmlLink?: string;

  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
}

export interface CalendarInfo {
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
  accessRole: 'owner' | 'writer' | 'reader' | 'freeBusyReader';
  primary?: boolean;
  backgroundColor?: string;
}

export interface CreateEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  extendedProperties?: {
    private?: Record<string, string>;
  };
  // FR-003: Additional event details
  attendees?: Array<{ email: string; displayName?: string }>;
  conferenceData?: {
    createRequest?: { requestId: string };
    entryPoints?: Array<{ entryPointType: string; uri: string }>;
  };
}

export interface PatchEventInput {
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  attendees?: Array<{ email: string; displayName?: string }>;
}


export interface CalendarProvider {
  readonly providerName: string;

  listCalendars(accountId: string): Promise<CalendarInfo[]>;

  getEvent(
    accountId: string,
    calendarId: string,
    eventId: string
  ): Promise<CalendarEvent | null>;

  listEvents(
    accountId: string,
    calendarId: string,
    timeMin: string,
    timeMax: string
  ): Promise<CalendarEvent[]>;

  createEvent(
    accountId: string,
    calendarId: string,
    event: CreateEventInput
  ): Promise<CalendarEvent>;

  patchEvent(
    accountId: string,
    calendarId: string,
    eventId: string,
    patch: PatchEventInput,
    etag?: string
  ): Promise<CalendarEvent>;

  deleteEvent(
    accountId: string,
    calendarId: string,
    eventId: string
  ): Promise<void>;
}
