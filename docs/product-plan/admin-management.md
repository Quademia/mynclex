# Admin Management — permissions, users, tutors

Canonical home for the ADMIN-side management surfaces: admin
permissions, user management, tutor management. Created 2026-07-08
(the readiness multi-curator discussion made it concrete).
Deliberately thin — it captures what is settled and grows as each
surface gets designed/built. Sibling docs own their domains
(readiness-packs.md, payments-and-enrolment.md); this doc owns *who
may do what, and the UIs that manage that*.

---

## 1. Current state (verified 2026-07-08)

**The permission MODEL is real and enforced; the management UIs are
all placeholders.**

- **Vocabulary lives in CODE only** — `lib/access/constants.ts`:
  `BANK_CURATE · USERS_MANAGE · TUTORS_MANAGE · PROGRAMMES_VIEW ·
  PAYMENTS_MANAGE · COMMS_MANAGE · SYSTEM_MANAGE` (+ the
  `AdminPermission` union, so typos are compile errors). The DB has
  **no CHECK constraint** on permission values (early deferral) — a
  deliberate stance this doc keeps: the vocabulary is code, the
  management UI (§3) writes only those constants, which closes the
  typo gap without a migration per new bucket.
- **Grants live in the DATABASE** — `nclex_admin_permissions` (one
  row per user × permission, with `granted_at` / `granted_by`
  provenance). Roles beside it in `nclex_user_roles`
  (STUDENT / TUTOR / ADMIN / SUPER_ADMIN, multi-role).
- **Enforcement is layered** (house rule): TS gates
  (`requireAdminPermission(PERM_X)` etc. via `@/lib/access`) mirror
  SQL RLS (`db/rls.sql` helper: SUPER_ADMIN OR a matching grant row).
  Only SUPER_ADMIN can write grants (RLS-enforced); admins can read
  their own.
- **SUPER_ADMIN bypasses everything** — intentional v1 (see the
  standing note that this gets revisited "when admin tools ship";
  this doc is that thread).
- **Routes**: `/admin/permissions` placeholder already exists and is
  gated on the SUPER_ADMIN *role* (deliberately not a bucket — the
  page that grants buckets can't be one). `/admin/users`,
  `/admin/tutors`, `/admin/applications` are placeholders too.
  Today, granting anything = a manual SQL insert.

---

## 2. New permission: `READINESS_MANAGE` <span>settled 2026-07-08 — Shape B</span>

Several curators will work the same packs; not all of them should be
able to put one on sale or delete one. Two shapes were discussed;
**Sam chose B — "curators compose, managers sell":**

- **`BANK_CURATE` keeps composition** — view packs, run the picker,
  add / remove / reorder members. Composition *is* content work, and
  the picker's adds write reservation flags onto `nclex_bank_items`
  rows, which already require `BANK_CURATE` — so this shape has no
  double-grant trap.
- **`READINESS_MANAGE` gates the commercial lifecycle** — create a
  pack, edit pack basics (title / n / time limit), publish /
  unpublish, delete. Later it covers the sell-side admin surfaces
  (credits / claims views) when the student side lands.

**The mechanical split falls on table lines, which is what makes the
RLS clean** (row-level security can't tell one UPDATE column from
another, so the split couldn't be "basics yes, publish no"):

| Object | Writes gated by |
|---|---|
| `nclex_readiness_packs` (the pack ROW: create · basics · publish flag · delete) | `READINESS_MANAGE` |
| `nclex_readiness_pack_items` (the LINK rows: composition) | `BANK_CURATE` |

Reads stay broad for admins (curators still *see* everything on the
pack pages; lifecycle controls are what they lose).

**Build shape (small slice):** the constant + union entry in
`constants.ts` · TS gates moved on the lifecycle actions
(`createPackAction`, `updatePackBasicsAction`,
`setPackPublishedAction`, `publishAllAndPublishPackAction`,
`deletePackAction`) + the lifecycle UI hidden without the permission ·
one migration re-pointing the pack-row RLS policies · seed the grant
for current admins as appropriate (SUPER_ADMIN needs nothing — the
bypass covers it).

---

## 3. The permissions management UI <span>settled 2026-07-08</span>

Fills the existing `/admin/permissions` placeholder. SUPER_ADMIN-only
(already gated correctly).

- **v1 = a small matrix**: everyone holding the ADMIN role, listed
  with a checkbox per permission bucket; tick/untick = grant/revoke
  rows in `nclex_admin_permissions`. Provenance shown from the
  columns that already exist ("granted by …, on …").
- **Guard rails**: SUPER_ADMIN holders aren't editable here (their
  bypass makes buckets meaningless); no self-lockout paths.
- **New admins, v1 = promote an existing user** — search users, grant
  the ADMIN role, tick buckets. **Invite-a-new-admin-by-email is
  PARKED** — it wants the invite-token + `/welcome` machinery (the
  tutor-invite precedent) plus transactional email; carries an
  `EMAIL-TRIGGER` marker when built, per the standing email rule.

---

## 4. Users & tutor management <span>placeholder sections — grow when opened</span>

Captured so the doc owns the whole wing; nothing settled yet beyond
what exists:

- **Users** (`/admin/users`, `USERS_MANAGE`): directory, per-user
  detail (roles, enrolments, payments), support actions. Unbuilt.
- **Tutors** (`/admin/tutors` + `/admin/applications`,
  `TUTORS_MANAGE`): the vetting pipeline (v1 tutors are manually
  vetted), tutor directory, invite flow. Unbuilt as admin UI —
  tutor invites currently run through the existing token/`/welcome`
  path without an admin surface.
- Revisit the **SUPER_ADMIN RLS bypasses** on tutor tables when these
  surfaces ship (the standing intentional-v1 note).

---

## 5. Sequencing

Not scheduled against the readiness student side yet — settled only
that **§2 (the permission) + §3 (the UI) are one small arc** that
should land before the multi-curator pack workflow starts, since
that's what makes several people on the packs safe and visible
(together with the pack audit READOUT planned in
readiness-packs.md §12).
