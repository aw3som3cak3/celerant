import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-club-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';
process.env.CLUB_PROVISION_SECRET = 'club-secret-xyz';

import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { POST as provision } from '@/app/api/club/provision/route';

const NOW = Date.UTC(2026, 7, 20);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function callProvision(body: unknown) {
  return provision(
    new NextRequest('http://localhost/api/club/provision', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer club-secret-xyz' },
      body: JSON.stringify(body),
    }),
  );
}

describe('club bridge — pending families + provisioning', () => {
  it('provisionPendingFamily creates a PENDING family with a free unique pair and N distinct-icon players', () => {
    const { familyId, activationToken, playerIds } = repo.provisionPendingFamily([1, 3, 5], NOW);

    expect(repo.isFamilyPending(familyId)).toBe(true);
    expect(playerIds).toHaveLength(3);

    const players = playerIds.map((id) => repo.playerById(id)!);
    expect(new Set(players.map((p) => p.icon)).size).toBe(3); // distinct icons within the family
    expect(players.map((p) => p.school_year)).toEqual([1, 3, 5]);
    expect(players.every((p) => p.family_id === familyId)).toBe(true);

    const fam = repo.familyById(familyId)!;
    expect(fam.icon_pair).toBe(fam.icon_pair.split('+').sort().join('+')); // canonical
    expect(fam.activated_at).toBeNull();
    // The raw token's SHA-256 matches the stored hash; the raw token is never persisted.
    expect(fam.activation_token_hash).toBe(sha256(activationToken));
    // A pending family cannot be logged into by PIN — its hashes are the colon-free sentinel.
    expect(fam.pin_hash.includes(':')).toBe(false);
    expect(fam.parent_hash.includes(':')).toBe(false);
  });

  it('school years clamp to 0..9', () => {
    const { playerIds } = repo.provisionPendingFamily([-3, 12, 4], NOW);
    expect(playerIds.map((id) => repo.playerById(id)!.school_year)).toEqual([0, 9, 4]);
  });

  it('successive provisions get distinct, unique icon pairs', () => {
    const a = repo.provisionPendingFamily([2], NOW);
    const b = repo.provisionPendingFamily([2], NOW);
    const pa = repo.familyById(a.familyId)!.icon_pair;
    const pb = repo.familyById(b.familyId)!.icon_pair;
    expect(pa).not.toBe(pb);
  });

  it('activateFamily: wrong token returns false and leaves it pending; right token flips it active', () => {
    const { familyId, activationToken } = repo.provisionPendingFamily([3], NOW);

    expect(repo.activateFamily('not-the-token', 'pin', 'parent', NOW)).toBe(false);
    expect(repo.isFamilyPending(familyId)).toBe(true);

    const ok = repo.activateFamily(activationToken, 'realsalt:realpin', 'realsalt:realparent', NOW + 1000);
    expect(ok).toBe(true);
    expect(repo.isFamilyPending(familyId)).toBe(false);

    const fam = repo.familyById(familyId)!;
    expect(fam.pin_hash).toBe('realsalt:realpin');
    expect(fam.parent_hash).toBe('realsalt:realparent');
    expect(fam.activated_at).toBe(NOW + 1000);

    // One-time: the same token can't activate again (already activated).
    expect(repo.activateFamily(activationToken, 'x', 'y', NOW + 2000)).toBe(false);
  });

  it('activateFamily can repick the icon pair (stored canonical)', () => {
    const { familyId, activationToken } = repo.provisionPendingFamily([3], NOW);
    const ok = repo.activateFamily(activationToken, 'p:h', 'q:h', NOW, 'rocket+anchor');
    expect(ok).toBe(true);
    expect(repo.familyById(familyId)!.icon_pair).toBe(['rocket', 'anchor'].sort().join('+'));
  });

  it('a normal createFamily is NEVER pending', () => {
    const s = Math.random().toString(36).slice(2);
    const famId = repo.createFamily(`apple-${s}+pear-${s}`, 'salt:pin', 'salt:parent', NOW);
    expect(repo.isFamilyPending(famId)).toBe(false);
    expect(repo.familyById(famId)!.activation_token_hash).toBeNull();
    expect(repo.familyById(famId)!.activated_at).toBeNull();
  });

  it('provisionPendingFamily with avoidIcons never assigns an avoided icon', () => {
    // Avoid the whole run of icons this provision would otherwise reach for first.
    const a = repo.provisionPendingFamily([2, 4, 6], NOW);
    const wouldUse = a.playerIds.map((id) => repo.playerById(id)!.icon);
    // Now provision again, avoiding exactly those — the new children must dodge every one.
    const avoid = new Set(wouldUse);
    const b = repo.provisionPendingFamily([2, 4, 6], NOW, avoid);
    const gotIcons = b.playerIds.map((id) => repo.playerById(id)!.icon);
    expect(gotIcons.some((k) => avoid.has(k))).toBe(false);
    expect(new Set(gotIcons).size).toBe(3); // still distinct within the family
  });

  it('a full provision run (2 families + an existing player sharing one group) yields all-distinct icons', async () => {
    // An existing Celerant player joins alongside two provisioned households.
    const exFam = repo.createFamily(`owl-${Math.random()}+fox-${Math.random()}`, 'salt:pin', 'salt:parent', NOW);
    const existing = repo.createPlayer(exFam, 'star', 5, NOW);

    const res = await callProvision({
      groupName: 'Distinct-team',
      households: [{ children: [{ schoolYear: 2 }, { schoolYear: 4 }] }, { children: [{ schoolYear: 3 }] }],
      addExisting: [{ playerId: existing }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { groupId: string };

    const icons = repo.membersOfGroup(body.groupId).map((m) => m.icon);
    expect(icons).toHaveLength(4); // 2 + 1 provisioned children + 1 existing
    expect(new Set(icons).size).toBe(4); // every member of the group has a DISTINCT icon
    expect(icons).toContain('star'); // the existing player's fixed icon is preserved
  });

  it('the provision API fails 409 when an addExisting player collides with a group icon', async () => {
    // Seed a group with a member using 'comet', then try to add another 'comet' existing player.
    const groupName = 'Collide-team';
    const f1 = repo.createFamily(`kite-${Math.random()}+whale-${Math.random()}`, 's:p', 's:q', NOW);
    const p1 = repo.createPlayer(f1, 'comet', 3, NOW);
    const seed = await callProvision({ groupName, households: [], addExisting: [{ playerId: p1 }] });
    expect(seed.status).toBe(200);

    const f2 = repo.createFamily(`drum-${Math.random()}+flute-${Math.random()}`, 's:p', 's:q', NOW);
    const p2 = repo.createPlayer(f2, 'comet', 4, NOW); // same icon, different family
    const clash = await callProvision({ groupName, households: [], addExisting: [{ playerId: p2 }] });
    expect(clash.status).toBe(409);
    expect((await clash.json()).error).toBe('icon_collision_in_group');
    // p2 never joined the group.
    const gid = repo.groupByKindName('club', groupName)!;
    expect(repo.membersOfGroup(gid).map((m) => m.playerId)).not.toContain(p2);
  });

  it('provisioned players can join a club group alongside existing players (group spans families)', () => {
    const groupId = repo.groupByKindName('club', 'Kaxås STEAM-team') ?? repo.createGroup('club', 'Kaxås STEAM-team', NOW);
    // idempotent ensure: a second lookup returns the same group.
    expect(repo.groupByKindName('club', 'Kaxås STEAM-team')).toBe(groupId);

    const { playerIds } = repo.provisionPendingFamily([2, 4], NOW);
    for (const pid of playerIds) repo.addToGroup(groupId, pid, NOW);

    const existingFam = repo.createFamily(`whale-${Math.random()}+kite-${Math.random()}`, 'salt:pin', 'salt:parent', NOW);
    const existing = repo.createPlayer(existingFam, 'star', 5, NOW);
    repo.addToGroup(groupId, existing, NOW);

    const members = repo.membersOfGroup(groupId).map((m) => m.playerId);
    expect(members).toEqual(expect.arrayContaining([...playerIds, existing]));
  });
});
