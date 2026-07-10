import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { SESSION_COOKIE, hashToken } from '@/lib/session';
import { json, clearCookie, PARENT_COOKIE } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(req: NextRequest) {
  for (const name of [SESSION_COOKIE, PARENT_COOKIE]) {
    const tok = req.cookies.get(name)?.value;
    if (tok) repo.deleteSession(hashToken(tok));
  }
  let res = json({ ok: true });
  res = clearCookie(res, SESSION_COOKIE);
  res = clearCookie(res, PARENT_COOKIE);
  return res;
}
