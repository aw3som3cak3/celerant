import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-club-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';

const NOW = Date.UTC(2026, 7, 20);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

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
