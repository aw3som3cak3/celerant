import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-groupicon-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';
process.env.CLUB_PROVISION_SECRET = 'club-secret-xyz';

import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { hashToken } from '@/lib/session';
import { POST as changeIcon } from '@/app/api/player/icon/route';
import { POST as provision } from '@/app/api/club/provision/route';
import { GET as activateGet, POST as activate } from '@/app/api/activate/route';

const NOW = Date.UTC(2026, 7, 21);

// A child (family) session cookie for `familyId`.
function withSession(familyId: string): string {
  const raw = `tok-${familyId}-${Math.random()}`;
  // The icon route stamps `Date.now()` (real wall clock), so the session must outlive that, not NOW.
  repo.createSession(hashToken(raw), familyId, false, NOW, Date.now() + 3600_000);
  return raw;
}
function postIcon(familyId: string, body: unknown) {
  return changeIcon(
    new NextRequest('http://localhost/api/player/icon', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `sid=${withSession(familyId)}` },
      body: JSON.stringify(body),
    }),
  );
}
function callProvision(body: unknown) {
  return provision(
    new NextRequest('http://localhost/api/club/provision', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer club-secret-xyz' },
      body: JSON.stringify(body),
    }),
  );
}
function postActivate(body: unknown) {
  return activate(
    new NextRequest('http://localhost/api/activate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('group-icon uniqueness — enforced at icon-change', () => {
  it('rejects (409 icon_taken) an icon used by ANOTHER group member, even when free in the family', async () => {
    const fA = repo.createFamily(`cat-${Math.random()}+dog-${Math.random()}`, 's:p', 's:q', NOW);
    const pA = repo.createPlayer(fA, 'star', 3, NOW);
    const fB = repo.createFamily(`sun-${Math.random()}+moon-${Math.random()}`, 's:p', 's:q', NOW);
    const pB = repo.createPlayer(fB, 'comet', 4, NOW);
    const g = repo.createGroup('club', `K-${Math.random()}`, NOW);
    repo.addToGroup(g, pA, NOW);
    repo.addToGroup(g, pB, NOW); // distinct icon, joins fine

    // 'comet' is NOT used in family A — but a group-mate (pB) uses it, so the change is refused.
    const res = await postIcon(fA, { playerId: pA, icon: 'comet' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('icon_taken');
    expect(repo.playerById(pA)!.icon).toBe('star'); // unchanged

    // A truly free icon still works.
    const ok = await postIcon(fA, { playerId: pA, icon: 'rocket' });
    expect(ok.status).toBe(200);
    expect(repo.playerById(pA)!.icon).toBe('rocket');
  });
});

describe('group-icon uniqueness — enforced at activation', () => {
  it('rejects a repicked child icon that collides with another group member', async () => {
    // Two households provisioned into one group; each child gets a group-distinct icon.
    const res = await callProvision({
      groupName: `Activate-team-${Math.random()}`,
      households: [{ children: [{ schoolYear: 2 }] }, { children: [{ schoolYear: 3 }] }],
      addExisting: [],
    });
    const body = (await res.json()) as {
      households: { activationToken: string; players: string[] }[];
    };
    const [h1, h2] = body.households;
    const otherIcon = repo.playerById(h2.players[0])!.icon; // an icon owned by the OTHER household in the group
    const p1 = h1.players[0];
    expect(repo.playerById(p1)!.icon).not.toBe(otherIcon); // provisioning already made them distinct

    // Activating household 1 and trying to steal household 2's icon collides in the group → 409.
    const clash = await postActivate({
      token: h1.activationToken,
      pin: '1234',
      parentPin: '5678',
      childIcons: [{ playerId: p1, icon: otherIcon }],
    });
    expect(clash.status).toBe(409);
    expect((await clash.json()).error).toBe('child_icon');
    expect(repo.isFamilyPending(repo.playerById(p1)!.family_id)).toBe(true); // nothing was written

    // A free icon activates cleanly.
    const ok = await postActivate({
      token: h1.activationToken,
      pin: '1234',
      parentPin: '5678',
      childIcons: [{ playerId: p1, icon: 'rocket' }],
    });
    expect(ok.status).toBe(200);
    expect(repo.playerById(p1)!.icon).toBe('rocket');
  });

  it('the activate GET returns a per-child exclude set covering group-taken icons', async () => {
    const res = await callProvision({
      groupName: `Exclude-team-${Math.random()}`,
      households: [{ children: [{ schoolYear: 2 }] }, { children: [{ schoolYear: 3 }] }],
      addExisting: [],
    });
    const body = (await res.json()) as { households: { activationToken: string; players: string[] }[] };
    const [h1, h2] = body.households;
    const otherIcon = repo.playerById(h2.players[0])!.icon;

    const getRes = activateGet(
      new NextRequest(`http://localhost/api/activate?t=${encodeURIComponent(h1.activationToken)}`),
    );
    const data = (await getRes.json()) as { children: { playerId: string; icon: string; exclude: string[] }[] };
    const child = data.children[0];
    expect(child.exclude).toContain(otherIcon); // the other household's icon is excluded
    expect(child.exclude).not.toContain(child.icon); // but the child keeps its own
  });
});
