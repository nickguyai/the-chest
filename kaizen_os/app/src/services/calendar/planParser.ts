import { prisma } from '../../lib/db';

export interface ParsedBlock {
  dayOffset: number;
  dayName: string;
  startTime: string;
  endTime: string;
  cardId: number | null;
  cardTitle: string;
  description?: string;
  raw: string;
  isMatched: boolean;
}

export interface ParseResult {
  blocks: ParsedBlock[];
  errors: string[];
  matchedCount: number;
  unmatchedCount: number;
}

const TIME_PATTERN = /^-\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s+\[([^\]]+)\]\s*(.*)?$/;
const DAY_PATTERN = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday):$/i;

const DAY_MAP: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export async function parsePlanText(
  userId: number,
  text: string
): Promise<ParseResult> {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const blocks: ParsedBlock[] = [];
  const errors: string[] = [];

  let currentDay = 0;

  // Load user's cards for matching
  const cards = await prisma.card.findMany({
    where: {
      userId,
      unitType: { in: ['ACTION_GATE', 'ACTION_EXPERIMENT', 'ACTION_ROUTINE', 'ACTION_OPS'] },
    },
    select: { id: true, title: true },
  });
  const cardMap = new Map(cards.map((c) => [c.title.toLowerCase(), c]));

  for (const line of lines) {
    // Check for day header
    const dayMatch = line.match(DAY_PATTERN);
    if (dayMatch) {
      currentDay = DAY_MAP[dayMatch[1].toLowerCase()];
      continue;
    }

    // Check for time block
    const timeMatch = line.match(TIME_PATTERN);
    if (timeMatch) {
      const [, startTime, endTime, cardTitle, description] = timeMatch;

      // Try to match card (case-insensitive)
      const card = cardMap.get(cardTitle.toLowerCase());

      blocks.push({
        dayOffset: currentDay,
        dayName: DAY_NAMES[currentDay],
        startTime,
        endTime,
        cardId: card?.id || null,
        cardTitle: card?.title || cardTitle,
        description: description?.trim() || undefined,
        raw: line,
        isMatched: !!card,
      });
    } else if (line.startsWith('-')) {
      errors.push(`Could not parse: "${line}"`);
    }
  }

  const matchedCount = blocks.filter((b) => b.isMatched).length;
  const unmatchedCount = blocks.filter((b) => !b.isMatched).length;

  return { blocks, errors, matchedCount, unmatchedCount };
}
