# Flag and Bookmark

**Status:** ✅ **BUILT — all five slices, 2026-07-30.** On `main`, not yet on
prod (migration `20260902120000` is dev-applied and ships with the next
release). Designed and built the same day, with Sam.
**Supersedes:** `bank-consumption-runner.html` §14 "Mark-for-review" (tagged
*skeleton*, TBD on UI placement, icon design, and re-attempt behaviour — all
three are answered here).
**BUILD_LIST's "build marking" refers to this doc.** So does the runner's
in-code reference to "slice 4.7".
**Build plan: §11.**

---

## 1. The whole problem in one line

**Marking was two different features sharing one icon**, and that is why it has
sat half-built since 2026-05.

| | **Flag** | **Bookmark** |
|---|---|---|
| Student's words | "come back to this before I submit" | "save this so I can study it again" |
| Scope | one sitting | the whole bank, forever |
| Lifetime | dies at submit (kept as history) | until the student removes it |
| Grain | `(attempt, question)` | `(student, question)` |
| Storage | new column on `nclex_attempt_items` | existing `nclex_question_marks` |
| Feeds | the question grid, the session report | the Builder's pool filter |

Everything below follows from that split. Once separated, **each half is small
and neither blocks the other.**

### 1.1 Why the existing table cannot serve both

`nclex_question_marks` carries this
([`20260506140000_slice_2_1_5_question_marks.sql:75`](../../db/migrations/20260506140000_slice_2_1_5_question_marks.sql)):

```sql
CREATE UNIQUE INDEX nclex_question_marks_bank_unique
  ON (student_id, target_kind, target_id) WHERE target_source = 'BANK';
```

One row per student per question, forever, and **no `attempt_id` anywhere in
the table.** So a flag cannot live there:

- the same question flagged in two sittings is rejected by the index;
- un-flagging in October deletes the row August's report depends on;
- "what did I flag during *this* sitting" is unanswerable — the data never
  recorded which sitting a row belonged to.

The table is a **bookmark** table. Its decision log is correct and complete —
it just turns out to be a spec for one of the two features. Nothing in it is
wasted and nothing about it changes.

### 1.2 Separating is *less* work than merging

Forcing one table to hold both would mean adding `attempt_id`, reworking the
unique index, and then answering an unanswerable question: if a student flagged
Q400 in three sittings and unflagged it in one, does it appear in the Builder's
bookmark pool? There is no good answer, because that asks a study list to
summarise three unrelated in-sitting decisions.

---

## 2. Flag

### 2.1 Storage — a column, not a table

`nclex_attempt_items` ([`db/schema.sql:661`](../../db/schema.sql)) is **already
one row per (attempt, question)**, created up front when the sitting is built,
carrying `attempt_id`, `position` and `item_id`. That is exactly the grain a
flag needs. A boolean column on it is the entire storage design.

- **No new table. No new RLS policy.**
- It sits on `attempt_items`, **not** `attempt_answers`, because a student must
  be able to flag a question they have not answered.

### 2.2 The flag is never deleted

It is part of the attempt record, so it becomes **history** rather than rubbish.
The report can say *"you flagged 6 questions during this sitting"* a year later,
while the flag stops being actionable the moment the sitting is submitted.

This is better than expiring it and costs nothing.

### 2.3 ⚠ The write needs an RPC

Students hold **SELECT only** on `nclex_attempt_items`
([`db/rls.sql:485`](../../db/rls.sql)) — there is no student UPDATE policy, by
the deliberate "conservative shape" of slice 2.1. So the toggle goes through a
`SECURITY DEFINER` function, the same pattern as the discard action built in
`20260901120000`.

Do not add a student UPDATE policy to `attempt_items` to avoid writing the
function. That table holds the frozen snapshot every score is computed against;
a student-writable UPDATE on it is a scoring hole.

The function must:
- verify the attempt belongs to the caller;
- refuse if the attempt is not `IN_PROGRESS` (see §2.4);
- touch **only** the flag column.

### 2.4 Live-editable, review-frozen

| State | Flag control |
|---|---|
| Sitting in progress | editable — set and unset freely |
| Sitting submitted / abandoned | **renders, does not respond** |

Two reasons, and the second is the load-bearing one:

1. After submit there is nothing to "come back to", so the action has no meaning.
2. The flag is now part of the attempt record. Letting a student unflag in
   review **rewrites history** and makes the report's *"you flagged 6"*
   retroactively untrue.

This must be enforced in the RPC, not only in the UI.

### 2.5 Where the flag appears

Flag exists where the student can act on it — which means **where navigation
back is possible**:

| Mode | Within-session nav | Grid | Flag |
|---|---|---|---|
| Untimed Learning | free | yes | **yes** |
| Untimed Test | free | yes | **yes** |
| Timed Free Navigation | free | yes | **yes** |
| Timed Sequential | strict forward | no | ⚠ open — see §7.1 |
| CAT | strict forward | no | **no** — already settled |

Modes per [`bank-consumption-runner.html` §15](bank-consumption-runner.html).
CAT's exclusion is not a new decision: `bank-consumption-cat.html` §16 already
settled **no live-run mark-for-review** in CAT.

### 2.6 The grid

The grid already encodes this correctly and **needs no design work** — runner
§16.4 puts marked state on the **border** channel, deliberately separate from
the fill channel, so a cell can read as *right + flagged + current* at once.

Two changes only, both wording:

- the filter chip `Marked` → **`Flagged`**
- the colour-code legend entry → **"Flagged for review"**

Runner §16.5 stands: the grid is a **navigation** surface. You cannot flag,
unflag, or change an answer from it.

---

## 3. Bookmark

### 3.1 Storage — unchanged

The existing `nclex_question_marks` table, exactly as built in 2026-05. Table,
indexes, constraints and RLS all stay as they are. Students already hold
SELECT / INSERT / DELETE on their own rows, so **bookmark writes go direct — no
RPC.** Row-exists toggle: bookmark on = INSERT, bookmark off = DELETE.

### 3.2 Questions only

**A student bookmarks a question. There is no "bookmark this whole case."**

`target_kind = 'CASE'` stays in the schema as unused capacity — never written,
costs nothing, and leaves the door open. **Do not migrate it out.**

### 3.3 What that means for cases — already handled, no SQL change

A case is selected as **one unit**, so bookmarking a single child pulls the
whole case. The pool helper already does exactly this
([`20260823120000_cat_pool_enforcement.sql:187`](../../db/migrations/20260823120000_cat_pool_enforcement.sql)):

```sql
BOOL_OR(EXISTS (SELECT 1 FROM marks_q WHERE marks_q.target_id = csi.item_id))
  AS any_child_marked
...
(EXISTS (SELECT 1 FROM marks_c WHERE marks_c.target_id = cr.case_id)
  OR cr.any_child_marked) AS case_marked
```

With `marks_c` permanently empty, `any_child_marked` does all the work — which
is the behaviour we want, already shipped.

**This is not a case quirk.** Every Builder filter behaves this way, because a
case is all-or-nothing: the difficulty axis does the same thing (recorded in
the 2026-07-29 log — ticking Hard yields standalone matches *plus* every child
of any case holding a Hard child). And there is no alternative available: you
cannot sit Q4 of a case alone, because the scenario and chart tabs *are* the
question.

It is arguably the **right** behaviour rather than a compromise. If Q4 defeated
you on the prioritisation step, re-sitting the case hands back the scenario you
need in order to answer Q4 at all.

⚠ **One honest consequence to surface, not fix:** a Bookmarked filter may report
"18 questions available" when only 4 were bookmarked and 14 are case siblings
riding along. State it plainly in the Builder. **Do not "fix" it later as a
bug** — it is the selection-unit model working correctly.

### 3.4 Absent from CAT and readiness packs — live *and* review

**Bookmark does not exist on CAT or readiness-pack surfaces at all.**

The reason is not exam authenticity. It is that the button would make a promise
the architecture is committed to breaking:

- every CAT question is reserved (10b3 — CAT draws only from the pool);
- every readiness question is reserved (mutual exclusivity, both directions);
- `_nclex_eligible_unit_pool` excludes reserved stock outright
  (`bi.cat_pool = FALSE`, `cs.cat_pool = FALSE` — lines 114 and 145);
- the bookmark filter is a **CTE inside that helper**, so it *intersects* with
  the eligible pool rather than bypassing it.

So a bookmarked CAT question **can never be served back by the Builder**. Not by
oversight — by design, and correctly. Offering the control there would create a
study list that silently does nothing.

### 3.5 ⚠ The case exception, knowingly declined

Cases are the one place where "impossible" is false. A case reserved for CAT or
a pack **unlocks for a student who has actually met it** (`case-bank.md`, live
on prod) — so it *can* be re-sat, and a bookmark on it would be honest.

**Declined for v1 anyway.** A control that appears on the case at Q10–15 and
vanishes on the standalone at Q16 — same review screen, two different truths —
is harder to explain than one simply absent from exam surfaces.

The need is also already partly met: the case bank shows per-case attempt
history, so a case met in a CAT surfaces there on its own. You do not need a
bookmark to find it again; it finds you.

Recorded as a follow-on in §7.2, not forgotten.

### 3.6 The read side is finished

**The pool helper needs no change.** It already handles bookmarks correctly —
questions directly, cases via any-child. The Builder chip already queries it.

Only the **write path** is missing. That was BUILD_LIST's claim all along; it is
now verified rather than assumed.

### 3.7 ⚠ The runner must READ existing bookmarks at sitting start

A bookmark is `(student, question)`. So when a bookmarked question turns up in a
later sitting it is **already bookmarked** — there is no second bookmark to
create and nothing to forbid. The control simply renders in the **on** state.

This is not a rule to enforce. It is a **load** to perform, and it is currently
missing: the runner's marked set is empty, so every question would render as
un-bookmarked regardless of the truth.

**If the load is skipped**, the failure is visible but not dangerous: the button
shows "off" for a question that is bookmarked, the student taps it, the INSERT
hits `nclex_question_marks_bank_unique`, and they get an error for doing
something entirely reasonable. The index protects the data correctly; the
experience is what breaks.

**The control must stay tappable on an already-bookmarked question** — not to
re-bookmark, but to **un**bookmark. That is the pruning loop in §6. Disable it
and the loop has no exit, so the list can only ever grow.

### 3.8 ⚠ The two controls need two different keys

The grid's existing set is keyed by **`attempt_item_id`**
([`runner-grid.tsx:120`](<../../app/(app)/(focused)/session/[attempt_id]/runner-grid.tsx>)):

```ts
if (marked.has(item.attempt_item_id)) filterCounts.marked += 1;
```

That is **flag** grain, not bookmark grain — the grid was built for the flag all
along, which is why the flag work slots into it with no restructuring.

| Control | Keyed by | Lifetime in the runner |
|---|---|---|
| **Flag** | `attempt_item_id` | starts **empty** every sitting |
| **Bookmark** | `item_id` | arrives **pre-set** from earlier sittings |

⚠ **Passing one where the other belongs compiles cleanly and is wrong.** Both
are sets of strings. The symptom would be bookmarks appearing to reset every
sitting — exactly the defect §3.7 exists to prevent — with no type error and no
failing test to catch it. Name the variables so they cannot be confused
(`flaggedAttemptItemIds` / `bookmarkedItemIds`), and assert the distinction in a
test that puts a question in two attempts.

---

## 4. Vocabulary — "mark" is retired

**"Marks" already means points in this product** — `marks_snapshot`,
`computeMarksFromKey`, `bank-marks-and-scoring.html`, "a SATA question is worth
5 marks". So "your marked questions" sits directly beside "the marks you
scored", meaning two unrelated things.

Sam's two words remove the collision for free:

| Old | New |
|---|---|
| Mark / Marked (runner button) | **Flag / Flagged** |
| `Marked` (grid filter chip) | **Flagged** |
| `Marked` (Builder pool chip) | **Bookmarked** |
| "Mark for review" (tutorial, legend) | **"Flag for review"** |

Applies to **student-facing text only.** The table name
`nclex_question_marks` and the SQL identifiers (`marks_q`, `case_marked`,
`f_marked`) stay — renaming them is churn with migration risk and no user
benefit. This doc is the mapping.

---

## 5. Where both controls live

Both sit in the runner topbar, where the dead Mark button sits today:

```
[Exit] | [Title + meta] ——— [Counter] [Clock + eye] [⚑ Flag] [🔖 Bookmark] [Calc] [Grid]
```

The existing button ([`runner-topbar.tsx:164`](<../../app/(app)/(focused)/session/[attempt_id]/runner-topbar.tsx>))
is `disabled` with the tooltip *"Marking questions for review isn't available
yet"*. It becomes **Flag**; Bookmark is added beside it.

Both need **distinct icons and distinct labels** — they are two toggles of
similar shape, one ephemeral and one permanent, and a mis-tap on bookmark
silently pollutes the study list. Follow the existing pattern of a separate
label span (`rn-calc-btn-label`, `rn-grid-toggle-label`) so labels can collapse
on narrow screens while the icons stay.

### 5.1 Untimed Learning is the one collision

UL submits per question and reveals the rationale **mid-run**, so it is the only
mode where both controls are live on screen with a rationale visible. Every
other mode separates them in time. Worth a deliberate look when building rather
than discovering it.

### 5.2 The topbar overflow menu — considered, **not** in this slice

Collapsing the topbar's secondary controls into a menu was raised and
**deliberately deferred** (Sam, 2026-07-30). Recorded so it is not re-litigated:

- **Flag would have to stay out of any menu regardless.** "Have I flagged this?"
  must be answerable at a glance, mid-question, on a clock — a menu would force a
  separate outside-the-menu indicator, spending the space anyway for nothing.
- The sorting test, if it is ever built: **does the control's state need to be
  readable without opening the menu?** Counter, Clock and Flag → yes, stay out.
  Calc, Grid, Bookmark and the hide-clock eye → no, the open panel is its own
  indicator.
- It should be **≤768px only**; desktop has the room and the project convention
  is to leave desktop untouched.
- ⚠ It would be the runner's own component. The runner is a `(focused)` route
  and deliberately does not use `AppShell` / `MobileNav`, so the shared
  mobile-nav drawer does not apply here.

---

## 6. Removing bookmarks

**No bulk-management surface in this slice.** A student unbookmarks the same way
they bookmarked — the toggle in the runner, available at any time, live or
review.

This is sufficient rather than merely acceptable, because a complete
self-service loop already exists:

> filter the Builder to **Bookmarked** → sit those questions → unbookmark as you
> go

The pool serves exactly the questions worth pruning, so **the runner is the
management surface for v1.** A "My bookmarks" page is a convenience, not a
missing piece (§7.2).

---

## 7. Open and deferred

### 7.1 ✅ SETTLED: Timed Sequential gets no flag

Sam, 2026-07-30. Built that way.

- **Against:** it is strict-forward with no grid, so you can never return —
  which is the flag's stated purpose, and the same reasoning that excludes CAT.
- **For:** because flags now survive into the report (§2.2), flagging in a
  forward-only sitting means *"show me this in my review afterwards"* — a real
  use that only exists because of the storage decision.

**Hidden**, consistent with CAT and with the definition Sam gave. The rule
collapses to one sentence — *can you get back to the question?* — which lands
on exactly the same set as grid availability. Not a coincidence: the grid is
HOW you come back. If one is ever changed, look hard at the other.

### 7.2 Deferred, with the reason

| Item | Why deferred |
|---|---|
| **"My bookmarks" surface** | the runner loop in §6 covers v1 |
| **Bookmarked filter on the case bank** | would let a case met in a CAT be saved for re-sitting; the table already supports `CASE`, so nothing here blocks it (§3.5) |
| **Topbar overflow menu** | §5.2 |
| **Case-level bookmarking** | §3.2 — schema capacity kept, UI declined |
| **Mark history / analytics** | the marks migration is explicit: *if a future analytic needs mark history, add a separate audit table — don't bend this one* |

### 7.3 ⚠ The runner tutorial needs new steps — and has none today

The Mark button carries **no `data-coach` anchor**, while Calc and Clock both
do. So the public tutorial has never had a mark step, even though the design
handoff specified one (*"Try it: mark this question"*,
`design-handoff/runner-tutorial/tutorial-runner.html`).

When this ships the tutorial needs **two** steps, not one, and its recap line
(*"counter, clock and hide toggle, mark for review, calculator, grid toggle"*)
needs rewording. The tutorial is **public and on prod** — this is user-visible.

### 7.4 ⭐ The report shows BOOKMARKS, and no flag at all (Sam, 2026-07-30)

Three elements of CD's design were absent because nothing wrote marks
(`session-report.md` §6). This section first planned to restore all three as
**flag** readings. Sam rejected that outright, and he was right.

**His question was: what if I flagged questions during the attempt but
unflagged them all before submitting?** Answer: the report shows nothing —
correct, but it exposes that the flag is a *weak* signal here, failing in both
directions:

- **flagged but fine** — you flagged it, worked it out, got it right, never
  tidied up. That is the common case; most people do not unflag.
- **unflagged but still lost** — his scenario. The diligent student who clears
  their flags leaves no trace of where they struggled.

⚠ **And it exposed an over-claim of mine.** I had written *"you flagged 6
questions during this sitting"* in this doc, a column comment and two commit
messages. Unflagging **deletes** the state, so the report can only ever see
the position **at submit**. The data never supported that sentence.

**Sam's replacement:** show what is **still bookmarked at the time the report
is viewed**. A bookmark is deliberate and durable — you would have to actively
remove it to make the statement false — so reading it live is what makes it
honest. It is also the only signal on the page that is **actionable**: it feeds
the Builder's Bookmarked pool, so the action can serve those questions back.

Built as three surfaces:

| Element | Reads |
|---|---|
| "N of these are still bookmarked" fix-list entry, ranked **first** | bookmark, live |
| "Bookmarked" filter chip on the per-question table | bookmark, live |
| inline star toggle per row | bookmark, live |

Ranked first because **the student's own stated intent outranks our inference
about them**. Hidden entirely at zero.

⚠ **The wording rule is now a test.** Bookmarks have no attempt scoping, so one
may have been set months ago in a different sitting. Copy must say *"still
bookmarked"* and never *"you bookmarked these here"* — the same class of
over-claim the flag was rejected for. `derive.test.ts` fails if someone later
writes the friendlier-sounding wrong thing.

**One rule was bent to make it work.** Builder deep links force the pool to
UNSEEN so practice serves fresh questions — but a bookmark is the student
saying the opposite in as many words, so `pool=marked` is honoured. Narrow on
purpose: that value only, and content axes are *not* combined with it.
INCORRECT stays off-limits from a link.

---

## 8. What is already built

| Piece | State |
|---|---|
| `nclex_question_marks` table + indexes + RLS | ✅ pre-existing, unchanged |
| Bookmark read path in `_nclex_eligible_unit_pool` | ✅ pre-existing, correct, never touched |
| Grid marked-state encoding (border channel) | ✅ pre-existing |
| Builder pool chip | ✅ relabelled **Bookmarked** |
| Grid filter chip + legend | ✅ relabelled **Flagged** |
| Runner topbar — dead ⚑ Mark button | ✅ **removed** |
| Bookmark control + write/delete | ✅ slice 1 |
| Flag column on `nclex_attempt_items` | ✅ slice 2 (`20260902120000`) |
| Flag toggle RPC | ✅ slice 2 |
| Flag control, grid wiring, review-frozen | ✅ slice 3 |
| Report: still-bookmarked + inline toggle | ✅ slice 4 |
| Tutorial steps + sandbox controls | ✅ slice 5 |

⚠ **Not on prod.** The migration is dev-applied and committed; it ships with
the next `main → prod` release, which applies migrations automatically.

---

## 9. Where the code lives

| Path | What |
|---|---|
| `db/migrations/20260506140000_slice_2_1_5_question_marks.sql` | the bookmark table + its decision log |
| `db/migrations/20260823120000_cat_pool_enforcement.sql` | `_nclex_eligible_unit_pool` — the bookmark read path and the reserved-stock exclusion |
| `db/schema.sql` (§`nclex_attempt_items`) | where the flag column goes |
| `db/rls.sql` (~line 485) | why the flag needs an RPC |
| `app/(app)/(focused)/session/[attempt_id]/runner-topbar.tsx` | the button, currently disabled |
| `lib/practice/runner/cell-state.ts` | grid cell state, incl. the marked channel |
| `lib/practice/report/derive.ts` | report readings that gain flag data |
| `docs/product-plan/bank-consumption-runner.html` §14, §16.4, §16.5 | superseded skeleton; grid encoding; grid-is-navigation |
| `docs/product-plan/bank-consumption-attempt-creation.html` §6.3.4, §7 | why marking is its own table |

---

## 10. Decision log

| Decision | Rationale |
|---|---|
| Split into two features | one table structurally cannot hold both (§1.1); splitting is *less* work (§1.2) |
| Flag on `nclex_attempt_items` | already the right grain; no new table, no new RLS |
| Flag survives submit | history is more useful than deletion, and free |
| Flag frozen in review | editing it would rewrite the attempt record the report reads |
| Flag via RPC | students hold SELECT only, and `attempt_items` is the scoring snapshot |
| Bookmark = questions only | Sam: you bookmark a question, not a scenario |
| Bookmark = "re-quiz me", not "re-read" | it feeds a Builder pool; that is what the wiring already does |
| No bookmark in CAT / readiness | reserved stock cannot re-enter the practice pool, so the control would be a lie (§3.4) |
| Case exception declined | one screen, two truths, is worse than a uniform absence (§3.5) |
| "Mark" retired as a user-facing word | it already means points (§4) |
| No bulk-manage surface | the Builder→runner loop already closes it (§6) |
| No topbar overflow menu | Sam, deferred; flag would have to stay visible regardless (§5.2) |

---

## 11. Build slices — ✅ ALL FIVE BUILT (2026-07-30)

| | Slice | Commit | Verified |
|---|---|---|---|
| 1 | Bookmark, end to end | `9ff71ef` | Sam, live |
| 2 | Flag storage + RPC | `2720bcc` | 12 checks under rollback |
| 3 | Flag in runner + grid | `4138efd` | Sam, live |
| 4 | Report: still-bookmarked | `4d33b3c` | ⚠ not clicked |
| 5 | Tutorial + vocabulary | `fc35739` | ⚠ coach copy not clicked |

vitest **739 → 784**. One migration. Bookmark went first because it needed no
migration and no RPC, and closed a filter that had never once matched a
question; the flag needed schema work and fixed nothing that was broken.

**What the build changed about the plan**, recorded because the reasons
outlived the decisions:

- **§3.4 gained a third exclusion — tutor quizzes.** The practice pool reads
  `nclex_bank_items` only, so a bookmarked TUTOR question is exactly as
  unservable as a reserved one. A consequence of the rule, not a new rule,
  but the doc had not noticed the pool was bank-only.
- **§7.4 was rewritten by Sam.** The report shows no flag at all; it shows
  **still-bookmarked**, read live. See §7.4.
- **Slice 5 was bigger than planned.** The sandbox *hid* both controls, so the
  walkthrough could not teach them — teaching them meant making the sandbox
  render them with local-only state.

⚠ **Two silent breakages, both caught, both now guarded by tests:**

1. **`COACH_SECTIONS` holds raw indices into `COACH_STEPS`.** Inserting the two
   tutorial steps misaligned every section below them — jump menu one topic
   off, tsc clean, all tests passing. Now pinned to step titles.
2. **The coach's gate check was `s.gate === 'calc' ? calcOpen : currentSubmitted`.**
   Anything not `'calc'` fell through to the submit gate, so adding `'flag'`
   would have gated the flag step on *submitting*. Now an exhaustive switch.

Both are the same shape as the defects this project keeps finding: correct
types, green tests, wrong behaviour.

### ✅ Slice 1 — Bookmark, end to end · *no migration*

The whole of bookmarking. Nothing in the database changes.

- Load the student's bookmarks at sitting start, keyed by `item_id` (§3.7).
- Bookmark control in the runner topbar — direct INSERT / DELETE, no RPC (§3.1).
- Editable **everywhere** bookmark exists: live *and* review (§2.4 does not
  apply — that restriction is the flag's).
- **Absent entirely** on CAT and readiness-pack surfaces (§3.4).
- Relabel the Builder pool chip `Marked` → **`Bookmarked`**.
- Add the count-honesty line to the Builder (§3.3) — "18 available" may include
  case siblings.

⚠ **Decision needed at the start of this slice:** the dead `⚑ Mark` button
([`runner-topbar.tsx:164`](<../../app/(app)/(focused)/session/[attempt_id]/runner-topbar.tsx>))
would otherwise sit beside a live Bookmark, which is the exact
two-features-one-icon confusion this doc exists to remove. **Recommendation:
delete it in this slice** and reintroduce it as Flag in slice 3. It is
`disabled` and does nothing, so removing it costs the student nothing.

**Done when:** a student bookmarks a question, builds a new quiz filtered to
Bookmarked, and is served it — the first time that filter has ever worked.

### ✅ Slice 2 — Flag storage · *migration + RPC, no UI*

- Migration: flag column on `nclex_attempt_items`.
- `SECURITY DEFINER` toggle RPC (§2.3): verifies attempt ownership, refuses
  unless the attempt is `IN_PROGRESS`, touches only the flag column.
- ⚠ Do **not** add a student UPDATE policy to `attempt_items` as a shortcut —
  it is the frozen snapshot every score is computed against.
- Proven under rollback before merging, including another student's attempt and
  a submitted attempt, both refused.

**Done when:** the RPC is proven on real rows in a rolled-back transaction and
the migration file is md5-identical to the deployed body.

### ✅ Slice 3 — Flag in the runner and grid

- Topbar **Flag** control, wired to slice 2's RPC.
- Load the attempt's flags, keyed by `attempt_item_id` — **starts empty every
  sitting** (§3.8).
- **Review-frozen** (§2.4): renders, does not respond. Enforced in the RPC as
  well as the UI.
- Grid filter chip `Marked` → **`Flagged`**; legend entry → **"Flagged for
  review"**.
- Per-mode presence per §2.5.

⚠ **Blocked on §7.1** — whether Timed Sequential gets a flag. Answer it before
starting; the recommendation is no.

**Done when:** a question flagged in one sitting shows flagged in that sitting's
grid and review, and shows **unflagged** in a later sitting containing the same
question. That single test proves the split works.

### ✅ Slice 4 — The session report gains a study-list reading

The payoff, and the reason marking was worth building. Three CD elements return
(§7.4) — all three read **flag**, not bookmark:

- "N questions you flagged" fix-list item
- flagged ring on the question map
- filter chip on the per-question table

Separate slice because it is a different surface and a different file
(`lib/practice/report/`), and slice 3 is independently useful without it.

### Slice 5 — Tutorial and vocabulary sweep

- **Two** new coach steps, not one, plus the `data-coach` anchors the Mark
  button never had (§7.3).
- Reword the tutorial recap line — it currently reads "mark for review".
- Sweep remaining student-facing "mark" strings against the §4 table.

⚠ **The tutorial is public and on prod**, so this is user-visible. It is last
because it documents the finished behaviour, and doing it earlier means doing it
twice.

### Not in this arc

Everything in §7.2 — "My bookmarks", the case-bank bookmark filter, the topbar
overflow menu, case-level bookmarking, mark history.
