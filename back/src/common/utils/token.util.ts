import { createHash, randomBytes } from 'crypto';

export function generateOpaqueToken(bytes = 48): string {
  return randomBytes(bytes).toString('hex');
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
