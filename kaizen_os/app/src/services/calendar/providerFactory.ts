import { CalendarProvider } from './CalendarProvider';
import { GoogleCalendarProvider } from './GoogleCalendarProvider';
import { prisma } from '../../lib/db';

const providers: Record<string, CalendarProvider> = {
  google: new GoogleCalendarProvider(),
};

export async function getProviderForAccount(accountId: string): Promise<CalendarProvider> {
  const account = await prisma.calendarAccount.findUnique({
    where: { id: accountId },
    select: { provider: true },
  });

  if (!account) throw new Error('Account not found');

  const provider = providers[account.provider];
  if (!provider) throw new Error(`Unsupported provider: ${account.provider}`);

  return provider;
}

export function getProvider(providerName: string): CalendarProvider {
  const provider = providers[providerName];
  if (!provider) throw new Error(`Unsupported provider: ${providerName}`);
  return provider;
}
