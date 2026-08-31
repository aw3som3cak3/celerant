import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-recover-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { hashPin, verifyPin } from '@/lib/session';
import { POST } from '@/app/api/login/recover/route';

const NOW = Date.UTC(2026, 7, 31);

let seq = 0;
// A family with entry PIN 1357 and parent PIN 9753; unique icon pair per call.
function makeFamily(entry = '1357', parent = '9753') {
  const pair = `recA${seq}+recB${seq++}`;
  const id = repo.createFamily(pair, hashPin(entry), hashPin(parent), NOW);
  return { id, pair };
}

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/login/recover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('login-screen entry-PIN recovery (parent-PIN-gated)', () => {
  it('the right parent PIN resets the entry PIN', async () => {
    const { id, pair } = makeFamily();
    const res = await post({ iconPair: pair, parentPin: '9753', newPin: '2468' });
    expect(res.status).toBe(200);
    const fam = repo.familyById(id)!;
    expect(verifyPin('2468', fam.pin_hash)).toBe(true);
    expect(verifyPin('1357', fam.pin_hash)).toBe(false);
    expect(verifyPin('9753', fam.parent_hash)).toBe(true); // parent PIN untouched
  });

  it('works regardless of the entered icon order', async () => {
    const { id, pair } = makeFamily();
    const [a, b] = pair.split('+');
    const res = await post({ iconPair: `${b}+${a}`, parentPin: '9753', newPin: '2468' });
    expect(res.status).toBe(200);
    expect(verifyPin('2468', repo.familyById(id)!.pin_hash)).toBe(true);
  });

  it('a wrong parent PIN fails (401 invalid) and changes nothing', async () => {
    const { id, pair } = makeFamily();
    const res = await post({ iconPair: pair, parentPin: '0000', newPin: '2468' });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('invalid');
    expect(verifyPin('1357', repo.familyById(id)!.pin_hash)).toBe(true);
  });

  it('an unknown family is the same uniform 401 (no existence leak)', async () => {
    const res = await post({ iconPair: 'no_such_a+no_such_b', parentPin: '9753', newPin: '2468' });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('invalid');
  });

  it('rejects a weak new PIN (400) after the parent PIN checks out', async () => {
    const { id, pair } = makeFamily();
    const res = await post({ iconPair: pair, parentPin: '9753', newPin: '1234' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('weak_pin');
    expect(verifyPin('1357', repo.familyById(id)!.pin_hash)).toBe(true);
  });

  it('rejects a new entry PIN equal to the parent PIN (400 pins_equal)', async () => {
    const { pair } = makeFamily();
    const res = await post({ iconPair: pair, parentPin: '9753', newPin: '9753' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('pins_equal');
  });

  it('a pending (imported) family cannot be recovered — the PENDING sentinel never verifies', async () => {
    const { familyId } = repo.provisionPendingFamily([2], NOW);
    const pair = repo.familyById(familyId)!.icon_pair;
    const [a, b] = pair.split('+');
    const res = await post({ iconPair: `${a}+${b}`, parentPin: '9753', newPin: '2468' });
    expect(res.status).toBe(401);
    expect(repo.isFamilyPending(familyId)).toBe(true);
  });

  it('throttles after too many attempts on one family (429)', async () => {
    const { pair } = makeFamily();
    // 5 allowed wrong tries, the 6th within the window is blocked.
    for (let i = 0; i < 5; i++) {
      const r = await post({ iconPair: pair, parentPin: '0000', newPin: '2468' });
      expect(r.status).toBe(401);
    }
    const blocked = await post({ iconPair: pair, parentPin: '0000', newPin: '2468' });
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toBe('rate_limited');
  });
});
