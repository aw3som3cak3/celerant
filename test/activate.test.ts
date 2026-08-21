import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-activate-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { verifyPin } from '@/lib/session';
import { GET, POST } from '@/app/api/activate/route';

const NOW = Date.UTC(2026, 7, 21);

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/activate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}
function get(token: string) {
  return GET(new NextRequest(`http://localhost/api/activate?t=${encodeURIComponent(token)}`));
}

describe('parent activation (club-bridge §2c)', () => {
  it('GET returns the pending family for a live token, { ok:false } for a bad one', async () => {
    const { activationToken } = repo.provisionPendingFamily([2, 4], NOW);
    const ok = (await get(activationToken).json()) as { ok: boolean; iconPair?: string; children?: unknown[] };
    expect(ok.ok).toBe(true);
    expect(ok.iconPair).toContain('+');
    expect(ok.children).toHaveLength(2);

    const bad = (await get('not-a-real-token').json()) as { ok: boolean };
    expect(bad.ok).toBe(false);
  });

  it('the right token + two distinct PINs flips a pending family to active', async () => {
    const { familyId, activationToken } = repo.provisionPendingFamily([3], NOW);
    expect(repo.isFamilyPending(familyId)).toBe(true);

    const res = await post({ token: activationToken, pin: '1234', parentPin: '5678' });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    expect(repo.isFamilyPending(familyId)).toBe(false);
    const fam = repo.familyById(familyId)!;
    expect(fam.activated_at).not.toBeNull();
    expect(verifyPin('1234', fam.pin_hash)).toBe(true);
    expect(verifyPin('5678', fam.parent_hash)).toBe(true);
  });

  it('a wrong token fails (410) and leaves the family pending', async () => {
    const { familyId } = repo.provisionPendingFamily([2], NOW);
    const res = await post({ token: 'wrong-token-xyz', pin: '1234', parentPin: '5678' });
    expect(res.status).toBe(410);
    expect((await res.json()).ok).toBe(false);
    expect(repo.isFamilyPending(familyId)).toBe(true);
  });

  it('a spent token cannot activate again (one-time)', async () => {
    const { familyId, activationToken } = repo.provisionPendingFamily([2], NOW);
    expect((await (await post({ token: activationToken, pin: '1111', parentPin: '2222' })).json()).ok).toBe(true);
    const again = await post({ token: activationToken, pin: '3333', parentPin: '4444' });
    expect(again.status).toBe(410);
    // The already-set PINs are untouched by the failed second attempt.
    const fam = repo.familyById(familyId)!;
    expect(verifyPin('1111', fam.pin_hash)).toBe(true);
    expect(verifyPin('3333', fam.pin_hash)).toBe(false);
  });

  it('pin === parentPin is rejected (400), family stays pending', async () => {
    const { familyId, activationToken } = repo.provisionPendingFamily([2], NOW);
    const res = await post({ token: activationToken, pin: '1234', parentPin: '1234' });
    expect(res.status).toBe(400);
    expect(repo.isFamilyPending(familyId)).toBe(true);
  });

  it('a changed family iconPair must stay unique (409), then a free pair activates', async () => {
    // Occupy a specific pair with another family.
    repo.createFamily('rocket+anchor', 'salt:pin', 'salt:parent', NOW);
    const { familyId, activationToken } = repo.provisionPendingFamily([2], NOW);

    const clash = await post({ token: activationToken, pin: '1234', parentPin: '5678', iconPair: ['rocket', 'anchor'] });
    expect(clash.status).toBe(409);
    expect((await clash.json()).error).toBe('pair_taken');
    expect(repo.isFamilyPending(familyId)).toBe(true);

    const ok = await post({ token: activationToken, pin: '1234', parentPin: '5678', iconPair: ['kite', 'whale'] });
    expect(ok.status).toBe(200);
    expect(repo.familyById(familyId)!.icon_pair).toBe(['kite', 'whale'].sort().join('+'));
  });

  it('changed child icons must stay distinct within the family (409), then distinct ones activate', async () => {
    const { familyId, activationToken, playerIds } = repo.provisionPendingFamily([2, 4], NOW);
    const [p1, p2] = playerIds;

    const dup = await post({
      token: activationToken,
      pin: '1234',
      parentPin: '5678',
      childIcons: [{ playerId: p1, icon: 'bicycle' }, { playerId: p2, icon: 'bicycle' }],
    });
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toBe('child_icon');
    expect(repo.isFamilyPending(familyId)).toBe(true);

    const ok = await post({
      token: activationToken,
      pin: '1234',
      parentPin: '5678',
      childIcons: [{ playerId: p1, icon: 'bicycle' }, { playerId: p2, icon: 'tractor' }],
    });
    expect(ok.status).toBe(200);
    expect(repo.playerById(p1)!.icon).toBe('bicycle');
    expect(repo.playerById(p2)!.icon).toBe('tractor');
  });

  it('a normal (already-active) family can never be activated (no token to find)', async () => {
    const famId = repo.createFamily('sushi+dolphin', 'salt:pin', 'salt:parent', NOW);
    expect(repo.familyById(famId)!.activation_token_hash).toBeNull();
    // With no activation token minted, no token resolves to it — there is nothing to activate.
    const res = await post({ token: 'anything', pin: '1234', parentPin: '5678' });
    expect(res.status).toBe(410);
  });
});
