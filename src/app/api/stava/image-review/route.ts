import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { sessionFromRequest } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The granska-bilder EYE-vet tool (test family only, same gate as the audio granska). GET returns
// every saved per-image verdict; POST upserts one. Verdicts are global (which picture reads right),
// not per-family — the client builds the full asset list from the English pools itself.
function isReviewer(req: NextRequest, now: number): boolean {
  const s = sessionFromRequest(req, now);
  if (!s) return false;
  const family = repo.familyById(s.familyId);
  return !!family && family.icon_pair.includes('fox') && family.icon_pair.includes('hotdog');
}

export function GET(req: NextRequest) {
  const now = Date.now();
  if (!isReviewer(req, now)) return json({ authorized: false });
  return json({ authorized: true, reviews: repo.getImageReviews() });
}

export async function POST(req: NextRequest) {
  const now = Date.now();
  if (!isReviewer(req, now)) return json({ ok: false }, 403);
  const body = (await req.json().catch(() => null)) as { kind?: string; word?: string; verdict?: string; note?: string } | null;
  if (!body?.kind || !body?.word || (body.verdict !== 'ok' && body.verdict !== 'bad')) return json({ ok: false }, 400);
  repo.setImageReview(body.kind, body.word, body.verdict, body.note?.trim() || null, now);
  return json({ ok: true });
}
