# The Session Report, and History as its index

*Living document. Started 2026-07-30. Canonical home for
**`/student/bank/session/report/[attemptId]`** — the permanent report for a
Builder-built practice sitting — and for **`/student/bank/history`**, the
directory that indexes every sitting and routes each to its own report. Part of
`mynclex/docs/product-plan/`.*

Last updated: 2026-07-30 (built end to end in one session: History rebuilt as a
directory, discard, the report in three slices, and the uniform row actions)

---

## Status

**Built. On the session branch, merged to `main` 2026-07-30. NOT on `prod`.**

One migration, dev-applied:

| Migration | What |
| --- | --- |
| `20260901120000_discard_attempt.sql` | `nclex_discard_attempt()` — the only write this arc adds |

Everything else is app-layer. Every figure on the report reads columns that
already existed.

---

## 1. The problem, and the shape that resolved it

A readiness pack and a CAT each had a permanent per-sitting report. A practice
quiz had only the **end-of-quiz popup** — a moment, not a destination — after
which the sole artifact was re-entering the runner. The dashboard's own code
said so in a comment: *"A finished practice quiz has no standalone report
surface today."*

The first proposal was to put practice detail **inside** History. Sam rejected
it and named the better shape: give practice its **own report page**, like the
other two, and let History stay a **directory**. That is the whole design:

| Surface | Job |
| --- | --- |
| History | find a sitting; route it to its report or its answers |
| Session report | debrief ONE practice sitting |
| Pack report / CAT result | the same, for their kinds |
| Analytics (7.2, unbuilt) | across sittings — trends, not one sitting |

**Why it matters:** it makes all three kinds symmetrical, and a report gets a
URL — bookmarkable, linkable from the dashboard, and something the results
popup can point at. Detail buried in an expanding row is none of those.

### The consequence for History

History does **not** show per-sitting detail. It answers *which sitting*, and
gets out of the way. Its remaining jobs are completeness, correct routing, and
the lifecycle (discard). That made it smaller, not bigger.

---

## 2. What the report says, and what it refuses to say

**Never banded, never compared.** Stated on the page, directly under the score:
*"Item-equivalent average, partial credit included. Not banded, not ranked
against other students."*

This is load-bearing, not boilerplate. A pack **does** band you (Building →
Excelling) and **does** compare you to peers, so a student who has seen that
page will read a bare percentage here the same way unless told otherwise. In
CD's revision the sentence had drifted into a page footnote below a 25-row
table; it belongs beside the number it qualifies.

Also refused, and why:

- **No dominant-weakness headline.** An earlier draft read *"You landed 15 of
  25 — pharmacology is where this session went"*, and compared the sitting to
  the student's recent average. Naming the story of a sitting off seven
  questions is exactly the over-claim the page's own small-sample caveat warns
  against. The headline states the fact; the fix list makes the suggestion.
- **No cross-sitting trend.** A "recent custom sessions" chart was dropped: its
  own caption said *"different filters each time, so read the shape, not the
  gap"*, and a chart that tells you not to read it literally is doing
  comparison work it cannot support. That belongs to Analytics.
- **Nothing about marked questions** — see §6.

### The readings

| Card | Says | Notes |
| --- | --- | --- |
| Rail | score, fully-correct, answer points, time, pace | time facts **omitted** when unrecorded |
| Question outcomes | full / partial / wrong-or-skipped | three buckets, not two |
| Answer points | found / missed / wrong picks | `pointsDetail()` from `lib/scoring` |
| Where you slipped | four axes, weakest first | difficulty via `displayBand()` |
| Your fix list | up to 3 actions, worst first | silent below a 3-question sample |
| Every question | stem, subject, outcome, time, changed | filter chips + show-more |

Two decisions inside those:

- **"Fully correct" means FULL marks.** A 3-of-4 SATA is partial. Treating
  score > 0 as correct flatters the report; treating it as wrong hides the
  cheapest marks to convert.
- **Pace divides by ANSWERED, not by total.** 8 answered of 25 in 400s is 50s
  per question worked, not 16s.

---

## 3. Entry points

Four, all verified live:

1. **The end-of-quiz popup** — *"See your session report"* as the primary CTA,
   with "Review attempt" and "Build another" kept below it. Reopenable from the
   runner's `Score · N%` pill.
2. **History → Report** on every finished row.
3. **Dashboard → Recent activity** chip.
4. **The URL**, which is the point of it being a page.

Out of the report: **Review all N answers** (the runner), **Build the same
again** (the Builder, prefilled), **← Back to History**.

### Row actions: the same pair for all three kinds

Settled 2026-07-30 after Sam observed that the practice report was the only one
you had to *discover* — packs and CATs advertised their report in the action
column while practice advertised the runner and hid its report behind an
unlabelled click on the result cell.

Every finished row now offers **Report** and **Review**. Unfinished rows offer
only **Resume**; discarded rows offer nothing. The result cell went back to
plain text.

⚠ **Packs are the asymmetric case.** A pack's *answers* expire after 21 days —
`/session/[id]` reads `expires_at` and redirects to the report once it passes —
so Review appears only while the window is open, and otherwise the row shows an
inert **"Review closed"** carrying the reason. Its score and report are
permanent. **Only an explicit `true` opens it:** the runner does
`reviewWindowOpen(credit?.expires_at ?? null)`, so a *missing* credit row is
expired to it, and on dev most pack attempts have no credit row at all. A
permissive default would have offered Review on nearly every pack row and
bounced every one.

---

## 4. Discard

The only write this arc adds. Nothing had ever written `ABANDONED`, though the
value existed from the start: one dev student carried **36** unfinished sittings
that could never be cleared, and the rebuilt History shipped a "Discarded"
filter that matched zero rows by construction.

- **A SECURITY DEFINER function, not an app-layer update** — a student has no
  UPDATE policy on `nclex_attempts` at all, and every attempt write in the
  product already goes through one. That also puts the rules in the one layer
  every caller crosses.
- **Practice only**, measured not assumed: all 36 stale rows are practice
  quizzes, there are zero unfinished CATs, and the only two unfinished packs are
  exactly what must be protected (a pack is a paid one-shot; discarding forfeits
  a credit). Widening it later means relaxing one predicate.
- **No answer row is touched.** Submitted answers stay counted in accuracy and
  progress — otherwise discarding becomes a way to tidy up a bad score and every
  figure on the dashboard stops meaning anything.
- **`ended_at` stays NULL.** The sitting did not end, it was abandoned, and the
  readiness report derives a duration from `ended_at − started_at`.

Proven on real rows under rollback, 7/7: the owner succeeds; answers unchanged;
a finished sitting, an unfinished pack, another student's sitting and a
fabricated id all refused — the last two with the **same message**, so the
function cannot be used to probe whether an id exists; and a logged-out caller
refused. The migration file is **md5-identical** to the deployed body.

---

## 5. Data facts this arc established

Each was measured, and each would have shipped a wrong number if assumed.

| Fact | Consequence |
| --- | --- |
| `actual_question_count` disagrees with the real item rows on **7 of 69** practice attempts, overstating by up to 6 | the first report contradicted itself — "9 Q" in the heading, "2 of 6" in the body. Count the item rows. On a FINISHED sitting the answer rows equal them exactly (26/26 completed, 7/7 timed out), which fixed History too |
| `answer_changes_json` is an append-only log **including the first answer**, and building a multi-slot answer appends one entry per slot | its LENGTH is not a change count. A 4-row matrix answered straightforwardly logs 4 entries and zero changes of mind |
| The log stores the answer **before and after** each edit | which makes *"1 of those moved away from the right answer"* derivable, by scoring both through `pointsDetail()` |
| **139 of 1,853** stem snapshots (7.5%) are Tiptap JSON, not text | stems must go through `richTextToPlain()` or one row in thirteen prints `{"type":"doc",…}` |
| `nursing_subject` appears in **zero** stored filter payloads | a subject-only History search would be correct code that could never match. It covers every content axis instead |
| Per-question time exists on ~49% of answers; attempt-level on **2 of 33** finished practice sittings | time facts must be **absent**, not zero |
| `nclex_question_marks` has **zero rows and no writer anywhere** | see §6 |

---

## 6. Marking: a half-built feature

The Builder offers a **"Marked" pool chip**. The runner has a **⚑ Mark button**.
The question grid has a **"Marked" filter**. `nclex_question_marks` exists and
the SQL reads it.

**Nothing writes to it.** The runner's button is `disabled`, with the tooltip
*"Marking questions for review isn't available yet"*, and the marked set is
hardcoded empty. So the Builder's Marked pool has never been able to match a
single question.

Consequence for this arc: CD's design had a *"3 questions you marked"* fix-list
item, a marked ring on the question map, and a Marked filter chip on the table.
**All three are deliberately absent.** They return when marking is built — and
when it is, only the write path is missing; every consumer is already wired.

---

## 7. Not built

- **Marking** (§6) — Sam's call: later, so it's done properly.
- **"Re-quiz what you got wrong"** — the most useful fix-list action we don't
  have. The Builder *has* an INCORRECT pool chip, but its deep-link prefill
  deliberately honours content axes only and forces the pool to UNSEEN so
  practice serves fresh questions. Enabling it is small; overriding that rule
  from one call site is a decision, not a detail.
- **Per-question deep links.** Every Review lands on the sitting, not on that
  question, so a long CAT opens near its end. Same gap `case-bank.md` records.
- **Sorting** on History beyond newest-first, and **date-range** filters.
- **Renaming History** — reviewed and dropped: "test history" is the convention
  in this market, and familiarity beats a marginally more accurate label. The
  nav reads **"All history"**; the page heading stays **History**.

---

## 8. Where the code lives

| Path | What |
| --- | --- |
| `lib/practice/report/` | `queries.ts` (loader + gate), `derive.ts` (every figure, pure), `types.ts` |
| `app/(app)/student/bank/session/report/[attemptId]/` | the route, the shell, and five cards |
| `styles/session-report.css` | `bsr-` prefix ⚠ **not** `sr-` — `.sr-only` is the screen-reader utility |
| `lib/practice/history/` | `derive.ts` (routing + wording), `queries.ts` (paged), `actions.ts` (discard) |
| `lib/overlays/practice/discard-confirm.tsx` | the confirm dialog |

**One rule threads through `derive.ts`: never re-score.** `score_awarded` is
written by the submit RPC and is the grade; the report only counts and splits
it. A report that recomputed the grade could disagree with the runner, the
History row and the dashboard, with no way to tell which was right.

`pointsDetail()` is shared with the readiness report rather than copied, and
`describeOutcome()` / `reportHref()` are shared with the dashboard rail — the
rail was already routing and wording correctly while History was not, and two
surfaces describing one sitting must not be able to disagree.
