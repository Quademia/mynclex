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

⚠ **Not in this doc, deliberately:** tutor plans, quotas and billing —
**now owned by `tutor-plans-and-billing.md`**, with §12 left here as a
pointer (moved 2026-08-27) — and the shared account surface (§14). Both
are named so nobody assumes they were forgotten.

⭐ **Slice 2 was redesigned, built and Sam-tested on 2026-08-22.** One
door instead of two, entered by **email first**; the register-as-tutor
toggle is **dropped**; the form and the applicant's status page are **one
route**. §5, §8, §9 and §11 carry the changes, each with the superseded
version left visible rather than quietly overwritten.

**Status: THE ARC IS COMPLETE — all three slices, all four doorways**
(2026-08-22). Slice 1 is on `prod` (`ce10dfa` + `70502a1`); slice 2 is on
`prod` (`de88294`); slice 3 is built and Sam-tested on dev, on a branch.
⚠ **That last clause is the line in this file most likely to rot** —
check `git log origin/prod` rather than trusting it. It rotted four
times in three days during slices 1 and 2, and the sentence about slice
2 that stood here said "not yet on `main`" for the whole day after it
had shipped to prod.

⏭ **What the arc did NOT close**, none of it blocking: the
student-facing suspension notice (§7 → OPEN — nothing tells a student
their tutor is suspended) · the `private, no-store` gap repo-wide (§14)
· the public nav hiding every link below 760px (§14), which matters more
now that one of those links is a door we want strangers to walk
through · account settings, where a name typed by an admin can be
corrected (§14).

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
  source             TEXT NOT NULL
                     CHECK (source IN ('SELF_APPLICATION','ADMIN_PROMOTION',
                                       'ADMIN_INVITE','REGISTRATION')),

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

⭐ **Four sources, not five.** A `LEGACY` value shipped in 1a for the
hand-made tutors and was retired the same day (`20260914120000`) after
Sam asked why the code should carry a branch for six rows that can never
occur again. Checking found the premise was wrong, and it was mine:
`nclex_user_roles.granted_at` had recorded when each of them became a
tutor all along, so they are `ADMIN_PROMOTION` with real April dates.
Only `approved_by` was inferred, only where no granter was recorded, and
only on dev — prod's single tutor carries a real one.

⭐ **The better reason was the column, not the branch.** With LEGACY rows
present a NULL `approved_at` meant *either* "not approved yet" *or*
"predates the record" — two unrelated things reading identically. It now
means exactly one, which is why the column stays nullable: a PENDING or
REJECTED applicant has no approval date by definition.

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
| `SELF_APPLICATION` | the person, already signed in | already exists | required | 2a-i |
| `REGISTRATION` | the person, logged out, no account yet | created now | required | 2a-ii |
| `ADMIN_INVITE` | admin, by email | created by us | implicit | 3 ✅ |

✅ **All four are built as of 2026-08-22.** The arc's founding promise —
one row per person, whichever door they came through — now holds in
code, and `source` is the only thing that differs between them.

**`REGISTRATION` writes `nclex_users` + `nclex_tutors`, and NO role.**
That is the whole mechanism — see §8 for what the applicant then sees.

### Routing rule <span>rewritten 2026-08-22 — email first, not session state · BUILT, with one correction below</span>

**There is ONE form. Which branch you are in is decided by the EMAIL you
type, not by whether you happened to be signed in when you arrived.**

⭐ **APPLYING IS A LOGGED-OUT ACT** (Sam, 2026-08-22, while reviewing the
build). The person who reaches "For tutors" heard about MyNclex, arrived
as a stranger, and clicked. Signed-in traffic to that route is real but
it is people coming **back** — a pending applicant checking where they
stand, a rejected one resubmitting, a student following the card on their
picker. So: *applying is a logged-out act; checking your application is a
signed-in one.* Design the page around the first and the second still
works; do it the other way round and the common visitor meets a form
built for the rare one.

**As built:**

| Arriving as | Sees |
|---|---|
| A stranger | **One field: your email** |
| …no account on that address | Name + password → then their application |
| …address already has an account | *"You already have an account — sign in to continue"*, with the address prefilled |
| Already signed in | *"Signed in as …"*, then the form or their status |

⚠ **CORRECTION TO THE ORIGINAL DESIGN — WHERE THE ANSWER COMES FROM.**
This section first said step 1 *resolves* the email. It does not. The
plan was to check it behind a Turnstile pass so the check cost an
attacker exactly what `/register` costs them. **That is not buildable
here**, and `lib/auth/turnstile.ts` says why in capitals: a Turnstile
token can be validated exactly ONCE and **Supabase** must be the one to
spend it — calling Cloudflare ourselves would hand Supabase a spent token
and refuse every signup on the site. So our own check can only confirm
that a token *arrived*; a script sends any string. The thresholds in
`lib/auth/thresholds.ts` do not close it either, because they are keyed
by **email**, which is precisely what an enumerator varies.

So the email is still asked first — that is the UX, and it carries into
step 2 — but the **answer** about whether the account exists comes from
the signup attempt, which Supabase verifies for real.

⭐ **Which is why step 2 is deliberately SHORT: a name and a password.**
If the address turns out to be taken, the applicant has lost two fields
rather than a 400-word application — and that, not the number of steps,
was the whole point of asking for the email first.

⭐ **Why this replaced the old rule.** The previous version branched on
*whether you are signed in*, and read: *"The public 'For tutors' page
sends a logged-out visitor into register-as-tutor and a signed-in one
into the application form."* It has a case it never noticed — **logged
out, but you already have an account** — and that case is not exotic: it
is an existing MyNclex student, on her phone, not signed in, tapping
"become a tutor". The old rule walks her into `signUp`, which fails with
*"User already registered"* **after** she has filled a long form
including three tutor-specific fields. A dead end at the end of the work,
for exactly the applicant §5 below calls a real vetting signal.

⚠ **The email routes; it never authorises.** The `nclex_tutors` row is
ALWAYS written from `auth.uid()`, never from the typed address. Without
that rule, §9's *update the row in place* makes this a takedown rather
than a leak: a stranger typing a live tutor's address would knock their
APPROVED row back to PENDING and overwrite their profile with text they
never wrote. Proving identity means signing in — the same way it does
everywhere else in the product.

ⓘ **Enumeration — matches `/register`, not `/forgot-password`.** Telling
a visitor "this address already has an account" is what
`lib/auth/account-lookup.ts` forbids in strong terms ("NOTHING THIS
RETURNS MAY EVER REACH THE USER"). But `/register` **already** discloses
it, returning Supabase's own *"User already registered"* verbatim — also
settled with Sam, the same day. The two decisions do not conflict:
forgot-password protects a door where the visitor does not need the
answer, and account creation is a door where they do. So this form adds
no capability an attacker lacks at the front door, and it reads the
signup error rather than that function, leaving its rule literally true —
`account-lookup.ts` is never called from this flow.

ⓘ `source` **needs no schema change and keeps its vetting signal** —
`REGISTRATION` vs `SELF_APPLICATION` is derived rather than passed.

⭐ **And it is derivable EXACTLY, which is better than the URL flag the
build first reached for.** Every other way of getting an account here
grants a role on the way in: `/register` grants STUDENT, the pay-first
setup at `/welcome` grants STUDENT, admin promotion grants TUTOR. So
somebody holding **no role at all** at the moment they submit can only
have arrived through this form. ⚠ It was briefly a parameter the client
passed, which let the applicant write a fact about *our* provenance —
and while nothing branches on `source`, "was already our student" is a
vetting signal they should not be able to set for themselves.

ⓘ The distinction is thin and **nothing branches on `source`** — it is
metadata for the admin directory, and §8's branching keys off *roles*,
not source. It is kept because provenance cannot be reconstructed later
(once approved, a cold registrant who later enrols is indistinguishable
from a student who applied) and because "was already our student" is a
real vetting signal. Collapsing the two values loses only that signal.

`SELF_APPLICATION` and `REGISTRATION` are the same machinery — and
since 2026-08-22 they are the same **form**, not two doorways sharing
parts. MyTeacher's own comment notes its register toggle "puts them
straight into the approval queue — no separate access-request step
needed"; we take that conclusion without taking its toggle (§11 → 2a).

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

⚠ **`SUSPENDED` is NOT a source for re-apply** <span>settled
2026-08-22</span>. The only arrow into `PENDING` is from `REJECTED` (or
from nothing at all, on a first application). Allowing
`SUSPENDED → PENDING` would let a suspended tutor launder their own
standing: re-apply, sit in the queue as an ordinary applicant, and be
re-approved by an admin who does not check the history. **This is the
same rule `nclex_tutor_record_decision` already enforces on the admin
side** — it refuses *every* transition to PENDING, because returning a
row to PENDING is a re-application and must never be a way to un-decide
something. Two doors, one rule. See §9 for where it is enforced.

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

### ⚠ What "four switches" turned out to mean when it was built (1d)

The table above is right about the *decisions* and undercounted the
*places*. Recorded here because the next person will trust the table:

- **It is FOUR VIEWS AND TWO FUNCTIONS, not "the three public views"** —
  `nclex_public_programmes` · `_units` · `_cohorts` ·
  `_payment_strategies` · `nclex_join_waitlist` · `nclex_submit_enquiry`.
  Filtering only the programmes view leaves the units, cohorts and
  **prices** publicly readable.
- **⭐⭐ CHECKOUT READS NONE OF THEM.** `lib/payments/init.ts` resolves
  the programme and the plan from the **base tables** through the service
  role and checks only that the programme is `PUBLISHED`. Filtering every
  view in the database would not have stopped one sale — a direct link or
  a stale tab bypasses discovery entirely. "Checkout blocked" needed its
  own gate inside `startCheckout`.
- **⭐⭐ "Money in flight stops" is NOT the two reminder emails.** Step 2c
  of the nightly sweep PAUSES a student for arrears. Stopping the
  reminders alone would have meant we quietly stop asking for the money
  and then lock the student out for not paying it — the exact outcome the
  rationale above forbids. Three blocks skip a suspended tutor: due
  reminders, overdue reminders, **and the pause**. Access-window expiry
  and subscription expiry deliberately do NOT (that window is what the
  student bought; passes are sold by us, not the tutor).

### ⚠ Settled: suspension does NOT touch the programmes (Sam asked, 2026-08-21)

Sam asked whether suspension should unpublish the tutor's programmes,
reasoning that nearly everything already keys off `p.status =
'PUBLISHED'`, so **one** switch would be harder to miss than two.
**Argued down, on this arc's own principle for the third time:**

- **It destroys information we cannot recover.** Reinstatement would have
  to republish — but *which* ones? Some were already drafts, deliberately.
  Getting it right needs a hidden "was published before we suspended
  them" flag on every programme: a second piece of state, worse than the
  one we were avoiding.
- **It writes OUR decision into THEIR column.** Published-ness is the
  tutor's editorial judgement ("this is ready"); standing is ours. Fold
  them together and neither can be read honestly afterwards — their
  programme history would show them unpublishing work they never touched.
  Same axis separation that killed `EXPIRED`-as-status and the plan
  columns (§13).

⭐ **But he was right about the cost, and it had already bitten.** Two
switches means every public surface must remember both — and the
session-reminder defect above is exactly that failure. ⏭ **Follow-up
(not built):** make *"is this programme publicly live?"* answerable in
**one** place rather than re-derived by hand in seven, so a new surface
inherits both conditions whether or not its author knows suspension
exists. ⚠ It cannot be a plain SQL function called from a view's `WHERE`
— that runs as the invoker and would hit `nclex_tutors`' RLS as `anon`,
emptying the catalogue. It has to be a view, or a documented join.

### ⏭ OPEN — the student is never told (Sam, 2026-08-21)

**Settled in principle, undesigned, NOT built.** §7's rationale already
says *"pretending future sessions will still happen is a lie the product
would be telling"* — and 1d only implemented the half that faces the
public and the tutor. **Nothing in the student interface says a word.**
A student enrolled with a suspended tutor keeps their curriculum,
library and quizzes exactly as intended, and has no way to learn that
nobody is coming to the live sessions.

~~⚠⚠ **And one part of this is a live defect, not a future feature.**~~
✅ **FIXED 2026-08-21, migration `20260920120000`.**
`nclex_enqueue_session_reminders` joined `nclex_users` for the tutor's
*name* and never asked their standing, so the 07:00 cron kept emailing a
suspended tutor's students *"your live class is tomorrow"* — the
forbidden lie, sent by us, on a schedule. Missed in 1d-v because §7
enumerates four switches and this is a **fifth** consequence. ⭐ *A
four-row table of consequences is a summary, not an inventory.*
- Two places, not one. ⚠ The tutor's **"send reminder now"** button gated
  on *ownership* (`v_tutor = auth.uid()`), which a suspended tutor still
  passes — suspension revokes the role, it does not reassign their
  programmes. Unreachable through the UI, accepted by the RPC.
- ⚠ **It does not unsend anything.** Reminders go out up to 7 days ahead
  and each class is announced exactly once, so a student may already hold
  a "see you Tuesday" for a class that is now not happening. Only the
  student-facing notice below closes that week-long window — the fix
  stops the leak, it does not mop up.

To decide when it is picked up — deliberately NOT decided now:
- **What the student sees, and where** — cohort/programme overview,
  the curriculum list, the live-sessions surface, or all three.
- **How much to say.** "Your tutor is currently unavailable" is honest
  and vague; naming a suspension discloses a conduct decision to
  someone with no need for it. ⭐ The disclosure test is the one the
  emails already use: is this a fact the recipient needs in order to
  act? A student needs to know **no sessions are coming**; they do not
  need to know why.
- **Whether it is an email as well as a screen.** A student who never
  logs in between suspension and their next scheduled class learns
  nothing from a banner.
- **What happens on reinstatement** — the notice has to come down, and
  a student told "no sessions" needs telling when they resume.
- **Refunds and instalments.** Out of scope here and named in §7 only
  as "creates a refund liability". A student mid-instalment on a
  suspended tutor's programme is a commercial question, not a UI one.

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

### ⭐ The form and the status page are ONE route <span>settled 2026-08-22</span>

Earlier drafts of this section described "the application page" as a
surface separate from the application *form*. **They are the same
route.** It has to read the caller's `nclex_tutors` row before it can
render anything — that is how the SUSPENDED refusal below works — and
once it is doing that, the form is simply the state it shows when it
finds no row. This is what §9 already observed MyTeacher doing:
*"reads the existing row first and branches on `request_status`."*

| Row found | What the route shows |
|---|---|
| **none** | The form, blank |
| `PENDING` | "Request #N — pending review". **No form.** |
| `REJECTED` | The outcome + `decision_reason`, **"Update and resubmit"** (§9 — the same form, pre-filled), **and** the conversion offer below |
| `SUSPENDED` | Refusal + a contact route. No form. |
| `APPROVED` | "You are already a tutor" → their workspace |

- **`REJECTED` → conversion:** *"We're not taking you on as a tutor
  right now — but you can use MyNclex as a student."* One button, grants
  STUDENT, drops them at `/student/picker`. A rejection should not be a
  dead end.
- **`SUSPENDED`** — telling *them* discloses nothing new: §1d settled
  (visibility option (i)) that a tutor can read their own row, and that
  reasons are written as if the subject will read them. ⚠ Note there is
  deliberately **no appeal mechanism** in v1; the exit is "contact us".
- **`APPROVED` should be unreachable** in practice — they hold the role
  and `/router` sends them to their workspace. It is a state here so the
  route never renders a blank application form to a working tutor.

⭐ **Consequence: resubmit is not a screen.** It is the `REJECTED` state
of a page the applicant has already seen, reusing the same form
component with values loaded. This drops slice 2's surface count from
two to one, and removes the "which page am I supposed to be on?"
question entirely. The *work* does not shrink — the states still have to
be built.

### ⚠ Every signed-in state needs to say who you are <span>found in testing, 2026-08-22</span>

Sam, looking at the built page: *"they don't see they are logged in, and
how to log out or go somewhere."*

⭐ **For a role-less applicant THIS ROUTE IS THE WHOLE PRODUCT.**
`/router` sends them here, there is no sidebar, no account menu and
nowhere else to go. Before the fix they read "your application is with
us" underneath a nav button inviting them to **Log in** — which they
already were — with no way to sign out and no indication of which account
they were even looking at. A person with two addresses could not tell
which one we were talking about.

So a strip sits above **all five** signed-in states: *signed in as
&lt;email&gt;* · a way back into the product **only when they hold a
role** (an applicant holds none, and a link that bounces them straight
back here is worse than no link) · **sign out**.

⚠ **It is NOT a session-aware public nav**, which would have fixed it on
every public page at once. Checked rather than assumed: every page in the
`(public)` group answers `Cache-Control: no-cache, must-revalidate` —
**no `private`** — so putting a name in the shared nav would put per-user
content on every marketing page behind a header that does not say it is
per-user. That is its own change, with its own headers to settle first.
This route is already `force-dynamic` and already renders the caller's
own application, so session UI *here* changes nothing about caching.

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

### ⚠ Only `REJECTED` may re-apply <span>added 2026-08-22</span>

The list above branches on `PENDING` and `REJECTED` and is silent on the
other two states. **A suspended tutor must be refused outright** — see
§6 for why (they would otherwise launder a suspension back into the
queue). `APPROVED` is refused too, for the duller reason that they are
already a tutor.

**Enforced in two layers, per the standing rule that we gate at every
one — and both are built:**

1. **The route** reads the row and renders the refusal instead of a
   form (§8's state table).
2. **`nclex_tutor_submit_application` refuses it** — `SUSPENDED` and
   `APPROVED` both raise, whatever the UI did. Proven on dev in
   rolled-back transactions, 2026-08-22, alongside the refusal of any
   `source` that is not one of the two self-serve values.

⚠ **The sign-in bounce is routing, NOT security.** It is tempting to
think a suspended tutor is stopped by "that address already has an
account — sign in", but suspension revokes the **role**, not the
account: they can still log in, and they may still be a student
elsewhere. The bounce merely delivers them to the branch where the real
check has to happen. Layer 2 is the one that matters, because layer 1
can be bypassed.

**Keep deliberately:** the pre-fill (a rejected applicant should not
retype everything to fix one thing) and showing the count (**"Request
#2"** is honest — it says we know you have asked before).

**Resubmit is in v1.** The route exists anyway for §8, so resubmit is
the same form plus an increment — and since 2026-08-22 it is not even a
separate screen, just the `REJECTED` state of the page they already
know.

**Keep `decision_reason`** — someone re-applying without knowing what
was wrong wastes everyone's time.

⚠ **SUPERSEDED 2026-08-22 — read the paragraph below as history.** It
was written before 1d, which built exactly the trail it says v1 would go
without: **`decision_history`, an append-only JSONB array** of
`{at, by, from, to, reason}` on the row itself. Its conclusion still
holds — *no events **table*** — and the rule banked with it is the
reason: *a JSONB array is right while a history is short, bounded and
read whole; a table is earned the day something needs to query across
rows.* Left in place because the reasoning about `nclex_audit_log` is
still true and still worth knowing.

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
| `tutor.added_by_admin` ✅ | new tutor | admin promotion / invite | 1c-i · dialled in 3 |
| `tutor.application_received` ✅ | applicant | on submit — "we have it, Request #N" | 2a-i |
| `tutor.application_submitted_admin` ✅ | **admin** | on submit | 2a-i |
| `tutor.application_approved` ✅ | applicant | on approve | 2b |
| `tutor.application_rejected` ✅ | applicant | on reject, carrying the reason | 2b |
| `tutor.suspended` ✅ | tutor | on suspend, carrying the reason | 1d-iv |
| `tutor.reinstated` ✅ | tutor | on reinstate | 1d |

**All seven are built.** The four from slice 2 were each observed
sending on dev, 2026-08-22.

⭐ **Seven keys, EIGHT emails — `tutor.added_by_admin` carries two**
(slice 3). A promoted tutor has a password; an invited one has an
account with none, so the profile and workspace links point behind a
door they cannot open. One `entry` dial, one template, and the invited
branch shows exactly one control: the link that creates the password.
⚠ Absence of the dial means `LOG_IN`, because rows already sent — prod
included — are rendered from their frozen payload and must not change.
See §11 → Slice 3.

⚠ The **admin** notification matters — recipient ≠ actor. Without it a
queue fills up that nobody knows about.

⭐ **It is the first email this product sends to ITSELF**, and its
disclosure rules are the INVERSE of every other template in the folder.
The outward ones withhold the admin's name and are written knowing a
stranger reads them; this one carries the applicant's name, address,
organisation and their own words, because the reader is the person about
to decide. ⚠ It still carries **no decision link** — nothing in an inbox
approves anybody; that belongs behind a login and a permission check.
ⓘ The address is the constant `SUPPORT_EMAIL`, not a fan-out to everyone
holding `TUTORS_MANAGE` (Sam, 2026-08-22): a fan-out is a feature nobody
needs while there is one admin, and an address in the code cannot
silently go nowhere the way an unset env var can.

### ⚠⚠ `stage` — the bug that made a second email vanish <span>found 2026-08-22</span>

Sam suspended a tutor who had already been suspended the day before and
no email arrived. The action was fine; **the fingerprint was wrong**, and
the lesson generalises well beyond this arc.

The outbox de-duplicates on `(event_key, subject_ref, stage)` and reads a
unique violation as **success** — which is what makes Paystack's webhook
retries harmless. `stage` defaults to `'-'`, which `outbox.ts` documents
as *"a one-off"*.

⭐ **That default is right when a subject can only experience an event
once — and WRONG whenever `subject_ref` is a PERSON.** An enrolment is
approved once and a checkout gets one receipt. A person can be suspended,
reinstated and suspended again. All of these emails used
`subject_ref = user_id` with the default stage, so **the second one
silently vanished**: the insert was refused, the refusal read as success,
and the action reported that it had emailed somebody it had not.

⚠ **The worst case was not suspension.** §9 exists so a rejected
applicant can fix their application and resubmit — so a *second*
rejection is designed for, and that email is the only thing carrying the
new reason.

**Fixed:** the four decision emails take the decision's own timestamp
from the trail entry `nclex_tutor_record_decision` just appended (every
transition appends exactly one, so it names that decision and no other);
the two submission emails take `s<submission_count>`. ⓘ The fallback is
`now()` rather than `'-'` — for a notice about somebody's standing,
duplicated beats missing. `tutor.added_by_admin` keeps `'-'`, because
promotion refuses when a row already exists.

⭐ **`tutor.reinstated` was not in this table until it was built** (Sam,
2026-08-21). The list had an email for taking someone's standing away and
none for giving it back, so a reinstated tutor would have found out by
discovering the workspace worked again. **An account that writes to you
when it removes something and goes silent when it restores it reads as
punitive** — and leaves the person unsure whether the decision was
reversed or they merely got lucky. Worth checking every future pair for
the same asymmetry: approve/reject has both, suspend/reinstate did not.

ⓘ The two suspension emails are **deliberate opposites**, and the
differences are the design:
- **Reason**: `tutor.suspended` carries it — telling someone they are
  suspended without saying why leaves them no possible action but to
  write and ask. `tutor.reinstated` has no reason **field at all**,
  because reinstatement takes none (§7's rule: undoing a restriction
  needs no justification the way imposing one does).
- **Button**: suspension has none — every link would point at a door we
  just locked. Reinstatement is all button; the workspace link *is* the
  message.
- **Actor**: neither names an admin, and the suspension notice most of
  all. A staff name on a *conduct* decision invites them to be contacted
  about it personally.
- ⚠ Reinstatement **does not apologise and does not explain**. We may
  reinstate because we were wrong, because they fixed something, or
  because the suspension was always meant to be temporary — the record
  does not distinguish those, so the email must not imply one.

⭐ **Built ones use `enqueueAndSend`, not `enqueueEmail`** (Sam,
2026-08-21). The rule the code already carried and this arc confirmed:
**send instantly when a human is standing there who could fix a
failure; queue plainly when nobody is.** An admin promoting a tutor is
looking at the screen. The row is written first so the drain can retry
(`claimDueEmails` takes QUEUED *and* FAILED), then delivery is attempted
at once — measured at 0.5s from enqueue to SENT on dev.
⚠ It still returns *queued*, never *delivered* — the send runs after the
response under `waitUntil`. Toasts must not claim it arrived.

ⓘ `tutor.added_by_admin` **does not name the admin who did it** (Sam,
2026-08-21). Which admin promoted them is our provenance, visible in the
directory and on `approved_by`; a staff member's personal name in an
outward email is a disclosure that would have been made by accident the
first time `TUTORS_MANAGE` was delegated.

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
- ⚠ **Backfill provenance — and this shipped WRONG.** 1a gave the
  pre-existing tutors a fifth source value, `LEGACY`, with NULL
  `approved_at`, on the stated grounds that "nobody knows when these
  people were approved". Nobody had looked at the table next door:
  `nclex_user_roles.granted_at` is NOT NULL and had recorded every one
  of those dates. The UI spent a few hours rendering "Unknown ·
  predates the record" over data we held. Retired by
  `20260914120000` — see §3 and §13.
- **Verified 2026-08-21 on dev:** backfill faithful — **5 of 5** bags
  identical to their source, all `APPROVED` (as `LEGACY` at the time,
  `ADMIN_PROMOTION` after the same-day correction above) · the
  **rendered** public programme page
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

**1b — the directory.** ✅ **BUILT 2026-08-21** (`3c49145`).
`/admin/tutors` replaces its placeholder with
a read-only list: name, email, status, source, programme count, and
whether the public profile has been filled in. No actions yet.

- **Touches:** `app/(app)/admin/tutors/page.tsx` · new `lib/tutors/`
- **Verify:** the backfilled tutors appear (5 on dev, 1 on prod).
- **Ships alone:** yes — "who are our tutors?" is a question nothing
  in the product answers today.

**1c — add a tutor.** ✅ **BUILT 2026-08-21**, and SPLIT IN TWO while
building: **1c-i** (`fca499e`) — the two lookups, `grantTutorRole()`,
the chooser and the search path, the welcome email; **1c-ii**
(`c657975`) — the new-user path with the as-you-type check, its four
verdicts and both escape hatches. Migration `20260915120000` carries
both RPCs.

⚠ **A defect worth remembering: `nclex_tutor_email_check` threw on
every call** for one commit. It declared a variable named `found`,
which shadows plpgsql's special `FOUND`, so `IF NOT FOUND` compared a
RECORD against a boolean. It shipped typechecked, linted and
**unexercised** — invisible to every tool in the repo, and obvious the
first time anything called it. Fixed in the original migration rather
than a follow-up, since it had only ever run on dev.

⭐ **The sub-slice that unblocks tutor #2.**
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

**1d — suspend and reinstate.** ✅ **BUILT 2026-08-21** — `ac890ee`
(the trail), `7d87818` (the transitions), `d66acf0` (the public filter +
checkout gate), `e0d12d9` (the emails + the sweep), `e0118ca`
(`tutor.reinstated`), `2bc0da3` (the reinstate confirm). **Four
migrations**, `20260916`–`20260919`.

⭐ **It carried a schema change the plan did not have: `decision_history`**
(Sam's call). Until 1d no row could hold more than ONE decision, so the
drawer's derived trail was sufficient *by accident*; suspend/reinstate
makes a second, a third and a fourth, and a scalar `decision_reason`
keeps only the latest. It is an **append-only JSONB array on
`nclex_tutors`**, not the events table §13 rejected — the rule settled
alongside it: *a JSONB array is right while a history is short, bounded
and read whole; a table is earned the day something queries across rows.*
⚠ The scalars stay authoritative for current state, and ONE SQL statement
writes both, so they cannot drift.

⚠ **And a hole the new RPC re-opened.** §1a's column privileges stop a
tutor approving themselves through a direct update — but a
`SECURITY DEFINER` function runs as its definer, so any tutor who also
holds `TUTORS_MANAGE` could have lifted their own suspension through it.
`nclex_tutor_record_decision` refuses to decide on the caller's own
record. **Every future SECURITY DEFINER write against this table must
re-check that**; the column grant does not protect it.

ⓘ The reinstate confirm dialog was **added against the design** (Sam),
which said reinstatement needs no modal. Its reasoning was about
requiring a *reason*, not about *confirming* — so the note is optional
and the rule survives. The new fact the design could not weigh: with an
append-only trail, a misclick is **permanent in the record** even after
the state is corrected.

- **Touches:** `lib/tutors/actions.ts` · **four** public views and **two**
  public RPCs · `lib/payments/init.ts` · the nightly sweep · two email
  templates · two modals — ⚠ *not* "the same two views again", see §7
- ⚠ **The only sub-slice that changes what the public can see.**
  Suspension must **not** reuse `nclex_users.is_active` (§7) — that is
  a person-level switch, and wrong for a tutor who is also a student.
- **Verify:** suspend a dev tutor who has a published programme. The
  programme leaves `/programmes`, **while an enrolled student still
  reaches its curriculum, library and quizzes** — that is the §7 rule,
  and it is the assertion worth writing a test around. Reinstate and
  confirm both reverse.

### Slice 2 — the self-serve door <span>✅ BUILT 2026-08-22 — re-cut, built and Sam-tested the same day</span>

⚠ **Re-cut with Sam before any of it was built.** The previous cut —
2a (form) · 2b (decide) · 2c (applicant's view) · **2d (the
register-as-tutor toggle)** — assumed two doorways and two surfaces.
The new shape has **one door, one route, and no toggle**. §5's routing
rule and §8's state table are the substance; this is only the build
order. ⚠ **2d no longer exists.** Its content — creating the account —
is now the second half of 2a.

**Two routes total:** `/for-tutors` (the pitch) and
**`/for-tutors/apply`** (settled — it lives in the `(public)` group, so
it inherits the public nav and footer; route groups do not affect the
URL). The path is exported once as `TUTOR_APPLICATION_PATH` in
`lib/tutors/types.ts`, because the rejection email and the picker card
both point at it.

⭐ **ONE MIGRATION FOR THE WHOLE SLICE** — `20260921120000_tutor_self
_application.sql`, and only 2a-i needed it. Everything else was already
there: 1d's decision RPC already accepted `APPROVED` and `REJECTED` with
every guard, `grantTutorRole` was already the only code that writes the
role, 1b had already shipped the queue's stylesheet, and
`nclex_roles_self_insert_student` was already shaped for 2c's conversion.

**Build order was 2b → 2a-i → 2c → 2a-ii**, not the order below. The
queue was built first on the reasoning that a queue waiting for
applications is harmless while applications arriving with nothing able to
decide them are dead letters — the doc's constraint is about *shipping*,
not about which to write first.

**2a-i — the door, for people who are already signed in.** ✅ Built. The
pitch page replacing the inert nav `<span>` at
`components/public/public-nav.tsx:25`, plus the application route with
**all five** states of §8 (the `REJECTED` one and its pre-filled form
came here rather than waiting for 2c), the `/student/picker` card, the
submit RPC, and `tutor.application_received` +
`tutor.application_submitted_admin`.

- ⚠ **Nothing can decide these yet.** Do not ship to prod without 2b,
  or applications arrive as dead letters. *(Moot in the end — 2b was
  built first.)*
- ⓘ **It creates no role-less applicants**, which is what made it safe
  to build before 2c.
- ⭐ **THE MIGRATION IS THE SLICE.** `nclex_tutors`' INSERT policy is
  `TUTORS_MANAGE`, so an applicant cannot write their own row, and the
  self-UPDATE policy is narrowed by 1a's column privileges to
  `public_profile` alone. Opening either would hand the applicant the
  `status` column. So: `nclex_tutor_submit_application`, and **it takes
  no user id** — everything is written from `auth.uid()`, which makes
  §5's identity rule structural rather than a check somebody could
  forget. ⚠ Being `SECURITY DEFINER` it re-checks what the column grants
  would have stopped (the 1d lesson): it writes `PENDING` as a literal
  and never touches `approved_*`, `decided_*` or `decision_reason`.
- ⚠ **`SUSPENDED` and `APPROVED` are refused by the RPC**, not merely
  hidden by the UI. See §9.
- ⭐ **The pitch page stays purely presentational** — copy, headings and
  a button, with no application logic in it. Claude Design will design
  it properly later, and that should replace a template, not force a
  rewrite. It is a marketing surface, which is more than "replace the
  inert span" implied.

**2b — decide.** ✅ Built. `/admin/applications` replaces its placeholder
with the queue: a Pending pane (the applicant's note, their history, the
decision) and a Decided tab. Approve (→ `grantTutorRole`) or reject with
a reason. Plus `tutor.application_approved` and
`tutor.application_rejected`.

- ⭐ **Approve is 1c's action with a different trigger, and the check
  PASSED.** No new code was needed for the grant, and no migration for
  the decision — 1d's `nclex_tutor_record_decision` already took
  `APPROVED` and `REJECTED` with every guard. Had it needed either, 1c
  was built too narrowly.
- ⓘ First thing in the arc that can produce a `REJECTED` row.
- ⚠ **The queue is "did anybody apply" (`first_applied_at IS NOT NULL`),
  NOT `status IN ('PENDING','REJECTED')`.** An approved applicant's row
  becomes `APPROVED` and is then indistinguishable from an admin
  promotion by status alone — so a status filter would lose every
  approval the queue ever made, which is the one thing an admin looks
  back for.
- ⚠ **The placeholder promised the wrong thing** and was corrected: it
  described this page as *"approve + trigger setup-link email"*. There is
  no setup link on this path — a self-serve applicant either had an
  account or made one with their own password. Setup links belong to
  slice 3.
- ⭐ **Decided rows OPEN, and it is the same drawer `/admin/tutors`
  opens.** They were dead text beside a tab where records are clickable —
  and five columns cannot answer what the tab exists for. The two drawers
  merged; see §14.

**2c — rejection, resubmission, and the way back in.** ✅ Built.

⚠ **Smaller than this plan expected, and the reason is structural.** The
`REJECTED` state, the pre-filled resubmit form and the `/student/picker`
card all landed in **2a-i**, because they are states of a route 2a-i had
to build anyway (§8). What was genuinely left:

- **The router split.** *"No roles"* used to mean one thing; since the
  self-serve doorway it means two. ⚠ Without this branch **every
  self-serve applicant lands on `/no-access` on every sign-in** — a page
  telling the person we are actively deciding about that they do not
  belong here. Now: no roles **and** a tutor record → their own status
  page; no roles and nothing else → `/no-access`, as before.
- **The conversion offer** (§8): *use MyNclex as a student instead*.
  ⭐ **No migration and no service role**, because
  `nclex_roles_self_insert_student` already permits exactly this and
  nothing more — `user_id = auth.uid() AND role = 'STUDENT'`. Proven
  against the live policy, each rolled back: granting themselves TUTOR is
  **refused**, granting STUDENT to somebody else is **refused**, granting
  themselves STUDENT **succeeds**. The database enforces the shape of the
  action rather than trusting it, which is why it is three lines — the
  opposite of the arrangement `grantTutorRole` needs.
- ⚠ **The tutor record is not deleted or altered** by converting. They
  remain a rejected applicant who is now also a student, because §9 lets
  them come back and resubmit and that needs the row, the reason and the
  count intact.
- ⓘ Offered only to someone who does **not** already hold STUDENT — a
  rejected applicant who was our student all along has nothing to accept.

**2a-ii — the logged-out branch.** ✅ Built. Step 1's email field, the
*"you already have an account — sign in"* bounce, and the new-account
path: `signUp` behind Turnstile, `nclex_users`, **no role**, then the
application. Three short steps; see §5 for why the middle one exists and
where the account-exists answer really comes from.

- ⚠ **Last, deliberately** — it is the first thing that creates
  **role-less applicants**, and **2c must exist first** or they land on
  `/no-access` with no way to learn their own status. ⭐ Note this
  dependency did not disappear when the toggle did; **it moved**. Under
  the old cut it constrained 2d; it now constrains this.
- ⚠ **A first cut of this put a six-field form in front of the visitor**
  and discovered the collision at submit. It was rejected by Sam on
  sight, and correctly: it designed the page around the rare visitor
  (already signed in, decides to apply) and made the common one — a
  stranger — work for it. ⭐ **The rework DELETED code rather than adding
  it**: with the email asked first, nobody writes an application before
  we know who they are, so the sessionStorage draft hand-off, its effect,
  a hydration argument and an `eslint-disable` all disappeared. *When the
  thing you argued hardest for vanishes under the alternative, the
  alternative was right.*
- ⓘ **The account is created BEFORE the application is written**, which
  an earlier cut avoided so as not to leave role-less orphans behind
  anyone who wandered off mid-form. That worry is handled where it
  belongs: 2c routes any role-less person to this page, so an abandoned
  signup lands on the form it abandoned.
- ⭐ **No `/welcome`, no setup link, no confirmation email.** Verified
  against the code on 2026-08-22: `/register` does **not** confirm by
  email today — it calls `signUp`, writes the profile and role *using
  the new user's own session*, then redirects to `/router`. So email
  confirmation is switched **off** on the project, and "check your
  email" would have meant either turning it on project-wide (⚠ which
  **breaks `/register`**, whose inserts depend on the session that
  confirmation withholds) or building a confirm step that reaches into
  `/welcome` — the convergence point slice 3 is sequenced last to avoid.
  Signing them in at submit is what the existing machinery already does.
- ⓘ **What that gives up:** the address is never verified. Same
  exposure `/register` and 1c-ii already carry, and it self-corrects —
  approval mails that address, so a bogus one never hears back. Real
  verification for tutors is a legitimate future call, but it is slice
  3's `/welcome` work pulled forward and should be decided as such.
- ⚠ **Turnstile must be on this form.** Dev's Supabase project has the
  captcha switch ON, so a signup without a pass is refused. A form that
  forgets the widget submits and is silently rejected.

### Slice 3 — invite by email <span>✅ BUILT 2026-08-22 — Sam-tested end to end · NO migration</span>

**3 — invite.** Admin enters an email with no account: creates the
auth user, the `nclex_users` row, the `nclex_tutors` row
(`ADMIN_INVITE`, APPROVED), grants the role, sends the setup link.
`inviteTutorByEmailAction` in `lib/tutors/actions.ts`.

**Two commits:** `282c2e9` (the email learns there are two doors) ·
`fde33d7` (the door itself). **Eight files, no new ones, and no
migration** — `signup_source` is free text and every other write shape
already existed.

- ⭐ **It filled 1c's "new user" branch — it did NOT add a second
  button.** To an admin, "add a tutor" is one action; whether the
  person already has an account is our implementation detail. The
  instruction 1c left there (*"ask them to register, then add them
  here"*) was **replaced in place**, so there was never a moment with
  two controls doing one job.
- ⭐ **The name fields appear only once the address comes back free** —
  which is what asking for the email first was always for. ⚠ And the
  server re-checks the address anyway: the as-you-type verdict is a
  courtesy that is minutes old by the time Invite is clicked, and it
  arrived from a browser.
- ⭐ **1c had left the stylesheet ready, unused.** `.adt-names` (with
  its ≤768px collapse) and `.adt-receipt` were both already there, so
  the form needed one new class. **Third time in this arc** — 1b left
  the queue's entire stylesheet for 2b, and 1d's decision RPC already
  took every verdict 2b needed.

**⚠⚠ THE EMAIL WAS THE REAL GAP, and the plan did not see it.** §10
said "sends the setup link"; `TutorAddedByAdminPayload` had no field for
one, and both its buttons pointed at `/tutor/profile` and `/tutor` —
**behind a login the invitee cannot pass**, because the account has no
password. The template even carried a preview labelled *"Invited by
email (slice 3)"*, so the reuse was anticipated and the link was not.

- ⭐ **Fixed with a DIAL, not a second key** — `entry: 'LOG_IN' |
  'SET_UP'`, mirroring `enrolment-added`, which settled the identical
  fork on 2026-08-12 as *"TWO DIALS, NOT FOUR EMAILS"*. §10's test for
  splitting a key is *"shared facts, nothing else in common"*; here the
  facts **and** the intent are the same — an admin chose you, you are a
  tutor, write your profile. Only the door differs, and that is what a
  dial is for. On `SET_UP` the profile drops from button to sentence.
- ⚠ **Absence of `entry` means `LOG_IN`, and that is a COMPATIBILITY
  rule.** `renderOutboxRow` renders from the frozen payload alone, so
  every row queued before this slice — **including the ones on prod** —
  arrives with no `entry` key and must keep rendering the email it
  actually sent. ⭐ Generalises: adding a field to a payload is adding
  it to history you have already sent.
- ⚠ **The template DEGRADES rather than trusts.** `payload` is
  `Record<string, unknown>` at the enqueue boundary, so nothing
  type-checks "SET_UP carries a link" — a discriminated union would
  have bought exactly nothing where it mattered. With no link it prints
  the sign-in-code route instead of a dead button, which is a real way
  in because the account exists.

**⭐⭐ `last_login_utc` WAS NEVER STAMPED BY `/welcome` — a pre-existing
bug, found only because the chip needed a truthful signal.** The column
was written by `/login`'s two paths and nowhere else, so **anybody who
arrived through an invite and stayed away read as "never signed in"
forever** — wrong for every tutor-invited student and every pay-first
buyer since those flows were built, not just for tutors. Finishing setup
*is* a sign-in. Fixed in `finalizeWelcomeAction`, and that fix is what
makes the directory's new line mean what it says.

- **The chip is `source = 'ADMIN_INVITE'` AND never signed in** — both
  halves. ⚠ The second alone would also flag a *promoted* tutor who has
  not logged in lately, which is a different claim about a different set
  of people. It sits **under** the APPROVED pill rather than replacing
  it, because both are true: an invited tutor really is approved and
  really does hold the role; what the pill cannot say is that nobody has
  walked through the door yet.
- ⓘ Answers Sam's actual question — *"I invited her last week and heard
  nothing"* — on screen instead of by asking her.

**⚠ The `/welcome` risk was SMALLER than this section feared**, and the
fear was written before anyone checked. It called this "the one most
able to break something that currently works". The mechanism —
`generateLink` mints without sending, our email carries the link,
`/welcome` consumes it — has been live for tutor-added students and
pay-first buyers since 2026-08-12. What was genuinely new was a **TUTOR**
landing there, and `/router` already sent a TUTOR-only user to `/tutor`.

- ⚠ **What DID need fixing was the copy.** The email field read *"The
  email your tutor invited"* — true of one of the three flows that land
  there. An admin-invited tutor has no tutor. Now *"The email your
  invitation was sent to."* ⓘ The page is a convergence point; its copy
  has to be true of everybody who reaches it, not of whoever arrived
  first.
- ⓘ **The setup link uses the REQUEST's origin; the workspace links use
  production.** Deliberately asymmetric, inherited from
  `lib/enrolments/enrol-email.ts` — the person reading an email is not
  the person who ran the code, *except* on the one link that exists only
  to be clicked now. It is what makes the flow testable on localhost.
- ⓘ `signup_source: 'ADMIN_INVITE'`, **not** `TUTOR_INVITE` — that one
  means a tutor invited a *student*. Provenance that cannot be
  reconstructed later is worth a distinct word now.

**⏭ A name typo is correctable exactly ONCE** (Sam, 2026-08-22).
`nclex_users.forename/surname/name` are `NOT NULL`, so the invite must
collect a name — otherwise the directory shows `(unknown user)` for
somebody you just invited, which is the blind spot 1b exists to close.
The invitee can correct it at `/welcome` (both fields arrive prefilled
and editable). **After that it is frozen**: nothing in `/admin/*` edits
identity, and `/tutor/profile` hosts only the public profile. ⭐ Settled
as **deferred to the account surface** rather than patched into the
tutor directory — §14 already records that gap as repo-wide, and this
adds one concrete requirement to it: *identity fields, not only the
public profile*.

ⓘ **It was probably the COMMON case, not the edge one** (Sam,
2026-08-21) — most tutors are expected to be strangers, not existing
students. Sequencing it last still paid: 1c built `grantTutorRole()`,
1d proved the decision guards, and the stopgap onboarded anyone who
could register in the meantime.

### If only one thing gets built

ⓘ **HISTORICAL as of 2026-08-22** — slices 1 and 2 are both built, so
this no longer advises anybody. Kept because the reasoning is the useful
part and it was corrected once already; the correction is the point.

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

## 12. Tutor plans and quotas — MOVED <span>2026-08-27</span>

**This section has moved to `tutor-plans-and-billing.md`.** It is a
pointer now, and deliberately holds no reasoning of its own — the
argument it used to carry is load-bearing and must have exactly one
home. (Duplicating a decision across two files is how the Quademia
rename sat half-done for three days.)

That doc answers this section's questions and owns the whole commercial
side: the Free / Pro / Plus proposal, the trial, whether a student's
programme fee touches our merchant account, and the "we'll set your
content up for you" service.

⚠ **It is a PROPOSAL, not a decision.** Nothing there is ratified and
no number in it is fixed.

**What still holds from here, and constrains that doc:**

- `nclex_tutors` holds **no money, no expiry and no plan**. Whatever
  model lands attaches by `user_id` without touching this table, the
  grant, the application flow or the admin surfaces. **Nothing in this
  arc depends on the answer.**
- **Admission ≠ plan assignment** — approval puts everyone on the free
  tier; upgrading is a separate self-serve act; an admin may grant a
  plan *against* a tutor. See §13, where the merged version is recorded
  as rejected.
- Vetting standing and commercial standing are **independent axes** —
  §7, and why `EXPIRED` is not a `status` value (§13).

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
| Four sources — `LEGACY` retired the day it shipped | Keep it for the pre-existing tutors | The premise ("nobody knows when they were approved") was false: `nclex_user_roles.granted_at` had every date. And removing it disambiguated `approved_at`, which had come to mean both "not yet" and "unknowable". (Sam pushed; the mistake was mine.) |
| The welcome email names no admin | Say who promoted them | Provenance is ours, not the recipient's. Harmless with one admin, an accidental disclosure the moment `TUTORS_MANAGE` is delegated. Compare `enrolment-rejected`, which discloses a tutor's address deliberately, because a student who paid them needs to reach them. |
| **One form, routed by EMAIL** <span>2026-08-22</span> | Route by whether you are signed in (the original §5 rule) | The old rule has no answer for *logged out but already has an account* — the commonest real applicant — and walks her into a `signUp` that fails after she has filled the whole form. (Sam's call.) |
| **No register-as-tutor toggle** <span>2026-08-22</span> | MyTeacher's toggle beside the student signup on `/register` | `/register` is on a path to retirement — students increasingly arrive through checkout and set up at `/welcome` — so the toggle builds the tutor door onto a surface we expect to remove. It also deletes slice 2's largest risk: 2d existed as a separate sub-slice *because* it was the only thing touching `/register`. (Sam's call.) |
| **Sign them in at submit** <span>2026-08-22</span> | "Check your email" after applying | Verified in code: `/register` does not confirm by email, and its profile/role inserts run on the new user's own session — so enabling confirmation project-wide **breaks `/register`**, and doing it for tutors alone means building `/welcome` work that slice 3 is sequenced last to avoid. Costs email verification, which self-corrects (approval mails the address). |
| **The apply form and the status page are one route** <span>2026-08-22</span> | A form surface plus a separate application page | The route must read the row before rendering anything (that is how the SUSPENDED refusal works), so the form is just the state where no row is found. Resubmit stops being a screen and becomes the `REJECTED` state. |
| **ONE record drawer for both admin surfaces** <span>built 2026-08-22</span> | A drawer per page — the directory's showing the profile, the queue's showing the application | Sam asked; I argued for keeping them apart ("different lens") and was wrong. `nclex_tutors` is ONE ROW PER PERSON (§2) — two partial views of it leave an admin with two screens for one record and no way to tell which is authoritative, and a rejected applicant appears in **both** surfaces already. It also taxed every future column with a "which drawer?" decision. ⚠ Forces both loaders to fetch every column: a section that hides itself when a field is empty cannot tell "they wrote no note" from "this page did not ask for the note". |
| **The queue keeps its Decided tab — for now** <span>open, 2026-08-22</span> | Delete it; the directory is already the searchable archive of decided applications | Sam's call to stop: the overlap is real but nothing is broken by it. ⏭ The open question is whether `/admin/applications` should become a pure **inbox that empties** — a to-do list that keeps completed items forever has stopped being one — with the directory answering "did we say no to this person before?", which it does better (it has search). Deferred until both pages have been used in anger. The directory's status filter gained Pending and Rejected in the meantime, which was most of why the two felt like duplicates rather than layers. |
| **The email-existence answer comes from `signUp`** <span>2026-08-22</span> | A captcha-gated "is this address taken?" check on step 1 | ⚠ Not buildable. `lib/auth/turnstile.ts`: a Turnstile token validates exactly ONCE and Supabase must spend it, so our own check can only confirm a token *arrived* — a script sends any string. Thresholds are keyed by email, which is what an enumerator varies. So the email is asked first for the UX, and Supabase answers it for real one step later. |
| **`source` is derived, not passed** <span>2026-08-22</span> | A parameter from the client (or a `?new=1` flag) | Every other route into an account grants a role on the way in, so holding **no role** at submit means they came through this form. A client-supplied value would let an applicant write a fact about *our* provenance. |

**Three things from MyTeacher deliberately not copied:** its single
`users.role` column (overwriting it stops a teacher being a student —
ours grants additively); its silent failure on the request insert
(logs to console and proceeds, so the person is told "pending" when no
row exists — ours must fail loudly or not at all); and the
denormalised email/name.

---

## 14. Knock-on, and things found next door

- ✅ **CLAUDE.md's "Public self-serve tutor signup" deferral is now
  corrected** (2026-08-22). It was struck through when Sam re-opened it
  on 08-21; now that slice 2 is built it records that, with the original
  deferral still visible so the reversal reads as history rather than as
  a line nobody ever wrote.
- ⏭ **`/admin/applications` may be over-lapping `/admin/tutors`.** Both
  list the same rows; the directory has search and the full record. See
  §13 — the open question is whether the queue should shrink to a pure
  inbox. Not urgent, and better judged after the pages have been used.
- ⚠⚠ **EVERY PAGE IN THIS APP ANSWERS `Cache-Control: no-cache,
  must-revalidate` — INCLUDING AUTHENTICATED ONES** (measured
  2026-08-22, localhost). CLAUDE.md rule #4 says authenticated pages must
  respond `private, no-store`; nothing implements that half, anywhere.
  Repo-wide and pre-existing, not introduced by this arc — but this arc
  is what surfaced it, because `/for-tutors/apply` renders a person's own
  application (their status, their reason, their own words) and sits in
  the **public** route group. ⓘ `no-cache` does force revalidation, which
  mitigates much of it; the missing word is `private`. Needs checking
  against the deployed Worker before anything is changed, since the
  OpenNext pipeline may differ from localhost.
- ⏭ **The public nav hides every link below 760px**
  (`styles/discovery.css`, `@media (max-width: 760px)` →
  `.pub-nav .links { display: none; }`). So on a phone the tutor doorway
  is reachable only by typing the URL. Pre-existing and affects all four
  public links; worth a decision now that one of them is a door we want
  people to walk through, and the audience is phone-first.
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
  - ⭐ **Slice 3 gave it a concrete requirement: IDENTITY fields, not
    only the public profile** (Sam, 2026-08-22). An invited tutor's name
    is typed by the admin inviting them, who may have misheard it. The
    invitee can correct it **once**, at `/welcome`, where both fields
    arrive prefilled; after that nobody can — nothing in `/admin/*`
    edits `forename`/`surname`, and `/tutor/profile` holds only the
    outward-facing bag. Settled as *deferred to this surface rather than
    patched into the tutor directory*, because the hole belongs to every
    user of every audience.
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
