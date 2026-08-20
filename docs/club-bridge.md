# Club bridge — Kaxåsbygden STEAM-team → Celerant

Status: SPEC (2026-08-20), for review before build. Bridges the tech-club app
(`../membla/kaxasbygden-web`, Next.js + Postgres/Drizzle + Clerk) to Celerant: the children registered in
the club become Celerant families + players, gathered into a **"Kaxås STEAM-team"** group, with parents
invited *later* to activate their family view. Builds on the group foundation (docs/groups.md).

## 0. The boundary is already drawn — and half-built
The club app already declares the integration: `child.celerantId` — *"Avbildningen barn ↔ Celerant-konto.
Vi håller den; Celerant modellerar aldrig vår organisation."* The mapping lives in the **club app**;
Celerant never models the club. Today `celerantId` is a **manual** field in the member editor — the column
and intent exist, the automated provisioning does not. This spec builds that.

The club's model maps cleanly onto Celerant's:

| Club app (`kaxasbygden-web`) | → | Celerant |
|---|---|---|
| `steam_team_registration` (a household: parent(s) + contact) | → | a **family** (pending, until the parent activates) |
| `child` (FK `registrationId`) | → | a **player** (icon + school_year); `child.celerantId = player.id` |
| all active STEAM-team children | → | members of the **Kaxås STEAM-team** group (a `member_group`) |
| `steam_team_registration.parentEmail` | → | the invitation recipient (stays club-side; Celerant never gets it) |

## 1. Privacy: Celerant gets the least it can
Celerant identifies children by **icon, never name**. So the bridge sends Celerant only:
- **age** — `birthYear` (+ month) → `school_year`, and
- **household grouping** — which children share one family.

Celerant never receives names, parent emails, phone numbers, health data (allergies/medications), or
consent records — those stay in the club app (which is GDPR-careful about them by design). Celerant stores
"player uuid X, icon 🍒, åk3"; the club app alone knows that's a named child. This is the boundary working
*for* privacy, not against it.

## 2. What must be built in Celerant (the new capability)
The group + membership plumbing exists (docs/groups.md). The genuinely new thing is **families that exist
before a parent claims them**, plus a way to create them from outside.

### 2a. Pending (unactivated) families
Today `family` requires `pin_hash` + `parent_hash` (a parent sets them at signup). An imported family has
**no parent yet**. So `family` gains an activation state:
- `activation_token` (a one-time secret, hashed) and `activated_at` (NULL = pending).
- PIN columns become nullable *or* hold placeholders until activation; a pending family cannot be logged
  into normally — only through its activation link.
- `icon_pair` is still the unique key: the import **auto-assigns** a free pair; the parent may change it on
  activation. (Uniqueness across imported families is the import's job.)

### 2b. A provisioning entry point (called by the club app, or a one-time import script)
Given a household `{ children: [{ birthYear, birthMonth }], }`, Celerant:
1. creates a **pending family** (auto icon-pair, activation token),
2. creates a **player** per child (auto icon unique within the family, `school_year` from birthYear),
3. adds every player to the **Kaxås STEAM-team** `member_group`,
4. returns `{ familyId, activationUrl, children: [{ playerId }] }`.

The club app stores each `playerId` as `child.celerantId`, and holds `activationUrl` to email the parent
when ready. **Idempotent on re-run:** a child that already has a `celerantId` is skipped (never a duplicate
player). Authenticated like the fluency signal (a shared secret / provisioning token), and it is the ONLY
write Celerant accepts from the club.

### 2c. Parent activation flow
The parent opens `activationUrl` → a Celerant page that: verifies the token, lets them **set the entry +
parent PINs** and confirm/repick the family icon-pair and each child's icon, then stamps `activated_at`.
From then it is an ordinary family they own (the family view, the reward room, everything). The token is
one-time and expires.

### 2d. The group
"Kaxås STEAM-team" is a `member_group` (`kind:'club'` or `'steam_team'`, `name:'Kaxås STEAM-team'`),
created once. Every imported child joins it. It spans families — exactly the cross-family case the group
foundation was built for; identity in any roster view is `icon + family` (docs/groups.md §1).

## 3. Who sends the invitation
**The club app**, not Celerant. It owns the parent's email, the consent record, and the email
infrastructure (`steam_broadcast` / SendGrid). Celerant only mints the `activationUrl`; the club app
decides when and to whom it goes (respecting `acceptCommunication` / consent). Celerant never learns a
parent's address.

## 4. Before a parent activates
A child can **practise immediately** — their icon works, θ accrues, körkort can be earned. The STEAM
brief's rule holds: *a group without a family must be first-class, never degraded.* The family *view* (the
parent's window, the reward room) is simply dormant until activation; the child's progress is already
attached to their (pending) family and follows them into it. A kid is never blocked on their parent.

## 5. Initial import vs. ongoing
- **Initial import (one-time):** read the current club roster (active STEAM-team children grouped by
  registration) → provision each household → write back `celerantId`. This needs **read access to the club
  Postgres** (the `DATABASE_URL`) — not in the repo, so Erik runs the query/import or provides access.
- **Ongoing:** a new registration in the club app calls the provisioning endpoint on save (or a nightly
  sync), so the roster stays mirrored without a manual step.

## 6. Open decisions for review
- **Icons at import:** auto-assign temporary icons (parent repicks on activation) vs. leave icon-less. Lean:
  auto-assign — an icon is how a kid logs in, and it's unique-within-family, which a pending family already
  guarantees.
- **Family granularity:** one Celerant family per `registration` (siblings together). Confirm the club app's
  registration really is one household (it carries one/two parents + their children — yes).
- **celerant_family_id on the club side?** The club stores `celerantId` per child; a `registration.celerant_
  family_id` (+ the activation link) would let it email the parent and show family status. Small club-app
  column; their call.
- **Transport:** a live provisioning **API** (authenticated) vs. a one-time **script** for the existing
  roster + API for new ones. Lean: script now (fastest to a populated group), API next for ongoing.
- **Age mapping:** `birthYear`/`birthMonth` → `school_year` needs the Swedish school-year cutoff; confirm the
  formula (åk = years since the year they turned 7, roughly) or pass school_year explicitly if the club has it.

## 7. What I need to proceed
1. **Read access to the club roster** — a `DATABASE_URL` I can query, or an export of the active STEAM-team
   children (birthYear/month + registrationId), to run the initial import. No names needed.
2. **Confirm the shape** above — especially the pending-family + parent-activation flow, and the
   script-first transport.

Then I build, in order: the Kaxås STEAM-team group → pending families + provisioning → the initial import →
the parent-activation page. The club app's `celerantId` write-back + invitation send are its side (small).
