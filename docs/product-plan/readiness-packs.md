# Readiness Packs

Last updated: 2026-07-09 (**student Slice ②b.1 + ②b.2 step 1 COMPLETE +
MERGED to `main`** — the readiness checkout route (`/checkout/readiness`,
credits buyable; both mint paths proven live) and the student **packs
surface + claiming** (`/student/bank/packs`; claim / claim-all via
service-role actions, the DB one-live-claim-per-pack index the guard;
built from the CD "Readiness Claiming" prototype). Two IA decisions
settled with Sam: **readiness stays a bank-family surface** (relaxed
`requireBankOrReadiness` front door + per-page bank gates + a picker
Readiness door — NOT a third product), and a **reason-aware `/no-access`
wall** (gates redirect with `?need=<reason>`; the bank gate's 6 callers
route through it). Plus **②b.2 step 2a — activate the 21-day window**
(Start my 21 days → writes `activated_at` + `expires_at`, card flips to
ACTIVE with a days-left meter; no Begin button yet). No migration in this
arc. ⏭ NEXT = ②b.2 step 2b (the one-shot runner) → step 3 (results);
~500 questions go onto dev first so packs fill to `n` for a back-to-back
sitting test. See §12 → Slice ②b. Previously (**Slice ②a
COMPLETE + MERGED**): the credits table + mint-at-activation, three
sub-slices [§12 → Slice ②a]; migrations `20260728120000` [credits table
+ subscription cleanup] + `20260729120000` [`mint_index` idempotency key]. Sam-tested
live: a `BANK_60D` buy granted a subscription AND minted its 1 bundled
credit. The mint is keyed on `readiness_credits`, never `pack_type` (the
bundled-credit trap), locked by tests unsatisfiable by the buggy
version. Claiming/activation/sweep deferred to ②b. Scoped the same day
with two §7 revisions, both because later migrations invalidated their
assumptions: **the All-5 pre-claim exception is RETIRED** — every credit
mints unclaimed [§7 → *Post-purchase claiming UX* r4] — and the
`nclex_subscriptions` `pack_type` CHECK narrowed to `BANK_DURATION`
alongside the two dead column drops [§7 → *Three tables, three jobs*].
Previously 2026-07-08:
**student Slice ① COMPLETE** — READINESS SKUs
seeded, the admin Products & Pricing page, and now the public
`/readiness` page [§12 → Slice ①.3, re-cut from "bank-access Section 2"
into a dedicated page]. Everything on that page is a read: N cards, no
badge, "Unlocks every pack" derived, pack specifics in their own block.
Migrations `20260726120000` [anon reads published packs] +
`20260727120000` [`All 5` → `All packs`]. Two fixes fell out: the
publish gate now requires `n`, and the ₵ sign is retired product-wide in
favour of `GHS`. Previously 2026-07-07: §12
build slices added — the minimal slice plan for the build, admin side
first; to be updated as slices land. Previously 2026-07-06: §11.5 results page SETTLED — proposal
confirmed + enriched: popup stays as the source-aware runner summary
[standing rule: it adapts per source], points line beside the
headline %, peer comparator w/ minimum-N gate, per-system +
per-difficulty breakdowns w/ the thin-slice honesty rule, two
lifetimes. Same session: the Readiness-band top label renamed
**Exam-ready → Excelling** in `bank-consumption.html` §6.
**With §11.5 settled, every §11 open question is now closed.**
Doc created 2026-07-04 — consolidates the
readiness-pack planning previously scattered across
`payments-and-enrolment.md`, `bank.md`, `bank-consumption.html` and
`main.md`; §11.2 claiming UX settled 2026-07-05; everything else
settled 2026-07-04.)

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
| All packs | every published pack unlocked | ₵350 | $70 | $14 (30% off) |

The third SKU was named **"All 5"** until 2026-07-08 (migration
`20260727120000`). The live `/readiness` page caught it: with three
packs published, a card headed *"All 5"* rendered the derived line
*"Unlocks all 3 packs"*. Every hardcoded pack count had been driven out
of the code, and one survived in a database column an admin had typed.
Its slug stays `READINESS_ALL5` — a locked identity field; this is the
same offer, not a new one.

Card copy: *"100 questions · 3 hours 20 minutes · one shot per pack ·
21-day window on activation."* Selection of which packs happens
**post-purchase**, so a returning student is never blocked from buying
by the SKU shape.

> ⚠ **This table is the seed, not the shape** (noted 2026-07-08, when
> the admin Products & Pricing page shipped). An admin with
> PAYMENTS_MANAGE can create and retire readiness SKUs at will, so
> "the 3 SKUs" is a fact about today's catalogue, not a constant any
> surface may encode. Likewise the card copy above: `100 questions`
> is `nclex_readiness_packs.n` and `3 hours 20 minutes` is
> `time_limit_sec` — **both editable per pack** — and "any 1 of the
> 5" counts published packs. Every one of those numbers is a read.
> The public page's treatment of this is settled in the *Student
> side → Slice ①* entry below (§12).

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
| 365 days | $160 | 5 | $70 (All packs) | $230 | **$70** |

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
salary, All packs ≈ 16%); the bundle line is real marketing — *"a year of
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

**Atomicity is the one hard rule enforced in code — for CASES ONLY
(trend revised 2026-07-07, ②b build).** A case is atomic: its 6
questions enter a pack as a unit, consecutive and in slot order —
progressive chart disclosure and the CJMM sequence only make sense
whole. The admin picker therefore needs "add this case (6 questions)"
as a single action, and pack composition maths reads like the real
blueprint: e.g. 3 cases (18 Q) + 82 standalone = 100.

**Trends are NOT atomic** — Sam's ②b revision of the original
"same idea with variable counts" framing. A trend question is a
complete self-standing item (no progressive disclosure, no CJMM
sequence — the wrapper build explicitly adopted the chart engine
*minus* disclosure), and the reservation model already treats trend
children individually (per-child visibility flags, §4). So the picker
offers a trend's questions **with per-question checkboxes** — the
curator selects which siblings to place at that insertion point:

- **Batch lands together:** whatever is ticked in one add lands
  consecutively at the insertion point, in item-id order.
- **Blocks are display-over-adjacency, nothing is stored:** the
  detail page's tinted trend block = a run of consecutive same-trend
  rows (the ②a grouping already derives it this way). The block
  moves as one (that's what you placed), and **per-question remove**
  works on trend rows (case rows stay block-remove only).
- **No magnet, no welding:** adding more siblings later inserts them
  wherever the curator points — possibly forming a second block of
  the same trend elsewhere in the pack. Legal by design.
- **No within-block reorder (build-when-it-hurts):** sibling order
  inside a block is the landed order; rearranging = remove +
  re-add at the right spot. Within-block ↑↓ is a cheap app-layer
  bolt-on if real use demands it.
- **Cross-pack splitting allowed:** different questions of one trend
  may live in different packs (the `UNIQUE(item_id)` rule is
  per-child). "Which pack is this trend in?" is a per-question
  answer — badges reflect that.

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
  carry **1–3 questions per dataset**, not a 10-question run. The
  per-question picker (above) makes this natural — take the 1–3 best
  siblings, leave the rest.
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

Shape **locked at build (2026-07-07, Slice ①)** — three changes from
the original sketch, all settled with Sam:

```
nclex_readiness_pack_items
  id         TEXT PRIMARY KEY          -- '<pack_id>:<item_id>' (see below)
  pack_id    TEXT NOT NULL REFERENCES nclex_readiness_packs ON DELETE CASCADE
  item_id    TEXT NOT NULL REFERENCES nclex_bank_items ON DELETE RESTRICT
  position   INTEGER NOT NULL CHECK (position >= 1)   -- the sat order
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  UNIQUE (item_id)                     -- ONE PACK PER QUESTION, DB-enforced
  UNIQUE (pack_id, position)
```

1. **`UNIQUE (item_id)` is global, not per-pack** — the "can't be
   double-added" rule was UI-only in the sketch; per the
   layered-enforcement house rule the database itself now guarantees
   a question belongs to at most one pack (packs never share
   questions — that's the reservation model). The per-pack duplicate
   rule comes free (implied by the global one).
2. **`id` + `created_at`** per the house pattern
   (`nclex_case_study_items`). The `id` is the composite
   `'<pack_id>:<item_id>'` — deliberately meaningful so an audit-log
   row (which stores only `entity_id`) names both the pack and the
   question even after the link row is deleted.
3. **`position` gets a `>= 1` sanity check only** — no hard 1..100
   bound; "exactly n, no gaps" is owned by the publish gate (the
   pack row already carries `n`).

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
the picker's "add case as a unit" action (cases only — trends add
per-question, §5).

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
  the captured data). **Build note (2026-07-07):** the audit trigger
  only knew `created`/`updated` — removing a question from a pack is
  a row DELETE, i.e. half of every swap — so Slice ① widens it with a
  `deleted` action, and the pack + link tables get audit coverage
  **from Slice ① onward** (not Slice ③ as first sketched) so history
  exists from the first membership row. Who-added-it is answered by
  the audit log, not an `added_by` column (the log survives the row's
  deletion and captures the remover too).
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

**The picker** (inside pack detail; trend model revised 2026-07-07 —
see §5): the established filter → tick → add pattern, in three
sections — standalone questions (tick several, add as a batch),
cases with per-unit **"Add case (6 questions)"** (atomicity enforced
at save), and trends with **per-question checkboxes** (select which
siblings land at this insertion point; the batch lands consecutively
in item-id order). Only published, non-member questions offered; a
question in another pack shows its badge and can't be double-added
(instant via the link table). **Positional control reuses the
just-built patterns** — insert-at-position + move arrows on member
rows, case units moving as one block, trend blocks =
display-grouping over consecutive rows with per-question remove.

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
2. **Standalone readiness SKUs** — Single/Select 3/All packs → 1/3/5
   credits. (For All packs the claiming step is trivial *while there
   are five* — 5 credits, 5 packs, no choice — but the mechanics are
   identical, and a sixth published pack turns it into a real choice
   with nobody editing the SKU.)
3. **Admin grant** — no payment behind it.

**Claiming is its own, final step** (settled 2026-07-04): the student
turns a credit into a named pack on their dashboard *before* — and
separately from — activating the 21-day window. Claims don't
un-claim (harmless: the packs are deliberately identical in shape).
**No exceptions — every credit mints unclaimed** (revised 2026-07-08;
the All-5 pre-claim carve-out is retired, see *Post-purchase claiming
UX* r4 below).

### Three tables, three jobs

- **`nclex_payments`** (exists, live) — the charge/receipt. One row
  per product bought. Already knows the `READINESS_PURCHASE` purpose;
  `lib/payments/init.ts` already routes READINESS products to it.
- **`nclex_subscriptions`** (exists, live) — **bank time only.** A
  readiness purchase creates **no subscription row**.
  **Enforced in SQL, not just TS** (settled 2026-07-08): Slice ②a's
  migration drops the two never-written readiness columns
  (`readiness_pack_id`, `readiness_activated_at` — verified 0 rows
  populated, free while unused) **and narrows the `pack_type` CHECK
  from `('BANK_DURATION','READINESS','TRIAL')` to `BANK_DURATION`
  alone.** Both other values became unreachable by earlier decisions
  and nothing cleaned up after them: `TRIAL` when migration
  `20260724120000` made the trial a free `BANK_DURATION` pass (§7 →
  *Unchanged*), and `READINESS` once `activate.ts` stops granting a
  subscription for `READINESS_PURCHASE`. Leaving a CHECK permissive
  for states the product forbids means the database will happily
  record the bug — the layered-enforcement rule says the SQL layer
  mirrors the TS gate. (Verified 2026-07-08 before the decision: dev
  holds 5 subscription rows, none with either readiness column set and
  none with `pack_type` `READINESS` or `TRIAL`; prod holds no
  subscription rows at all. Nothing to migrate, only to forbid.)
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

### Post-purchase claiming UX <span>settled 2026-07-05</span>

How a held credit becomes a named pack. Six pieces:

1. **Claiming lives on the readiness-page pack cards — no separate
   wizard.** The dedicated readiness page (§11.10) already gives each
   pack a card whose state derives from the student's credit rows;
   when the student holds an unclaimed credit, every *eligible* card
   (per the claimability table, §2 → *One shot, abandonment &
   re-claiming*, rule 4) shows a **Claim** button. Picking the pack
   IS the claim. State and action live on the same object.
2. **Three escalating gates, friction matched to what each step
   costs:**
   - **Claim = light confirm.** Irreversible but harmless (the packs
     are identical in shape; the window does NOT start). The copy
     must carry both halves explicitly: *"this won't start your
     21-day window"* (no fear-claiming) AND *"claims can't be swapped
     to another pack"* (no expected undo) — light in friction, not
     light in information. This matters most to a Select-3 buyer
     allocating 3 credits across 5 packs — claiming is their one
     scarce-allocation moment.
   - **Activate = firm confirm** ("Start my 21 days" — the
     commitment moment; day 21 spends the shot even unsat, §2).
   - **Begin exam = full-stop preflight** (the one-attempt warning,
     §2 rule 1).
3. **Payment result screens deep-link to the readiness page.** The
   existing checkout result card gains a "Claim your pack →" CTA for
   readiness purchases — payment to claiming is one click, not a
   hunt.
4. **Every credit mints unclaimed — the All-5 pre-claim exception is
   RETIRED** <span>revised 2026-07-08</span>. It was settled
   2026-07-05 on the reasoning that All-5 means *5 credits, 5 packs,
   zero real choice*, so the claim step would be pure ceremony and
   the rows should mint with `pack_id` + `claimed_at` already
   stamped. Three changes since have each broken a premise of that
   sentence:
   - **"5 packs" is no longer a constant.** The pack count is
     admin-editable (create + delete, post-③ improvements), so
     "which SKU is the all-packs one" cannot be a hardcoded
     `product_id` without re-introducing exactly the count-hardcoding
     bug the §12 → Slice ①.3 re-cut removed from the public page. The
     honest derivation is `readiness_credits >= publishedPackCount`,
     evaluated at mint time.
   - **"5 credits" is no longer a constant.** `readiness_credits` is
     a free integer (migration `20260725120000`) and
     `READINESS_SELECT2` already exists, so there is no 1/3/5 rule
     for the mint to key off.
   - **Pre-claim cannot survive contact with history.** A student who
     has already *sat* a pack can never claim it again (§2 r4,
     claimability table). Buy All-packs after sitting Pack 2 → 5
     credits, 4 claimable packs. Mint-time pre-claim must either fail
     or silently strand a credit with no surface having said so. The
     degenerate case is already live on dev today: **zero published
     packs**, so pre-claim would have nothing to claim into.

   **The rule now:** the mint writes `pack_id` and `claimed_at` NULL,
   always, whatever the SKU. One code path, no mint-time branch, no
   dependency on pack count or purchase history. **The ceremony moves
   to the claiming UI** (Slice ②b): when a student's unclaimed credits
   are `>=` the packs they can still claim, offer a single **"Claim
   all"** button. One click instead of a special case in the ledger.
   A build slice that finds `claimed_at` stamped at mint time is
   looking at a bug, not at this exception.
5. **Pay-first guests claim after account setup.** Credits mint
   against the account at `/welcome` (the established convergence
   point); the student lands on the readiness page with credits
   waiting. No claiming as a guest.
6. **The bank-dashboard section shows the compact state only**
   ("2 credits unclaimed · Pack 1: 12 days left") and links to the
   readiness page. One surface does claiming; the dashboard
   signposts.

Pixels to CD (the readiness page + its claim/activate confirms are
already on the CD-brief list, §11.10 / §11.2).

### The mint rule — one condition, and it is NOT `pack_type`

**Mint `readiness_credits` rows whenever `product.readiness_credits >
0`, regardless of `pack_type`.** Stated explicitly because the
natural-looking implementation is wrong: a mint written as `if
(product.pack_type === 'READINESS')` passes every readiness test,
ships green, and **silently drops every bundled credit** — `BANK_90D`
grants 90 days of bank access *and* 2 readiness credits, and nobody
notices the missing credits until a student asks where their pack
went. `pack_type` answers *what else does this grant* (bank time, via
a subscription row); `readiness_credits` answers *how many credits
does this mint*. They are independent questions and the two purchase
shapes cross:

| Product | Subscription row? | Credit rows minted |
|---|---|---|
| `BANK_30D` (credits 0) | ✅ 30 days | 0 |
| `BANK_90D` (credits 2) | ✅ 90 days | **2** |
| `READINESS_SELECT3` (credits 3) | ❌ **none** | 3 |

`source` on each credit row is what `pack_type` *does* decide:
`BANK_BUNDLE` for a `BANK_DURATION` product, `SELF_PURCHASE` for a
`READINESS` one, `ADMIN_GRANT` where there is no payment.

### Worked examples

- Buy **BANK_90D** → 1 payment row → activation creates 1
  subscription row (90 days of bank, knows nothing about credits)
  **+ 2 credit rows minted** (bundle provenance, pointing at the same
  payment).
- Buy **READINESS_SELECT3** → 1 payment row → **3 credit rows
  minted**, no subscription row.
- Buy **BANK_30D** → 1 payment row → 1 subscription row, **0 credit
  rows** (the `readiness_credits > 0` guard, not a type check).
- Admin grants a pack → 1 credit row, no payment.

All four are unit tests in Slice ②a.2 — the third exists so a
`pack_type`-keyed regression cannot pass the suite.

### Rejected (2026-07-04)

Squeezing per-credit state into `nclex_subscriptions` (this doc's
earlier "likely shape") — rejected after discussion: the credit's
stage would be *inferred* from which columns happen to be filled
rather than stated; one-payment→N-rows would weaken the table's
one-entitlement-per-payment database guarantee for bank rows too; and
a one-shot paid product deserves boringly explicit record-keeping.
The subscriptions table goes back to doing one thing well.

### Unchanged

- `nclex_products` carries READINESS SKUs: `pack_type = 'READINESS'`
  plus **`readiness_credits`** — the count of credits activating the
  product mints. (An early sketch in the payments doc put a per-SKU
  `readiness_pack_id` on products — the schema as built correctly uses
  the *count*. The built shape is canonical.)
  **Revised 2026-07-08 (Sam's catch, migration `20260725120000`):**
  the two original columns — `readiness_pack_count` (READINESS) and
  `bundled_readiness_credits` (BANK_DURATION) — **collapsed into one
  `readiness_credits`**. They answered the same question in two
  places: §3's interaction rules already say bundled and standalone
  packs are granted by the *identical* credit mechanism (the SKU fixes
  the COUNT; the student picks the packs), and a credit's provenance
  derives from `pack_type`. The split forced the mint code to branch
  on type to choose a column, and left an unguarded illegal state (a
  READINESS row could also carry bundled credits — mint 5, or 8?). Now:
  one column, `NOT NULL DEFAULT 0`, with `CHECK (pack_type <>
  'READINESS' OR readiness_credits >= 1)` — a readiness SKU granting
  nothing is broken; a bank pass granting nothing is normal. Done
  before the credits slice so no mint logic or credit rows depended on
  the old shape. **The pack count is a free integer** — no 1/3/5 rule
  exists in the DB, so a "Select 2" SKU is legal.
- **The trial is a free BANK_DURATION pass, not its own `pack_type`**
  (settled 2026-07-08, migration `20260724120000`): `pack_type` = what
  the product grants, `kind` = whether you pay. `'TRIAL'` was dropped
  from the products `pack_type` CHECK; a trial *subscription* is
  identified by `source = 'SELF_TRIAL_SIGNUP'`. This also fixed a
  latent bug — `activate.ts` only sets an expiry for `BANK_DURATION`,
  so an activated trial would have granted bank access with **no end
  date** (unreachable: trial signup is unwired, 0 TRIAL subscription
  rows anywhere).
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

## 11. Open questions — ✅ ALL SETTLED as of 2026-07-06 (kept as the decision log)

1. **Credit/entitlement representation — ✅ SETTLED 2026-07-04** (see
   §7): a NEW dedicated credits table, one row per credit, minted at
   activation with the grant frozen; claiming as its own final step;
   readiness purchases create no subscription row; **no status column
   — event timestamps are the only truth** (16-column working shape
   accepted 2026-07-04, in §7). Final name + column lock at the build
   slice.
2. **Post-purchase claiming UX — ✅ SETTLED 2026-07-05** (see §7 →
   *Post-purchase claiming UX*): claiming on the readiness-page pack
   cards themselves (no separate wizard) · **three escalating
   gates** — claim = light (but the copy carries both halves: window
   doesn't start + no swap) · activate = firm · begin-exam =
   full-stop preflight · payment result screens deep-link to the
   page · **every credit mints unclaimed** (the All-5 pre-claim
   exception was retired 2026-07-08 — a "Claim all" button replaces
   the ceremony; see §7 → *Post-purchase claiming UX* r4 for why) ·
   pay-first guests claim after account setup at `/welcome` · the
   dashboard section = compact state + signpost only. Pixels to CD.
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
5. **Results page — ✅ SETTLED 2026-07-06** (proposal confirmed by
   Sam as drafted, then enriched in the same discussion). A full
   results **page** per sitting — the permanent analytics /
   performance-review surface; the pack card's used state links here
   forever. The confirmed shape:
   - **The popup stays too — page and popup are complementary
     layers.** The runner's universal source-aware results popup
     (built Slice 3a, `lib/practice/runner/results-popup.tsx`;
     `READINESS_PACK` is already in its source union) remains the
     instant on-runner completion summary. For readiness it gets its
     own variant: primary CTA **"See your full report" → this page**,
     no retake button (one shot). **Standing rule (Sam, 2026-07-06):
     the popup must keep adapting intelligently per source** —
     builder session / curriculum-linked quiz / readiness pack /
     future CAT each get fitting copy + actions, never one generic
     popup.
   - **Verdict hero:** score + band, honest labelling (a *measured*
     score on a fixed form — no "Predicted" prefix here, and never
     pass-probability). Bands renamed 2026-07-06: **Building →
     Approaching → Ready → Excelling** (top band was "Exam-ready";
     rename rationale in `bank-consumption.html` §6, which stays
     canonical for bands). **Headline % stays the canonical
     `final_score`** (item-equivalent average,
     `bank-marks-and-scoring.html` §7 — one formula everywhere;
     bands are defined on it) **plus an explicit points line**
     (e.g. "412 of 520 points" — earned vs max marks) so the
     answer-level volume behind NGN partial credit is visible
     (Sam's point: ~100 questions carry far more than 100 scoreable
     answers; partial credit is already in the maths, the points
     line makes it visible).
   - **Peer comparator** (Sam's addition): "You scored higher than
     N% of takers of this pack." A pack is the fairest peer set in
     the product — identical 100 questions under identical
     conditions (this answers `bank-consumption.html`'s open
     cohort-definition question *for packs*). **Minimum-N gate**
     before it renders (~20–30 sittings; below that: "Peer
     comparison unlocks as more nurses sit this pack"). Aggregate
     data → lives in the forever layer.
   - **Breakdowns — a multi-axis remediation map** (Sam's
     addition): per-category (client needs) **+ per-body-system +
     per-difficulty** (all axes already on every bank item;
     subjects / Bloom / CJMM available too if CD wants them).
     **Thin-slice honesty rule:** always show the fraction
     ("1 of 3"), never a bare percentage on tiny slices — 100
     questions across 14 body systems leaves some systems at 2–3
     questions.
   - **Question list → review** via the existing review runner,
     gated by the credit's 21-day window. No new review surface.
   - **Two lifetimes on one page** (the design's spine, mirrors §2):
     the **report layer** (score · band · points · peer · breakdowns)
     reachable forever; the **question-review layer** live in-window,
     then links disable with a one-line explanation ("Question
     review closed on day 21 — your score and breakdown are yours
     forever").
   - Pixels to CD (the results brief joins claiming + the admin
     picker on the CD-brief list).
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

## 12. Build slices <span>sketched 2026-07-06 · recorded 2026-07-07 — update as slices land</span>

Direction set 2026-07-06: **build starts admin side first, CD as
needed mid-build** (not briefs-first; CD most valuable at Slice ②).
This is the minimal slice plan — statuses and build notes get updated
here as each slice lands. Status legend: ✅ done · 🔨 in progress ·
⏭ next · ⬜ pending.

**Admin side (the authoring surface):**

- **✅ Slice ① — Foundation: link table + seed + packs list — BUILT +
  Sam-tested 2026-07-07** (migration `20260721120000` dev-applied +
  probe-verified: seeds + audit rows, RESTRICT blocks deleting an
  in-pack question, link insert/delete → created/deleted audit rows).
  The migration: create `nclex_readiness_pack_items` (per-child link
  rows per §6, the **locked shape** — global `UNIQUE(item_id)`,
  composite id, `position >= 1`), drop `item_ids` + `price_cents` off
  `nclex_readiness_packs` (both empty/superseded). **Audit coverage
  from day one** (pulled forward from Slice ③): widen the audit
  action CHECK + trigger with `deleted`, attach triggers to the pack
  + link tables. Seed the **5 packs as drafts**
  (`NCLEX_PACK_00001`…`00005`, §11.9) so earmarking has
  destinations. The `/admin/packs` placeholder becomes the real
  **packs list**: the 5 packs, status, fill progress ("Pack 1 —
  64/100"); the blueprint-health hint joins in Slice ③ with the
  meter maths.
- **🔨 Slice ② — Pack detail + picker + machine-managed visibility.**
  **②a (detail spine) ✅ BUILT + Sam-tested 2026-07-07** from the CD
  "Readiness Packs Admin" prototype (concept-not-source): new
  `lib/bank/packs/` module; `/admin/packs/[pack_id]` detail (members in
  sat order, case/trend units as tinted collapsible blocks that move as
  one, ↑↓/remove, pack-basics card incl. child difficulty+category
  chips); the **pill-strip navigation** ([Packs] [Pack 1–5 w/ dot+count]
  [Reserved stock "soon"]) on list + detail. `position` = **spaced
  ordinals** (STEP 1e6, the cohort "store" pattern — display numbers
  are dense-computed; moves write gap midpoints, no renumber under the
  UNIQUE). **②b ✅ BUILT + Sam-tested + MERGED to `main` 2026-07-07
  (second session): the picker** (slide-over from the CD prototype:
  search+facets, standalone multi-tick add, case add-as-unit,
  **trend per-question selection** [the 2026-07-07 revision — §5],
  insert-at-position via the row ⊕, and the machine-managed
  visibility flags in the add path).
  Pack detail per §6: members in position order, case units as
  welded collapsible blocks, trend blocks = display-grouping over
  consecutive same-trend rows (per-question remove; no within-block
  reorder — build-when-it-hurts); the **filter → tick → add picker**
  with per-unit "Add case (6 questions)" and per-question trend
  checkboxes (a trend batch lands consecutively, item-id order);
  double-add blocked with a pack badge; positional insert + move
  arrows reused from the insert arc. **The visibility flag goes
  machine-managed** (per the §4 per-entity rule): add → flag(s) off
  in the same save; removal leaves hidden (never auto-expose).
- **🔨 Slice ③ — Meters + publish gate + reserved-stock lens.**
  **Meters + gate + list hint BUILT 2026-07-07 (second session,
  awaiting Sam's test):** Composition meters on pack detail (fill ·
  mix vs the §5 guideline · the blueprint meter vs the NCSBN 2023
  ranges [new `CLIENT_NEEDS_BLUEPRINT_RANGES` in classifications.ts]
  — guidance, never a block; pure maths in
  `lib/bank/packs/composition.ts`); the completeness-gated **publish
  toggle** + "Publish all N & publish pack" helper (mirrors the case
  wrapper's publish-all precedent — flips `is_published` on draft
  members, safe because saved rows are well-formed and pack members
  are builder-hidden) + un-publish semantics (§6), gate re-computed
  server-side in the actions; the packs-list **blueprint-health
  hint** ("Blueprint 6/8"). **Reserved-stock lens BUILT same
  session — Sam's placement call: a dedicated page**
  (`/admin/packs/reserved`, behind the pill; static segment beats the
  `[pack_id]` sibling). Union of three sources so it can't drift:
  readiness-tagged questions + children of readiness-tagged cases
  (wrapper-tag inheritance — this is what the raw bank-list tag
  filter can't see) + every link-table member (backstop). Rows show
  pack assignment ("Pack 3"/"unassigned"), source (standalone/case/
  trend), and a **⚠ visible-in-builder leak warning** (the §4
  tag-and-hide rule surfaced; case children read the CASE row's
  flag). Header counts reserved vs the summed pack-target. (Audit
  coverage moved to Slice ①.)

- **✅ Post-③ admin improvements (2026-07-08, Sam-directed):**
  **(1) Sticky area header** per the CD prototype — title row + pill
  strip pin to the `.product-content` scroll on all three lenses; the
  detail's right rail parks under the band and scrolls internally;
  Sam's variation: the members list keeps natural page flow (no CD
  viewport cap); mobile stays natural scroll. **(2) Pack create /
  edit / delete:** one shared `PackFormModal` (title · description ·
  question count · time limit) — "+ New pack" on the list creates a
  draft and opens it; the basics card became read-only display (+ id,
  + count) whose Edit opens the same modal. **`n` is EDITABLE**
  (Sam's call — the 100 standard is an amber advisory, advise >
  block; the mix guide now SCALES to n; time limit follows exam pace
  2 min × n until manually set; hard floor: n ≥ current members).
  **Delete = never-sold packs only** (published blocks it now; a
  credits check joins when the student side lands) — empty pack =
  plain confirm, members = typed-DELETE gate; cascade puts members
  back in the unassigned reserve (never auto-exposed), audit keeps
  the history. **(3) Pack numbering is id-derived + gaps refill:**
  the pill "Pack N" comes from the id suffix (stable across deletes —
  no renumbering), and minting takes the LOWEST free number, so a
  deleted draft's slot is reusable — safe precisely because deletion
  is restricted to never-sold packs (sold packs retire via archive
  and keep their number forever). **(4) Packs-list card ⋮ menu**
  (programme-card-menu pattern): Edit → the shared modal · Delete →
  the graded confirm (disabled on published cards w/ unpublish-first
  tooltip) · **Publishing → a popup hosting the SAME `PublishPanel`
  as the detail sidebar** (extracted — one source of truth for the
  gate checklist; gate loads lazily per pack; popup stays open so
  the curator watches the checklist flip). **(5) App-wide toast fix**
  (Sam's catch): `.auth-toast` moved below the 56px topbar
  (top 24→68px) — it was colliding with the user-menu corner.

- **⬜ Pack audit READOUT (planned 2026-07-08 — Sam: definitely
  needed).** The capture side has run since Slice ① (triggers on the
  pack + link tables, `deleted` action, composite link ids that
  survive deletion) — but there is NO UI over it yet; pack history is
  only reachable by querying the log directly. Build the readout:
  a **History drawer on pack detail** (point the existing
  entity-generic audit drawer — the bank-list one — at the pack +
  membership entities), showing who created/edited the pack and who
  added/removed which question, when. **Why it matters: several
  curators will work the same packs** — the log is how the team
  reviews each other's changes, and it's the §6 no-membership-lock
  decision's answer to "which questions did this pack hold on date
  X". Sequencing: **pulled EARLIER (Sam, same day) — build soon, a
  next-session candidate**, ahead of the multi-curator earmarking
  pass; small slice — readout only, capture is done.

**Student side (sequenced after admin; slice boundaries firm up when
we get there — roughly the §10 gaps list):**

- **✅ Slice ① Catalogue + products — COMPLETE 2026-07-08** (RE-CUT the
  same day, with Sam): widened to include the admin management surface,
  narrowed to exclude the in-app student surfaces (moved to the credits
  slice, below). All three pieces built + Sam-tested:
  1. **READINESS product rows seeded ✅** (migration `20260722120000`,
     dev-applied) — the 3 settled SKUs (§3 prices: `READINESS_SINGLE`
     ₵100/$20 · `READINESS_SELECT3` ₵240/$48 · `READINESS_ALL5`
     ₵350/$70; `pack_type='READINESS'`, credits 1/3/5). Plus **three
     schema corrections found while building** (all dev-applied, all
     pre-credits-slice so nothing depended on the old shapes):
     `20260723120000` products RLS for PAYMENTS_MANAGE ·
     `20260724120000` the trial becomes a free BANK_DURATION pass
     (+ fixes the no-expiry bug) · `20260725120000`
     `readiness_pack_count` + `bundled_readiness_credits` collapse to
     one `readiness_credits`. See §7 → *Unchanged* for both rationales.
  2. **Admin Products & Pricing page** — fills the existing
     `/admin/products` placeholder (nav entry + PAYMENTS_MANAGE gate
     already exist). **Create + edit in v1 (Sam's call 2026-07-08).**
     Two groups, not three: **Bank access** (the paid tiers *and* the
     free trial — the trial is a bank pass that costs nothing; a "Free"
     pill distinguishes it) and **Readiness packs**.
     Editable: both prices, display name, `readiness_credits`, status
     activate/retire, sort order. **Locked identity fields:** slug,
     `pack_type`, `duration_days` — a different offer = retire the old
     + create the new, never mutate meaning under sold rows. **No
     delete, ever** (payments FK RESTRICT) — ARCHIVED is the only
     remove; re-activate reverses it. The page states the
     recipe-only rule on its face: **edits affect future buyers
     only** (grants freeze at mint/activation, §7).

     **Settled build rules (2026-07-08, from the CD round-1 review):**
     - **Money in, money out.** Prices are stored as integer minor
       units; the form accepts `120.50` and stores `12050`, refusing
       >2 decimal places. One conversion helper, one place.
     - **Per-pack savings are DERIVED, never stored** — a readiness
       SKU's "₵80/pack · 20% off" is computed against the 1-credit
       SKU's unit price. Hardcoding it (CD round 1) makes the label
       lie the moment a price is edited.
     - **Promotions = `compare_at_price`, NOT a discount percentage**
       (Sam asked; recommendation accepted). A stored percentage makes
       the charge derived, which breaks under dual-currency rounding —
       Paystack needs one exact integer. Keep `price_minor_*` as what
       you actually charge; add nullable `compare_at_price_minor_ghs`
       / `_usd` meaning "what it used to cost". Set + higher than price
       → public card shows a strike-through and a *computed* % off.
       Running a promo = lower the price, set compare-at. Time-boxed
       promo windows + coupon codes are a real, separate feature —
       **parked**. ⬜ *Columns not yet built — land them with the
       admin page.*
     - **`readiness_credits` is a free integer**, not a 1/3/5 dropdown
       (CD round 1's constraint came from an over-specified brief).
       Amber advisory — never a hard block — when a SKU grants more
       credits than there are packs to claim (credits beyond the pack
       count are unspendable: no student can claim one pack twice).
       Same advisory on the bank tiers' bundled credits.
     - **Slug**: format + uniqueness validated on create; immutable
       after. **No second trial** — creation guards against it.
  3. **Public readiness page ✅ BUILT + Sam-tested 2026-07-08.** Was
     drafted as "bank-access Section 2"; re-cut with Sam into a
     dedicated public `/readiness` page. Full shape + build notes below.
  Plus **one small RLS migration**: `nclex_products` writes (and
  reading ARCHIVED rows) are SUPER_ADMIN-only today, but the surface
  gates on PAYMENTS_MANAGE — align the SQL layer to the TS gate
  (the layered-enforcement rule). **✅ landed as `20260723120000`
  (piece 1 above).**

#### Slice ①.3 — the public readiness page <span>settled 2026-07-08</span>

**Where it lives — a dedicated page, not a section on bank-access.**
The public nav has carried a disabled `<span class="link-soon">
Readiness</span>` placeholder since the landing-page slice
(`components/public/public-nav.tsx`), between *Practice bank* and
*For tutors* — the surface was always planned, and §3's
"bank-access page, Section 2" simply predates it. Each public page
sells one thing: `/bank-access` converts on *duration*, `/readiness`
converts on *verdict*. **New folder** (approved):
`app/(public)/readiness/` = `page.tsx` (server; catalogue + published-
pack reads) + `readiness-plans.tsx` (client; currency toggle + the
cards), mirroring `bank-access/`. Styles: new
`styles/readiness-public.css`, not an extension of `bank.css`.

**Bank-access stays untouched.** Sam raised the real future case —
*"I bought 30 days, which bundles no credits, and now I want packs"*
(§3 already allows it: *"a student can buy standalone packs on top of
a bundle"*). That buyer is **logged in and has already paid**; they
never return to `/bank-access`, which exists to convert someone who
has bought nothing. The top-up therefore lands on the **in-app**
surfaces (§11.10 — the bank-dashboard compact section and the in-app
readiness page), which know who the student is and can say *"you hold
0 credits."* A public page cannot. So "dedicated page only" is not a
staging compromise to revisit — the top-up flow simply lives
elsewhere, and it is already scheduled inside the credits slice.
What may return to `/bank-access` later is a **cross-sell line**, not
cards: §3's *"a year of bank + all 5 packs, $70 cheaper than buying
separately."* One sentence, whenever wanted.

**Everything on the page is a read.** The admin can create and retire
readiness SKUs, and can edit each pack's `n` and `time_limit_sec`.
So the page encodes no counts, names or numbers:

- **N cards, not 3.** Query `pack_type='READINESS'`, `kind='PAID'`,
  `status='ACTIVE'`, ordered by `sort_order`. Render whatever comes
  back; the grid must hold N=1 and N=7, not just today's 3. Card
  title is the row's `name`. Price is `price_minor_{ghs,usd}` under
  the shared GHS/USD toggle; the strike-through "was" price and its
  computed % are `full_price_minor_*` + `percentOff()`; the per-pack
  unit price is `perPackMinor()`. All three already exist and are
  derived, never stored.
- **No "Most popular" badge.** `bank-plans.tsx` hardcodes
  `days === 90`; the readiness equivalent would hardcode All-5.
  There is no `featured` column, and `credits === max(credits)` is a
  guess. Ship no badge. A real `featured` flag is a separate cheap
  decision if ever wanted.
- **Zero active SKUs hides the pricing section** (archiving all
  three is a legal admin action) — never an empty grid.
- **The pack count is live, and counts *published* packs only** —
  `published = TRUE AND status = 'active'`. Drafts must never
  inflate the public number. As of today all five seeded packs are
  `draft`, so the honest count is **0**.
- **"All N unlocked" vs "pick any 3" is derived**, not a SKU
  identity: `readiness_credits >= publishedPackCount` → the card
  reads *unlocks every pack*; otherwise *pick any N of M*. Publish a
  sixth pack and yesterday's All-5 card must start saying "any 5 of
  6" by itself.

**Where the pack specifics go — Option 2 (settled).** A credit is
spendable on *any* pack, so a SKU card may only print "100 questions
· 3h 20m" if every published pack agrees — and one pack edited to 75
questions makes the card lie. Rejected: making uniformity a product
rule (contradicts the editable-`n` decision taken the same day).
Adopted:

- **Cards sell count, price and terms** — *"1 pack · one shot ·
  21-day window on activation."*
- **A "What's in a pack" block below the grid sells substance** —
  one row per published pack with its own `n` and `time_limit_sec`.
  Honest under any configuration.
- **Nicety:** a single line above the grid — *"Every pack: 100
  questions, 3h 20m"* — rendered **only when the published packs
  actually agree** on both, and silently absent otherwise.

**Pre-launch state.** With no pack published, the page must not read
*"pick any 1 of 0 packs."* A deliberate zero-published-packs state is
part of the slice, not an accident to paper over.

**CTA + nav (Sam's calls).** The nav placeholder **lights up** to a
real `/readiness` link now. The card CTA stays **disabled ("Coming
soon")** until ②b builds the readiness checkout route — `/checkout/
bank` hard-rejects any product whose `pack_type !== 'BANK_DURATION'`
(`app/(public)/checkout/bank/page.tsx`), by design. Deliberately
**not** pulled forward: a working CTA before ②a mints credits would
take a student's money and grant nothing, because the credits table
does not yet exist. Precedent for a live page with an inert CTA: the
bank landing shipped that way, and its *Start free trial* button is
still a disabled stub today.

#### Build notes <span>2026-07-08 — Sam-tested</span>

Built from the CD "Public Readiness Packs v2" prototype (which honoured
the three corrections above). `app/(public)/readiness/` = `page.tsx`
(server; all reads) + `readiness-plans.tsx` (client; the currency
toggle, and nothing else) + `sample-report.tsx` (static). New
`styles/readiness-public.css`. The prototype's palette turned out to be
our token set written as raw hex, so `.pub-shell`'s bridge vars
absorbed it 1:1.

**Two migrations, both dev-applied + verified:**

- **`20260726120000` — anon reads published packs.** Caught before a
  line of the page was written: Slice ①'s
  `nclex_readiness_packs_read_published` was scoped `TO authenticated`,
  so a logged-out visitor read **zero** packs and the page would have
  shown "the first packs are being curated" to every stranger, forever.
  Now mirrors `nclex_products_public_select` (no `TO` clause → the
  `public` role), predicate `published = TRUE AND status = 'active'`.
  Membership (`nclex_readiness_pack_items`) stays curator-only, so no
  question leaks — only title/description/`n`/`time_limit_sec`.
- **`20260727120000` — the `All 5` → `All packs` rename** (see §3).

**Two code fixes that fell out of building it:**

- **The publish gate now requires `n`** (`lib/bank/packs/composition.ts`
  → `computeGate`). It required a title and a time limit but *not* a
  question count, while every caller passed `pack.n ?? 100` as the fill
  target — so a null-`n` pack could publish and then claim "all 100
  positions filled" against a number nobody had set. A published pack
  is a public listing; neither number may be null. (No data to repair:
  all five seeds carry `n = 100`.)
- **One money voice, product-wide.** The page reached for
  `formatMinor()` — the *admin* formatter, which printed `₵350`. Every
  public surface already printed `GHS 350`. Sam's call on seeing the
  split: everything is GHS. The cedi sign is retired from all three
  amount formatters (`lib/products/money.ts`,
  `lib/programmes/format.ts`, `lib/home/tutor/programme-overview-queries.ts`)
  and their labels; `$` stays. Two `₵` glyphs survive in
  `tutor-payments-view` because they are **icons**, not amounts (one
  sits beside the words "GHS Received"). Five files still hand-roll the
  same formatter — flagged, not fixed.

**Three deviations from the prototype, all deliberate:**

1. **The cross-sell banner is number-free.** CD wrote *"includes all 5
   packs — ₵350 cheaper than buying them separately"*: three hardcodes
   (pack count, price, coverage) in one sentence, i.e. exactly the bug
   this re-cut removed. It now reads *"Longer bank passes include
   readiness credits at no extra cost."*
2. **The pre-launch card makes no promises.** CD had it invite a
   purchase (*"buy your credits whenever you like — they never expire
   until you spend them"*) while every CTA on the page is disabled. The
   expiry claim is also slippery: `expires_at` is stamped at
   **activation**, so a credit can lapse unsat (§2). Both dropped.
3. **The sample report is static.** CD's Client-needs / Body-system /
   Difficulty tab switcher was a review affordance, not a feature
   (Sam) — a marketing page has no business shipping interactive state
   to show off a breakdown. Frozen on Client needs; a dead tab strip
   would be worse than none. Everything it illustrates is settled in
   §11.5, so it advertises nothing unbuilt *by decision* — only unbuilt
   *by schedule*. **It will need re-syncing when the real results page
   lands.** Its peer-comparison caption states no min-N number, because
   §11.5 settled a range (~20–30) rather than a figure, and a public
   page is the wrong place to pick one.

**The unlocks-everything line states no count** (Sam, after seeing it
live). "Unlocks all 3 packs" advertises how many packs we have shipped
— operational trivia, and it reads badly mid-launch. Now *"Unlocks
every pack"*. The count survives only in the pick-a-subset branch
("Pick any 3 of 5 packs"), where it is the set being chosen from.
**Rejected: driving the line off `credits` alone** ("Unlocks 5 packs").
That over-promises whenever a SKU grants more credits than there are
packs to claim — surplus credits are unspendable — which is precisely
the configuration the admin catalogue flags amber; the public card must
not contradict its own warning. It would also restate the "5 pack
credits" line above it. At launch (5 packs, 5 credits) both render the
same; they differ only where the credits-only version is wrong.

- **✅ Slice ②a — credits table + mint-at-activation — BUILT +
  Sam-tested + MERGED to `main` 2026-07-08** (three sub-slices; two
  migrations `20260728120000` + `20260729120000`, dev-applied +
  probe-verified; app-layer mint; tsc + eslint + vitest clean).
  Deliberately stopped **before** claiming — the slice's job was to
  prove credits mint and the table writes correctly, the ground ②b
  stands on. Sam validated it live: a `BANK_60D` purchase granted a
  subscription **and** minted its 1 bundled credit (source
  `BANK_BUNDLE`, unclaimed, idempotency-keyed) — the mixed-grant case a
  `pack_type`-keyed mint would have silently broken.

  - **②a.1 — the migration ✅** (`20260728120000`). Created
    `nclex_readiness_credits` on the §7 accepted shape — 16 columns,
    **no status column** (event timestamps are the only truth), ten
    CHECK constraints (activation requires a claim · used requires
    activation · used/expired/revoked mutually exclusive · a claim
    names a pack · provenance matches `source` · expiry requires
    activation · revoke carries a reason), the **partial unique index
    for one live claim per (student, pack)** that ignores
    `expired_at`/`revoked_at` rows so a lapsed pack is re-claimable but
    a sat one never is (§2 r4), and owner + SUPER_ADMIN RLS. Same
    migration did the `nclex_subscriptions` cleanup (§7 → *Three
    tables, three jobs*): dropped `readiness_pack_id` +
    `readiness_activated_at`, narrowed the `pack_type` CHECK to
    `BANK_DURATION`. Verified by 10 adversarial constraint probes (each
    illegal state rejected, both legal states + the re-claim-after-
    expiry seam accepted), rolled back.
  - **②a.2 — the mint + the `activate.ts` fix ✅.** The pure decision
    (`planActivationGrants` in `lib/payments/readiness-mint.ts`) mints
    **whenever `readiness_credits > 0`, never keyed on `pack_type`** (§7
    → *The mint rule*); `grantBankSubscription` became
    `grantProductEntitlement`, which grants a subscription (bank passes
    only) and/or mints credits. **Divergence from the scoped plan
    (better than written):** rather than *removing* `READINESS_PURCHASE`
    from `BANK_PURPOSES`, the list was **renamed `PRODUCT_PURPOSES` and
    kept all three** — a readiness purchase still has to be routed and
    minted, so dropping it would make activation reject it; the
    no-subscription outcome now comes from the product's `pack_type` via
    `planActivationGrants`, closer to the fact than a purpose list. Same
    end state the plan wanted, more robust. **Second addition
    (`20260729120000`):** the mint is N-rows-per-payment, so — unlike
    the one-per-payment subscription — it had no key against a double
    activation (the callback can fire twice; the grant precedes the
    ACTIVATED flip). Added `mint_index` + `UNIQUE(payment_id,
    mint_index)`; a re-run's batch insert conflicts on index 1, rolls
    back atomically, is read as already-minted. The four §7 worked
    examples (incl. `BANK_30D`→0) are unit tests — together
    unsatisfiable by any count-keyed-on-`pack_type` rewrite.
  - **②a.3 — read + stage helper ✅.** `creditStage()` (pure,
    `lib/payments/readiness-credits.ts`) derives unclaimed → claimed →
    active → used/expired/revoked from the filled timestamps, terminal
    endings winning (§7: *one helper so every screen reads it
    identically*); `getMyCredits()` (`readiness-credits-read.ts`) reads
    the caller's own rows (getUser + explicit `user_id` filter) → rows
    with stage + a by-stage tally. Split pure-from-server like the mint
    so the stage logic is unit-tested. Read-only — no claiming,
    activation, or sweep. Clock caveat documented: the stage is truthful
    to what's written, so a past-deadline credit reads ACTIVE until the
    sweep stamps `expired_at`.

  **Out of scope (as scoped), now ②b or later:** the nightly sweep that
  stamps `expired_at`, the 21-day window, the "Claim all" button, and
  every surface in §11.10.

- **🔨 Slice ②b — the readiness checkout, the surface + claiming, the
  sitting, results.** Split into build steps; the CD "Readiness
  Claiming" prototype (2026-07-09) drives the surface pixels.

  - **②b.1 — the readiness checkout route ✅ BUILT + Sam-tested + MERGED
    to `main` 2026-07-08.** A student can buy readiness credits: new
    `/checkout/readiness` (mirror of `/checkout/bank`, ACTIVE PAID
    READINESS SKU, shared `CheckoutShell`; the engine already routed
    `READINESS_PURCHASE` and ②a mints). The `/readiness` CTA went live
    ("Get credits"). The result screen is honest for a readiness-only
    order (`isReadinessOnly` → "Readiness pack credits" line, lands on
    the picker with "Go to your account", NOT "Start practising"). Both
    mint paths now proven on real dev buys: bundled (`BANK_60D` → sub +
    `BANK_BUNDLE` credit) and standalone (`READINESS_SINGLE` →
    `SELF_PURCHASE` credit, **no subscription**).

  - **②b.2 step 1 — the student packs surface + claiming ✅ BUILT +
    Sam-tested + MERGED to `main` 2026-07-09.** The dedicated
    `/student/bank/packs` surface (was a placeholder): `getStudent­Readiness­View`
    joins published packs × the student's credits into per-pack card
    state via `creditStage`; `claimReadinessPack` / `claimAllReadiness`
    (service-role actions re-validating ownership — no student-write RLS
    on credits) set `pack_id` + `claimed_at` on one unclaimed credit,
    the DB one-live-claim-per-pack index the hard guard. The light claim
    confirm carries **both** copy halves (won't start the clock / can't
    be swapped). Members never read (curator-only RLS) — the card shows
    the pack's own n + time. Reachable states this step: catalogue /
    claimable / claimed (activation + sat states render but aren't
    reachable until the sitting). Verified live: 2 packs claimed to
    distinct packs, only `pack_id`+`claimed_at` written (no clock
    started), no double-claim.

    **IA decision (2026-07-09, settled with Sam) — readiness stays a
    bank-family surface, NOT a third product.** The student IA is two
    spaces (Bank / Programme) with a picker hub + a two-pill switcher;
    readiness lives in the bank sidebar (§11.10 always placed it "for
    every bank audience"). But standalone SKUs (②b.1) created a buyer
    with readiness credits and **no bank subscription**, whom the bank
    gate blocked. Fix, three small changes: (1) the bank layout's
    front-door gate relaxed to **`requireBankOrReadiness`** (bank access
    OR a readiness entitlement); (2) the 5 bank-consumption pages
    (dashboard/practice/history/journey/profile) each re-assert
    `requireActiveBankSubscription` themselves, so a readiness-only
    student who clicks them still bounces — the Packs page adds no bank
    check; (3) the picker gains a **Readiness door** (grouped with the
    bank rail, teal variant, shown to owners) — the only hub route to
    packs for a student with no bank pass. `/student/bank` index →
    dashboard (bank) or packs (readiness-only).

    **Reason-aware access wall (2026-07-09, from Sam's test feedback).**
    A blocked gate no longer hard-redirects to a bespoke target with no
    context (a no-bank student clicking Practice was dumped on the bank
    sell page). `/no-access` is now reason-aware: gates redirect with
    `?need=<reason>` and the page renders the explanation + CTA.
    `need=bank` → what's locked + See-bank-plans + (if they own
    readiness) a link to their packs so they're never stranded; no
    reason → the existing genuine-denial page. All 6
    `requireActiveBankSubscription` callers (5 pages + the session
    runner) and `requireBankOrReadiness` route through it; the picker's
    "Get access" (chosen navigation) still links straight to
    `/bank-access`. New blocked cases add a `need` value, not a redirect
    per gate.

  - **②b.2 step 2a — activate the 21-day window ✅ BUILT + Sam-tested +
    MERGED to `main` 2026-07-09.** The CLAIMED card gained a **Start my
    21 days** button → firm confirm → `activateReadinessPack`
    (`readiness-activate.ts`, service-role, ownership re-validated) writes
    `activated_at` + `expires_at` (now + `READINESS_WINDOW_DAYS = 21`)
    onto the pack's claimed credit; the DB CHECKs enforce
    activation-needs-a-claim / activation-sets-a-deadline. The card flips
    to **ACTIVE** with a days-left meter (urgency colour) — **no
    Begin-exam button yet** (the runner is step 2b; no dead button, same
    as step 1 left CLAIMED buttonless). `getStudentReadinessView` now
    carries `daysLeft` (reads `expires_at`). Verified live: Pack 1 →
    `activated_at` + `expires_at` exactly 21 days apart, stage ACTIVE,
    nothing else touched. **Gotcha (fixed `6dd3837`):** a bare
    `export const` in the `'use server'` file broke the whole module
    (only async functions may be exported) — tsc/eslint pass it, the dev
    build doesn't; **smoke-test the route after any `'use server'`
    change, not just typecheck.** (Same family as the `export type`
    gotcha.)

  - **🔨 ②b.2 step 2b — the one-shot runner** (the sitting behind "Begin
    exam") lights up the rest of the ACTIVE card + the USED state. **Step 3
    — results** (§11.5, the standalone permanent report page) is a
    SEPARATE slice after it. "Build everything" (Sam, 2026-07-09 — no real
    users, so no burned-window risk): the full claim → activate → sit →
    result chain ships, in ordered tested steps, nothing dormant. Dev is
    ready — all 5 packs filled 100/100, published, active (the ~500-question
    fill last session).

    **Architecture (settled 2026-07-09, grounded in the code).** The
    runner, timer, scoring, per-question review, the results popup and the
    `/session/[id]` page are **reused as-is** — the session page is
    source-agnostic (it already lazy-expires + scores any timed attempt
    generically) and the preflight is already source-aware. The sitting
    lands as an ordinary attempt; **the runner doesn't know it's a pack.**
    The one genuinely new piece is **attempt creation**: `nclex_create_attempt`
    hard-rejects readiness (`source <> 'CUSTOM_BUILT'` raises; it also
    requires a bank subscription and picks questions *randomly from a filter
    pool*), so readiness needs its **own creation function** that walks the
    pack's fixed 100 members **in curated position order**. That function
    **writes to the same four attempt tables** the existing RPC does
    (`nclex_attempts` + `nclex_attempt_items` + the case/trend snapshot
    tables) — which is exactly why the runner reuses unchanged. **No new
    tables** (the attempt tables already carry the `READINESS_PACK` source +
    FK + CHECKs). The credits table already has the hooks: `attempt_id` (the
    forever link) + `used_at` (the "sat = closed forever" stamp); the card
    states (`CATALOGUE → CLAIMABLE → CLAIMED → ACTIVE → USED`) are already
    modelled — 2b makes ACTIVE/USED reachable.

    **Shot timing (settled, Sam 2026-07-09):** the shot is spent **on Start
    at the preflight** (§2 r1 — "starting the sitting = the shot"), NOT on
    attempt creation. Bouncing off the preflight costs nothing; the attempt
    row may exist unstarted + reusable. `used_at` + `attempt_id` stamp when
    the student clicks Start past the full-stop warning.

    **Sub-slices (each built, then PAUSED for Sam's test before the next):**
    - **2b-i — attempt creation (the migration).** New
      `nclex_create_readiness_attempt(p_pack_id)` SECURITY DEFINER: validates
      the caller owns a live, activated, not-yet-sat credit for the pack +
      the pack is published; builds the attempt (source `READINESS_PACK`,
      mode **Timed Sequential**, `duration_seconds` = the pack's
      `time_limit_sec`) walking members **in position order**, flattening
      cases/trends + snapshotting exactly like `nclex_create_attempt`;
      returns the attempt id. Test: call it, verify 100 ordered
      `nclex_attempt_items` + case/trend snapshots.
    - **2b-ii — Begin + the one-shot preflight.** `beginReadinessAttempt(packId)`
      server action (get-or-create the live attempt, mirror of
      `readiness-activate.ts`); a **Begin exam** button on the ACTIVE card →
      `/session/[id]`; the preflight's **readiness full-stop variant**
      (one-shot warning). Start spends the shot (`used_at` + `attempt_id`) +
      starts the clock. Test: Begin → warning → Start → runner, timer running.
    - **2b-iii — sit, quit-as-is, re-entry.** Session-page gate for
      `READINESS_PACK`; confirm the timed sequential run; **quit =
      submit-as-is** (packs-only deviation) while **connection-loss =
      re-enterable on the clock** (the existing resume path). Test: answer
      some, quit → scores as-is; re-enter mid-clock → resumes.
    - **2b-iv — completion + USED card + in-window review.** The results
      popup **readiness variant** (CTA "See your full report", no retake);
      card flips to **USED**; per-question review **gated to the 21-day
      window**. Test: finish → readiness popup → USED → review works
      in-window.
- **⬜ Results page (step 3, its own slice after 2b):** the permanent per-sitting report per §11.5
  (verdict hero + points line, peer comparator w/ min-N, multi-axis
  breakdowns, two lifetimes, review-runner reuse + window gating);
  the readiness variant of the results popup. CD brief: results.

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
