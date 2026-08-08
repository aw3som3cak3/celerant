import { SKILLS, type Skill, type Subject } from '@/skills';

// Subject scoping (spelling increment 3). A single, memoised place to slice the skill
// graph to ONE subject, so every per-child / per-view iteration filters the same way and
// a maths flow can never surface a spelling skill (or vice versa). It lives in its OWN
// module — importing SKILLS — so a test can vi.mock('@/skills') to inject a fixture skill
// and prove the filter holds; a helper INSIDE skills.ts would close over the real array
// and dodge the mock. Order is preserved (filter is stable), so with today's all-maths
// graph `skillsForSubject('maths')` is the full SKILLS list in order — maths byte-identical.
const _cache = new Map<Subject, Skill[]>();
export function skillsForSubject(subject: Subject): Skill[] {
  let c = _cache.get(subject);
  if (!c) {
    c = SKILLS.filter((s) => s.subject === subject);
    _cache.set(subject, c);
  }
  return c;
}
