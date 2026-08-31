import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-parent-pin-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { hashPin, verifyPin, newSessionToken } from '@/lib/session';
import { PARENT_COOKIE, PARENT_MAX_AGE_MS } from '@/lib/api';
import { POST } from '@/app/api/parent/pin/route';

const NOW = Date.UTC(2026, 7, 31);

// A family whose entry PIN is 1357 and parent PIN 9753, plus a live PARENT session
// cookie for it (parent-elevated). Returns the id and the cookie header value.
// A per-call counter keeps the icon pair unique across the shared test DB.
let seq = 0;
function makeFamily(entry = '1357', parent = '9753') {
  const id = repo.createFamily(`famA${seq}+famB${seq++}`, hashPin(entry), hashPin(parent), NOW);
  const { token, tokenHash } = newSessionToken();
  // The route resolves the session against real Date.now(), so anchor the (short,
  // 30-min) parent session on now — not the fixed NOW, which is already expired.
  const t = Date.now();
  repo.createSession(tokenHash, id, true, t, t + PARENT_MAX_AGE_MS);
  return { id, cookie: `${PARENT_COOKIE}=${token}` };
}

function post(cookie: string | null, body: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return POST(new NextRequest('http://localhost/api/parent/pin', { method: 'POST', headers, body: JSON.stringify(body) }));
}

describe('change entry/parent PIN (behind the parent session)', () => {
  it('changes the entry PIN, leaving the parent PIN untouched', async () => {
    const { id, cookie } = makeFamily();
    const res = await post(cookie, { which: 'entry', pin: '2468' });
    expect(res.status).toBe(200);
    const fam = repo.familyById(id)!;
    expect(verifyPin('2468', fam.pin_hash)).toBe(true);
    expect(verifyPin('1357', fam.pin_hash)).toBe(false); // old entry PIN gone
    expect(verifyPin('9753', fam.parent_hash)).toBe(true); // parent PIN untouched
  });

  it('changes the parent PIN, leaving the entry PIN untouched', async () => {
    const { id, cookie } = makeFamily();
    const res = await post(cookie, { which: 'parent', pin: '2468' });
    expect(res.status).toBe(200);
    const fam = repo.familyById(id)!;
    expect(verifyPin('2468', fam.parent_hash)).toBe(true);
    expect(verifyPin('1357', fam.pin_hash)).toBe(true); // entry PIN untouched
  });

  it('rejects a weak PIN (400) and changes nothing', async () => {
    const { id, cookie } = makeFamily();
    const res = await post(cookie, { which: 'entry', pin: '1234' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('weak_pin');
    expect(verifyPin('1357', repo.familyById(id)!.pin_hash)).toBe(true);
  });

  it('rejects an entry PIN equal to the parent PIN (400 pins_equal)', async () => {
    const { id, cookie } = makeFamily();
    const res = await post(cookie, { which: 'entry', pin: '9753' }); // == the parent PIN
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('pins_equal');
    expect(verifyPin('1357', repo.familyById(id)!.pin_hash)).toBe(true);
  });

  it('requires a parent session — no cookie is forbidden (403)', async () => {
    const { id } = makeFamily();
    const res = await post(null, { which: 'entry', pin: '2468' });
    expect(res.status).toBe(403);
    expect(verifyPin('1357', repo.familyById(id)!.pin_hash)).toBe(true);
  });

  it('a plain (non-elevated) family session cannot change a PIN (403)', async () => {
    const id = repo.createFamily('badger+willow', hashPin('1357'), hashPin('9753'), NOW);
    const { token, tokenHash } = newSessionToken();
    const t = Date.now();
    repo.createSession(tokenHash, id, false, t, t + PARENT_MAX_AGE_MS); // parent=false
    const res = await post(`${PARENT_COOKIE}=${token}`, { which: 'entry', pin: '2468' });
    expect(res.status).toBe(403);
    expect(verifyPin('1357', repo.familyById(id)!.pin_hash)).toBe(true);
  });
});
