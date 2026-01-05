import { google } from 'googleapis';
import { prisma } from '../../lib/db';
import { encryptToken, decryptToken } from '../../lib/crypto';

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export async function getAuthenticatedClient(accountId: string) {
  const account = await prisma.calendarAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) throw new Error('Account not found');

  const oauth2Client = getOAuth2Client();

  const accessToken = decryptToken(account.accessTokenEncrypted);
  const refreshToken = decryptToken(account.refreshTokenEncrypted);

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: account.expiresAt.getTime(),
  });

  // Check if token needs refresh (5 min buffer)
  if (account.expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
    const { credentials } = await oauth2Client.refreshAccessToken();

    await prisma.calendarAccount.update({
      where: { id: accountId },
      data: {
        accessTokenEncrypted: encryptToken(credentials.access_token!),
        expiresAt: new Date(credentials.expiry_date!),
      },
    });

    oauth2Client.setCredentials(credentials);
  }

  return oauth2Client;
}
