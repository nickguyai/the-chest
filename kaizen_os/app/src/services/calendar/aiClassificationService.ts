import { prisma } from '../../lib/db';
import { CalendarEvent } from './CalendarProvider';
import { CardSuggestion } from './classificationService';
import {
  callGeminiParallel,
  aggregateVotes,
  getTopActions,
} from '../ai/geminiService';
import { DateTime } from 'luxon';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load prompt template
const PROMPT_TEMPLATE_PATH = path.join(
  __dirname,
  '../../server/prompts/classification_prompt.md'
);

function loadPromptTemplate(): string {
  try {
    return fs.readFileSync(PROMPT_TEMPLATE_PATH, 'utf-8');
  } catch {
    // Fallback inline template if file not found
    return `# Event Classification
## Rules
{{RULES}}
## Previous Classifications
{{PREVIOUS_CLASSIFICATIONS}}
## Actions
{{ACTIONS}}
## Events to Classify
{{EVENTS}}
## Instructions
For each event, suggest TWO action cards. Output XML:
<classifications>
<task name="Event Title"><action>Action 1</action><action>Action 2</action></task>
</classifications>`;
  }
}

interface ActionCard {
  id: number;
  title: string;
  unitType: string;
  parent?: { title: string } | null;
}

// Cache TTL: 24 hours
const CACHE_TTL_HOURS = 24;

async function getCachedSuggestions(userId: number, eventTitle: string): Promise<CardSuggestion[] | null> {
  const cached = await prisma.aiClassificationSuggestion.findUnique({
    where: {
      userId_eventTitle: { userId, eventTitle: eventTitle.trim() },
    },
  });
  
  if (cached && cached.expiresAt > new Date()) {
    console.log(`[AI Cache] Hit for "${eventTitle.slice(0, 30)}..."`);
    return cached.suggestions as unknown as CardSuggestion[];
  }
  
  return null;
}

async function setCachedSuggestions(
  userId: number, 
  eventTitle: string, 
  suggestions: CardSuggestion[],
  prompt?: string,
  rawResponse?: string,
  latencyMs?: number
): Promise<void> {
  const expiresAt = DateTime.now().plus({ hours: CACHE_TTL_HOURS }).toJSDate();
  
  await prisma.aiClassificationSuggestion.upsert({
    where: {
      userId_eventTitle: { userId, eventTitle: eventTitle.trim() },
    },
    update: {
      suggestions: suggestions as any,
      prompt,
      rawResponse,
      latencyMs,
      expiresAt,
    },
    create: {
      userId,
      eventTitle: eventTitle.trim(),
      suggestions: suggestions as any,
      prompt,
      rawResponse,
      latencyMs,
      expiresAt,
    },
  });
}

/**
 * Get AI-powered suggestions for unclassified events
 */
export async function getAISuggestions(
  userId: number,
  events: Array<{ event: CalendarEvent; accountId: string }>,
  options: { skipCache?: boolean } = {}
): Promise<Map<string, CardSuggestion[]>> {
  if (events.length === 0) {
    return new Map();
  }

  const result = new Map<string, CardSuggestion[]>();
  const eventsNeedingAI: Array<{ event: CalendarEvent; accountId: string }> = [];

  // Check database cache first (unless skipCache is true)
  if (!options.skipCache) {
    for (const e of events) {
      const cached = await getCachedSuggestions(userId, e.event.summary);
      if (cached) {
        result.set(e.event.summary, cached);
      } else {
        eventsNeedingAI.push(e);
      }
    }
  } else {
    eventsNeedingAI.push(...events);
  }

  // If all events were cached, return early
  if (eventsNeedingAI.length === 0) {
    console.log(`[AI] All ${events.length} events found in database cache`);
    return result;
  }

  console.log(`[AI] ${eventsNeedingAI.length} events need AI classification (${events.length - eventsNeedingAI.length} cached)`);

  // 1. Load classification rules
  const rules = await prisma.eventClassificationRule.findMany({
    where: { userId, isActive: true },
    include: { card: { select: { title: true } } },
  });

  // 2. Load past 2 weeks of classifications
  const twoWeeksAgo = DateTime.now().minus({ weeks: 2 }).toJSDate();
  const recentAnnotations = await prisma.calendarEventAnnotation.findMany({
    where: {
      userId,
      createdAt: { gte: twoWeeksAgo },
      cardId: { not: null },
    },
    include: { card: { select: { title: true } } },
    take: 100, // Limit to avoid huge prompts
  });

  // 3. Load active action cards
  const actionCards = await prisma.card.findMany({
    where: {
      userId,
      unitType: { in: ['ACTION_GATE', 'ACTION_EXPERIMENT', 'ACTION_ROUTINE', 'ACTION_OPS'] },
      status: { in: ['in_progress', 'not_started'] },
    },
    include: { parent: { select: { title: true } } },
  });

  // 4. Build prompt (only for events needing AI)
  const prompt = buildPrompt(rules, recentAnnotations, actionCards, eventsNeedingAI);

  // 5. Run 5 parallel Gemini calls
  const startTime = Date.now();
  let responses: string[];
  try {
    responses = await callGeminiParallel(prompt, 5);
  } catch (error) {
    console.error('AI classification failed:', error);
    return result; // Return whatever we got from cache
  }
  const latencyMs = Date.now() - startTime;

  if (responses.length === 0) {
    return result;
  }

  // 6. Aggregate votes and get top 2 per event
  const votes = aggregateVotes(responses);
  const topActions = getTopActions(votes, 2);

  // 7. Convert to CardSuggestion format and save to database
  const cardByTitle = new Map(actionCards.map(c => [c.title.toLowerCase(), c]));
  const rawResponse = responses.join('\n---\n'); // Combine all responses for logging

  for (const e of eventsNeedingAI) {
    const eventTitle = e.event.summary;
    const suggestions = topActions.get(eventTitle) || [];
    
    const cardSuggestions: CardSuggestion[] = suggestions
      .map(s => {
        const card = cardByTitle.get(s.action.toLowerCase());
        if (!card) return null;
        
        // Confidence based on vote count (out of 5 runs, each suggesting 2)
        const confidence = Math.min(0.95, 0.5 + (s.votes / 10) * 0.5);
        
        return cardToSuggestion(card, confidence, true);
      })
      .filter((s): s is CardSuggestion => s !== null);

    // Save to database (with prompt and response for debugging)
    await setCachedSuggestions(userId, eventTitle, cardSuggestions, prompt, rawResponse, latencyMs);

    result.set(eventTitle, cardSuggestions);
  }

  console.log(`[AI] Saved ${eventsNeedingAI.length} suggestions to database (latency: ${latencyMs}ms)`);

  return result;
}

function buildPrompt(
  rules: Array<{ matchType: string; matchValue: string; card: { title: string } }>,
  annotations: Array<{ cardId: number | null; card: { title: string } | null }>,
  actions: ActionCard[],
  events: Array<{ event: CalendarEvent; accountId: string }>
): string {
  let template = loadPromptTemplate();

  // Format rules
  const rulesText = rules.length > 0
    ? rules.map(r => `- "${r.matchValue}" (${r.matchType}) → ${r.card.title}`).join('\n')
    : 'No rules defined.';

  // Format previous classifications (we don't have event titles stored, so just show card distribution)
  const classificationCounts = new Map<string, number>();
  for (const a of annotations) {
    if (a.card) {
      classificationCounts.set(a.card.title, (classificationCounts.get(a.card.title) || 0) + 1);
    }
  }
  const prevText = classificationCounts.size > 0
    ? Array.from(classificationCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([title, count]) => `- ${title}: ${count} events`)
        .join('\n')
    : 'No previous classifications.';

  // Format actions
  const actionsText = actions
    .map(a => {
      const type = a.unitType.replace('ACTION_', '');
      const theme = a.parent?.title || 'No Theme';
      return `- [${type}] ${a.title} (Theme: ${theme})`;
    })
    .join('\n');

  // Format events
  const eventsText = events
    .map(e => `- "${e.event.summary}"`)
    .join('\n');

  // Replace placeholders
  template = template
    .replace('{{RULES}}', rulesText)
    .replace('{{PREVIOUS_CLASSIFICATIONS}}', prevText)
    .replace('{{ACTIONS}}', actionsText)
    .replace('{{EVENTS}}', eventsText);

  return template;
}

function cardToSuggestion(card: ActionCard, confidence: number, isAi: boolean): CardSuggestion {
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
