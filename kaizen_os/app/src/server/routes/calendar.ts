import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import { prisma } from '../../lib/db';
import { encryptToken } from '../../lib/crypto';
import { getOAuth2Client } from '../../services/calendar/tokenService';
import { getWeekEventsWithCache } from '../../services/calendar/eventCacheService';

const router = Router();

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

// GET /api/calendar/google/authorize?userId=1
router.get('/google/authorize', (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: userId,
  });
  res.redirect(url);
});

// GET /api/calendar/google/callback
router.get('/google/callback', async (req: Request, res: Response) => {
  const { code, state: userId } = req.query;

  if (!code || !userId) {
    return res.status(400).json({ error: 'Missing code or state' });
  }

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code as string);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Missing tokens in response');
    }

    oauth2Client.setCredentials(tokens);


    // Get user email from token info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    if (!userInfo.email) {
      throw new Error('Could not get user email');
    }

    // Store encrypted tokens
    await prisma.calendarAccount.upsert({
      where: {
        userId_provider_email: {
          userId: parseInt(userId as string, 10),
          provider: 'google',
          email: userInfo.email,
        },
      },
      update: {
        accessTokenEncrypted: encryptToken(tokens.access_token),
        refreshTokenEncrypted: encryptToken(tokens.refresh_token),
        expiresAt: new Date(tokens.expiry_date!),
        scopes: SCOPES,
      },
      create: {
        userId: parseInt(userId as string, 10),
        provider: 'google',
        email: userInfo.email,
        accessTokenEncrypted: encryptToken(tokens.access_token),
        refreshTokenEncrypted: encryptToken(tokens.refresh_token),
        expiresAt: new Date(tokens.expiry_date!),
        scopes: SCOPES,
      },
    });

    res.redirect('/settings?connected=true');
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/settings?error=auth_failed');
  }
});

// GET /api/calendar/accounts
router.get('/accounts', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  const accounts = await prisma.calendarAccount.findMany({
    where: { userId },
    select: {
      id: true,
      provider: true,
      email: true,
      selectedCalendarIds: true,
      writeCalendarId: true,
      createdAt: true,
    },
  });

  res.json(accounts);
});

// DELETE /api/calendar/accounts/:id
router.delete('/accounts/:id', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  try {
    await prisma.calendarAccount.delete({
      where: { id: req.params.id, userId },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(404).json({ error: 'Account not found' });
  }
});

// PUT /api/calendar/accounts/:id/preferences
router.put('/accounts/:id/preferences', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  const { selectedCalendarIds, writeCalendarId } = req.body;

  try {
    const account = await prisma.calendarAccount.update({
      where: { id: req.params.id, userId },
      data: {
        ...(selectedCalendarIds !== undefined && { selectedCalendarIds }),
        ...(writeCalendarId !== undefined && { writeCalendarId }),
      },
      select: {
        id: true,
        provider: true,
        email: true,
        selectedCalendarIds: true,
        writeCalendarId: true,
      },
    });
    res.json(account);
  } catch (error) {
    res.status(404).json({ error: 'Account not found' });
  }
});

// ============================================
// Calendar Provider Endpoints (Phase 3)
// ============================================

import { getProviderForAccount } from '../../services/calendar/providerFactory';

// GET /api/calendar/accounts/:id/calendars
router.get('/accounts/:id/calendars', async (req: Request, res: Response) => {
  try {
    const provider = await getProviderForAccount(req.params.id);
    const calendars = await provider.listCalendars(req.params.id);
    res.json(calendars);
  } catch (error) {
    console.error('List calendars error:', error);
    res.status(500).json({ error: 'Failed to list calendars' });
  }
});

// GET /api/calendar/accounts/:id/events?calendarId=...&timeMin=...&timeMax=...
router.get('/accounts/:id/events', async (req: Request, res: Response) => {
  const { calendarId, timeMin, timeMax } = req.query;

  if (!calendarId || !timeMin || !timeMax) {
    return res.status(400).json({ error: 'calendarId, timeMin, and timeMax are required' });
  }

  try {
    const provider = await getProviderForAccount(req.params.id);
    const events = await provider.listEvents(
      req.params.id,
      calendarId as string,
      timeMin as string,
      timeMax as string
    );
    res.json(events);
  } catch (error) {
    console.error('List events error:', error);
    res.status(500).json({ error: 'Failed to list events' });
  }
});


// ============================================
// Weekly Review Endpoints (Phase 4)
// ============================================

import { getWeekReview, commitReview } from '../../services/calendar/reviewOrchestrator';

// GET /api/calendar/review?weekStart=YYYY-MM-DD
router.get('/review', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  const weekStart = req.query.weekStart as string;
  if (!weekStart) {
    return res.status(400).json({ error: 'weekStart query param required (YYYY-MM-DD)' });
  }

  try {
    const result = await getWeekReview(userId, weekStart);
    res.json(result);
  } catch (error) {
    console.error('Get week review error:', error);
    res.status(500).json({ error: 'Failed to get week review' });
  }
});

// POST /api/calendar/review/reclassify - Force AI reclassification for pending events
router.post('/review/reclassify', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  const weekStart = req.query.weekStart as string;
  if (!weekStart) {
    return res.status(400).json({ error: 'weekStart query param required (YYYY-MM-DD)' });
  }

  try {
    const result = await getWeekReview(userId, weekStart, { forceAI: true });
    res.json(result);
  } catch (error) {
    console.error('Reclassify error:', error);
    res.status(500).json({ error: 'Failed to reclassify events' });
  }
});

// POST /api/calendar/review/commit
router.post('/review/commit', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  try {
    const result = await commitReview(userId, req.body);
    res.json(result);
  } catch (error) {
    console.error('Commit review error:', error);
    res.status(500).json({ error: 'Failed to commit review' });
  }
});


// ============================================
// Weekly Planning Endpoints (Phase 5)
// ============================================

import { previewPlan, commitPlan, getSubmittedTypes, getWeeklyPlannedHours } from '../../services/calendar/planningService';

// POST /api/calendar/plan/preview
router.post('/plan/preview', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  const { text, weekStart } = req.body;
  if (!text || !weekStart) {
    return res.status(400).json({ error: 'text and weekStart are required' });
  }

  try {
    const result = await previewPlan(userId, text, weekStart);
    res.json(result);
  } catch (error) {
    console.error('Preview plan error:', error);
    res.status(500).json({ error: 'Failed to preview plan' });
  }
});

// GET /api/calendar/events/week - Get all events for a week (Phase 8)
router.get('/events/week', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  const weekStart = req.query.weekStart as string;
  if (!weekStart) {
    return res.status(400).json({ error: 'weekStart query param required (YYYY-MM-DD)' });
  }

  const debug = req.query.debug === 'true';
  const forceRefresh = req.query.forceRefresh === 'true';

  try {
    // Use cached events (fetches from Google if cache expired or forceRefresh)
    const cachedEvents = await getWeekEventsWithCache(userId, weekStart, { forceRefresh });
    
    // Transform cached events to match expected format
    const allEvents = cachedEvents.map(e => ({
      id: e.eventId,
      accountId: e.accountId,
      calendarId: e.calendarId,
      summary: e.summary,
      description: e.description,
      location: e.location,
      start: { dateTime: e.startDateTime.toISOString() },
      end: { dateTime: e.endDateTime.toISOString() },
      attendees: e.attendees,
      htmlLink: e.htmlLink,
      recurringEventId: e.recurringEventId,
      iCalUID: e.iCalUID,
    }));

    // Load user's classification rules
    const rules = await prisma.eventClassificationRule.findMany({
      where: { userId, isActive: true },
      include: { card: { select: { id: true, title: true, unitType: true, parentId: true } } },
      orderBy: { priority: 'desc' },
    });

    // Load routine links for classification
    const routineLinks = await prisma.routineCalendarLink.findMany({
      where: { userId },
      include: { card: { select: { id: true, title: true, unitType: true, parentId: true } } },
    });
    const routineLinkMap = new Map(routineLinks.map(l => [l.recurringEventId, l]));

    // Load event annotations for direct event→card links
    const annotations = await prisma.calendarEventAnnotation.findMany({
      where: { userId },
      include: { card: { select: { id: true, title: true, unitType: true, parentId: true } } },
    });
    // Map by eventId for quick lookup
    const annotationMap = new Map(annotations.filter(a => a.card).map(a => [a.eventId, a]));

    // Apply classification rules to events
    const classifiedEvents = allEvents.map(event => {
      const eventTitle = (event.summary || '').trim();
      let classificationSource: string | undefined;
      let classificationConfidence: number | undefined;
      let assignedCardId: number | undefined;
      let assignedCardTitle: string | undefined;
      let assignedCardType: string | undefined;
      let assignedThemeId: number | undefined;

      // Priority 0: Check direct annotations (highest priority - explicit user assignment)
      const annotation = annotationMap.get(event.id);
      if (annotation && annotation.card) {
        assignedCardId = annotation.cardId!;
        assignedCardTitle = annotation.card.title;
        assignedCardType = annotation.card.unitType;
        assignedThemeId = annotation.card.parentId || undefined;
        classificationSource = 'annotation';
        classificationConfidence = 1.0;
      }

      // Priority 1: Check routine links (recurring event match)
      if (!assignedCardId && event.recurringEventId) {
        const routineLink = routineLinkMap.get(event.recurringEventId);
        if (routineLink) {
          assignedCardId = routineLink.cardId;
          assignedCardTitle = routineLink.card.title;
          assignedCardType = routineLink.card.unitType;
          assignedThemeId = routineLink.card.parentId || undefined;
          classificationSource = 'routine_link';
          classificationConfidence = 1.0;
        }
      }

      // Priority 2: Check classification rules
      if (!assignedCardId) {
        for (const rule of rules) {
          let matches = false;
          if (rule.matchType === 'title_exact' && eventTitle === rule.matchValue) {
            matches = true;
          } else if (rule.matchType === 'title_contains' && eventTitle.toLowerCase().includes(rule.matchValue.toLowerCase())) {
            matches = true;
          }
          
          if (matches) {
            assignedCardId = rule.cardId;
            assignedCardTitle = rule.card.title;
            assignedCardType = rule.card.unitType;
            assignedThemeId = (rule.card as any).parentId || undefined;
            classificationSource = 'rule';
            classificationConfidence = 0.9;
            break;
          }
        }
      }

      const result: any = {
        ...event,
        assignedCardId,
        assignedCardTitle,
        assignedCardType,
        assignedThemeId,
        classificationSource,
      };

      // Debug mode: include extra metadata
      if (debug) {
        result.debug = {
          classificationSource,
          classificationConfidence,
          recurringEventId: event.recurringEventId,
          iCalUID: event.iCalUID,
        };
      }

      return result;
    });

    res.json(classifiedEvents);
  } catch (error) {
    console.error('Get week events error:', error);
    res.status(500).json({ error: 'Failed to get week events' });
  }
});

// POST /api/calendar/plan/commit
router.post('/plan/commit', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  try {
    const result = await commitPlan(userId, req.body);
    res.json(result);
  } catch (error: any) {
    console.error('Commit plan error:', error);
    res.status(500).json({ error: error.message || 'Failed to commit plan' });
  }
});

// GET /api/calendar/plan/submitted-types - Get which action types are already submitted for a week
router.get('/plan/submitted-types', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  const weekStart = req.query.weekStart as string;
  if (!weekStart) {
    return res.status(400).json({ error: 'weekStart query param required (YYYY-MM-DD)' });
  }

  try {
    const submittedTypes = await getSubmittedTypes(userId, weekStart);
    res.json(submittedTypes);
  } catch (error) {
    console.error('Get submitted types error:', error);
    res.status(500).json({ error: 'Failed to get submitted types' });
  }
});

// GET /api/calendar/week/planned-hours - Get planned hours summary for a week (FR-001)
router.get('/week/planned-hours', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  const weekStart = req.query.weekStart as string;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return res.status(400).json({ error: 'weekStart query param required (YYYY-MM-DD format)' });
  }

  try {
    const result = await getWeeklyPlannedHours(userId, weekStart);
    res.json(result);
  } catch (error) {
    console.error('Get planned hours error:', error);
    res.status(500).json({ error: 'Failed to calculate planned hours' });
  }
});


// ============================================
// Routine Linking Endpoints (Phase 7)
// ============================================

import {
  linkRoutineToEvent,
  unlinkRoutine,
  getRoutineLinks,
  getRoutineLinkForCard,
  getRecurringEventsForLinking,
  createRecurringEventForRoutine,
} from '../../services/calendar/routineLinkService';

// GET /api/calendar/routines/links - Get all routine links for user
router.get('/routines/links', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  try {
    const links = await getRoutineLinks(userId);
    res.json(links);
  } catch (error) {
    console.error('Get routine links error:', error);
    res.status(500).json({ error: 'Failed to get routine links' });
  }
});

// GET /api/calendar/routines/links/:cardId - Get link for specific card
router.get('/routines/links/:cardId', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  try {
    const link = await getRoutineLinkForCard(userId, parseInt(req.params.cardId, 10));
    res.json(link);
  } catch (error) {
    console.error('Get routine link error:', error);
    res.status(500).json({ error: 'Failed to get routine link' });
  }
});

// GET /api/calendar/routines/recurring-events - Get available recurring events for linking
router.get('/routines/recurring-events', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  try {
    const events = await getRecurringEventsForLinking(userId);
    res.json(events);
  } catch (error) {
    console.error('Get recurring events error:', error);
    res.status(500).json({ error: 'Failed to get recurring events' });
  }
});

// POST /api/calendar/routines/link - Create a routine link
router.post('/routines/link', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  const { cardId, accountId, calendarId, recurringEventId, iCalUid } = req.body;
  if (!cardId || !accountId || !calendarId || !recurringEventId) {
    return res.status(400).json({ error: 'cardId, accountId, calendarId, and recurringEventId are required' });
  }

  try {
    const link = await linkRoutineToEvent(
      userId,
      parseInt(cardId, 10),
      accountId,
      calendarId,
      recurringEventId,
      iCalUid
    );
    res.json(link);
  } catch (error: any) {
    console.error('Create routine link error:', error);
    res.status(400).json({ error: error.message || 'Failed to create routine link' });
  }
});

// POST /api/calendar/routines/create-recurring - FR-002: Create a new recurring event for a routine
router.post('/routines/create-recurring', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  const { cardId, summary, recurrencePattern, daysOfWeek, rrule, startTime, duration, location, description } = req.body;
  
  // Either rrule OR recurrencePattern is required
  if (!cardId || !summary || !startTime || !duration || (!recurrencePattern && !rrule)) {
    return res.status(400).json({ 
      error: 'cardId, summary, startTime, duration, and either recurrencePattern or rrule are required' 
    });
  }

  try {
    const link = await createRecurringEventForRoutine(
      userId,
      parseInt(cardId, 10),
      {
        summary,
        description,
        recurrencePattern,
        daysOfWeek,
        rrule,
        startTime,
        duration: parseInt(duration, 10),
        location,
      }
    );
    res.json(link);
  } catch (error: any) {
    console.error('Create recurring event error:', error);
    res.status(400).json({ error: error.message || 'Failed to create recurring event' });
  }
});

// DELETE /api/calendar/routines/link/:cardId - Remove a routine link
router.delete('/routines/link/:cardId', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  try {
    await unlinkRoutine(userId, parseInt(req.params.cardId, 10));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete routine link error:', error);
    res.status(500).json({ error: 'Failed to delete routine link' });
  }
});


// ============================================
// Classification Rules CRUD Endpoints
// ============================================

// GET /api/calendar/rules - Get all classification rules for user
router.get('/rules', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  try {
    const rules = await prisma.eventClassificationRule.findMany({
      where: { userId },
      include: { card: { select: { id: true, title: true, unitType: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(rules);
  } catch (error) {
    console.error('Get rules error:', error);
    res.status(500).json({ error: 'Failed to get rules' });
  }
});

// POST /api/calendar/rules - Create a new classification rule
router.post('/rules', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  const { matchType, matchValue, cardId, priority, isActive } = req.body;
  if (!matchType || !matchValue || !cardId) {
    return res.status(400).json({ error: 'matchType, matchValue, and cardId are required' });
  }

  try {
    const rule = await prisma.eventClassificationRule.create({
      data: {
        userId,
        matchType,
        matchValue: matchValue.trim(),
        cardId: parseInt(cardId, 10),
        priority: priority ?? 0,
        isActive: isActive ?? true,
      },
      include: { card: { select: { id: true, title: true, unitType: true } } },
    });
    res.status(201).json(rule);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'A rule with this match type and value already exists' });
    }
    console.error('Create rule error:', error);
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

// PUT /api/calendar/rules/:id - Update a classification rule
router.put('/rules/:id', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  const { matchType, matchValue, cardId, priority, isActive } = req.body;

  try {
    // Verify ownership
    const existing = await prisma.eventClassificationRule.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    const rule = await prisma.eventClassificationRule.update({
      where: { id: req.params.id },
      data: {
        ...(matchType !== undefined && { matchType }),
        ...(matchValue !== undefined && { matchValue: matchValue.trim() }),
        ...(cardId !== undefined && { cardId: parseInt(cardId, 10) }),
        ...(priority !== undefined && { priority }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { card: { select: { id: true, title: true, unitType: true } } },
    });
    res.json(rule);
  } catch (error) {
    console.error('Update rule error:', error);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

// DELETE /api/calendar/rules/:id - Delete a classification rule
router.delete('/rules/:id', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  try {
    // Verify ownership
    const existing = await prisma.eventClassificationRule.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    await prisma.eventClassificationRule.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete rule error:', error);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});


// ============================================
// Calendar Event Batch Update Endpoint
// ============================================

// POST /api/calendar/events/batch-update - Update multiple GCal events
router.post('/events/batch-update', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  const { updates } = req.body;
  if (!updates || !Array.isArray(updates)) {
    return res.status(400).json({ error: 'updates array is required' });
  }

  try {
    const results: Array<{ eventId: string; success: boolean; error?: string }> = [];

    for (const update of updates) {
      const { accountId, calendarId, eventId, patch } = update;
      
      if (!accountId || !calendarId || !eventId || !patch) {
        results.push({ eventId: eventId || 'unknown', success: false, error: 'Missing required fields' });
        continue;
      }

      // Verify account belongs to user
      const account = await prisma.calendarAccount.findFirst({
        where: { id: accountId, userId },
      });
      
      if (!account) {
        results.push({ eventId, success: false, error: 'Account not found or unauthorized' });
        continue;
      }

      try {
        const provider = await getProviderForAccount(accountId);
        await provider.patchEvent(accountId, calendarId, eventId, patch);
        results.push({ eventId, success: true });
      } catch (err: any) {
        console.error(`Failed to update event ${eventId}:`, err);
        results.push({ eventId, success: false, error: err.message || 'Update failed' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({ 
      success: successCount === updates.length,
      message: `Updated ${successCount}/${updates.length} events`,
      results 
    });
  } catch (error) {
    console.error('Batch update error:', error);
    res.status(500).json({ error: 'Failed to batch update events' });
  }
});


// ============================================
// Calendar Sync Endpoint
// ============================================

// POST /api/calendar/sync - Sync calendar events for the current/next week
router.post('/sync', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  try {
    const { weekStart: requestedWeekStart } = req.body;
    
    // Get user's calendar accounts
    const accounts = await prisma.calendarAccount.findMany({ where: { userId } });
    
    if (accounts.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No calendar accounts connected',
        eventsSynced: 0 
      });
    }

    // Calculate week start if not provided
    let weekStart = requestedWeekStart;
    if (!weekStart) {
      const now = new Date();
      const weekStartDate = new Date(now);
      weekStartDate.setDate(now.getDate() - now.getDay() + 1); // Monday of current week
      weekStart = weekStartDate.toISOString().split('T')[0];
    }

    // Use getWeekEventsWithCache with forceRefresh to sync and cache events
    const events = await getWeekEventsWithCache(userId, weekStart, { forceRefresh: true });

    res.json({ 
      success: true, 
      message: `Synced ${events.length} events from ${accounts.length} account(s)`,
      eventsSynced: events.length 
    });
  } catch (error) {
    console.error('Calendar sync error:', error);
    res.status(500).json({ error: 'Failed to sync calendar' });
  }
});


// ============================================
// Planning Session Endpoints
// ============================================

import {
  getOrCreatePlanningSession,
  updatePlanningSession,
  commitPlanningSession,
  deletePlanningSession,
} from '../../services/calendar/planningSessionService';

// GET /api/calendar/planning/session?weekStart=YYYY-MM-DD
router.get('/planning/session', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  const weekStart = req.query.weekStart as string;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return res.status(400).json({ error: 'weekStart query param required (YYYY-MM-DD format)' });
  }

  try {
    const session = await getOrCreatePlanningSession(userId, weekStart);
    res.json(session);
  } catch (error) {
    console.error('Get planning session error:', error);
    res.status(500).json({ error: 'Failed to get planning session' });
  }
});

// PUT /api/calendar/planning/session
router.put('/planning/session', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  const { weekStart, actionStates, gcalAssignments } = req.body;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return res.status(400).json({ error: 'weekStart required (YYYY-MM-DD format)' });
  }

  try {
    const session = await updatePlanningSession(userId, weekStart, {
      actionStates,
      gcalAssignments,
    });
    res.json(session);
  } catch (error) {
    console.error('Update planning session error:', error);
    res.status(500).json({ error: 'Failed to update planning session' });
  }
});

// POST /api/calendar/planning/session/commit
router.post('/planning/session/commit', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  const { weekStart } = req.body;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return res.status(400).json({ error: 'weekStart required (YYYY-MM-DD format)' });
  }

  try {
    const session = await commitPlanningSession(userId, weekStart);
    res.json(session);
  } catch (error) {
    console.error('Commit planning session error:', error);
    res.status(500).json({ error: 'Failed to commit planning session' });
  }
});

// DELETE /api/calendar/planning/session?weekStart=YYYY-MM-DD
router.delete('/planning/session', async (req: Request, res: Response) => {
  const userId = parseInt(req.headers['x-user-id'] as string, 10);
  if (!userId) {
    return res.status(400).json({ error: 'x-user-id header required' });
  }

  const weekStart = req.query.weekStart as string;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return res.status(400).json({ error: 'weekStart query param required (YYYY-MM-DD format)' });
  }

  try {
    const deleted = await deletePlanningSession(userId, weekStart);
    res.json({ success: deleted });
  } catch (error) {
    console.error('Delete planning session error:', error);
    res.status(500).json({ error: 'Failed to delete planning session' });
  }
});

export default router;
