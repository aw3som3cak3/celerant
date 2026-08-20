# Groups — a child belongs to several, and family is one of them

Status: SPEC + FOUNDATION (2026-08-20). Introduces a general **group** concept: a child can be a member
of several groups (a patrol, a class, a club), and their **family is one of them**. Built additively —
the family stays exactly as it is, and the group model unifies it in the *accessor*, not by a risky
rewrite of core identity.

## 0. Why family is NOT just refactored into a generic group
`family` is the load-bearing wall of the app, not merely a grouping:
- **Auth** — a `session` authorises a *family*, never a player (schema §6.6).
- **Identity** — `icon_pair` is the family's unique key; `player.icon` is unique *within a family*.
- **The reward economy** — `family_goal`, `session_allocation`, `bonus_allocation`,
  `family_shared_target` all key on `family_id`. The cooperative goal, the cats, the weekly pass — all
  family-scoped.

Collapsing that into a generic `group` row would touch every one of those. So we don't. **Family remains
the anchor.** The group layer is additive, and the family appears as a group only through a unified
read — see §2.

## 1. The icon-identity finding (why groups need this thought)
Icon uniqueness is enforced **per family**, three layers deep, and it is solid:
- the picker (`IconGrid` `exclude`) hides a sibling's icon — absent, not greyed;
- both APIs (`POST /api/player`, `/api/player/icon`) return `409 icon_taken`;
- the DB has `UNIQUE (family_id, icon)` as a hard backstop; `iconsUsedInFamily` counts *archived* kids
  too, matching the constraint (no app-check-passes-but-DB-throws gap); regression-tested.

**But uniqueness is scoped to `family_id`.** Two children in *different* families can share an icon
(each unique in their own family). The moment a group spans families, an icon alone is no longer a unique
identifier inside that group. **The resolution: the icon is family-scoped *display*; the true key is
`player.id`. In any cross-family (group) context, identity is `icon + family`** (e.g. "🍒 · 🐢🍦 family"),
or a group-local label. We do **not** try to enforce icon-uniqueness across a group — families are made
independently, so that would either block legitimate families or need cross-family coordination at
creation. Not worth it; disambiguate at render time instead.

## 2. The model — general groups + a synthesised family group
```
member_group        a real group BEYOND the family (patrol / class / club). NOT family.
group_membership    player ↔ member_group, many-to-many, with a role (leader/member, future).
family              unchanged — the anchor (auth, identity, rewards).
```
`groupsForPlayer(playerId)` returns the child's groups as **one unified list**: the **family group**
(synthesised from `player.family_id`, `kind:'family'`) followed by every `member_group` they belong to.
So "a child is in several groups, and family is one" is **true through the accessor** — without storing
the family as a `member_group` row or backfilling anything. The family group is *virtual*: it carries the
family's existing machinery (its "group goal" already *is* `family_goal`), and it can never be
accidentally deleted or double-counted.

### Schema (additive, both `CREATE TABLE IF NOT EXISTS` — no migration/backfill)
- `member_group(id, kind, name, created_at, archived_at)` — `kind` is `'patrol' | 'class' | 'club' | …`,
  **never `'family'`** (family is virtual).
- `group_membership(group_id, player_id, role='member', joined_at, PK(group_id, player_id))` — a child in
  several groups has several rows; `role` seeds the future leader/member distinction.

### Repo surface
`createGroup(kind, name)` · `addToGroup(groupId, playerId, role?)` · `removeFromGroup(groupId, playerId)`
· `membersOfGroup(groupId)` → players **with their family**, so a roster can disambiguate a shared icon ·
`groupsForPlayer(playerId)` → `[familyGroup, …memberGroups]` · `memberGroupsForPlayer(playerId)`.

## 3. Guardrails that carry over (motivation.md + the STEAM briefs)
- **Collective, never comparative.** Any future group goal is aggregate-only; **no per-child contribution
  is stored or queryable** — the rule that protects the family cat-room (`motivation §4.1`) applies
  verbatim to any group goal. A group total may show; who filled it may not.
- **A group without a family must be first-class**, never degraded — the STEAM brief's rule. `player_id`
  is the key, so a child can meaningfully belong to a group whether or not their family uses the app.
- **A leader view is a view over many children** — the one surface where "no ranked list" can be lost by
  construction. Any future leader roster returns *set membership, never an ordering* (the fluency-signal
  contract's disclosure rule); it disambiguates by `icon + family`, never by rank.

## 4. What this foundation enables — and what's deferred
**Enables now:** create a patrol/class/club, add children from any families to it, ask "what groups is this
child in?" and "who's in this group?" (with family disambiguation). The general spine STEAM's *patrull/
grupp* sits on.

**Deferred (separate later slices):**
- **Group goals / a group reward economy.** The family reward layer stays family-scoped; a *group*
  collective goal (the STEAM "badhuset") is its own slice — and it must decide granularity (the brief
  leans **grupp over patrull**, since patrols are re-formed and a goal that shatters on every reshuffle is
  a bad goal) and the "where do session units go when a child is in both" question (unchanged progress,
  don't double-count).
- **Roles / leaders + leader auth.** `role` exists in the schema but nothing reads it yet; a leader login
  and the "which of these twelve may work alone at the bench" roster are future.
- **Group PINs / joining flow.** How a child joins a group (invite code? leader adds them?) is a later UX.
- **Membership lifecycle.** A family is effectively permanent; a group membership starts and ends,
  sometimes mid-term (STEAM's open question). For now membership is a simple add/remove.
