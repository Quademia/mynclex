# The review scoring strip

**Status:** built and released to prod. 2026-07-30 / 07-31.
**Origin:** a Claude Design prototype — *"Runner Review Scoring Line"* — built
by Sam against the real runner code.

One line above the rationale in review mode, saying how the question was
marked:

```
◐ PARTIAL CREDIT   2 / 5 marks · 3 of 5 found · 1 wrong pick │ +1 per correct, −1 per wrong, never below 0        ◷ 1m 44s   30% correct · 47% partial
```

---

## 1. Why it exists — the contradiction it removes

The rationale header used to read `Rationale · wrong`, taken from
`is_correct`. That column is **full-credit-only by design**
(`bank-marks-and-scoring.html` §5.5), so a student who scored 2 of 3 was
told **"wrong"** with the number **"2 / 3"** sitting immediately beside
it. The header and the score contradicting each other, on one line, with
the header read first.

Not an edge case. On dev, of 715 submitted answers:

| | |
|---|---|
| full credit | 333 |
| **partial** | **199 (28%)** |
| zero | 179 |

More than one review screen in four said "wrong" next to a non-zero
score.

## 2. The verdict is derived, never stored

`verdictFor(scoreAwarded, marksMax)` → `CORRECT` / `PARTIAL` / `WRONG`,
in `lib/scoring/verdict.ts`. Read by the strip, the question grid, and
anything else that needs to state an outcome.

**A three-state column was considered and rejected.** `score_awarded` and
`marks_snapshot` already determine the answer completely, so a stored
verdict would be a third fact restating the first two and free to drift
from them — the exact shape of the difficulty *word* stored beside the
difficulty *number*, which did drift and cost slice 10d to unwind.

It also leaves `is_correct` alone, which matters: **57 TS files and 24
SQL files read it** — accuracy percentages, the progress engine, tutor
analytics, the CAT ability estimate — and they want the strict flag they
have. Only the display needed a third state, so only the display gained
one.

> **Rule of thumb this arc settled:** derive when the source is one row
> away; materialise when the source is the whole table.

## 3. What the strip shows, and where each figure comes from

| Segment | Source | Notes |
|---|---|---|
| Verdict chip | `verdictFor()` | Three states. Amber for partial — never red. |
| Score | `score_awarded` / `marks_snapshot` | Already on the answer row. |
| Breakdown | `pointsDetail()` | The same splitter the session report uses, so the two cannot disagree. |
| Rule | `question_type` | See §4. |
| Time | `time_spent_sec` | Absent, not zero, when unrecorded. |
| Item statistics | `nclex_item_response_stats` | See §5. |

**Time is null on older sittings** — everything before the time engine
(196 of 715 dev rows: all of May, all of June, part of July). Those
sittings stay reviewable forever, so the segment has to disappear rather
than show `0s`.

**`pointsDetail()` returns null** on a shape it can't read; the score
shows alone. Never a blank, never a zero.

⚠ **Known limit — Matrix multiple-response.** `pointsDetail` sums found
and wrong *across* rows, while the score floors *within* each row. On a
question where a row bottoms out, the breakdown will not visibly add up
to the score (`2 of 3 found · 3 wrong picks` beside a score of 2). The
rule sentence is what makes it explicable. Pre-existing — the session
report's points card shares the helper.

## 4. The scoring rules, in words

**The first time the product tells a student how their marks were worked
out.** Until now those rules existed only as comments in
`lib/scoring/functions.ts`, read by nobody outside the codebase.

Seven sentences across eleven types (`lib/scoring/rules-copy.ts`), Sam's
wording:

| Types | Sentence |
|---|---|
| MCQ · True/false | `All or nothing` |
| SATA · Select N · Highlight | `+1 per correct, −1 per wrong, never below 0` |
| Matrix | `1 mark per row you match` |
| Matrix multi-response | `Per row — +1 per correct, −1 per wrong, never below 0` |
| Cloze · Drag cloze | `1 mark per blank you fill correctly` |
| Drag to order | `1 mark per slot you place correctly` |
| Bow-tie | `1 mark per correct tile` |

**⭐ Matrix multi-response is literally the SATA sentence with `Per row — `
in front.** The two rules *are* one mechanism applied to different units,
so the copy does not describe that relationship — it **is** that
relationship, and a student meeting both on consecutive questions sees
the single qualifier that changed. A test asserts the exact prefix, so
rewording one forces the other.

**The copy is not free text.** Each rule carries a machine-checkable
claim, `penalisesWrongPicks`, and the test runs the **real**
`scoreAttempt` for every type to check the score actually moves the way
the sentence says. Change the maths without the wording and it fails.

⚠ **The sentences do not group one-to-one with the scoring functions, and
must not.** Cloze and Drag-cloze read alike across two *different*
functions (a student sees blanks in a sentence either way); Drag-cloze and
Drag-to-order share *one* function and read differently (blanks vs slots).
**The maths fixes the claim; what the student is looking at fixes the
noun.**

**Rejected: the notation the canonical doc itself uses** (`0/1 per row`,
`+/− with floor 0`). Precise, shorter, and our own house vocabulary — but
it needs a key, the only place to put a key is a hover, and our students
are on phones. Spending a line of wrapping beats spending a line of
comprehension.

## 5. Item statistics — "how did everyone else do?"

`nclex_item_response_stats`, one row per **(item_source, item_id)**:
`n_students`, `n_full`, `n_partial`, `n_zero`, `computed_at`.

### ⚠ Not called "cohort"

The prototype labelled it that. The word is already taken — a cohort here
is a group of students enrolled together in a programme run
(`nclex_cohort_*`, ~219 files). Worse than a clash, it points at the
wrong set: a tutor reading "cohort" would think *my class*, when this is
every student who has ever answered the question.

**The proof it is wrong:** the word is accurate for the one view where we
*don't* use it (a tutor looking at their own students) and inaccurate for
the one where we did. Same shape as "mark" meaning two things — caught
before shipping this time.

### Stored, not derived

Five surfaces will eventually want these numbers, and each would
otherwise re-implement three rules: first-answer-only, bank and tutor kept
apart, and the threshold. **The threshold is a safety rule, not a
preference** — below it, a percentage on a rarely-answered question is
the reader's own result handed back to them. One writer owning the rules
beats five readers re-deriving them. Storing also makes a curator
"hardest questions" view a sort rather than a full scan.

### Why a table, not columns on the question

Precedent existed — `difficulty_irt` is an empirically-derived aggregate
on the item row. Three things ruled it out:

1. **RLS.** `nclex_bank_items_read_published` is `USING (is_published =
   true)`, so every signed-in user can read every column of every
   published question. The raw counts would be one API call away.
2. **`nclex_bank_items_audit`** writes a history row on every UPDATE. A
   nightly refresh would fill the "who edited this question" log with
   machine writes.
3. **Three `BEFORE INSERT OR UPDATE` triggers** fire on any update at
   all, including the CAT seal trigger, which runs a pack-membership
   subquery per row and can raise.

### Why pg_cron, not the recalibration Action

`recalibrate.yml` states the rule itself: the enrolment sweep lives in the
database because *"it applies rules, each row decided on its own"*;
recalibration lives outside because it solves for unknowns iteratively,
where bugs are silent and CPU cost is real. **Counting answers is
emphatically the first kind**, and counting fails loudly.

⚠ An earlier claim that stats could ride free on the calibration pass was
**retracted**: that job reads `item_source = 'BANK'` only, and
deliberately — the IRT scale is one bank-wide scale and a tutor's dozen
students must never enter it. So tutor questions could never have joined
it.

`cron.schedule('nclex-item-stats-nightly', '0 3 * * *', …)` — 03:00, since
the enrolment sweep holds 02:00. Full recompute, idempotent, so turning
the feature off loses nothing.

### Two audiences, two gates

| | Sees | Threshold |
|---|---|---|
| **Student** | a percentage | **30** — via `nclex_item_stats_for_attempt`, enforced in SQL |
| **Tutor** | their own questions | **none** |
| **Curator** | bank rows | none |

**Tutors get no threshold because a percentage needs a large n to mean
anything and a fraction does not.** *"3 of 11 of your students"* is honest
at n=11; *"27%"* is not. The threshold protects a student from a
meaningless number, not a tutor from their own class.

30 is `DEFAULT_MIN_RESPONSES`, the number recalibration already uses — one
answer to "how many responses before we believe this", not two. It lives
in both SQL and TS, bound by a test that reads the cut-off out of the
migration file.

### When a question first gets a row

**Only once a student has SUBMITTED an answer to it, and the nightly job
has run since.** Authoring creates no row; serving creates no row; a skip
is not an encounter. So the first row appears at the next 03:00 after the
first submitted answer — up to ~24 hours' lag.

On dev: 4,266 published bank questions, **600 rows**. Over 3,600
published questions have never been answered by anyone.

⚠ **Orphan rows are expected and harmless.** Statistics derive from
attempt snapshots, which deliberately outlive the question — dev already
has 10, from deleted seed questions. Nothing surfaces them wrongly: a
student can only reach one by reviewing a sitting that contained that
question, where showing how others did is still true.

### The count is not shown, and *is* still in the payload

The tooltip never says how many students have answered — Sam's call, for
a commercial reason: it would tell a student how small the platform still
is.

⚠ **The RPC still returns the counts, deliberately.** Removing them was
argued for on the case-bank rule (*what we hide must not be in the
response*) and **overruled, correctly**: that rule protects **exam
content**, where a leak lets a student work the system. Nothing follows
from knowing this number, so it is a display decision, not a boundary. If
it ever becomes something we truly must not reveal, the RPC is where to
fix it.

### The admin switch

`item_stats_enabled` on `/admin/config`. **Unlike the other two
scheduled-job switches, it gates the display as well as the job** —
stopping this job alone would *freeze* the last numbers on screen rather
than remove them, which is the wrong outcome for the reason an admin
would most likely reach for it.

## 6. The question grid — the sixth fill

The strip saying *"Partial credit"* while the grid cell for the same
question was dark-red *"Wrong"*, four inches apart, would have fixed the
contradiction in one place and made it louder in the other.

Both now read the same `verdictFor()`, pinned by a test.

**⭐ Amber moved from Skipped to Partial credit.** Matching the strip was
the whole point, and amber was taken — by Skipped, which is close to
partial's opposite: one means you never answered, the other that you
answered and earned marks. **Skipped is not a score at all**; it is the
absence of an answer, and sits beside Unanswered in the legend. It became
a neutral cell with a **dashed** edge, which also keeps it legible
without relying on hue.

⚠ **The tutorial teaches the colour key in words** — *"amber skipped"* —
so this made that step **wrong, not merely dated**, on a public
walkthrough. Rewritten.

The **spoken label** moved too: it was built from the raw CSS fill token,
so a screen reader would have said *"Question 10, partial"*, which does
not say partial **what**. Now *"partial credit"* — and *"right"* became
*"correct"* on the way past.

**The Wrong filter deliberately does not sweep in partial.** A tab
labelled "Wrong" listing partial answers is the same conflation removed
from the header. Partial gets its own row when the legend becomes the
filter (§8).

## 7. The filter — the colour key does two jobs

**Slice 3b, and it closes a gap slice 3 opened.** Once partial credit had
its own fill, **no filter could reach it**: before, "Wrong" caught partial
answers because partial *was* painted wrong. The count visibly dropped
from 7 to 3 the moment that was fixed.

**⭐ The shape is Sam's, and it is sharper than the two I proposed.** I
offered a fifth tab, then a merged block. He asked why "Wrong" is in the
top rail at all — *you do not filter for wrong answers mid-sitting*.
That splits the two controls by what they are *for*:

```
Rail    All 10 · Flagged 0 · To do 0          progress — every mode
Key     Dropped marks 7
        Correct 3 · Partial credit 4 · Wrong 3 · Skipped 0 · Flagged 0
        Current
```

The rail is **what I still have to deal with**; the key is **how it went**.
"Wrong" was the single correctness idea in a progress control, which is
exactly why it alone needed a `revealCorrectness` condition. Removing it
made the rail three buttons that mean the same thing everywhere.

⚠ **Sam's suggested replacement — "Answered" in the rail — was checked
against the data and dropped.** Across every finished sitting on dev the
`answered` fill occurs **zero** times, because in review every submitted
question resolves to correct, partial or wrong; `answered` is the neutral
fill used only while correctness is hidden. It would have been a button
reading **0** on every review screen. So "Wrong" *leaves* the rail rather
than being replaced.

**"Dropped marks" = wrong + partial.** Single-select cannot union two
states, and that union is the thing a student actually wants after a
sitting. ⚠ It is **not** calling partial answers wrong again — both keep
their own row, colour and count; this is a third question asked over
both. The row carries **two swatches**, so it stays a colour key rather
than a query bolted onto one.

**Counts are derived from `isVisibleUnderFilter`** over one list of
filters, rather than tallied per tab by hand. A count can no longer
disagree with what clicking it shows.

⚠ **The key was `aria-hidden`, being decoration. A control cannot be.**
Real buttons, `aria-pressed`, focus-visible, and **explicit** `aria-label`s
rather than name-from-content — the label and count are adjacent spans and
would have computed as `"Correct3"`. Clicking the active row clears back
to All.

**"Current" stays a plain line.** It is a *position*, not a result, so
there is nothing to filter to — but dropping it would leave the teal ring
unexplained, which costs more than one inert row.

⚠ **Both coach anchors survived.** The rail and the key stayed *separate*
elements, so no walkthrough step was orphaned — only copy changed.

## 8. Defects found by looking at the rendered page

None of these were caught by tsc, tests or lint. All were found by
reading what was actually on screen.

1. **The tooltip dropped 41% of students.** *"41% got it right, 18% did
   not"* — the single-mark branch treated "did not" as the **zero** share,
   but it means *not full marks*, which is zero **and** partial. Looks
   impossible on a one-mark question — except `marks_snapshot` is frozen
   per attempt while the counts aggregate across attempts, so a question
   edited from one mark to several after someone answered it has exactly
   those partial answers.
2. **The tooltip totalled 101%** (30 / 47 / 24). Independent rounding is
   harmless in the strip, where nobody adds two figures side by side —
   not harmless in a sentence listing all three. The residual now absorbs
   it.
3. **The tooltip was as wide as the screen.** A native `title` renders as
   one unbroken line and no CSS can constrain it, so ~185 characters
   stretched right across. **The line breaks are the layout** — four short
   lines, longest 39 chars, with a test capping every line.
4. **"Not a verdict on you"** — caught in draft. `verdict` is this
   feature's own word for the chip two inches to the left. One word, two
   meanings, on one screen: exactly what "cohort" had just taught us.

## 9. Not built

- **A skipped question still reads `WRONG` in the strip.** Pre-existing,
  but the same conflation this arc removes — and already settled
  elsewhere: the session report shows *"Not answered"*, grey not red.
- **Tap-to-reveal on phones.** There is no hover on touch, so the tooltip
  is unreachable for the audience that matters most.
- **Multi-select filtering.** Single-select throughout; "Dropped marks"
  covers the one union worth having. Revisit only if a second one turns
  up.
- **Other surfaces.** The table feeds only the strip; the session report,
  readiness report and a curator "hardest questions" view are all cheap
  now and none are built.
- **Cohort-scoped tutor statistics** — *"how did MY students do on this
  BANK question"* — a different aggregate over the same data.

## 10. Files

| | |
|---|---|
| `lib/scoring/verdict.ts` | the three states |
| `lib/scoring/rules-copy.ts` | the seven sentences + their claims |
| `lib/practice/runner/scoring-strip.tsx` | the strip |
| `lib/practice/runner/item-stats.ts` | the read, the display split, the tooltip |
| `lib/practice/runner/cell-state.ts` | grid fills, incl. the spoken labels |
| `db/migrations/20260903120000_item_response_stats.sql` | table, RLS, refresh, RPC, cron, switch |
| `app/(app)/admin/config/config-defs.ts` | the switch |
