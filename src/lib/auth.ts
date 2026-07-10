import 'server-only';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, hashToken } from './session';
import { PARENT_COOKIE } from './api';
import * as repo from '@/db/repo';

export type Session = { familyId: string; parent: boolean };

function resolve(token: string | undefined, now: number): Session | null {
  if (!token) return null;
  const row = repo.sessionByTokenHash(hashToken(token));
  if (!row || row.expires_at < now) return null;
  if (!repo.familyById(row.family_id)) return null; // family soft-deleted
  return { familyId: row.family_id, parent: row.parent === 1 };
}

// For route handlers.
export function sessionFromRequest(req: NextRequest, now: number): Session | null {
  return resolve(req.cookies.get(SESSION_COOKIE)?.value, now);
}

// The whole authorisation model (§6.6): the requested player must belong to the
// session's family. player_id is a request parameter, never session state.
export function requirePlayer(req: NextRequest, playerId: string, now: number): repo.PlayerRow | null {
  const s = sessionFromRequest(req, now);
  if (!s) return null;
  if (!repo.playerBelongsToFamily(playerId, s.familyId)) return null;
  return repo.playerById(playerId) ?? null;
}

// A parent-elevated session lives in a separate short-lived cookie, so a child
// left on the family session never inherits parent access (ui-lifecycle §4.4).
export function parentFamilyFromRequest(req: NextRequest, now: number): string | null {
  const token = req.cookies.get(PARENT_COOKIE)?.value;
  const s = resolve(token, now);
  return s && s.parent ? s.familyId : null;
}

// For server components.
export async function sessionFromCookies(now: number): Promise<Session | null> {
  const store = await cookies();
  return resolve(store.get(SESSION_COOKIE)?.value, now);
}
