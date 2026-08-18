import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-elec-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { getDb } from '@/db';
import { replay } from '@/db/replay';
import { SLICE1_SKILL_PREREQS, tierUnlocked, buildDoneCapability } from '@/lib/electronics-builds';
import { buildLadder, buildReadiness, buildAlerts, confirmBuildComplete, confirmCapability } from '@/lib/electronics';
import { __setFluencyMetLookup } from '@/lib/electronics-fluency-seam';
import { BUILDS_BY_ID } from '@/lib/electronics-builds';

const NOW = Date.UTC(2026, 7, 17);
const COIN = 'build_light_led_coin';

// The other agent's 8 electronics skills are not in this worktree, so we STUB the fluency-`met`
// lookup at its seam (electronics-fluency-seam.ts). This is exactly the single integration point the
// human wires to the real signal at merge; production never calls the setter.
function metSet(met: Set<string>) {
  __setFluencyMetLookup((_playerId, code) => met.has(code));
}
const allSkillsMet = () => metSet(new Set(SLICE1_SKILL_PREREQS));

let pid: string;
beforeEach(() => {
  const fam = repo.createFamily(`t+i-${Math.random().toString(36).slice(2)}`, 'x:y', 'x:z', NOW);
  pid = repo.createPlayer(fam, 'mouse', 3, NOW);
  replay(pid);
  allSkillsMet();
});
afterEach(() => {
  __setFluencyMetLookup(null); // restore real wiring
});

describe('readiness detector', () => {
  it('coin build is LOCKED when a skill prerequisite is unmet', () => {
    // Own the breadboard so only the missing skill can be the blocker.
    confirmCapability(pid, 'elec_cap_owns_breadboard', NOW);
    metSet(new Set(SLICE1_SKILL_PREREQS.filter((c) => c !== 'elec_polarity'))); // one skill not met
    const r = buildReadiness(pid, BUILDS_BY_ID.get(COIN)!, repo.electronicsCapabilities(pid));
    expect(r.skillsMet).toBe(false);
    expect(r.status).toBe('locked');
  });

  it('coin build needs NO equipment — a bare throwie is ready on loop + polarity alone', () => {
    allSkillsMet(); // loop + polarity are in the set
    const r = buildReadiness(pid, BUILDS_BY_ID.get(COIN)!, repo.electronicsCapabilities(pid));
    expect(r.skillsMet).toBe(true);
    expect(r.equipmentOwned).toBe(true); // no equipment_prereqs → trivially satisfied
    expect(r.status).toBe('ready'); // ready without a breadboard (a CR2032 self-limits current)
  });

  it('coin build is READY when all skills met, equipment owned, and tier unlocked', () => {
    allSkillsMet();
    confirmCapability(pid, 'elec_cap_owns_breadboard', NOW);
    const r = buildReadiness(pid, BUILDS_BY_ID.get(COIN)!, repo.electronicsCapabilities(pid));
    expect(r.tierUnlocked).toBe(true); // coin is the floor, always unlocked
    expect(r.status).toBe('ready');
  });

  it('a ready build raises a grownup alert carrying the kit BOM and instructions', () => {
    allSkillsMet();
    confirmCapability(pid, 'elec_cap_owns_breadboard', NOW);
    const alerts = buildAlerts(pid);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].buildId).toBe(COIN);
    expect(alerts[0].tier).toBe('coin');
    expect(alerts[0].kitBom.length).toBeGreaterThan(0);
    expect(alerts[0].instructions.length).toBeGreaterThan(0);
  });

  it('no alert fires while the build is not ready (a skill unmet)', () => {
    metSet(new Set()); // no skills met → not ready
    expect(buildAlerts(pid)).toHaveLength(0);
  });
});

describe('completion grants capabilities and climbs the ladder', () => {
  it('confirming completion writes build_<id>_done and grants the next tier', () => {
    allSkillsMet();
    confirmCapability(pid, 'elec_cap_owns_breadboard', NOW);

    // Before: the 3 V tier is locked.
    expect(tierUnlocked('3v', repo.electronicsCapabilities(pid))).toBe(false);

    const res = confirmBuildComplete(pid, COIN, NOW + 1000);
    expect(res).not.toBeNull();
    expect(res!.granted).toContain(buildDoneCapability(COIN));
    expect(res!.granted).toContain('elec_cap_tier_3v');

    const caps = repo.electronicsCapabilities(pid);
    expect(caps.has(buildDoneCapability(COIN))).toBe(true);
    // After: completing the coin rung FLIPS the next tier's lock open.
    expect(tierUnlocked('3v', caps)).toBe(true);

    // The ladder now reports the coin build done.
    expect(buildLadder(pid).find((r) => r.build.id === COIN)!.status).toBe('done');
  });

  it('completion is idempotent — a re-confirm grants nothing new', () => {
    confirmCapability(pid, 'elec_cap_owns_breadboard', NOW);
    confirmBuildComplete(pid, COIN, NOW + 1000);
    const again = confirmBuildComplete(pid, COIN, NOW + 2000);
    expect(again!.granted).toHaveLength(0); // first grant wins
  });

  it('an unknown build id is rejected', () => {
    expect(confirmBuildComplete(pid, 'build_does_not_exist', NOW)).toBeNull();
  });
});

describe('capability facts are θ-INERT', () => {
  it('granting capabilities and completing a build touches no attempt/ability/θ', () => {
    const db = getDb();
    const attemptsBefore = db.prepare('SELECT COUNT(*) c FROM attempt WHERE player_id = ?').get(pid) as { c: number };
    const abilityBefore = db.prepare('SELECT skill_code, theta FROM ability WHERE player_id = ? ORDER BY skill_code').all(pid);

    confirmCapability(pid, 'elec_cap_owns_breadboard', NOW);
    confirmBuildComplete(pid, COIN, NOW + 1000);

    const attemptsAfter = db.prepare('SELECT COUNT(*) c FROM attempt WHERE player_id = ?').get(pid) as { c: number };
    const abilityAfter = db.prepare('SELECT skill_code, theta FROM ability WHERE player_id = ? ORDER BY skill_code').all(pid);

    expect(attemptsAfter.c).toBe(attemptsBefore.c); // no ledger rows written
    expect(abilityAfter).toEqual(abilityBefore); // θ cache byte-for-byte unchanged
  });

  it('replay() does not read or rebuild the capability facts (they survive a rebuild)', () => {
    confirmCapability(pid, 'elec_cap_owns_breadboard', NOW);
    confirmBuildComplete(pid, COIN, NOW + 1000);
    const before = repo.electronicsCapabilities(pid);

    replay(pid); // rebuilds ability + acquisition_state caches only

    const after = repo.electronicsCapabilities(pid);
    expect([...after].sort()).toEqual([...before].sort()); // durable facts persist across a replay
  });
});
