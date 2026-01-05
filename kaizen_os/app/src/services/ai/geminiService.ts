import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

let genAI: GoogleGenerativeAI | null = null;

// Simple logging - writes to console and optionally to file
const LOG_TO_FILE = process.env.LOG_AI_CALLS === 'true';

function logAI(type: 'prompt' | 'response' | 'error', data: any) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, type, data };
  
  // Always log to console in dev
  if (type === 'prompt') {
    console.log(`\n[AI ${timestamp}] === PROMPT ===`);
    console.log(typeof data === 'string' ? data.slice(0, 500) + '...' : data);
  } else if (type === 'response') {
    console.log(`[AI ${timestamp}] === RESPONSE ===`);
    console.log(typeof data === 'string' ? data.slice(0, 500) + '...' : data);
  } else {
    console.error(`[AI ${timestamp}] === ERROR ===`, data);
  }
  
  // Optionally write full logs to file
  if (LOG_TO_FILE) {
    const fs = require('fs');
    const logFile = `ai_classification_${new Date().toISOString().split('T')[0]}.log`;
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  }
}

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return genAI;
}

/**
 * Single Gemini API call
 */
export async function callGemini(prompt: string): Promise<string> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: 'gemini-3-flash-preview' });
  
  logAI('prompt', prompt);
  
  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();
  
  logAI('response', text);
  
  return text;
}

/**
 * Run multiple parallel Gemini calls and return all responses
 */
export async function callGeminiParallel(
  prompt: string,
  runs: number = 5
): Promise<string[]> {
  const promises = Array(runs).fill(null).map(() => callGemini(prompt));
  const results = await Promise.allSettled(promises);
  
  return results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map(r => r.value);
}

/**
 * Parse XML classification response
 * Returns Map<eventTitle, actionTitles[]>
 */
export function parseClassificationXml(xml: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  
  // Extract task blocks
  const taskRegex = /<task\s+name="([^"]+)">([\s\S]*?)<\/task>/gi;
  let taskMatch;
  
  while ((taskMatch = taskRegex.exec(xml)) !== null) {
    const eventTitle = taskMatch[1];
    const taskContent = taskMatch[2];
    
    // Extract action names
    const actionRegex = /<action>([^<]+)<\/action>/gi;
    const actions: string[] = [];
    let actionMatch;
    
    while ((actionMatch = actionRegex.exec(taskContent)) !== null) {
      actions.push(actionMatch[1].trim());
    }
    
    if (actions.length > 0) {
      result.set(eventTitle, actions);
    }
  }
  
  return result;
}

/**
 * Aggregate votes from multiple classification runs
 * Returns Map<eventTitle, Map<actionTitle, voteCount>>
 */
export function aggregateVotes(
  responses: string[]
): Map<string, Map<string, number>> {
  const votes = new Map<string, Map<string, number>>();
  
  for (const response of responses) {
    const parsed = parseClassificationXml(response);
    
    for (const [eventTitle, actions] of parsed) {
      if (!votes.has(eventTitle)) {
        votes.set(eventTitle, new Map());
      }
      const eventVotes = votes.get(eventTitle)!;
      
      for (const action of actions) {
        eventVotes.set(action, (eventVotes.get(action) || 0) + 1);
      }
    }
  }
  
  return votes;
}

/**
 * Get top N actions by vote count for each event
 */
export function getTopActions(
  votes: Map<string, Map<string, number>>,
  topN: number = 2
): Map<string, Array<{ action: string; votes: number }>> {
  const result = new Map<string, Array<{ action: string; votes: number }>>();
  
  for (const [eventTitle, actionVotes] of votes) {
    const sorted = Array.from(actionVotes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([action, voteCount]) => ({ action, votes: voteCount }));
    
    result.set(eventTitle, sorted);
  }
  
  return result;
}
