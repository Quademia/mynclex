# Student Case Study Bank

*Living document. Started 2026-07-29. Canonical home for **`/student/bank/cases`** —
the surface where a student browses every NGN case study in the bank and sits
one or two of them directly, in the existing runner. Part of
`mynclex/docs/product-plan/`.*

Last updated: 2026-07-30 (built end to end in one session — the page, the
attempt history, two access fixes, and the nav/dashboard rearrangement)

---

## Status

**Built. On the session branch, merged to `main` 2026-07-30. NOT on `prod`.**

Three migrations, all dev-applied:

| Migration | What |
| --- | --- |
| `20260829120000_case_bank.sql` | the eligibility helper, the list RPC, the launch RPC |
| `20260830120000_case_bank_history.sql` | per-case attempt history replaces the single last score |
| `20260831120000_case_bank_count.sql` | the dashboard door's count |

⏭ **Next: the History page** (Sam, 2026-07-30) — not this surface's own history,
which is built, but the student History page at `/student/bank/history`.

---

## 1. What it is

A student can browse all published case studies and sit **1 or 2** at a time.
Two is a ceiling, not a target: one case is a legitimate run. Each case is six
questions, so a run is 6 or 12.

It runs in the **existing runner**. There is no second player, no copy. The
launch RPC builds an ordinary attempt whose items happen to be exactly the
picked cases' children.

### Why it earns its own page

Before this, cases arrived by chance — the practice builder serves them mixed
into a random pool, so a student could not decide to practise case studies.
NGN case studies are the headline change in the NCLEX and the item type
candidates are most anxious about, so "drill these deliberately" is a real
capability.

ⓘ It does set a precedent: if cases earn a page for being a distinct
experience, trend items have an argument too. Cases are genuinely different —
a six-question unit sharing one chart — so it is defensible, but the next
person to ask will not be obviously wrong.

---

## 2. The lock, and the unlock (§2 is the heart of this surface)

Cases reserved for **CAT** (`cat_pool`) or sitting in a **readiness pack**
render **locked** and cannot be picked.

**⭐ The unlock rule (Sam's idea, and the best part of the design):** once a
student has actually met a locked case — in a CAT sitting or a readiness pack —
it **unlocks for them**. Protection expires when it has stopped protecting
anything.

Most products pick one of two worse options: lock reserved content forever, so
a student who just struggled through a case in a paid pack can never go back
and drill it; or don't lock at all, and leak the exam. This is a third answer,
and it has a side effect worth naming — it turns readiness packs and CAT into a
**source** of new practice material.

### What "seen" means

> The case appeared in one of the student's attempts **AND** either that
> attempt is finished, **OR** they submitted an answer to one of its questions.

Both halves are load-bearing:

- A readiness pack snapshots every question the moment the attempt row is
  created, so *"a row exists"* alone would unlock a pack the student never
  opened.
- A CAT abandoned halfway genuinely showed the student the cases it served, so
  *"the attempt finished"* alone would keep those locked.

⚠ Verified live that this discriminates correctly **within a single
in-progress attempt**: of two cases in one run, the one with a submitted
answer read as seen and the other did not. Also confirmed that merely *visiting*
a question writes a `DRAFT` answer row — so a rule keyed on "an answer row
exists" would have been wrong.

### The student must never learn WHY (Sam, 2026-07-29)

A locked row says **"Not available"** and nothing more. No reason in a tooltip,
no reason in a help bulb, and — the part that is easy to get wrong — **no
reason in the payload**. The RPC returns a bare `locked` and never
`cat_pool` or pack membership; hiding a field in the UI while shipping it in
the response is not hiding it.

The same reasoning removed something else: **a locked case ships no scenario
text at all**, because that is exam content. Locked rows carry title and
clinical axes only.

⚠ **The leak check is verified to bite**: against the live page response, a
locked case's scenario is absent *while an unlocked case's is present*. A
negative result only means something if the test could detect a leak.

ⓘ Residual, accepted: locked rows still show their **titles**, so a student can
see that a case exists and is off-limits. Much weaker than naming the
mechanism, and it is what makes the catalogue's true size visible.

---

## 3. Architecture

### One helper, two callers

`_nclex_case_bank_pool(student)` is the single eligibility gateway. The list RPC
and the launch RPC both read it, so **what the page offers and what the launch
accepts cannot disagree** — the same one-gateway property CAT slice 10b3 gave
practice.

The helper is granted to **nobody** (not even `authenticated`): it takes a
student id as an argument, so a direct caller could otherwise ask what is locked
for someone else. The two public RPCs reach it through `SECURITY DEFINER`.

### ⭐ Why this does NOT go through `_nclex_eligible_unit_pool`

Every practice path funnels through that helper, and since 10b3 it hard-excludes
reserved stock. This surface needs the opposite in one narrow spot — a reserved
case the student has already met. Teaching the practice helper the unlock rule
would leak reserved cases into the ordinary practice builder and shift its
counts, which is exactly the guarantee 10b3 exists to make. So the case bank
gets its own pair of functions and touches nothing shared.

### Eligibility

A case is in the pool when it is **published**, has **six published children**,
and `reserved OR is_builder_visible`.

⚠ That last clause cannot be a plain `AND is_builder_visible`: reserving a case
for CAT **forces that flag off** (the 10b3 trigger), so the naive version would
re-lock every reserved case a student has earned — 13 of them on dev.

| | builder-visible | hidden |
| --- | --- | --- |
| **unreserved** | offered | withheld — the curator's tick |
| **reserved** | listed (locked, or unlocked if seen) | listed (locked, or unlocked if seen) |

ⓘ Trade-off, deliberate: hiding an unreserved case also removes it from a
student who already sat it, so its Review link goes too. Their attempt is
untouched and still on the History page. Keeping it whenever `seen` would make
"hidden" mean two different things depending on the reader.

### Access

| Layer | Gate |
| --- | --- |
| `app/(app)/layout.tsx` | signed in, else `/login` |
| bank layout | `requireBankOrReadiness()` |
| the page | `requireActiveBankSubscription()` |
| `nclex_case_bank_list` | auth **+ bank entitlement** |
| `nclex_create_case_attempt` | auth + bank entitlement + re-checks every case against the helper |
| `nclex_case_bank_count` | auth only — see below |

The list RPC's entitlement check is **stricter than the practice read RPCs**
(`nclex_count_eligible_items` and `nclex_filter_breakdown` are auth-only; the
gate went on the write paths in `20260605120000`). The difference is what
leaks: those return counts, this returns content. It mirrors
`requireActiveBankSubscription()` exactly, SUPER_ADMIN bypass included, so the
page gate and the RPC cannot disagree and strand a real student on a throwing
page.

`nclex_case_bank_count` is auth-only on purpose: a single integer is not
protected content, and it shares a `Promise.all` with `nclex_count_eligible_items`,
so making it throw would take the whole dashboard down with it.

---

## 4. What a row shows, and what it deliberately doesn't

```
[ ]  Diabetic Ketoacidosis                                    ▾
     Medical-Surgical · Endocrine
```

**Dropped from the CD prototype's row, each for a measured reason:**

- **"6 questions"** — the schema fixes every case at six
  (`position BETWEEN 1 AND 6`, and the publish gate needs all six). It was the
  same string on all 93 rows. Said once in the page intro instead.
- **The difficulty word** — the average case spans **1.90 logits** between its
  easiest and hardest question, close to two full bands. One label per case is
  a coin flip, and re-introduces exactly the shown-difficulty-vs-real-difficulty
  drift CAT slice 10d spent a session removing.
- **Raw `tags`** — that column holds curator/ops vocabulary (`synthetic`,
  `CATPREP`, `Maryland`, `case_study`). ⚠ And one value is worse than untidy:
  a case tagged **`readiness`** would have told the student exactly which cases
  are pack members — the thing the lock exists to hide.

**In their place: the dominant subject and body system.** Not every distinct
one — a case's six children legitimately span subjects (one step might be a
delegation question), so listing them all describes the *questions*, not the
case. Measured: it dragged "Leadership and Management" onto a
peritoneal-dialysis case and ran to **140 characters**, wrapping onto two lines
and longer than the title above it. Dominant = the value most children carry,
ties broken by the value on **case position 1** ("Recognise cues", the step
that establishes what the case is about). Worst line: 140 → 42 characters, and
*more* accurate.

**The scenario is behind a per-row expand**, not printed on all 93 — it is what
you actually choose a case on, but inline it makes a phone-hostile page.

⚠ `scenario_summary` holds **two formats in one column**: Tiptap JSON for cases
authored since the rich-content relook (71 of 93 on dev) and plain text for the
older ones (22). The snippet extractor handles both, and must keep doing so —
naively joining Tiptap text nodes with spaces corrupts prose, because marks
split sentences mid-phrase (`A `/`68-year-old`/` male with…`).

---

## 5. Attempt history

Each row expands to **the case's own history**, newest first — capped at 10,
with the true total alongside (windowed *before* the cut, so capping cannot
change the count or `sat_here`).

```
YOUR ATTEMPTS
18 Jul 2026   43%            CAT exam                           CAT result
11 Jul 2026   47%            Readiness pack · 5 of 6 answered   Pack report
 9 Jul 2026   Not answered   Readiness pack                     Pack report
```

### ⭐ "Already attempted" means SAT HERE, not "met somewhere"

A case met only in an exam waits in **Ready to sit**, keeping its result. Two
reasons:

1. It makes Review **safe by construction** — the only sittings it can point at
   are this page's own 1- or 2-case runs.
2. It is the truer claim. Six questions buried in a timed 100-question exam,
   with no rationales at the time, is not having studied the case; and a
   percentage earned that way is not comparable to one earned sitting the case
   deliberately in Learning mode.

### Each entry links to its own home

`origin` decides the destination: a **readiness** sitting to its pack report, a
**CAT** to its result page, a case-bank or practice run to the runner.

⚠ **This is the fix for a real defect.** Before it, Review opened the whole
originating sitting — measured on a real dev row, a **100-question CAT, landing
on question 100**, with the case's six questions at Q10–15. Seven of sixteen
attempted cases behaved that way. It was never an *access* leak (CAT review is
already reachable from History, and readiness review keeps its 21-day window
gate), but it was a button that did not do what it said.

### Score, and why the answered count exists

Per question: **marks earned ÷ marks available**, averaged across the case's
questions. Each question counts as **one**, so a 13-mark bow-tie does not
outweigh a 1-mark MCQ — the item-equivalent average `final_score` uses.

The submitted-status test sits in the **JOIN, not the WHERE**: in the WHERE it
would drop unanswered questions from the average instead of scoring them zero,
inflating every score into "how you did on what you bothered with".

⚠ A bare percentage conflates **did badly** with **did not finish**. Real dev
rows: a 50% that was 75% on the four of six actually answered, and a 0% where
*nothing* was answered rendering identically to a genuine zero. So:
`Not answered` (grey and italic — it is not a failing score) and
"5 of 6 answered" only where there is something to explain. `served` is not
assumed to be 6: a CAT terminates on its own rules, not on case boundaries.

---

## 6. Where it lives

Sidebar: **NGN Case Studies**, under Question Bank (drawer-only on mobile — the
bottom tab bar is capped at four). Dashboard "Where to next": a door beside the
Question Bank, carrying a live count from `nclex_case_bank_count`.

The runner's exit resolver also learned this surface: a case run is stored as
`CUSTOM_BUILT`, so it was being sent back to the practice builder — a surface
the student did not come from. Same trap the file already documented for CAT.
`filters_json` is **required** on the resolver's input type so a new call site
cannot silently inherit the wrong destination.

---

## 7. ⚠ The open question: content supply

On dev, of 93 published complete cases: **59 reserved for CAT, 10 in readiness
packs, 24 free.** The page reads as mostly-locked, and that is **structural, not
a dev artifact** — CAT's own design target is 60 reserved cases, so the case
bank and CAT compete for the same shelf. As the CAT pool fills toward target,
this page gets *emptier*.

Prod is the opposite today: 7 published-complete cases, none reserved.

The answer is almost certainly **author more cases** rather than reallocate.
It is a content decision, not an engineering one, and it is the main thing to
resolve before this surface carries real weight.

---

## 8. Not built / deferred

- ⬜ **Deep-link Review to the case's first question.** Review still opens a run
  at its **last** question (the runner's resume rule). Bounded to 12 questions
  now rather than 100, and accepted as such — but still slightly wrong. Needs
  the session page to accept a starting position, which touches the runner's
  state init: the most heavily loaded, CAT-sensitive file in the app.
- ⬜ **Coverage signal** — "8 of 22 done", or "you're weak on Maternity cases".
  The classification data is already there. Probably the highest-value addition.
- ⬜ **A case-scoped review surface** (review one case, not the sitting it was
  part of). Considered and judged too large for now.
- ⬜ Dashboard door still says **CAT** while the sidebar says **Adaptive Testing
  (CAT)** — deliberate, the tiles are compact, but they could be matched.
