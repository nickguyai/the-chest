import { prisma } from '../../lib/db';
import { CalendarEvent } from './CalendarProvider';
import { getAISuggestions } from './aiClassificationService';

export interface CardSuggestion {
  cardId: number;
  cardTitle: string;
  cardType: 'gate' | 'experiment' | 'routine' | 'ops';
  themeName: string;
  confidence: number;
  isAiSuggested: boolean;
}

export interface ClassifiedEvent {
  event: CalendarEvent;
  accountId: string;
  status: 'classified' | 'pending';
  selectedCardId: number | null;
  selectedSkip: boolean;
  suggestions: CardSuggestion[];
  source: 'annotation' | 'rule' | 'routine_link' | 'none';
  confidence: number;
}

interface RuleRecord {
  id: string;
  matchType: string;
  matchValue: string;
  cardId: number;
  priority: number;
}

export interface ClassifyEventsOptions {
  forceAI?: boolean; // Force re-run AI classification even if we have cached suggestions
}

export async function classifyEvents(
  userId: number,
  events: Array<{ event: CalendarEvent; accountId: string }>,
  options: ClassifyEventsOptions = {}
): Promise<ClassifiedEvent[]> {
  const { forceAI = false } = options;
  
  // 1. Load routine links (for recurring event auto-classification)
  const routineLinks = await prisma.routineCalendarLink.findMany({
    where: { userId },
  });
  const routineLinkMap = new Map(routineLinks.map((l) => [l.recurringEventId, l.cardId]));

  // 2. Load existing annotations
  const annotations = await prisma.calendarEventAnnotation.findMany({
    where: { userId },
  });
  const annotationMap = new Map(
    annotations.map((a) => [
      `${a.accountId}:${a.calendarId}:${a.eventId}:${a.instanceKey}`,
      a,
    ])
  );

  // 3. Load active rules
  const rules = await prisma.eventClassificationRule.findMany({
    where: { userId, isActive: true },
    orderBy: { priority: 'desc' },
  });


  // 4. Load all action cards for suggestions
  const actionCards = await prisma.card.findMany({
    where: {
      userId,
      unitType: { in: ['ACTION_GATE', 'ACTION_EXPERIMENT', 'ACTION_ROUTINE', 'ACTION_OPS'] },
      status: { in: ['in_progress', 'not_started'] },
    },
    include: {
      parent: { select: { id: true, title: true } }, // Theme
    },
  });

  const cardMap = new Map(actionCards.map((c) => [c.id, c]));

  // First pass: classify what we can without AI
  const firstPassResults: ClassifiedEvent[] = [];
  const unclassifiedEvents: Array<{ event: CalendarEvent; accountId: string; index: number }> = [];

  events.forEach(({ event, accountId }, index) => {
    const key = `${accountId}:${event.calendarId}:${event.id}:${event.instanceKey}`;

    // Check routine link first (recurring events)
    if (event.recurringEventId && routineLinkMap.has(event.recurringEventId)) {
      const cardId = routineLinkMap.get(event.recurringEventId)!;
      const card = cardMap.get(cardId);
      firstPassResults.push({
        event,
        accountId,
        status: 'classified' as const,
        selectedCardId: cardId,
        selectedSkip: false,
        suggestions: card ? [cardToSuggestion(card, 1.0, false)] : [],
        source: 'routine_link' as const,
        confidence: 1.0,
      });
      return;
    }

    // Check existing annotation
    const annotation = annotationMap.get(key);
    if (annotation) {
      const card = annotation.cardId ? cardMap.get(annotation.cardId) : null;
      firstPassResults.push({
        event,
        accountId,
        status: 'classified' as const,
        selectedCardId: annotation.cardId,
        selectedSkip: annotation.cardId === null && annotation.source === 'manual',
        suggestions: card ? [cardToSuggestion(card, annotation.confidence, false)] : [],
        source: 'annotation' as const,
        confidence: annotation.confidence,
      });
      return;
    }

    // Try rules
    for (const rule of rules) {
      if (matchesRule(event, rule)) {
        const card = cardMap.get(rule.cardId);
        firstPassResults.push({
          event,
          accountId,
          status: 'classified' as const,
          selectedCardId: rule.cardId,
          selectedSkip: false,
          suggestions: card ? [cardToSuggestion(card, 0.9, false)] : [],
          source: 'rule' as const,
          confidence: 0.9,
        });
        return;
      }
    }

    // Mark as unclassified for AI processing
    unclassifiedEvents.push({ event, accountId, index });
    firstPassResults.push({
      event,
      accountId,
      status: 'pending' as const,
      selectedCardId: null,
      selectedSkip: false,
      suggestions: [], // Will be filled by AI
      source: 'none' as const,
      confidence: 0,
    });
  });

  // Second pass: Get AI suggestions for unclassified events
  // When forceAI is true, always run AI even if we might have cached suggestions
  if (unclassifiedEvents.length > 0 || forceAI) {
    const eventsForAI = forceAI 
      ? unclassifiedEvents // Could expand to re-classify more if needed
      : unclassifiedEvents;
    
    if (eventsForAI.length > 0) {
      console.log(`Running AI classification for ${eventsForAI.length} events (forceAI=${forceAI})`);
      try {
        const aiSuggestions = await getAISuggestions(
          userId,
          eventsForAI.map(e => ({ event: e.event, accountId: e.accountId })),
          { skipCache: forceAI } // Skip cache when forcing AI reclassification
        );

        // Update suggestions in results
        for (const { event, index } of eventsForAI) {
          const suggestions = aiSuggestions.get(event.summary);
          if (suggestions && suggestions.length > 0) {
            firstPassResults[index].suggestions = suggestions;
          } else {
            // Fallback to keyword matching
            firstPassResults[index].suggestions = generateKeywordSuggestions(event, actionCards);
          }
        }
      } catch (error) {
        console.error('AI suggestions failed, falling back to keyword matching:', error);
        // Fallback for all unclassified
        for (const { event, index } of eventsForAI) {
          firstPassResults[index].suggestions = generateKeywordSuggestions(event, actionCards);
        }
      }
    }
  }

  return firstPassResults;
}

function matchesRule(event: CalendarEvent, rule: RuleRecord): boolean {
  const title = event.summary.toLowerCase();
  const value = rule.matchValue.toLowerCase();

  switch (rule.matchType) {
    case 'title_contains':
      return title.includes(value);
    case 'title_equals':
      return title === value;
    case 'title_regex':
      try {
        return new RegExp(rule.matchValue, 'i').test(event.summary);
      } catch {
        return false;
      }
    case 'organizer_email':
      return event.organizer?.email?.toLowerCase() === value;
    case 'calendar_id':
      return event.calendarId === rule.matchValue;
    default:
      return false;
  }
}

function cardToSuggestion(card: any, confidence: number, isAi: boolean): CardSuggestion {
  const typeMap: Record<string, CardSuggestion['cardType']> = {
    ACTION_GATE: 'gate',
    ACTION_EXPERIMENT: 'experiment',
    ACTION_ROUTINE: 'routine',
    ACTION_OPS: 'ops',
  };

  return {
    cardId: card.id,
    cardTitle: card.title,
    cardType: typeMap[card.unitType] || 'ops',
    themeName: card.parent?.title || 'Unknown',
    confidence,
    isAiSuggested: isAi,
  };
}

function generateKeywordSuggestions(event: CalendarEvent, cards: any[]): CardSuggestion[] {
  // Simple keyword matching for suggestions (fallback when AI fails)
  const title = event.summary.toLowerCase();
  const suggestions: CardSuggestion[] = [];

  for (const card of cards.slice(0, 5)) {
    // Limit to 5 suggestions
    const cardTitle = card.title.toLowerCase();
    let confidence = 0.3; // Base confidence

    // Boost if title words match
    const titleWords = title.split(/\s+/);
    const cardWords = cardTitle.split(/\s+/);
    const matchingWords = titleWords.filter((w: string) => cardWords.some((cw: string) => cw.includes(w) || w.includes(cw)));
    if (matchingWords.length > 0) {
      confidence = Math.min(0.8, 0.3 + matchingWords.length * 0.15);
    }

    suggestions.push(cardToSuggestion(card, confidence, false));
  }

  // Sort by confidence
  suggestions.sort((a, b) => b.confidence - a.confidence);
  return suggestions.slice(0, 3);
}
