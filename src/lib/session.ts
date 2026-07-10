import 'server-only';
import { createHash, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

// A session authorises a FAMILY (ui-lifecycle §2, §6.6), never a player. The
// cookie carries a random opaque token; the DB stores only its SHA-256 so a
// leaked database does not hand out live sessions.

export const SESSION_COOKIE = 'sid';
export const SESSION_MAX_AGE_MS = 30 * 24 * 3600 * 1000; // 30 days

export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// --- PIN hashing -----------------------------------------------------------
// The spec asks for argon2id; that needs a native build this environment has no
// toolchain for. scrypt is a memory-hard KDF in the Node standard library — a
// reasonable, dependency-free stand-in. (Flagged in the README.)

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(pin, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Reject repeats (1111) and runs (1234, 4321) — ui-lifecycle §4.2.
export function isWeakPin(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return true;
  if (new Set(pin).size === 1) return true;
  const d = [...pin].map(Number);
  const asc = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
  const desc = d.every((v, i) => i === 0 || v === d[i - 1] - 1);
  return asc || desc;
}
