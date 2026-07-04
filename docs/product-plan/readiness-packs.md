# Readiness Packs

Last updated: 2026-07-04 (doc created + one full planning session —
consolidates the readiness-pack planning previously scattered across
`payments-and-enrolment.md`, `bank.md`, `bank-consumption.html` and
`main.md`. Settled same day: wrappers-in-packs + the real-NCLEX
composition guideline · the membership link table (per-child rows) ·
the corrected per-entity reservation rule · the CAT pool-exclusion
constraint · the credits model (dedicated table, 16-column working
shape, timestamps-no-status, mint-at-activation frozen grant) · the
21-day window semantics · one-shot/abandonment/re-claiming · publish
gate & membership edits · admin surface shape · visibility incl.
trials · seeding/naming. Open: §11.2 + §11.5 are proposals awaiting
Sam's confirmation — first items next session.)

**This is the canonical home for everything readiness-pack.** The other
docs keep short pointers here. Where an older doc's section conflicts
with this one, this doc wins.

Status legend: **settled** · **settled-by-analogy** (follows an
established house rule, confirm at build time) · **open**.

---

## 1. What a readiness pack is <span>settled</span>

A QAcademy-owned product: a curated, fixed-form, exam-simulating
assessment sold separately from (and bundled with) the bank
subscription. The student buys a pack, sits it **once**, under exam
timing, and gets a score that means something *because everyone who
takes that pack answers the same 100 questions* — a fixed yardstick.

Marketing name on the public page: **"Exam Readiness Assessments"**
(bank-access page, Section 2). Internal/product name: readiness packs.

How it differs from the neighbours:

| | Readiness pack | Custom practice | CAT (planned) |
|---|---|---|---|
| Question list | Fixed, curated | Student-filtered | Adaptive, drawn live from the whole eligible bank |
| Retakes | **One shot, ever** | Unlimited | Repeatable |
| Timing | Always timed, exam pace | Student's choice | Timed |
| Value | Comparable, predictive score | Practice in the shape you need | Exam *feel* + ability estimate |

Tutors do **not** get readiness packs (`nclex_tutor_readiness_packs`
deliberately doesn't exist) — tutors use Mock activities instead.
Settled in the original bank schema design.

---

## 2. Format & attempt rules <span>settled 2026-05-17</span>

**Format (all 5 packs identical shape):**

- **Count in v1:** 5 packs, named plainly "Readiness Pack 1" → "5".
- **Length:** 100 questions per pack — fixed, **not CAT**. Predictive
  integrity needs a consistent denominator.
- **Time limit:** 3 hours 20 minutes (200 min = 2 min/question,
  matching the real NCLEX's 5-hour / 150-question pace).

**Attempt rules:**

- **One shot per pack.** No retakes, no resets. If a student can
  retake the same 100 questions, the score isn't a real signal any
  more (UWorld follows the same rule for the same reason).
- **Permanent until activated.** Once entitled (bundled or
  standalone), a pack sits dormant in the student's account forever.
  The clock only starts on "Start".
- **21-day window on activation.** Same for bundled and standalone.
  Chosen over UWorld's 14 days — more generous, mild differentiation,
  still tight enough to feel focused rather than "a second bank
  subscription".
- **Window is independent of the bank subscription.** Unactivated
  packs survive bank expiry; a student can return months later,
  activate, and get their 21 days.

**Runner rules** (from the source/mode/state framework,
`bank-consumption.html` §15 — that framework itself stays canonical
there):

- `READINESS_PACK` is one of the three locked attempt **sources**.
- **Mode is set by us at pack authoring** — default **Timed
  Sequential** (no backtracking; exam-authentic).
- **No resume across sessions — but packs deviate from the general
  "abandoned = discarded" rule:** a quit **submits-as-is** instead of
  voiding, and a connection loss is re-enterable while the sitting's
  own clock runs. See *One shot, abandonment & re-claiming* below.
- **Review: inside the window only** — packs deviate from the
  general "review forever" rule; see *The 21-day window — semantics*
  below. (Custom practice keeps review-forever untouched.)

**Relation to the Readiness Signal** (`bank-consumption.html` §6):
pack results **feed** the signal as ordinary attempts — they are
**not specially weighted** and the signal never requires a pack (a
bank subscriber may have done zero packs).

### The 21-day window — semantics <span>settled 2026-07-04</span>

Grounded in what UWorld does with its Self-Assessments (2-week
window from activation; sitting AND review both live inside it;
after the window, answers are no longer viewable — even the score
needs a support email). We adopt the same shape, more generous on
results. **The window is not just time-to-sit — it's time to sit
AND time to learn from it.** Three rules:

1. **The window covers the sitting and the review.** Question-level
   review (questions, the student's answers, correct answers,
   rationales) is available from completion until day 21, then
   closes. **The result never disappears:** score, band and the
   per-category breakdown persist forever in history and keep
   feeding the Readiness Signal (deliberately more generous than
   UWorld, and content-safe — a breakdown exposes no questions).
   Rationale for closing question review: pack questions are a
   reserved, reusable asset; review-forever means permanent exposure
   of 100 reserved questions to everyone who ever sat the pack.
2. **Expires unstarted = the credit is spent.** Activate and never
   sit → day 21 consumes the shot; no reset, no credit refund. The
   student controlled the clock completely (packs wait unactivated
   forever), so "Start my window" is the commitment moment — and the
   UI must say so before the press. (Same as UWorld; same logic as a
   real exam no-show.)
3. **Started inside the window = always allowed to finish.** The
   window governs *whether you may start*; once started, the sitting
   is governed only by its own 3h20m timer. A sitting begun at 23:00
   on day 21 completes and scores normally past the window's end —
   the only cost of starting that late is little/no review time. No
   grace-period bookkeeping beyond "the sitting completes".

### One shot, abandonment & re-claiming <span>settled 2026-07-04</span>

Four rules (UWorld-verified: the same assessment can only be taken
once — *"it can't be reset"* — and their answer to "test me again" is
the catalogue of distinct assessments, pitched as *"each test acts as
an independent data point, ensuring you don't memorize questions"*):

1. **Starting the sitting = the shot.** Gated by a full-stop
   preflight warning that cannot be clicked casually: *this is your
   one attempt; leaving mid-exam ends and scores it.*
2. **Quit = submit-as-is, not void** (deviation from the general
   "abandoned timed session = discarded" rule, packs only).
   Unanswered questions score zero, the result computes, review works
   normally for the rest of the window. The student gets something
   honest for their money; the Readiness Signal gets real data; the
   credit's story stays clean (used + attempt link, like any
   completion).
3. **Connection loss ≠ quit.** The sitting can be re-entered while
   its own 3h20m clock is still running — the clock never pauses
   (exam-authentic). Clock runs out before they return →
   auto-submit-as-is. No quit-and-restart, but a Wi-Fi blip doesn't
   destroy a paid attempt.
4. **Which packs can a fresh credit claim?** A credit is generic (no
   memory); the student's own history with each pack decides:

   | History with the pack | Claimable? | Why |
   |---|---|---|
   | Never touched | ✅ | nothing to protect |
   | Live claim held (claimed / window running) | ❌ | already owned — would waste a credit |
   | **Sat** (even partially — quit counts, rule 2) | ❌ **ever** | one shot per pack: the questions are exposed, a repeat score could never be honest |
   | Earlier claim **expired unused** | ✅ | not one question was seen — fresh as untouched (the credits table's no-double-claim rule ignores `expired_at` rows) |

**Why sat-stays-closed even for a willing re-payer** (challenged +
upheld 2026-07-04): a re-sit score is inflated by familiarity — it
measures memory, not readiness — and hands the student false
confidence at the exact moment they're deciding whether to book the
real exam; it also contaminates the Readiness Signal, percentiles and
future v2 calibration. The *desire* ("test me again") is honestly
served by a **different** pack — that's what the multi-pack catalogue
is for, and it earns the same revenue. UI treats it as a redirect,
not a wall: *"Pack 2 can't be re-sat — a repeat score wouldn't be a
true measure. Ready to test your improvement? Pack 3 is fresh to
you."*

**Parking lot (v2, only if re-sit demand proves real):** more packs
(UWorld grew to 6), and possibly an explicitly-labelled *"practice
re-run — not scored, not predictive"* mode. Never a scored re-sit.

---

## 3. Pricing & SKUs <span>settled 2026-05-17</span>

Moved here from `payments-and-enrolment.md` (which keeps the bank
pricing and the generic payment flows).

**Standalone catalogue (3 SKUs)** — sold from the bank-access page,
Section 2:

| SKU | What it grants | GHS | USD | USD per pack |
|---|---|---|---|---|
| Single Pack | 1 pack — student picks any 1 of the 5 | ₵100 | $20 | $20 |
| Select 3 | 3 packs — student picks any 3 of the 5 | ₵240 | $48 | $16 (20% off) |
| All 5 | All 5 packs unlocked | ₵350 | $70 | $14 (30% off) |

Card copy: *"100 questions · 3 hours 20 minutes · one shot per pack ·
21-day window on activation."* Selection of which packs happens
**post-purchase**, so a returning student is never blocked from buying
by the SKU shape.

**Bundled credits per bank tier:**

| Bank tier | Pack credits |
|---|---|
| Trial | 0 |
| 30 days | 0 |
| 60 days | 1 |
| 90 days | 2 |
| 180 days | 3 |
| 365 days | 5 (all) |

Packs only kick in on serious commitment — 30d is pure bank, no
readiness sweetener.

**Bundle vs standalone value:**

| Tier | Bank price (USD) | Packs | Standalone value | Combo worth | Bundle saves |
|---|---|---|---|---|---|
| 30 days | $30 | 0 | — | $30 | — |
| 60 days | $50 | 1 | $20 | $70 | **$20** |
| 90 days | $70 | 2 | $40 (2× Single) | $110 | **$40** |
| 180 days | $110 | 3 | $48 (Select 3) | $158 | **$48** |
| 365 days | $160 | 5 | $70 (All 5) | $230 | **$70** |

(2-pack rows price as 2× Single — there is no "Select 2" SKU. GHS
savings scale the same way: ₵100 / ₵200 / ₵240 / ₵350.)

**Interaction rules (bundle + standalone coexist):**

- Bundled packs are granted as **credits**, not pre-assigned packs —
  a 90d bank gives "2 credits"; the student picks which 2 of the 5 to
  claim. A standalone purchase grants its packs the same way (the SKU
  fixes the *count*, the student picks the packs).
- A student can buy standalone packs on top of a bundle.
- During selection, the system **disables packs the student already
  owns** (bundle-claimed or previously purchased) — prevents
  double-purchase and wasted credits.

**Principles:** Single at $20 anchors to UWorld's standalone price;
30% off at All-5 mirrors the bank's reward-commitment curve; GHS
regionally priced (Single ≈ 5% of monthly Ghanaian entry-nursing
salary, All 5 ≈ 16%); the bundle line is real marketing — *"a year of
bank + all 5 readiness packs, $70 cheaper than buying separately."*
Rejected alternatives (lower and higher tables) are preserved in
`payments-and-enrolment.md` → *Pricing — Readiness packs* for the
record.

**Readiness packs are NOT offered at programme checkout** (settled —
keeps programme checkout simple; packs sell through the readiness
page).

---

## 4. Content: reservation mechanics <span>settled; per-entity rule corrected 2026-07-04</span>

Pack questions are **reserved**: they must never appear in the student
custom-quiz builder (and later, never in the CAT pool — §8).
Otherwise a student could meet pack questions before buying the pack,
and the one-shot score stops being a clean signal.

**No new tables for the questions themselves, and no new column.**
Pack questions stay ordinary `nclex_bank_items` rows — every editor,
image, wrapper, scoring and runner path operates on bank items, and
none of that stack gets duplicated. Reservation uses the pieces that
already exist:

1. **Hiding = `is_builder_visible = FALSE`** — the flag already exists
   and the builder pool + the tag picker already filter on it
   (verified in the live pool SQL, 2026-07-04).
2. **Bookkeeping = a `readiness` workflow tag** — "which hidden
   questions are readiness stock, how far to 500?" is answered by a
   tag, the same trick as `for_prod`. Zero schema change. Because the
   tag picker excludes non-builder-visible rows, the tag does not leak
   to students — **tag and hide in the same save** (a tagged-but-
   visible question would leak its tag until hidden).
3. **Membership = the link table** (§6) — which pack, what position.

A dedicated `is_readiness_question` column was considered and
**rejected** (2026-07-04): it would duplicate what the flag + tag
already say, every query would need to check both, and they can
drift. One hiding flag + one workflow tag + one link table keeps each
job in exactly one place.

### The per-entity reservation rule (corrected 2026-07-04)

Builder visibility is checked on **different rows** per entity type,
so "reserve this" means a different flip per type:

| Reserving… | Flip `is_builder_visible = FALSE` on… | Why |
|---|---|---|
| A standalone question | the question row | the pool's baseline filter checks it directly |
| A case study | **the case row** (one flip hides the whole 6-question unit) | the pool checks the *case row's own* flag; case children are excluded from the standalone pool by `parent_case_id` regardless, so flipping the 6 children would do nothing |
| A trend | **the trend's child question rows** | trend questions appear in the pool as standalone rows with their own flags; the trend dataset's own flag is a known no-op |

(An earlier framing — "hiding a case's children hides the case" —
was wrong in mechanism: what the 2026-07-03 eligibility fix derived
from children was classification/tag *matching*, not visibility. The
conclusion stands, the mechanism above is the true one.)

**Removal never auto-exposes.** When a question (or wrapper) is
removed from a pack, it stays hidden; a curator re-exposes
deliberately. Safest default for a sold product.

**Post-completion:** once a student has completed a pack, its
questions **stay hidden from the builder forever** — no per-student
unlock state. (Kept from the original bank plan.)

---

## 5. Wrappers in packs <span>settled 2026-07-04</span>

**Cases and trends go into packs.** The real NCLEX-RN has included
unfolding case studies in every sitting since the NGN change (three
cases / 18 questions minimum, woven among standalone items) — a
100-question "exam-simulating mock" with zero cases would feel
noticeably less real than the exam it predicts, and prediction is the
product. The machinery is already there: the runner handles wrapper
questions inside ordinary attempts (case panel, trend panel,
progressive disclosure, frozen snapshots), and a pack attempt is just
another attempt.

**Atomicity is the one hard rule enforced in code.** A case is
atomic: its 6 questions enter a pack as a unit, consecutive and in
slot order — progressive chart disclosure and the CJMM sequence only
make sense whole. Trends are the same idea with variable question
counts. The admin picker therefore needs "add this case (6
questions)" as a single action, and pack composition maths reads like
the real blueprint: e.g. 3 cases (18 Q) + 82 standalone = 100.

**Mix is a curation guideline, not code** — code enforces only
atomicity (whole wrappers, in order). Keeps the 5 packs free to vary
without a migration.

### Composition guideline <span>adopted 2026-07-04, real-NCLEX-grounded</span>

The real NCLEX-RN (NGN, since April 2023): 85–150 items (70–135
scored + 15 unscored pretest); **every candidate gets exactly 3 case
studies = 18 scored items** regardless of length (≈26% of scored
items on a minimum exam, ≈13% on a maximum one); **standalone
clinical-judgement items (bow-tie + trend) run at ~10%** of the items
beyond the cases, scaling with length (≈5 short exam, up to ≈12
long). Scaled to our 100:

| Component | Per 100 questions | Notes |
|---|---|---|
| Case studies | **2–3 cases (12–18 Q)** | atomic, slot order — the two real-exam proportions bracket exactly this range |
| Trend + bow-tie | **~8–12 Q** | the "10% standalone clinical judgement" layer |
| Traditional standalones | **~70–80 Q** | across the Client Needs blueprint |

- **Bow-ties need nothing new** — `BOWTIE` is an ordinary standalone
  type; no atomicity, no wrapper.
- **Prefer small trend attachments** — on the real exam a trend is a
  *single* question with a trended-tabs stimulus; pack trends should
  carry **1–3 questions per dataset**, not a 10-question run.
  Atomicity applies as settled.
- **Blueprint proportions** — the NCLEX test plan's Client Needs
  category % ranges are authoring guidance for the whole 100; the
  admin pack detail displays a blueprint meter (§ admin surface),
  never a block.

**CAT's wrapper exclusion is irrelevant here** — cases are excluded
from the *adaptive* pool in v1, but packs are fixed-form, so that
deferral doesn't constrain pack content.

---

## 6. Storage: the membership link table <span>settled 2026-07-04</span>

The original sketch (copied from Licensure) put a plain
`item_ids TEXT[]` on the pack row — the table exists (empty) with that
shape today. **Replace it with a link table**,
`nclex_readiness_pack_items` — one row per pack↔question membership,
carrying position. Reasons:

1. **The database can protect a sold product.** A real FK lets
   Postgres physically refuse to delete a question that sits inside a
   pack. A text list silently keeps a broken ID — discovered only when
   a paying student's one-shot mock loads 99 questions.
2. **"Is this question reserved, and by which pack?" becomes
   instant.** The builder pool exclusion, a "Pack 3" badge on the bank
   list, and the no-double-membership rule in the picker are all
   trivial lookups with a link table, awkward scans with a text list.
3. **It's the house pattern.** Case membership works exactly this way
   (`nclex_case_study_items` — one row per question-in-case, with
   position). Same shape of relationship, familiar code everywhere.

Illustrative shape (not binding until the build slice):

```
nclex_readiness_pack_items
  pack_id    TEXT NOT NULL REFERENCES nclex_readiness_packs ON DELETE CASCADE
  item_id    TEXT NOT NULL REFERENCES nclex_bank_items ON DELETE RESTRICT
  position   INTEGER NOT NULL          -- 1..100, the sat order
  UNIQUE (pack_id, item_id)
  UNIQUE (pack_id, position)
```

**Wrapper members: per-child rows** <span>settled 2026-07-04</span> —
a case in a pack = 6 link rows (one per child question) at
consecutive positions in slot order; a trend = one row per attached
question. This is the **established attempt-items pattern applied at
authoring time**: `nclex_attempt_items` already flattens wrappers
into per-child rows with flat positions + wrapper reference columns,
and the runner walks one flat list. Consequences: position numbering
stays natural; FK delete-protection lands on every actual question;
pack attempt creation maps link rows → attempt rows nearly 1:1 (the
runner doesn't know it's running a pack). The link rows carry **no
wrapper columns** — each bank question already knows its parent case
on its own row; the loader derives grouping the way attempt creation
does today. **Consecutive-and-in-slot-order is enforced at save** by
the picker's "add case/trend as a unit" action.

### Publish gate & membership edits <span>settled 2026-07-04</span>

- **The publish toggle gates on completeness:** all 100 positions
  filled + every member question published per the normal authoring
  rules + member wrappers published + pack basics present (title,
  time limit). Blocks with a notice naming what's missing; gate on
  the toggle, not save (drafting stays frictionless — the case
  wrapper's pattern).
- **"Publish all N & publish pack"** helper (mirror of "Publish all &
  publish case").
- **Un-publish stops new sales and new claims only** — it never
  touches existing credits, attempts or review.
- **NO membership lock on published packs** (Sam's call — the
  attempt-snapshot system already freezes every sitting as sat, so
  past attempts are untouchable regardless of edits). The one
  uncovered corner is **cross-student analytics** (percentiles assume
  one yardstick), handled three cheap ways instead of a lock:
  membership changes are **audit-logged** (the entity-generic audit
  system extends to the pack + link tables — "which 100 questions on
  any given date" stays answerable); a **curation guideline** — swap
  to fix defects only, a content refresh is a new pack; and pack
  analytics carries the **drift caveat** (tolerate or segment by
  membership era — decided at the analytics slice; the audit log IS
  the captured data).
- Consistency for free: swapping a question *out* leaves it hidden
  (never auto-expose); swapping one *in* requires it published, and
  the machine-managed flag hides it in the same save.

### Admin surface — shape <span>settled 2026-07-04; pixels to CD later</span>

Three lenses:

1. **Packs list** (`/admin/packs`): the 5 packs, status, fill
   progress ("Pack 1 — 64/100"), blueprint-health hint.
2. **Pack detail:** members **in position order**, wrapper units as
   grouped collapsible blocks; composition meters — fill (97/100),
   mix vs the composition guideline (cases / trend+bow-tie /
   traditional), and the **blueprint meter** (Client Needs
   proportions vs the published ranges — guidance, never a block);
   the publish toggle + gate + helper.
3. **Reserved-stock view:** the ~500 `readiness`-tagged questions,
   filterable, each showing "Pack 3 / unassigned" — the how-far-to-
   500 bookkeeping lens. Possibly a filter preset on the existing
   bank list rather than a new page (build-time call).

**The picker** (inside pack detail): the established
filter → tick → add pattern, in two sections — standalone questions,
and wrappers with per-unit **"Add case (6 questions)" / "Add trend
(N questions)"** (atomicity enforced at save). Only
published-or-publishable, non-member questions offered; a question in
another pack shows its badge and can't be double-added (instant via
the link table). **Positional control reuses the just-built
patterns** — insert-at-position + move arrows on member rows, wrapper
units moving as one block.

**The visibility flag becomes machine-managed.** Adding a question
(or wrapper) to a pack flips the right flag(s) off (per the §4
per-entity rule) in the same save; removal leaves them hidden (never
auto-expose). The flag and the pack contents cannot drift, and there
is no manual curator step to forget.

The pack row keeps `title / description / n / time_limit_sec /
published / status`; `item_ids` is dropped by the same migration that
adds the link table (the table is empty — cheap). `price_cents` on the
pack row is superseded by the products catalogue (§7) and should be
dropped too.

---

## 7. Payments & entitlement: the credits model <span>direction settled 2026-07-04; exact table shape deliberately NOT locked</span>

### The model

**However a readiness entitlement arrives, what the student holds is
credits, claimed against packs of their choosing later.** Credits
arise three ways:

1. **Bundled with a bank product** — 60d→1, 90d→2, 180d→3, 365d→5
   (Trial and 30d carry zero).
2. **Standalone readiness SKUs** — Single/Select 3/All 5 → 1/3/5
   credits. (For All 5 the claiming step is trivial — 5 credits, 5
   packs, no choice — but the mechanics are identical.)
3. **Admin grant** — no payment behind it.

**Claiming is its own, final step** (settled 2026-07-04): the student
turns a credit into a named pack on their dashboard *before* — and
separately from — activating the 21-day window. Claims don't
un-claim (harmless: the 5 packs are deliberately identical in shape).

### Three tables, three jobs

- **`nclex_payments`** (exists, live) — the charge/receipt. One row
  per product bought. Already knows the `READINESS_PURCHASE` purpose;
  `lib/payments/init.ts` already routes READINESS products to it.
- **`nclex_subscriptions`** (exists, live) — **bank time only.** A
  readiness purchase creates **no subscription row**. Its two
  never-written readiness columns (`readiness_pack_id`,
  `readiness_activated_at`) are slated for removal in the build
  slice's migration — free while unused.
- **A NEW dedicated credits table** (working name
  `nclex_readiness_credits`). One row per credit. Working column
  shape **accepted 2026-07-04** (below) — final lock at the build
  slice.

### The credits table — accepted working shape (2026-07-04)

**No status column — the event timestamps are the only truth** (Sam's
call, 2026-07-04): a status column would duplicate what the
timestamps already say and the two could drift — the same
one-fact-one-home principle that rejected the subscription shell row.
The stage is *derived* from which blanks are filled, via one shared
code helper so every screen reads it identically. (Enrolments keep
their explicit status column deliberately — an enrolment's life loops
and pauses; a credit's is strictly one-way. Linear lifecycle →
timestamps; loopy lifecycle → status.)

| # | Column | Holds | Filled when |
|---|---|---|---|
| 1 | `credit_id` | PK | minting |
| 2 | `user_id` | owning student | minting |
| 3 | `source` | `SELF_PURCHASE` · `BANK_BUNDLE` · `ADMIN_GRANT` | minting |
| 4 | `payment_id` | the spawning receipt | minting; NULL for admin grants |
| 5 | `granted_by` | which admin granted it | admin grants only |
| 6 | `pack_id` | the claimed pack | claiming; NULL before |
| 7 | `attempt_id` | the one sitting that consumed the shot | completion; NULL before |
| 8 | `created_at` | minted | minting |
| 9 | `claimed_at` | pack picked | claiming (with #6) |
| 10 | `activated_at` | window started | activation |
| 11 | `expires_at` | **the deadline** — activation + 21d, frozen per-credit | activation (with #10) |
| 12 | `used_at` | sitting completed | completion (with #7) |
| 13 | `expired_at` | **the lapse event** — window passed unused | the nightly sweep |
| 14 | `revoked_at` | taken back | refund/admin path |
| 15 | `revoked_reason` | why (refund, error…) | with #14 |
| 16 | `updated_at` | housekeeping | every write |

`expires_at` vs `expired_at` — deadline vs event — are both needed:
DB-level rules can only read what's written in rows (never the
clock), so the sweep stamping `expired_at` is what lets the
no-double-claim constraint ignore lapsed credits; it also gives
honest reporting. Reading the stage: #8 only = unclaimed credit →
+#9 = claimed → +#10/11 = window running → exactly one of #12 / #13 /
#14 ends the story.

**Database-enforced rules:** activation requires a claim; used
requires activation; used/expired/revoked mutually exclusive; a claim
must name a pack; provenance must exist (payment or admin, matching
`source`); **no two live claims on the same pack per student** (the
disable-owned rule with teeth); a claimed pack can't be deleted.
Students read their own rows; every transition goes through a
server action that re-validates (layered enforcement).

**The table deliberately does NOT:** gate review (review-forever
reads the attempt), touch the builder pool (reservation = flag +
link table), or store attempt content.

**Both former seams are now settled** (§2 → *One shot, abandonment &
re-claiming*): `expired_at` rows are ignored by the no-double-claim
rule (expired-unused packs re-claimable with a fresh credit), and a
deliberately abandoned sitting consumes the credit via
submit-as-is (used + attempt link, like any completion).

### Credits are minted at activation — the grant is frozen

The products catalogue is only the **recipe** ("this SKU carries 2
credits"). At activation the recipe is cooked: real credit rows are
**minted** into the credits table, and from then on the student's
ownership lives entirely in those rows — the subscription row never
carries credit information, and the product row is out of the
picture. Minting (rather than deriving "they qualify for N" from the
product at read time) freezes the grant at what was promised at
purchase: a later catalogue edit to a bundle count cannot change
already-granted credits — the same freeze philosophy as the
enrolment plan snapshot. It also gives each credit a row to carry its
own lifecycle, and removes any entitled-minus-claimed arithmetic.

### Worked examples

- Buy **BANK_90D** → 1 payment row → activation creates 1
  subscription row (90 days of bank, knows nothing about credits)
  **+ 2 credit rows minted** (bundle provenance, pointing at the same
  payment).
- Buy **READINESS_SELECT3** → 1 payment row → **3 credit rows
  minted**, no subscription row.
- Admin grants a pack → 1 credit row, no payment.

### Rejected (2026-07-04)

Squeezing per-credit state into `nclex_subscriptions` (this doc's
earlier "likely shape") — rejected after discussion: the credit's
stage would be *inferred* from which columns happen to be filled
rather than stated; one-payment→N-rows would weaken the table's
one-entitlement-per-payment database guarantee for bank rows too; and
a one-shot paid product deserves boringly explicit record-keeping.
The subscriptions table goes back to doing one thing well.

### Unchanged

- `nclex_products` carries READINESS SKUs: `pack_type = 'READINESS'`,
  `readiness_pack_count` (1/3/5), and `bundled_readiness_credits` on
  BANK_DURATION rows. (An early sketch in the payments doc put a
  per-SKU `readiness_pack_id` on products — the schema as built
  correctly uses the *count*. The built shape is canonical.)
- The pay-first / invite flow, dual currency, and the trial machinery
  are all shared with bank purchases
  (`payments-and-enrolment.md` stays canonical for those).

---

## 8. Interaction with CAT <span>settled as a constraint 2026-07-04; CAT itself parked</span>

CAT is the opposite animal: it draws from the **whole eligible bank,
live** — no fixed list, by design. The two products split cleanly and
the split is the point (fixed yardstick vs adaptive feel). Two
consequences land on the pack side:

1. **The CAT selection pool must exclude reserved pack questions** —
   the same reservation the builder honours, which the link table
   makes easy to enforce. Written here because the builder's filter
   and CAT's pool query will be separate pieces of SQL; the CAT build
   slice must carry this rule explicitly
   (`bank-consumption-cat.html` §12.7 build-handoff should point
   here).
2. **"Unseen" is a preference, not a promise.** CAT picks unseen
   first, then falls back to "seen in practice but never in a CAT",
   then true repeats — a guarantee is impossible to keep for heavy
   practice users. Rough maths: a 5-CAT allowance at up to 150 Q/CAT
   needs ~750 unseen questions as a bare floor and ~1,500
   CAT-suitable standalones for genuinely clean runs (the algorithm
   needs *choice* at every difficulty level, not just count).

**Status note (2026-07-04):** Sam is not yet convinced CAT earns its
cost (heavy engineering + a quiet ~1,500-question content demand).
Parked without prejudice. **Nothing in the readiness-pack build
depends on CAT** — packs work identically whether CAT ships or never
does. The pool-exclusion rule is enforced from the pack side anyway.

---

## 9. Content budget <span>settled as a planning number 2026-07-04</span>

- **~500 reserved questions** for the 5 packs (some inside cases/
  trends per the §5 mix), authored over months and earmarked as they
  land (flag + `readiness` tag).
- Reserved questions are **500 questions the builder and CAT can
  never touch** — be deliberately stingy while the bank is young.
- Full product vision (packs + healthy builder + CAT as designed) ≈
  **2,000+ published questions**. This number shapes curation pace,
  not any build slice.

---

## 10. Current build state (2026-07-04)

**Already exists:**

- Schema: `nclex_readiness_packs` (empty, old `item_ids` shape),
  `nclex_attempts.source = 'READINESS_PACK'` + FK + integrity
  CHECKs, products/payments/subscriptions columns per §7.
- Payment machinery handles READINESS purchases end-to-end
  (init → verify → activate → subscription row).
- Runner/attempt infrastructure for the other two sources, including
  wrapper rendering and frozen snapshots; history/preflight code
  already references the READINESS_PACK source in passing.
- Bank-access page shows "N readiness packs included" on bank cards.

**Not built (the gaps):**

1. Admin authoring surface — `/admin/packs` is a placeholder (no
   pack CRUD, no question picker, no publish).
2. The link-table migration (+ drop `item_ids`/`price_cents`), and
   the credits-table migration (+ drop the two never-written
   readiness columns off `nclex_subscriptions`).
3. Public catalogue Section 2 (the 3 SKU cards) + READINESS product
   rows seeded.
4. Post-purchase claiming (credits → pick packs; disable owned).
5. Student surface: where packs live, activation moment, the
   one-shot timed run wiring, results.
6. Attempt creation for the READINESS_PACK source
   (`nclex_create_attempt` currently serves the other sources).

---

## 11. Open questions (not yet settled)

1. **Credit/entitlement representation — ✅ SETTLED 2026-07-04** (see
   §7): a NEW dedicated credits table, one row per credit, minted at
   activation with the grant frozen; claiming as its own final step;
   readiness purchases create no subscription row; **no status column
   — event timestamps are the only truth** (16-column working shape
   accepted 2026-07-04, in §7). Final name + column lock at the build
   slice.
2. **Post-purchase claiming UX — PROPOSAL ON THE TABLE (2026-07-04),
   awaiting Sam's confirmation** (the composition discussion
   interrupted it; first item next session): claiming happens on the
   readiness-page pack cards themselves (no separate wizard) · a
   light confirm on claim, with **three escalating gates** — claim =
   light · activate = firm · begin-exam = full-stop preflight ·
   payment result screens deep-link to the page to claim · All-5
   mints pre-claimed · pay-first guests claim after account setup ·
   the dashboard section shows the compact state. Pixels to CD.
3. **21-day window expiry semantics — ✅ SETTLED 2026-07-04** (see §2
   → *The 21-day window — semantics*): review lives inside the
   window (results persist forever) · expires-unstarted = credit
   spent · started-inside = always finishes. The re-claim sliver is
   settled too (§2 → *One shot, abandonment & re-claiming*, rule 4):
   expired-unused packs are re-claimable with a fresh credit.
4. **One-shot + abandonment — ✅ SETTLED 2026-07-04** (see §2 → *One
   shot, abandonment & re-claiming*): start = the shot (full-stop
   preflight warning) · quit = submit-as-is · connection loss
   re-enterable on the sitting's own clock · sat-stays-closed upheld
   against the willing-re-payer scenario (UWorld-verified; redirect
   UI; v2 parking lot).
5. **Results page — PROPOSAL ON THE TABLE (2026-07-04), awaiting
   Sam's confirmation** (interrupted alongside §11.2): a full results
   **page**, not the popup — verdict hero (score + band, honest
   labelling) → per-category breakdown (the remediation map) →
   question list into review · **two lifetimes on one page** per the
   window rule: the report reachable forever, question-review links
   live in-window then disabled with a one-line explanation · review
   reuses the existing review runner, gated by the credit's window.
   Pixels to CD.
6. **Pack publish gate — ✅ SETTLED 2026-07-04** (see §6 → *Publish
   gate & membership edits*): completeness-gated toggle + publish-all
   helper + un-publish stops new sales/claims only + **no membership
   lock** (snapshots protect the past — Sam's call; audit log +
   defects-only guideline + analytics drift caveat instead).
7. **Link-table shape for wrapper members — ✅ SETTLED 2026-07-04**
   (see §6): per-child rows, minimal columns, wrapper identity
   derived from the question row, consecutive-and-in-slot-order
   enforced at save — the established `nclex_attempt_items`
   flattening pattern applied at authoring time.
8. **Admin surface — ✅ SETTLED 2026-07-04** (see §6 → *Admin surface
   — shape*): packs list + pack detail (grouped wrapper blocks,
   fill/mix/blueprint meters) + reserved-stock view; picker =
   filter→tick→add with add-as-unit wrapper sections, double-add
   blocked, positional insert/move reused. Pixels to CD.
9. **Seeding/naming — ✅ SETTLED 2026-07-04:** pack ids follow house
   style (`NCLEX_PACK_00001`); product slugs `READINESS_SINGLE` /
   `READINESS_SELECT3` / `READINESS_ALL5`; the 5 packs created
   up-front as drafts at build time so earmarking has destinations
   and the stock view can show per-pack fill progress.
10. **Trial interaction — ✅ SETTLED 2026-07-04.** The readiness
    catalogue is **visible in-app to every bank audience including
    trials** — zero credits changes what a student *owns*, never what
    they can *see or buy*. (The packs are public on the pricing page
    anyway; a trial student is the hottest lead and a legitimate pack
    customer regardless of bank status; and the 30-day tier needs the
    same section anyway.) **Surfaces (settled):** a section on the
    main bank dashboard **+ a dedicated readiness-pack page** (design
    deferred — CD candidate). **Working concept for the page:** a
    list of the 5 packs where each card's state derives from the
    student's own credit rows — no credit → Buy · unclaimed credit →
    Claim · claimed → Start my 21 days · window running →
    Continue/Review + days left · used → score + band · expired →
    spent. Taste rule: a section, not a nag — no popups or pressure
    banners on trials.

---

## Pointers kept elsewhere

- `payments-and-enrolment.md` — bank pricing, pay-first flow, dual
  currency, trial; the rejected readiness pricing alternatives
  (historical record).
- `bank.md` §Readiness packs — superseded by this doc (pointer
  added).
- `bank-consumption.html` §6 (Readiness Signal), §15 (source/mode/
  state framework) — those frameworks stay canonical there; this doc
  consumes them.
- `bank-consumption-cat.html` — CAT design; must carry the §8
  pool-exclusion rule into its build handoff.
- `main.md` §Readiness packs — one-paragraph summary, points here.
