# Tutor Onboarding — becoming a tutor, and staying one

Canonical home for how a person becomes a tutor on MyNclex, what
record that creates, and how their standing changes afterwards
(approval, suspension, re-application). Created 2026-08-21, when an
investigation into "what does the programme side need before real
tutors can use it" found that **there is no way to create a tutor at
all**.

Sibling docs own their domains. `admin-management.md` owns *who may do
what* and the admin permission model — its §4 "Users & tutor
management" points here for everything tutor-onboarding. This doc owns
the tutor record, the four ways in, and the lifecycle.

⚠ **Not in this doc, deliberately:** tutor plans, quotas and billing
(§12), and the shared account surface (§14). Both are named so nobody
assumes they were forgotten.

---

## 1. The problem (verified 2026-08-21)

**Nothing in the product can create a tutor.** All three code paths
that write a role hardcode `'STUDENT'`:

- `app/register/actions.ts` — self-registration
- `app/welcome/actions.ts` — invite / setup acceptance
- `lib/enrolments/actions.ts` — `ensureStudentRole`, on tutor-add

Nothing anywhere inserts `TUTOR`. `/admin/tutors`, `/admin/users` and
`/admin/applications` are 20-line `<Placeholder>` files. The public
nav's "For tutors" is an inert `<span className="link-soon">`
(`components/public/public-nav.tsx`).

RLS already permits the write — `nclex_roles_admin_write` (SUPER_ADMIN
only); the self-insert policy is restricted to `role = 'STUDENT'`. So
**the gap is a missing surface, not a missing permission.** Prod's
single `TUTOR` row was created by hand against the database.

⚠ `admin-management.md` §4 previously claimed tutor invites "run
through the existing token/`/welcome` path without an admin surface".
That was wrong — following it produces a student. Corrected
2026-08-21 (commit `d720f74`).

**What already exists and is reused, not rebuilt:**

- `nclex_users.public_profile` — the tutor's outward-facing bag
  (headline, speciality, years, bio, business branding), added slice
  3.5. **Tutors already edit it themselves** at `/tutor/profile`.
- Multi-role works end to end. `app/router/page.tsx` honours an
  active-role cookie and falls through to `/pick-role`; the tutor
  layout is a plain `roles.includes('TUTOR')` check. Granting TUTOR to
  an existing student account takes effect on next sign-in via the
  existing workspace switcher, with no other wiring.
- `PERM_TUTORS_MANAGE` exists in `lib/access/constants.ts`, and the
  admin sidebar already carries "Tutors" and "Tutor Applications" rows
  gated on it (`lib/nav/admin.ts`). The nav is wired; only the pages
  are empty.

---

## 2. The model — one row per person <span>settled 2026-08-21</span>

**`nclex_tutors`, one row per person**, adopted from the sibling
product MyTeacher's `teacher_profiles` (Sam's call — see §13 for the
alternative that was rejected).

Today "tutor" does not exist in our database. It is an *implication*:
a role string in a join table plus a JSONB bag on `nclex_users` that
only tutors use. There is no row that says "this person is a tutor of
ours", which is why there is nowhere to hang approval, suspension, or
a plan.

**This table is the tutor record. The application is its birth
certificate.** It is not an application table — an application table
is transient and one-row-per-request; this is permanent and
one-row-per-person, and `public_profile` means it is read on public
programme pages by strangers long after the application is forgotten.

It answers three questions:

| Question | Columns | Lifetime |
|---|---|---|
| Who are our tutors, and what do students see? | `public_profile` | permanent, public |
| What is their standing right now? | `status`, `source` | permanent — gates workspace + catalogue |
| How did they get here, and who decided? | application + decision fields | permanent, updated on re-application |

It looks application-heavy by column count because a tutor currently
*is* very little that a user isn't — a bio and a standing. That is an
honest reflection of today, not a shape to pad out with speculative
columns.

---

## 3. Schema

```sql
CREATE TABLE nclex_tutors (
  -- Identity: the person. No email/name copy — that is nclex_users.
  -- (MyTeacher duplicated both; we have a real FK.)
  user_id            UUID PRIMARY KEY REFERENCES nclex_users(id) ON DELETE CASCADE,

  -- ── Axis 1: standing with us (vetting / conduct) ──────────────
  status             TEXT NOT NULL
                     CHECK (status IN ('PENDING','APPROVED','REJECTED','SUSPENDED')),
  -- LEGACY = the hand-made tutors that predate this table; their
  -- approved_at/approved_by are NULL because nobody knows (see 11.1a).
  source             TEXT NOT NULL
                     CHECK (source IN ('SELF_APPLICATION','ADMIN_PROMOTION',
                                       'ADMIN_INVITE','REGISTRATION','LEGACY')),

  -- ── Public-facing (lifted from nclex_users.public_profile) ────
  -- PUBLIC-ONLY by rule; the invariant is encoded in the NAME (see
  -- migration 20260530120000). Never put vetting or private data here.
  public_profile     JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- ── Application payload (what you vet on) ─────────────────────
  organisation       TEXT,
  request_note       TEXT,
  submission_count   SMALLINT NOT NULL DEFAULT 1,
  first_applied_at   TIMESTAMPTZ,
  last_applied_at    TIMESTAMPTZ,

  -- ── Decision ──────────────────────────────────────────────────
  -- approved_* is the permanent vetting fact, set once on FIRST
  -- approval and never overwritten: "who let this person in".
  -- decided_* is the LAST decision of any kind, suspension included.
  approved_at        TIMESTAMPTZ,
  approved_by        UUID REFERENCES nclex_users(id) ON DELETE SET NULL,
  decided_at         TIMESTAMPTZ,
  decided_by         UUID REFERENCES nclex_users(id) ON DELETE SET NULL,
  decision_reason    TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**No money, no expiry, no plan.** See §12 — that omission is load-bearing.

**No `phone_number`.** Every user has a phone; it belongs on
`nclex_users`. The application form merely *populates* it there. The
boundary rule: **a field goes in `nclex_tutors` only if a non-tutor
would never need it.**

### Migrating `public_profile`

Moving the bag off `nclex_users` touches five call sites plus one view:

- `app/(app)/tutor/profile/page.tsx`, `public-profile-form.tsx`,
  `actions.ts`
- `lib/discovery/types.ts` (the `PublicProfile` type stays as-is)
- the `nclex_public_programmes` view (`db/rls.sql`), which selects
  `u.public_profile AS tutor_profile` — the join moves to `nclex_tutors`

Backfill is trivial: 5 tutors on dev, 1 on prod (as at 2026-08-21).

⚠ **Public reads go through views with explicit column lists**
(`nclex_public_programmes`, `nclex_public_units`). That is what makes
it safe to hold public and private data in one row: private columns
are simply never listed. The residual risk is app-side — a careless
`select('*')` could over-fetch. The public surface cannot.

ⓘ This abandons the "any user may show a public profile" intent
recorded on the original column. Nothing non-tutor uses it today, so
the intent was speculative; if student public profiles are ever
wanted, they get their own column.

---

## 4. Invariants

These four rules are what keep the design from being rebuilt. Break
one and the rest stops holding.

1. **The role stays in `nclex_user_roles`.** This table *explains* the
   tutorship; the role *grants* access. Role table = "can they get
   in"; tutors table = "who they are and what we decided". Every
   existing gate (`requireTutor`, the tutor layout, all RLS) keeps
   working untouched.
2. **One grant primitive.** `grantTutorRole(userId, source, decidedBy)`
   — idempotent, additive, **never removes other roles** (a tutor can
   legitimately be a student in someone else's cohort). Every path
   calls it. It is the only code that writes a TUTOR role.
3. **Registration never grants the role.** The account is always
   created as a student or as nothing; TUTOR is written only on
   approval. This is MyTeacher's load-bearing idea, and it is why
   `/register` and `/welcome` need **no changes at all** for the
   self-serve doorway.
4. **Every path writes a row** — including the ones with no approval
   step. Admin promotion writes an `APPROVED` row with
   `source = ADMIN_PROMOTION`, decided by the admin, decided now. It
   is tempting to skip the record when there is nothing to approve;
   don't. Skip it and `/admin/tutors` must read the role table for
   some tutors and this table for others, and every new doorway
   changes the read side. Write it always and the admin screen is one
   query against one table, forever.

---

## 5. The four doorways

All four end at the same act — *grant TUTOR to this person*. They
differ only in how the account comes into existence and whether a
human says yes first.

| `source` | Who starts it | Account | Approval | Slice |
|---|---|---|---|---|
| `ADMIN_PROMOTION` | admin, on an existing user | already exists | implicit — writing the row *is* the decision | 1c |
| `SELF_APPLICATION` | the person, already signed in, from the public "For tutors" page | already exists | required | 2a |
| `REGISTRATION` | the person, register-as-tutor toggle | created now | required | 2d |
| `ADMIN_INVITE` | admin, by email | created by us | implicit | 3 |

**`REGISTRATION` writes `nclex_users` + `nclex_tutors`, and NO role.**
That is the whole mechanism — see §8 for what the applicant then sees.

**Routing rule — which of the two self-serve doorways you land in is
decided by whether you are signed in.** The public "For tutors" page
sends a **logged-out** visitor into register-as-tutor (`REGISTRATION`
— account and application created together, no role) and a **signed-in**
one into the application form (`SELF_APPLICATION` — account already
exists, existing roles kept). Same destination, two entry states.

ⓘ The distinction is thin and **nothing branches on `source`** — it is
metadata for the admin directory, and §8's branching keys off *roles*,
not source. It is kept because provenance cannot be reconstructed later
(once approved, a cold registrant who later enrols is indistinguishable
from a student who applied) and because "was already our student" is a
real vetting signal. Collapsing the two values loses only that signal.

`SELF_APPLICATION` and `REGISTRATION` are the same machinery behind two
doorways: MyTeacher's own comment notes the register toggle "puts them
straight into the approval queue — no separate access-request step
needed". Build one, get both.

---

## 6. States and transitions

```
                 ┌─────────┐
   apply ───────▶│ PENDING │◀──── re-apply (updates row, count+1)
                 └────┬────┘
            approve │  │ reject
                    ▼  ▼
       ┌──────────┐    ┌──────────┐
       │ APPROVED │    │ REJECTED │
       └────┬─────┘    └────┬─────┘
   suspend  │   ▲           │
            ▼   │ reinstate │
       ┌───────────┐        │
       │ SUSPENDED │        │
       └───────────┘        │
                            ▼
              (may convert to plain STUDENT — §8)
```

`REJECTED` is **not terminal** — the CHECK must allow REJECTED →
PENDING. A constraint is the expensive kind of thing to change later.

The TUTOR role is written on entry to `APPROVED` and revoked on entry
to `SUSPENDED`.

---

## 7. Suspension <span>settled 2026-08-21 — "keep materials, stop new joins"</span>

Suspending a tutor fires four separable switches. Sam's decision:

| Switch | On suspend |
|---|---|
| New students joining | **stopped** — programme leaves the public catalogue, checkout blocked |
| Money in flight | **stopped** — instalment collection halts |
| Tutor's workspace | **revoked** — TUTOR role dropped |
| Existing students' access | **kept** — curriculum, library and quizzes stay available |

**Rationale.** There is a real distinction between *materials* and
*live delivery*. The curriculum, library notes and quizzes are rows in
our database that the student paid for, and we can serve them with no
tutor present. Live cohort sessions genuinely cannot continue. Cutting
off materials punishes the student for the tutor's conduct and creates
a refund liability; pretending future sessions will still happen is a
lie the product would be telling.

**Consequence for the schema: suspension does NOT cascade into
`nclex_enrolments`.** It is contained entirely in `nclex_tutors`.

⚠ **Implementation note.** `nclex_users.is_active` already gates the
three public views (`db/rls.sql` — `WHERE p.status = 'PUBLISHED' AND
u.is_active`) and appears **nowhere else** — not in login, not in any
access gate. So it hides programmes and does nothing more. Suspension
needs a **tutor-level** filter in those views rather than reusing that
blunt person-level switch, which would also be wrong for a tutor who
is still a student elsewhere.

---

## 8. Pending and rejected applicants <span>settled 2026-08-21</span>

There are **two kinds of pending applicant**, and only one is
role-less. Both read the same row.

**A. Role-less (registered as a tutor, brand new)** — has an account,
no roles, a PENDING row. Auto-creating a STUDENT role to give them
somewhere to stand was considered and rejected: it grants a role they
never asked for, and leaves a rejected applicant silently a student
forever.

The hook already exists — `app/router/page.tsx`:

```
if (roles.length === 0) {
  redirect('/no-access');
}
```

Split it: no roles **and** a `nclex_tutors` row → the application
page; no roles and nothing else → `/no-access` as today.

**The application page** serves three states:

- `PENDING` — "Request #N, pending review"
- `REJECTED` — the outcome and `decision_reason`, plus **"Update and
  resubmit"** (§9)
- `REJECTED` → conversion: *"We're not taking you on as a tutor right
  now — but you can use MyNclex as a student."* One button, grants
  STUDENT, drops them at `/student/picker`. A rejection should not be
  a dead end.

**B. Existing student who applies** — keeps STUDENT, gains a PENDING
row. We cannot hijack their login; they have real enrolments to reach.
They get a small **"Tutor application — pending"** card on
`/student/picker`, which is where they already land.

ⓘ `/student/picker` handles the empty case well already (programmes
list + a bank "Get access" CTA), so a brand-new applicant given a
student account would land somewhere sane. That is why option A is a
modelling preference, not a rescue.

---

## 9. Re-application <span>settled 2026-08-21</span>

**Allowed, and it updates the row in place** — the MyTeacher flow,
which was verified in `access-request.html` rather than assumed:

- reads the existing row first and branches on `request_status`
- `PENDING` → "Your request is pending review", showing **"Request #N"**
- `REJECTED` → "You can update your details and resubmit below"
- **"Update and resubmit"** reveals the form **pre-filled** from the
  previous submission
- on submit, if a row exists → update it, `submission_count + 1`,
  status back to `PENDING`

**Keep deliberately:** the pre-fill (a rejected applicant should not
retype everything to fix one thing) and showing the count (**"Request
#2"** is honest — it says we know you have asked before).

**Resubmit is in v1.** The application page exists anyway for §8, so
resubmit is the same form plus an increment.

**Keep `decision_reason`** — someone re-applying without knowing what
was wrong wastes everyone's time.

**No events table in v1.** Full decision history (from → to, when,
why, by whom) would need its own append-only table; the existing audit
log **cannot** do it — `nclex_audit_log.action` is CHECK-constrained to
`('created','updated')` with no before/after columns, so it records
authorship, not transitions. `submission_count` answers the question
that actually gets asked ("have they tried before?"). An events table
is purely additive later and changes nothing about this row — worth it
around the point tutor numbers make "did I reject this person before,
and why?" un-rememberable.

---

## 10. Emails

Built **inline with the slice that needs them**, per the standing rule
that email is no longer an arc of its own. Registry:
`docs/product-plan/transactional-email.md`.

| Trigger | Recipient | When | Slice |
|---|---|---|---|
| `tutor.added_by_admin` | new tutor | admin promotion / invite | 1 |
| `tutor.application_received` | applicant | on submit — "we have it, Request #N" | 2 |
| `tutor.application_submitted_admin` | **admin** | on submit | 2 |
| `tutor.application_approved` | applicant | on approve | 2 |
| `tutor.application_rejected` | applicant | on reject, carrying the reason | 2 |
| `tutor.suspended` | tutor | on suspend | 1 or 2 |

⚠ The **admin** notification matters — recipient ≠ actor. Without it a
queue fills up that nobody knows about.

`application_approved` / `application_rejected` mirror the existing
`enrolment-approved` / `enrolment-rejected` templates, so those two are
largely shape-reuse.

---

## 11. Slices <span>scoped into sub-slices 2026-08-21</span>

Ten sub-slices across three slices. **Each is independently
committable and leaves the app working**, and the boundaries are drawn
so no later one rewrites an earlier one.

⚠ **Read the order as a dependency chain, not a preference.** 1a is
the foundation every other sub-slice reads. 2a before 2b would leave
applications arriving with no way to decide them.

### Slice 1 — the table, and the way in

**1a — the table and the lift.** ✅ **BUILT 2026-08-21**, migration
`20260913120000_tutor_record.sql`, dev-applied. Create `nclex_tutors`;
backfill one row per existing TUTOR-role holder; copy `public_profile`
across; re-point `nclex_public_programmes` to join `nclex_tutors` for
the profile; update the three profile call sites to read and write the
new home.

- **Touches:** one new migration · `db/schema.sql` + `db/rls.sql`
  (snapshots) · `app/(app)/tutor/profile/{page.tsx,public-profile-form.tsx,actions.ts}`
- ⚠ **ONE view, not two** — corrected while building. Only
  `nclex_public_programmes` selects the profile bag.
  `nclex_public_units` and `nclex_public_cohorts` join `nclex_users`
  purely for the `is_active` check and select no profile; they are a
  **1d** concern (the tutor-level suspension filter), not 1a.
- ⚠ **The join is LEFT, with `COALESCE(t.public_profile, '{}')`.** A
  programme whose tutor somehow has no tutor row must still appear in
  the catalogue with an empty profile — an inner join would let a
  missing row silently **unpublish** someone's programme.
- ⭐⭐ **THE SELF-APPROVAL GUARD — found while building, and the reason
  this sub-slice mattered more than it looked.** The old home,
  `nclex_users`, has a **whole-row** self-update policy, which is
  harmless there because that row grants no privilege. `nclex_tutors`
  holds **`status`**. Move the same shape across and any signed-in
  tutor could run `update({ status: 'APPROVED' })` on their own row —
  self-approval, and self-un-suspension. **RLS cannot express "these
  columns but not those"**, so the row policy is not enough alone.
  Fixed with Postgres **column privileges**, which PostgREST honours:
  `REVOKE UPDATE ON nclex_tutors FROM authenticated`, then
  `GRANT UPDATE (public_profile, updated_at)`. Status transitions
  belong exclusively to 1c/1d under `TUTORS_MANAGE`. ⓘ **First
  column-level grant in the repo** — there were none before; this is
  the pattern if another table ever needs it.
- ⓘ **Also handled:** an UPDATE matching no rows is not an error to
  PostgREST, so a tutor with no record would have seen "Saved" and lost
  the work. The action now `.select()`s and reports a distinct message
  naming the cause.
- ⚠ **Do NOT drop `nclex_users.public_profile` in this migration.**
  Moving and deleting in one step leaves no rollback. The DROP is its
  own migration (**1a-drop**), after prod has run on the new home for
  a release.
- ⚠ **Backfill provenance.** The existing tutors were made by hand,
  before any of this existed. Labelling them `ADMIN_PROMOTION` invents
  a decision that never happened, and provenance is the entire point
  of `source` — so the CHECK gains a fifth value, **`LEGACY`**, and
  those rows carry `status = 'APPROVED'` with `approved_at` /
  `approved_by` left **NULL**, which is the truth: nobody knows.
- **Verified 2026-08-21 on dev:** backfill faithful — **5 of 5** bags
  identical to their source, all `LEGACY` / `APPROVED`, none wrongly
  stamped with an `approved_at` · the **rendered** public programme page
  serves the tutor's headline and bio from the new home · the editor's
  read and write round-trip under RLS as the tutor (simulated with that
  tutor's own JWT claims; **1 row** written, value read back, restored) ·
  the guard **proven to bite** — as `authenticated`, `public_profile` is
  writable and `status` is refused with `insufficient_privilege` · tsc at
  the known `scoring-roundtrip` errors, lint clean against baseline.
- ✅ **Confirmed by Sam in the browser, signed in as a tutor** (Steven
  Harris, 2026-08-21 15:21): the page loaded his existing profile from
  the new home, an edit saved (headline, speciality, years 5 → 10, and
  a `business_name` added), and it rendered on the **public** programme
  page through `nclex_public_programmes`.
  ⭐ **And the guard held under the real write, not just a synthetic
  one:** after the save, `status`, `source`, `approved_at`,
  `approved_by`, `decided_at` and `submission_count` were all
  unchanged — the UPDATE moved the profile bag and `updated_at` and
  nothing else, which is exactly what the column grant permits.
  ⓘ One false alarm worth recording so it is not re-chased: the old
  headline string still appears once on the public page. It is inside
  the **bio text** ("...now a Pediatric ICU nurse..."), which was not
  edited — not a stale read from the un-dropped `nclex_users` column.
- ⓘ **Invisible to users — a pure move.** That is exactly why it lands
  alone: it is the only sub-slice that touches *existing working
  features*, so a regression is easy to attribute.

**1b — the directory.** `/admin/tutors` replaces its placeholder with
a read-only list: name, email, status, source, programme count, and
whether the public profile has been filled in. No actions yet.

- **Touches:** `app/(app)/admin/tutors/page.tsx` · new `lib/tutors/`
- **Verify:** the backfilled tutors appear (5 on dev, 1 on prod).
- **Ships alone:** yes — "who are our tutors?" is a question nothing
  in the product answers today.

**1c — add a tutor.** ⭐ **The sub-slice that unblocks tutor #2.**
`grantTutorRole()` plus the "Add tutor" flow on the directory page:
writes the `nclex_tutors` row (`APPROVED`, `ADMIN_PROMOTION`, decided
by the admin) and the `nclex_user_roles` row, idempotently. Plus
`tutor.added_by_admin`.

**The UI is a dropdown, then a mode-specific form** (Sam, 2026-08-21).
Clicking "Add tutor" offers two choices — **existing user** or **new
user** — each opening its own form. They need different inputs, which
is why one clever field does not work: promoting needs only an
identity (search and pick), while inviting needs email *plus* forename
and surname, because a user record is being created from nothing.

- ⭐ **Each path needs an escape hatch to the other**, or the dropdown
  asks the admin to know something they may not — whether this person
  ever registered. Search finds nothing → *"Not found — invite them
  instead"*. New-user email matches an account → *"Already has an
  account — promote them instead"*. With both hatches a wrong branch
  costs one click; without them it is a dead end and a guess.
- The new-user email field **checks as you type**, so the answer
  arrives before the name fields are filled in, not on submit.
- ⚠ **THE LOOKUP NEEDS A `SECURITY DEFINER` RPC — RLS BLOCKS BOTH
  HALVES OTHERWISE.** `nclex_users_self_read` is
  `USING (id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'))`, so
  **only a SUPER_ADMIN can read another user's row**. An admin holding
  `TUTORS_MANAGE` can neither search users nor check an email. It works
  today only because Sam is the sole SUPER_ADMIN and
  `nclex_admin_permissions` is empty — i.e. the design would quietly
  depend on one person's role, and break the first time it is
  delegated. Use the repo's existing pattern (the id generators, the
  roster's ownership-then-service-role reads).
  - **Narrow, not a directory.** It answers "does this email have an
    account, and if so who?" — it must not return a browsable user
    list. An email-existence endpoint is an account-enumeration vector,
    and the narrower it is the less it can become one.
  - **Gated server-side on `TUTORS_MANAGE`**, not merely hidden behind
    an admin page — UI-only gating is what the layered-access rule
    exists to prevent.
- ⓘ **Until slice 3 exists, the new-user path ends in an instruction,**
  not a dead end: *"No MyNclex account for that email yet. Ask them to
  register, then add them here."* That is a working stopgap — the
  person registers as a student and is promoted — and it matches how v1
  vetting actually happens, in a conversation that is already taking
  place. Slice 3 removes the extra step; it does **not** add a second
  button (see below).
- **Touches:** `lib/tutors/actions.ts` · a lookup RPC (migration) · the
  directory page · one email template
- **Verify:** promote a dev student, sign in as them, confirm the
  workspace switcher appears and `/tutor` opens. Re-run the action and
  confirm it is a **no-op, not a duplicate-key error**. Check the
  lookup as a non-SUPER_ADMIN holding `TUTORS_MANAGE`, which is the
  case the RPC exists for and the one that silently works when tested
  only as Sam.
- ⚠ The grant must never remove existing roles (§4, invariant 2).

**1d — suspend and reinstate.** The status transitions, plus the
**tutor-level filter in the public views** so a suspended tutor's
programmes leave the catalogue. Revokes the TUTOR role; restores it on
reinstate. Plus `tutor.suspended`.

- **Touches:** `lib/tutors/actions.ts` · `db/rls.sql` (the same two
  views again) · one email template
- ⚠ **The only sub-slice that changes what the public can see.**
  Suspension must **not** reuse `nclex_users.is_active` (§7) — that is
  a person-level switch, and wrong for a tutor who is also a student.
- **Verify:** suspend a dev tutor who has a published programme. The
  programme leaves `/programmes`, **while an enrolled student still
  reaches its curriculum, library and quizzes** — that is the §7 rule,
  and it is the assertion worth writing a test around. Reinstate and
  confirm both reverse.

### Slice 2 — the self-serve doorways

**2a — capture an application.** The public "For tutors" page
(replacing the inert nav `<span>`), with the form for a **signed-in**
user: writes a PENDING row, `source = SELF_APPLICATION`. Plus
`tutor.application_received` and `tutor.application_submitted_admin`.

- ⚠ **Nothing can decide these yet.** Do not ship 2a to prod without
  2b, or applications arrive as dead letters.

**2b — decide.** `/admin/applications` replaces its placeholder with
the PENDING queue: approve (→ `grantTutorRole`) or reject with a
reason. Plus `tutor.application_approved` and
`tutor.application_rejected`.

- ⭐ **Approve is 1c's action with a different trigger.** If it needs
  new code, 1c was built too narrowly — that is the check on whether
  the grant primitive was factored properly.

**2c — the applicant's view.** Split the `roles.length === 0` branch
in `app/router/page.tsx`; the application page rendering PENDING
("Request #N"), REJECTED (with the reason) and the conversion offer to
a plain student account; the picker card for an existing student who
applied; and **resubmit** — the same form pre-filled, incrementing
`submission_count` and returning the row to PENDING.

- **Touches:** `app/router/page.tsx` · a new application route ·
  `/student/picker`

**2d — the register-as-tutor toggle.** The second doorway onto 2a's
machinery: the toggle on `/register`, the three extra fields, and
`source = REGISTRATION` — writing `nclex_users` + `nclex_tutors` and
**no role**.

- ⚠ **Last in slice 2, deliberately.** It is the only one touching
  `/register`, and **2c must exist first** or a role-less applicant
  lands on `/no-access` with no way to learn their own status.

### Slice 3 — invite by email

**3 — invite.** Admin enters an email with no account: creates the
auth user, the `nclex_users` row, the `nclex_tutors` row
(`ADMIN_INVITE`, APPROVED), grants the role, sends the setup link.

- ⚠ **The only path touching `/welcome`** — the convergence point for
  every account-setup flow, carrying the `?code=` vs `#access_token=`
  trap. Uses the existing setup-link machinery, **not**
  `inviteUserByEmail`, which was deliberately removed.
- ⭐ **It fills 1c's "new user" branch — it does NOT add a second
  button.** To an admin, "add a tutor" is one action; whether the
  person already has an account is our implementation detail. So this
  slice replaces the instruction in 1c's new-user form with the real
  thing, behind the same dropdown. Built as its own separate flow it
  would leave two buttons doing one job, which never gets merged back.
- ⚠ **This is probably the COMMON case, not the edge one** (Sam,
  2026-08-21): most tutors are expected to be people from outside who
  have never touched the platform, not existing students who want to
  teach. It is still sequenced last, deliberately — being the common
  case does not shrink the `/welcome` risk, and 1c builds
  `grantTutorRole()`, which this slice calls at the end anyway. But if
  the polished flow is wanted **before** tutor recruitment starts, this
  is the slice to move up, knowing it is the one most able to break
  something that currently works.
- **Deliberately last:** 1c plus its instruction already onboards
  anyone who can register, and this is the only path touching the
  convergence point.

### If only one thing gets built

**1a, then 1b, then 1c** — in that order, and 1b is not skippable.

⚠ **Corrected 2026-08-21.** This section previously read "1a, then 1c",
contradicting the lettering four paragraphs above. It was answering a
different question — *which single sub-slice carries the most value?* —
and 1c genuinely does. But that ignored the dependency: **1b and 1c are
the same page.** 1b is `/admin/tutors` read-only; 1c adds the "Add
tutor" flow to it. Building 1c first does not skip 1b, it forces most
of 1b to be built anyway just to host the button, and leaves a state
where an admin can *add* a tutor but not *see* who is one. The list is
not decoration there — it is the feedback loop for the action. Without
it the only way to confirm a promotion worked is to query the database,
which is the exact thing this arc exists to stop.

1d is genuinely useful but is not on the critical path to *"Sam can
make someone a tutor."*

---

## 12. Out of scope — tutor plans and quotas <span>open, 2026-08-21</span>

**Not designed, deliberately.** The "$29/month" figure predates any
real thinking and may not survive it.

**Tutor plans are quota tiers, not durations** — e.g. free: 50
students / 1 programme; mid: 100 students / 10 programmes; paid:
unlimited. That does not fit what exists:

- `nclex_products` is built entirely around consumer purchases —
  `duration_days`, `readiness_credits`, dual-currency prices. Every
  column that does real work answers *"how long"* or *"how many
  credits"*. Nothing expresses a quota.
- `nclex_subscriptions` answers *"does this person have access, until
  when?"* — a boolean with a time window, one row per granted period.
- **The free tier breaks the cardinality.** Subscription rows come
  from a purchase or a grant and a user may hold zero. But **every
  tutor is always on exactly one plan**, including one who never pays.
  Either every tutor gets a FREE subscription row — at which point the
  row stops being evidence of a transaction — or free tutors' limits
  live nowhere and get hardcoded, which means you cannot change the
  free tier or grandfather anyone without a deploy.
- **Enforcement has no home.** "50 students, 1 programme" must be
  checked at programme creation, cohort creation and every enrolment
  path. That is an arc, not a column.

⚠ **Do not model a tutor plan as a `nclex_products` row just because
products exist.** Adding `TUTOR_PRO` with a `duration_days` jams a
quota tier into a duration model. That is the rebuild this doc exists
to avoid.

### Settled principle — admission ≠ plan assignment

**They are two operations. A UI may combine them ("Approve and set
plan"); the model must not.**

You cannot sell someone a plan before deciding to admit them: if a
self-applicant picks a paid plan and is then rejected, either you owe
a refund to someone you turned down, or the "selection" was never
binding. So:

- **approval puts everyone on the free tier automatically** — no plan
  choice at any doorway
- **upgrading is a separate, self-serve act** by the tutor, from a
  billing page, at the moment a limit actually bites
- **admin can grant a plan** to an existing tutor (comp, deal) — an
  action *against a tutor*, not part of admitting one

If *"which plan are you interested in?"* is ever wanted on the
application form, it is a form field in the application payload — an
intent, not an entitlement.

This is the same axis separation as §7's status/subscription split.
Every time the two were merged during design it produced a bug: the
suspended tutor who pays and returns active, and the rejected
applicant who paid.

### Questions to answer before designing it

1. What is metered — students, programmes, cohorts, quizzes, storage?
2. Are limits **hard** (blocked) or **soft** (warned, then chased)?
3. **The sharp one — what happens on downgrade?** A tutor with 200
   students moves to the 100 plan. Block, grandfather, or force a cut?
   Every quota model lives or dies on this, and it should be decided
   before the schema.
4. Subscription at all, or **revenue share** — a percentage of what
   tutors collect? CLAUDE.md already defers "payment splits /
   marketplace billing", so this is a live alternative, not a new
   idea. A fixed monthly USD fee is a real barrier for a Ghanaian
   tutor with no students yet; a cut of collected fees costs them
   nothing until they earn, and aligns us with their success.

**Nothing in this arc depends on the answer.** `nclex_tutors` holds no
money, no expiry and no plan, so whatever model lands attaches to a
tutor by `user_id` without touching this table, the grant, the
application flow or the admin surfaces.

---

## 13. Decisions, and what was rejected

| Decision | Rejected alternative | Why |
|---|---|---|
| One `nclex_tutors` row per person | `nclex_tutor_applications`, one row per request | A request table records the *application* and still leaves no row representing *the tutor* — nowhere to hang approval, suspension or a plan. (Sam's call; the applications table was the first proposal and was wrong.) |
| `public_profile` lifted into it | Leave it on `nclex_users` | It is tutor-specific in practice, and the record it belongs to now exists. Public reads already go through column-list views, so the merge is safe. |
| Role stays in `nclex_user_roles` | Fold the grant into `nclex_tutors.status` | Keeps every existing gate and RLS policy working untouched. |
| `EXPIRED` **not** a `status` value | Add it alongside PENDING/APPROVED/… | Vetting standing and commercial standing are independent axes. Concretely: suspend a tutor → subscription lapses → sweep sets EXPIRED → they pay → system sets APPROVED → **a suspended tutor is teaching again**. `nclex_enrolments` does store EXPIRED, but an enrolment has one axis; a tutor has two. |
| Subscriptions live outside this table | `plan_type` + `access_expires_at` columns | Would be a second, competing copy of what `nclex_subscriptions` already models — two places to ask "is this tutor paid up?". (Proposed, then withdrawn, same session.) |
| `submission_count` on the row | An append-only events table | The existing audit log cannot record transitions (§9), and a counter answers the question actually asked. Events table is additive later. |
| No `email` / `name` copy | Denormalise like MyTeacher | We have a real FK; MyTeacher's copies exist because its schema predates one. |

**Three things from MyTeacher deliberately not copied:** its single
`users.role` column (overwriting it stops a teacher being a student —
ours grants additively); its silent failure on the request insert
(logs to console and proceeds, so the person is told "pending" when no
row exists — ours must fail loudly or not at all); and the
denormalised email/name.

---

## 14. Knock-on, and things found next door

- ⚠ **CLAUDE.md lists "Public self-serve tutor signup (tutors are
  manually vetted in v1)" under *Explicit Deferrals — Not v1*.** Sam
  re-opened it on 2026-08-21 — slices 2 and 3 build it. **That line
  needs updating**; it was left alone pending explicit sign-off, so
  until then CLAUDE.md and this doc contradict each other.
- **The account surface is NOT part of this arc** (Sam, 2026-08-21).
  The boundary settled while deciding where the profile lives:
  credentials = `auth.users`; account/identity = `nclex_users`
  (everyone); public profile = `nclex_tutors` (tutors only). The test
  is *who is the audience* — private (account) vs strangers (public
  profile).
- ⚠ **No user of any audience can manage their account today.**
  `/tutor/profile` hosts only the public-profile editor;
  `/student/bank/profile` is a placeholder; admin has no profile route.
  Worse, the student one sits in the **bank** nav behind
  `requireActiveBankSubscription()`, while both student programme
  shells hardcode it as the Profile destination
  (`components/nav/student/programme-shell.tsx`,
  `cohort-shell.tsx`) — so **a programme student without a bank
  subscription taps "Profile" and gets `/no-access?need=bank`**, an
  advert for a product they did not buy. Recommendation when it is
  picked up: one shared `<AccountSettings>` component over
  `nclex_users`, rendered inside each audience's own chrome.
- **`/tutor/students` ("My Students") is a reachable dead end** — a
  placeholder linked from both the sidebar (`lib/nav/tutor.ts`) and
  the tutor Home card (`lib/home/tutor/tutor-home.tsx`). The other four
  programme placeholders were delisted in the 2026-06-07 declutter and
  are genuinely unreachable.
- ⚠ **`bankAccessForUser` queries `.in('pack_type',
  ['BANK_DURATION','TRIAL'])` but the CHECK on that column was
  narrowed to `pack_type = 'BANK_DURATION'` only.** No row can ever be
  `TRIAL`, so that arm is dead code — consistent with "trial unwired",
  but now structurally impossible rather than merely unused. Its own
  look, sometime.
