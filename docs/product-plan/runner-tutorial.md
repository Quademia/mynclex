# Runner Tutorial (Sandbox)

*Living document. Started 2026-07-25. Canonical home for the **sandbox
tutorial** that teaches students how to use the exam runner — the question
types and the tools — in a safe, unscored, unsaved space. Surfaced by the
CAT work but **general to every mode**. Part of `mynclex/docs/product-plan/`.*

Last updated: 2026-07-26 (**arc complete** — Slices 1–3 all built; Slice 3
built this session across 3a/3b/3c and verified live; the whole tutorial is
functional)

---

## Status

**Built — the arc is complete (Slices 1–3).**

- **Slices 1 + 2** (sandbox mode + the coach layer) — **built and on `main`**
  (earlier 2026-07-26 sessions; app-layer, no migration).
- **Slice 3** (entry points + the flag memory) — **built 2026-07-26**, on the
  session branch `claude/work-session-4af632`, **awaiting Sam's test + merge to
  `main`**. NOT on `prod`. One migration `20260817120000_tutorial_flags.sql`
  (two per-user tables), applied to dev; app-layer otherwise.

The whole feature now works end to end: a public sandbox runner + coach, four
entry points, and the pre-exam offer. What each slice delivered is recorded in
*Build plan* below (headers marked ✅). Remaining follow-ups (none blocking)
live in *Deferred ideas & follow-ups*.

## Why

On the real NCLEX, a tutorial runs *before* the exam so no candidate loses
marks fumbling the interface — how SATA works, how to drop answers into a
matrix, how drag-and-drop / cloze / bow-tie behave, how to use the
calculator, the navigation and submit rules. Two forces make it worth
building:

- **The CAT trigger + the 5-hour honesty.** The real NCLEX's 5 hours
  *includes* its tutorial; ours (§9.3, moved to 5h on 2026-07-25) is 5 hours
  of pure answering. An **optional, untimed tutorial before the exam** closes
  that gap honestly — the exam clock still starts at zero when the student
  begins.
- **General value.** Our core audience meets NGN item types for the first
  time here. The exam should test *nursing judgement*, not "can you work the
  UI." This applies to **every** mode — CAT is only what surfaced the need.

## The governing principle — one runner, never a copy

The tutorial teaches the **exact** interface used on the day, so it must be
the **real runner**, not a look-alike. The distinction that matters:

- ❌ **A side runner that's a *copy*** — a second runner built to resemble the
  real one and kept in sync forever. This is the **mock we ruled out**: the
  day the real runner changes, a copy teaches a lie. (CD's HTML file *is* such
  a copy — but it is only a **blueprint**, never what we ship.)
- ✅ **The real runner, in a practice mode, with the coach on top** — same
  code, same components, same behaviour; we just feed it fake questions,
  switch off the "save" wiring, and float the coach beside it.

> Analogy: not a replica car built to look like yours — *your actual car*, on
> a private practice track, with an instructor in the passenger seat and the
> odometer unplugged.

The tutorial has its **own address** (a route like `/tutorial`), but that
route **mounts the real runner's building blocks** — it does not re-create
them. **There is only ever one runner.**

## The CD walkthrough (adopted 2026-07-25, concept-not-source)

Claude Design read the *real* runner components (per its sync notes:
`runner-topbar/-footer/-grid/-question-area`, `lib/practice/runner/types/*`,
the case/trend panels, `mode-brief.ts`) and built the walkthrough on top of
them. Shape we're adopting:

- **A 32-step linear walkthrough** grouped: chrome & tools (12) → every
  question type (11) → case & trend (7) → close (2), each step carrying a
  title, body, the **control it points at** (`target`), an optional **gate**
  (a must-do before Next unlocks), and which dummy question to show (`goto`).
- **Coach card anchored to each control** (Exit, calculator, answer area…),
  dimming the rest — a moving coach-mark, not one static modal.
- **Learn-by-doing gates** — several steps require the student to actually
  *do* it (mark the question, open the calculator, answer & submit) before
  continuing. Stronger than passive reading.
- **"Nothing is recorded"** surfaced to the user (a topbar pill + a dedicated
  step) — our sandbox-safety invariant made visible; the pill stays up even
  when coaching is hidden.
- **User controls on the coach card (v2, adopted 2026-07-25):**
  - **Hide coaching → Resume** — collapse the coach to a minimal strip so the
    whole runner is free to explore, and resume the guided flow at any time.
    This makes the tutorial *both* a guided tour and a free-explore sandbox,
    which **dissolves the earlier linear-vs-explore question** — you get both.
  - **End tutorial** — an explicit exit from the coaching, reachable anywhere
    (incl. the hidden-coaching strip).
  - **Jump-to-section** — a **hierarchical** dropdown (big sections + each of
    the 11 question types as a sub-entry), so a returning student lands
    straight on e.g. "bow-tie" in one click.

Two build-time notes (not blockers): the runner's own "Exit" and the coach's
"End tutorial" are **two exits** that must read coherently at build time; and
**jump + gates coexist** by design (the linear path gates on doing the thing,
but jump-to lets a returning user skip straight to a type — correct for a
reference tool, not a bug to "fix").

## Settled decisions

1. **Coverage — FULL.** All 11 question types (MCQ, T/F, SATA, Select-N,
   matrix, matrix-multi, highlight, cloze, drag-cloze, drag-order, bow-tie)
   plus case study and trend. Meeting an untaught type in a real exam is the
   exact failure the tutorial prevents.
2. **Shape — linear walkthrough + jump-to-section.** Guided "Step N of 32" as
   the default first-timer path, with a jump-to-any-section index for
   returners (CD delivered it, so it's in v1).
3. **Dummy content — CD's real clinical questions, kept as-is.** An earlier
   musing to make them trivial/non-nursing was **reversed**: a nurse doing a
   "primary-colours" question would feel patronised, and real content keeps it
   feeling like the exam. (If any prove to demand real deliberation we can ease
   them, but the set stands.)
4. **Design route — done.** CD delivered the coach-layer UX.
5. **Placement — authenticated focused route for v1.** The sandbox reuses the
   real runner components (which assume a logged-in context), so v1 is an
   authed, audience-neutral, distraction-free route. A public preview for
   prospective buyers is a possible **v2**, not a v1 gate.

## Build plan — the slices

A **multi-session feature**. Build in order; each slice is testable and
mergeable on its own.

### Slice 1 — the sandbox runner mode (the real engineering) ✅ BUILT (on `main`)

Make the runner run with fake questions that save nothing. The load-bearing
piece. **Delivered as a live `UNTIMED_LEARNING` + `sandbox` flag on the REAL
`<Runner>` (not a third mode), fed an in-code no-writes bundle; Submit scores
locally via the same pure `scoreAttempt`. Sign-off met: zero DB rows after a
full run.**

- **Dummy questions, held in the app code (NOT the bank).** ~19 dummy items —
  one per type (+ the case's children and a trend) — shaped exactly like real
  `nclex_attempt_items` so the runner renders them unchanged, kept in a
  constant (e.g. `lib/practice/tutorial/questions.ts`). Held in code so they
  **can never leak into the real bank or the CAT pool**, and are versioned
  with the app.
- **A third runner mode.** The runner today branches on `mode: 'live' |
  'review'`; add a `tutorial`/`sandbox` mode. **Review mode is the template** —
  it already reveals answers without saving; the sandbox is "review, but the
  student answers fresh and still nothing saves."
- **Every server action becomes a no-op.** `submitAnswer`, `saveProgress`,
  `completeAttempt`, `expire`, the clocks — all stubbed / not called in
  sandbox mode.
- **Wiring choice (settle in this slice):** teach the *existing* runner shell
  the new mode (one shell handles all three — preferred, guarantees zero
  drift), **or** a thin tutorial host mounting the runner's real child
  components. Either way it's the **same components**, never a reimplementation.
- **The safety invariant — provably no writes.** The sandbox never creates a
  real attempt, so there is nothing to write into; the stubs are belt-and-
  braces. **Sign-off = after a full tutorial run, the DB has zero new records**
  (no attempt, no answers, no score).
- *Nothing user-facing yet* beyond a bare sandboxed runner for testing.

### Slice 2 — the coach layer + flow ✅ BUILT (on `main`)

The guided coaching on top of the sandbox. CD's blueprint specifies most of it.
**Delivered as 31 steps (CD's 32 minus the disabled Mark button), rendering
inside the runner and driving it; gates (open the calc / submit to unlock
Next), hide→free-explore→resume, hierarchical jump-to-section, and End.**

- **Step data** — port CD's 32-step list (title, body, `target`, `gate`,
  `goto`) into the app.
- **Coach card** — a floating React component that positions itself next to
  the `target` control, dims the rest (the spotlight/ring), and renders
  title/body/Back/Next/Skip. Cross-viewport positioning is the fiddly UX bit.
- **Gate logic** — for gated steps, Next stays disabled until the student
  does the thing; the runner already announces mark/answer/submit events, the
  coach listens.
- **Flow controller + coach controls** — current step, advance/rewind, switch
  the underlying dummy question on `goto`, the hierarchical **jump-to-section**
  index, **hide/resume** (collapse to a strip → free-explore → resume), an
  explicit **End tutorial**, and the "you're ready — start your exam" ending.
  (All of these are coach-layer only — they don't touch Slice 1 or the safety
  invariant.)

### Slice 3 — entry points + "done" memory ✅ BUILT (session branch, awaiting merge)

Design settled 2026-07-26 (discussion with Sam), then **built the same day**
across 3a/3b/3c (see *Build sub-slices* below) and verified live. This is the
**only slice in the whole feature that writes to the database**; Slices 1–2
write nothing.

> **As built (2026-07-26, branch `claude/work-session-4af632`, NOT on `main`):**
> everything below shipped as designed, with these build-time confirmations and
> small deltas worth noting:
> - **There is no single shared preflight.** CAT has its OWN preflight modal on
>   the CAT home; custom-built + readiness use the `/session` preflight. A CAT
>   attempt is created already-started, so it never hits the `/session` gate.
>   The offer is therefore wired into **two** hosts (`preflight.tsx` +
>   `cat-home-client.tsx`), same shared `<PreExamTutorialOffer>`.
> - **"Watching is free" holds on every surface** with no CAT-clock fix needed —
>   the start action the popup defers is exactly what stamps the clock / creates
>   the CAT attempt / spends the readiness credit.
> - **This-sitting no-double-ask** uses a `tut_watched=1` marker on the return
>   address (the session preflight reads it; the CAT home derives the modal's
>   initial open state from it, reopening losslessly).
> - **The offer got a visible × + Esc** (both → back to the preflight) after
>   Sam flagged that backdrop-only close is undiscoverable.
> - **Readiness** is wired through the shared `preflight.tsx` interception but
>   was exercised via the custom-built variant, not a live paid pack.

#### The tutorial route becomes PUBLIC

The `<Runner>` component needs no user — it renders purely from its `data`
prop (no auth, no Supabase, no session). The tutorial is login-only today only
because it sits under `(app)/`, whose layout redirects anonymous visitors. So
"make it public" is a route + CSS-import change, **not** a runner rewrite.

**Decision — make the tutorial publicly reachable**, as ONE route: signed-in
students get the walkthrough *and* their done-flag write; logged-out visitors
get the identical experience, unrecorded (no `user_id`, nothing to write, and
nothing to suppress). Rationale: a public "taste of the exam interface" is the
industry norm — **NCSBN's own** Candidate Tutorial / Sample Questions / Exam
Preview are free and public, and UWorld's sample page is interactive with no
signup. Our tutorial is a fixed dummy set that touches neither the real bank
nor CAT, so public gives away *the demo everyone gives away*, not the product.
It also removes the "logged-out `/help` link bounces to login" wrinkle. (A
`(public)` sibling route or lifting the route out of the auth boundary — settle
the exact mechanism at build; the invariant is one route serving both.)

#### The "done" memory — TWO tables

No user/profile table exists; the codebase's pattern for per-user state is a
small dedicated table (`nclex_library_shelf_seen`, etc.). We record **two
distinct facts, and they belong in two tables** — because "did they finish the
tutorial" is a fact about a *tutorial*, while "don't show this again" is a fact
about a *popup*, not the tutorial. Bundling them onto one row assumes one
tutorial = one popup = one dismissal, which breaks the moment the same offer
appears in a second place, or a future tutorial has its own popup.

**1. `nclex_tutorial_completions`** — tutorial progress.
- Keyed **`(user_id, tutorial_key)`** — one row per user *per tutorial*, so a
  second walkthrough later (`/tutorial/builder`, onboarding, …) is a new
  `tutorial_key` value with **zero schema change**. `tutorial_key` here is
  `'exam-runner'`.
- **`completed_at`** — did they finish (reached the final coach step). A record
  only; it drives **no** behaviour (see the popup rule). Room to grow
  additively (`last_step`, …) on the same row.

**2. `nclex_dismissed_prompts`** — the "don't show me this again" list.
- Keyed **`(user_id, prompt_key)`** — one row per user *per popup*.
- **`dismissed_at`** — when they ticked "Don't show again". **This is what
  gates the popup**, nothing on the completions table does.
- `prompt_key` names the **offer**, not the physical spot — this one is
  `'pre-exam-tutorial-offer'` — so dismissing it silences that offer *wherever*
  it appears (what a user means by "stop offering me this"). Any future popup
  (same tutorial elsewhere, a future tutorial's own, or any app "don't show
  again") is just a new `prompt_key` — no schema change. This is a normalized
  registry (one row per popup), **not** the wide junk-drawer row we avoid.

#### What's recorded for an UNAUTHENTICATED user — nothing, by design

The tutorial route is public, so a logged-out visitor can walk the whole thing.
Both tables key on `user_id`, so there is nothing to write for someone without
an account, and that is correct:
- **Completion** simply **no-ops** without a user. The public page reads the
  user *optionally* (present → completion write enabled; absent → not). Guarded
  in layers, never by luck: the **client** only calls the write when a user is
  known; the **server action** re-checks `getUser()` and no-ops if empty (the
  authoritative guard); **RLS** keys the insert on `auth.uid()` so an anonymous
  request cannot write a row (the backstop).
- **Dismissal never arises** — the only dismissal surface is the pre-exam
  popup, which lives behind an exam attempt (auth + bank access). A logged-out
  visitor can't start an exam, so there is no popup to dismiss.
- **No carry-over.** If an anonymous visitor later signs up they start fresh
  (no completion, no dismissal) — correct, those facts are per-account. Anonymous
  "how many tried it" counts, if ever wanted, are the separate thin-capture idea
  in *Deferred ideas*, deliberately not these tables.

#### The four entry points

1. **`/help` hub** — an always-on "Take the exam walkthrough" link on the
   (now public) help hub, and inside `/help/cat` for context. No flag.
2. **Student dashboard** — a **permanent** doorway in the "Where to next" rail
   (`lib/home/student/bank/rail.tsx`, data-driven — one entry added). Evergreen
   copy ("Exam walkthrough" / "Practice the interface anytime — nothing is
   recorded") so it reads as a standing tool, not an unfinished task. A doorway,
   **not** a banner. No flag. (Reaches the already-subscribed student — its job
   is "you own the bank; learn the screen," not acquisition.)
3. **Pre-exam popup** — the one flag-aware surface (detailed below).
4. **Help in shared chrome** — a global **"Help"** link in the shared shell
   (user menu / topbar) → the `/help` hub, reachable from every space (bank,
   programme, cohort), filling the gap that the workspace has no help route
   today. A Help *hub* link, **not** a tutorial-specific nav line (cleaner,
   scales as help grows). Slightly bigger touch than a nav-config line (it's
   chrome), still minor.

#### The pre-exam popup — settled behaviour

- **CAT is not special.** We chose to keep watching **free** for every mode
  (the teaching walkthrough must never eat a student's real exam time — the
  newcomer who most needs it is the one who'd lose 10–15 min of a 5-hour CAT).
  So the offer, the free watch, and "clock starts at real questions" are
  **uniform across all modes**.
- **Where it fires:** the preflight is a real screen at the attempt's own
  address (`app/(app)/(focused)/session/[attempt_id]/preflight.tsx`), shown
  *after* the attempt is created. The popup fires when the student clicks
  **Start on the preflight** — read preflight → Start → popup.
- **When it shows:** every exam start, **unless `dismissed_at` is set** (the
  "Don't show again" checkbox). It does **NOT** gate on `completed_at` — a
  veteran keeps the standing courtesy until they switch it off themselves. Two
  buttons: **Watch** / **Start exam**, plus the checkbox.
- **No double-ask same-sitting:** if they just chose Watch on the way into
  *this* exam, we don't re-pop the offer on the immediate bounce-back to the
  preflight. Permanent suppression is still only the checkbox; this is a
  this-run-only skip. Next exam, fresh offer (unless dismissed).
- The checkbox writes a `nclex_dismissed_prompts` row (`prompt_key =
  'pre-exam-tutorial-offer'`); finishing the tutorial writes
  `nclex_tutorial_completions.completed_at` (record only). The popup reads the
  dismissed-prompts list, never the completions table.

#### The return-destination mechanism

The sandbox bundle already carries a single `exitHref` that End / Exit / finish
all route to (`buildSandboxData`, currently hardcoded to `/help`). Slice 3
makes it dynamic:

- Each door links with `/tutorial/exam?return=<internal-path>`; the page reads
  `return`, and `buildSandboxData` uses it as `exitHref`.
- **Guard (open-redirect):** honour only **internal** paths (leading single
  `/`, no scheme, no `//`); anything else falls back to `/help`.
- Standing doors return to their origin (`/help`, the dashboard, the hub).
- **Pre-exam returns to the attempt's own preflight address**
  (`/session/[attempt_id]`). Because the attempt already exists at a stable
  URL, the round-trip is **lossless** — nothing the student configured is lost,
  and it's uniform across modes. No stashing, no per-surface special-casing.

#### Build-time verifications (not decisions — checks)

- **CAT clock:** confirm the 5-hour clock starts at **preflight-Start** (after
  any tutorial detour), not at attempt creation — else free-watching would leak
  exam time, breaking the "watching is free" decision. Small fix if not.
- Confirm every mode's pre-exam moment routes through the shared preflight (or
  an equivalent stable per-attempt URL) so the popup + return hook lands
  everywhere.

#### Build sub-slices — 3a / 3b / 3c

Built in order; each is testable on its own.

**3a — Foundation: the two tables + the flag helpers.** The isolated DB piece;
everything else depends on it. Low-risk, additive.
- **New** `db/migrations/<version>_tutorial_flags.sql` — `nclex_tutorial_completions`
  and `nclex_dismissed_prompts` (both keyed on their pair) + RLS so a user only
  reads/writes their own rows.
- **New** `lib/practice/tutorial/completion.ts` — server helpers: mark a
  tutorial completed; check + set a prompt dismissal. Each **no-ops without an
  authenticated user** (see the unauthenticated rule above).
- Apply to **dev**; verify the tables + RLS. Nothing user-facing yet.

**3b — The tutorial's own behaviour: public route + return + completion write.**
- Make `/tutorial/exam` **public** (settle the exact mechanism — `(public)`
  sibling route vs lifting the auth boundary — at build; ensure the runner CSS
  is imported by the public layout).
- Read a guarded `?return=` and thread it into `buildSandboxData` as `exitHref`
  (`sandbox-data.ts`); `/help` stays the default.
- Write `completed_at` on reaching the final coach step (signed-in only).

**3c — The four doors.**
- `/help` hub + `/help/cat` links.
- The permanent dashboard doorway (`lib/home/student/bank/` doorways data).
- The global **Help** link in the shared chrome (user menu / topbar).
- The pre-exam popup on `session/[attempt_id]/preflight.tsx` — reads the
  dismissed-prompts list, Watch / Start + checkbox, no double-ask same-sitting,
  returns to the preflight. Plus the build-time checks above (CAT clock; every
  mode routes through the shared preflight).

#### Deferred within Slice 3 scope

- **Tutorial preflight** (its own framing screen before the walkthrough) —
  parked; see *Deferred ideas & follow-ups*.
- **Drift-safety tripwire** — parked; see the same section. Not a Slice-3 gate.

## Build-approach guardrails

- **One runner only.** Reuse the real components; never a parallel copy.
- **CD's HTML is the blueprint, not the source.** At build time, fidelity is
  checked against the **live** React components, not CD's static reproduction
  (same concept-not-source discipline as the bank/readiness CD work).
- **The no-write invariant is load-bearing** and gets its own verification
  (zero DB records after a full run) before Slice 1 is called done.

## Deferred ideas & follow-ups

Captured 2026-07-26 (discussion, not scheduled). Neither is a Slice-3 gate.

### A tutorial preflight (deferred)

Today `/tutorial/exam` drops the student straight into the runner + coach.
Idea: front it with a short **tutorial preflight** — its own framing screen
("This is the exam screen — nothing here is recorded") before entering, the
same way a real sitting has a preflight. Purely additive, architecture-neutral
(works with the current coach or any alternative). **Not now** — parked as a
possible Slice-3-plus polish once the entry points land.

### Drift-safety — keep the coach central, harden the anchor

**The problem.** The coach (`lib/practice/tutorial/coach/steps.ts`) points at
runner controls **by name** — each step's `target` matches a `data-coach="…"`
marker on a real runner component. The two live apart, so a control that is
renamed or removed leaves the step pointing at a ghost, and the coach **fails
silently** (`coach.tsx` falls back to a centred card spotlighting nothing).
There are two drift flavours: (a) a control renamed/deleted → **dangling
pointer**; (b) a brand-new control nobody wrote a step for → **untaught**.
(b) is unsolvable by any architecture — the machine can't know you *intended*
to teach a new control; that's always human curation.

**Considered and set aside — thread tutorial-awareness through every
component.** Sam's alternative: drop the overlay; give every runner feature a
tutorial prop so each renders its *own* coaching when in tutorial mode. This
genuinely kills flavour-(a) drift (coaching lives *inside* the control, so
deleting the control deletes its coaching — no pointer to dangle). But it was
not adopted, for three reasons: **(1)** the tutorial is a *guided sequence*
(31 ordered steps, gates, jump-to-section, hide/resume, End) — colocated
per-control bubbles have nowhere to hold the order, so a central orchestrator
(≈ the coach) re-emerges anyway, leaving you with *both*; **(2)** the whole
teaching script stops being readable in one file — reviewing "what the
tutorial says" would mean opening a dozen component files; **(3)** it couples
teaching into the live exam path, widening the surface for the exam-mode
display leaks the runner has repeatedly had. It also does **not** solve
flavour (b). Net: it fixes (a) at a high structural cost, and (a) is fixable
far more cheaply.

**Recommended follow-up (cheap, keeps the tour in one file):**
- **A dev-only tripwire** — a test that walks `COACH_STEPS` and asserts every
  `target` resolves to a real `data-coach` marker and every `gotoKey` to a
  real sandbox question. Turns silent drift into a loud test failure. ~30 lines.
- **Optionally, a typed anchor contract** — replace the loose `data-coach`
  *string* with a shared enum/registry both the component and the step import,
  so a rename becomes a compile error, not a silent miss. This captures the
  intuition behind the rearchitecture (the control declares its own tutorial
  hook) *without* moving the curriculum into the components — which is also how
  real onboarding libraries split it: element declares an anchor, a central
  driver sequences.

Neither is built. Schedule after the tutorial ships (post-Slice 3).

### The sandbox is a reusable primitive — a public free-question sampler

The engineering that makes the tutorial possible is **not** "a tutorial" — it
is a **sandbox mode on the real runner** (`data.sandbox` flag + no-op'd writes
+ an in-memory bundle builder), i.e. *run the real exam engine over any set of
questions, provably touching nothing*. The tutorial is its **first consumer**.
Its natural **second consumer** is a **public free-question sampler** — the
industry-standard "public taste of the interface" (NCSBN's own Candidate
Tutorial/Sample Questions, UWorld's no-signup sample page): mount the same
sandbox runner on a public route, feed it a handful of questions, let a
logged-out visitor answer and read the rationale, save nothing. Most of the
work already exists — it's a new *bundle source* + a public route, not a new
engine.

Two forks a future sampler slice must pick (named now so they don't ambush):
- **Question sourcing.** The tutorial's dummies are hand-authored in app code
  *precisely so they can't leak into the paid bank / CAT pool*. A sampler
  forces a choice: (a) expose a **curated slice of real bank items** as a
  deliberate giveaway (strongest demo, but it's paid content — needs an
  explicit "these N are public" flag, never accidental), or (b) a **separate
  purpose-built public pool** (clean separation, authoring cost).
- **The zero-write rule cuts both ways for a funnel.** Writing nothing is a
  pure win for the tutorial, but a marketing sampler that stores nothing also
  *captures* nothing (no "7/10 — sign up for the rest", no even-anonymous
  bounce count). If it becomes a conversion tool it likely wants a **thin,
  privacy-safe capture** (an anonymous count, not stored answers) — a
  deliberate, narrow exception to the invariant, not its abandonment. (Cf. the
  standing rule: capture the data even when deferring the dashboard.)

Not scheduled — a future v2+ idea; may also warrant a pointer from the
bank/public-demo planning when it's picked up.

## Related docs

- `bank-consumption-runner.html` — the runner this tutorial teaches (chrome,
  per-type rendering, navigation, grid, mark-for-review).
- `bank-consumption-cat.html` — §3.2 the `/help/cat` explainer (the tutorial's
  text cousin); §9.3 the 5-hour limit this tutorial complements.
- `calculator.md` — a tool the tutorial covers.
- **`design-handoff/runner-tutorial/`** — the adopted CD blueprint (v2),
  concept-not-source. `tutorial-runner.html` is the 32-step prototype (`STEPS`
  / `SECTIONS` / `RECAP` arrays); `cd-sync-notes.md` maps each screen to the
  real component it was built from; `README.md` explains the contract.
- `main.md` — overall MyNclex product plan.
