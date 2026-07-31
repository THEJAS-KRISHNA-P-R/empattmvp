/**
 * Minimal signed-cookie admin session.
 *
 * This is deliberately small: one shared admin password (ADMIN_PASSWORD),
 * one HMAC-signed cookie (ADMIN_SESSION_SECRET), no per-admin accounts.
 * That matches what the original spec actually needed for a 10-user demo
 * with a single admin — it had NO admin authentication at all, which is
 * the gap this fixes. If this grows into a real multi-admin product,
 * replace this with Supabase Auth (or similar) and per-row RLS policies
 * instead of hand-rolling more of this.
 *
 * Uses the Web Crypto API (`crypto.subtle`), not `node:crypto`, because
 * this needs to run inside Next.js Middleware, which by default executes
 * on the Edge runtime — `node:crypto` isn't available there, but
 * `crypto.subtle` is available in both Edge and Node.
 */

const COOKIE_NAME = 'empatt_admin_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      'ADMIN_SESSION_SECRET is not set. Generate one with `openssl rand -hex 32` and add it to your environment.'
    );
  }
  return secret;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time string comparison (avoids leaking match length via timing). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Creates a signed session token: `<issuedAtSeconds>.<hmacHex>`. */
export async function createAdminSessionToken(): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000).toString();
  const signature = await hmac(issuedAt);
  return `${issuedAt}.${signature}`;
}

/** Verifies a session token's signature and expiry. */
export async function verifyAdminSessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [issuedAt, signature] = token.split('.');
  if (!issuedAt || !signature) return false;

  const issuedAtNum = Number(issuedAt);
  if (!Number.isFinite(issuedAtNum)) return false;

  const ageSeconds = Math.floor(Date.now() / 1000) - issuedAtNum;
  if (ageSeconds < 0 || ageSeconds > SESSION_MAX_AGE_SECONDS) return false;

  const expectedSignature = await hmac(issuedAt);
  return timingSafeEqual(signature, expectedSignature);
}

/** Verifies the submitted password against ADMIN_PASSWORD using a timing-safe comparison. */
export function verifyAdminPassword(submitted: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    throw new Error('ADMIN_PASSWORD is not set in your environment.');
  }
  return timingSafeEqual(submitted, expected);
}

export const ADMIN_SESSION_COOKIE_NAME = COOKIE_NAME;
export const ADMIN_SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_SECONDS;
