import 'server-only';
import * as repo from '@/db/repo';
import { BY_CODE } from '@/skills';
import { buildStates } from './practice';
import { componentFluent } from './selector';

// The outward fluency signal (fluency-signal-contract.md v0.1). One child, one code — the
// answer to "var står barnet på den här koden?" for the external consumer (the workshop).
// Two independent axes, never flattened to a boolean:
//   met        — has the child MET the code (attempted ≥ once)?  exposure threshold
//   fluent     — is the gate open (componentFluent)?             "may try at the bench"
//   confidence — HOW the rate was established (rate_state)        "adult stops watching" iff 'measured'
export type FluencySignal = {
  met: boolean;
  fluent: boolean;
  confidence: 'measured' | 'provisional' | 'unknown';
};

export function fluencySignal(playerId: string, code: string): FluencySignal {
  const skill = BY_CODE.get(code);
  const player = repo.playerById(playerId);
  if (!skill || !player) return { met: false, fluent: false, confidence: 'unknown' };

  const row = repo.abilities(playerId).get(code);
  const met = row?.last_seen_at != null; // set on the first answered attempt; seeded-only rows are null
  const confidence = (row?.rate_state ?? 'unknown') as FluencySignal['confidence'];

  // fluent = the same gate the selector trusts. Guard the 'unknown' rate: componentFluent
  // THROWS on a component with no measurement (placement not run) — which is exactly the
  // 'unknown' case the consumer treats as "asked too early", so it's simply not fluent.
  const s = buildStates(playerId, player.school_year, skill.subject).find((x) => x.code === code);
  const fluent = s != null && !(s.mode === 'component' && s.rate.source === 'unknown') && componentFluent(s);

  return { met, fluent, confidence };
}
