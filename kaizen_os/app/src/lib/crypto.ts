import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

export function encryptToken(plaintext: string): string {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!, 'base64');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

export function decryptToken(encrypted: string): string {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!, 'base64');
  const [ivB64, authTagB64, ciphertext] = encrypted.split(':');

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
