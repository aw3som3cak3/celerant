import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-groups-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';

const NOW = Date.UTC(2026, 7, 20);

let famA: string, famB: string, pA: string, pB: string, pB2: string, pA2: string;
beforeEach(() => {
  const s = Math.random().toString(36).slice(2);
  famA = repo.createFamily(`cat-${s}+dog-${s}`, 'h', 'ph', NOW);
  famB = repo.createFamily(`sun-${s}+moon-${s}`, 'h', 'ph', NOW);
  pA = repo.createPlayer(famA, 'star', 3, NOW); // icon 'star' in family A
  pA2 = repo.createPlayer(famA, 'heart', 3, NOW);
  pB = repo.createPlayer(famB, 'star', 4, NOW); // SAME icon 'star', DIFFERENT family — legal within its family
  pB2 = repo.createPlayer(famB, 'comet', 4, NOW); // a DISTINCT icon in family B, for cross-family group tests
});

describe('groups — a child belongs to several, family is one', () => {
  it('groupsForPlayer lists the family group FIRST, then member groups', () => {
    const g = repo.createGroup('patrol', 'Örnpatrullen', NOW);
    repo.addToGroup(g, pA, NOW);
    const groups = repo.groupsForPlayer(pA);
    expect(groups[0].kind).toBe('family'); // the synthesised family group, first
    expect(groups.map((x) => x.kind)).toContain('patrol');
    expect(groups.map((x) => x.id)).toContain(g);
    // A child with no member groups still has exactly their family group.
    expect(repo.groupsForPlayer(pA2).map((x) => x.kind)).toEqual(['family']);
  });

  it('a group spanning families rejects a second member with the SAME icon (icon-uniqueness in a group)', () => {
    const g = repo.createGroup('club', 'Teknikklubben', NOW);
    repo.addToGroup(g, pA, NOW); // icon 'star', family A
    // pB is 'star' in family B — legal within its own family, but the group already uses 'star'.
    expect(() => repo.addToGroup(g, pB, NOW)).toThrow('icon_collision_in_group');
    expect(repo.membersOfGroup(g)).toHaveLength(1); // pB never joined
  });

  it('a group spanning families holds distinct-icon members, each carrying its family for display', () => {
    const g = repo.createGroup('club', 'Teknikklubben', NOW);
    repo.addToGroup(g, pA, NOW); // 'star', family A
    repo.addToGroup(g, pB2, NOW); // 'comet', family B — distinct icon, different family
    const members = repo.membersOfGroup(g);
    expect(members).toHaveLength(2);
    expect(new Set(members.map((m) => m.icon)).size).toBe(2); // icons are distinct in the group
    expect(new Set(members.map((m) => m.familyId)).size).toBe(2); // still cross-family
    expect(new Set(members.map((m) => m.playerId)).size).toBe(2); // player_id is the true key
  });

  it('re-adding the SAME player is idempotent (self is excluded from the icon guard)', () => {
    const g = repo.createGroup('club', 'K', NOW);
    repo.addToGroup(g, pA, NOW);
    expect(() => repo.addToGroup(g, pA, NOW)).not.toThrow();
    expect(repo.membersOfGroup(g)).toHaveLength(1);
  });

  it('iconsUsedInGroup / groupIconsForPlayer expose the group-side exclusion sets', () => {
    const g = repo.createGroup('club', 'K', NOW);
    repo.addToGroup(g, pA, NOW); // 'star'
    repo.addToGroup(g, pB2, NOW); // 'comet'
    expect(repo.iconsUsedInGroup(g)).toEqual(new Set(['star', 'comet']));
    expect(repo.iconsUsedInGroup(g, pA)).toEqual(new Set(['comet'])); // pA excluded
    // For pA: icons used by OTHER members across all pA's groups = just pB2's 'comet'.
    expect(repo.groupIconsForPlayer(pA)).toEqual(new Set(['comet']));
    // pA2 is in no member group → empty set.
    expect(repo.groupIconsForPlayer(pA2)).toEqual(new Set());
  });

  it('membership is many-to-many and add is idempotent', () => {
    const g1 = repo.createGroup('patrol', 'P1', NOW);
    const g2 = repo.createGroup('class', '3A', NOW);
    repo.addToGroup(g1, pA, NOW);
    repo.addToGroup(g2, pA, NOW);
    repo.addToGroup(g1, pA, NOW); // duplicate — no-op
    expect(repo.membersOfGroup(g1)).toHaveLength(1);
    const kinds = repo.groupsForPlayer(pA).map((x) => x.kind).sort();
    expect(kinds).toEqual(['class', 'family', 'patrol']);
  });

  it('removeFromGroup drops just that membership', () => {
    const g = repo.createGroup('patrol', 'P', NOW);
    repo.addToGroup(g, pA, NOW);
    repo.addToGroup(g, pB2, NOW); // distinct icon, so the group guard lets it join
    repo.removeFromGroup(g, pA);
    expect(repo.membersOfGroup(g).map((m) => m.playerId)).toEqual([pB2]);
    // pA keeps its family group.
    expect(repo.groupsForPlayer(pA).map((x) => x.kind)).toEqual(['family']);
  });

  it("createGroup refuses kind='family' (the family group is virtual, never stored)", () => {
    expect(() => repo.createGroup('family', 'nope', NOW)).toThrow();
  });

  it('within a family, an icon is still unique (the DB constraint holds)', () => {
    // The whole reason cross-family sharing is safe: within a family it is impossible.
    expect(() => repo.createPlayer(famA, 'star', 3, NOW)).toThrow(); // 'star' already taken in family A
  });
});
