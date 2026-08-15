import { describe, it, expect } from 'vitest';
import { selectItem, type SelState } from '@/lib/selector';

// A never-seen, seed-fluent skill: θ=2.4 ⇒ p≈0.92 (the band's easy edge), lastSeenAt null.
const mk = (over: Partial<SelState> & { code: string }): SelState => ({
  family: 'f', year: 1, mode: 'component', skillId: 0,
  theta: 2.4, lastSeenAt: null, requires: [], rate: { source: 'provisional', value: 10 },
  aim: 10, volatility: 0, seedFluent: true, earnedFluent: false, ...over,
});

const baseOpts = { now: 1_000_000, previousCode: null, recentCodes: [] as string[], rand: () => 0.5 };
const INTRO = new Set(['double_within_20', 'half_within_20']); // the newly-added-skills list

describe('new-content introduction (novel-intro)', () => {
  it('introduces a never-seen LISTED skill (double/half) the child can likely do', () => {
    const seen = mk({ code: 'add_within_10', theta: 0.85, lastSeenAt: 1_000 }); // in-band, already met
    const novel = mk({ code: 'double_within_20', theta: 2.4, lastSeenAt: null }); // never-seen, easy, listed
    const r = selectItem([seen, novel], { ...baseOpts, introduceCodes: INTRO });
    expect(r.chosen?.code).toBe('double_within_20');
    expect(r.introduced).toBe(true);
  });

  it('does NOT introduce a never-seen easy skill that is NOT on the list (the seed-fluent backlog)', () => {
    // en_color etc.: never-seen and easy, but legitimately skipped — the explicit list is what keeps
    // this backlog from being force-introduced (the whole reason it isn't a never-seen heuristic).
    const seen = mk({ code: 'add_within_10', theta: 0.85, lastSeenAt: 1_000 });
    const backlog = mk({ code: 'en_color', theta: 2.4, lastSeenAt: null });
    const r = selectItem([seen, backlog], { ...baseOpts, introduceCodes: INTRO });
    expect(r.scores.find((s) => s.code === 'en_color')?.novelIntro ?? false).toBe(false);
    expect(r.introduced).toBe(false);
  });

  it('does NOT introduce without introduceCodes (default) — backward compatible', () => {
    const seen = mk({ code: 'add_within_10', theta: 0.85, lastSeenAt: 1_000 });
    const novel = mk({ code: 'double_within_20', theta: 2.4, lastSeenAt: null });
    expect(selectItem([seen, novel], baseOpts).introduced).toBe(false);
  });

  it('does NOT introduce a listed skill that is too hard (p < target) — it waits its turn', () => {
    const seen = mk({ code: 'add_within_10', theta: 0.85, lastSeenAt: 1_000 });
    const hardNew = mk({ code: 'double_within_20', theta: -1, lastSeenAt: null }); // listed but p≈0.27
    const r = selectItem([seen, hardNew], { ...baseOpts, introduceCodes: INTRO });
    expect(r.scores.find((s) => s.code === 'double_within_20')?.novelIntro ?? false).toBe(false);
    expect(r.chosen?.code).toBe('add_within_10');
  });

  it('does NOT re-introduce a listed skill the child has already met', () => {
    const met = mk({ code: 'double_within_20', theta: 2.4, lastSeenAt: 5_000 });
    const other = mk({ code: 'add_within_10', theta: 0.85, lastSeenAt: 1_000 });
    const r = selectItem([met, other], { ...baseOpts, introduceCodes: INTRO });
    expect(r.scores.find((s) => s.code === 'double_within_20')?.novelIntro ?? false).toBe(false);
  });
});
