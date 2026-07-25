# Runner Tutorial (Sandbox)

*Living document. Started 2026-07-25. Canonical home for the **sandbox
tutorial** that teaches students how to use the exam runner — the question
types and the tools — in a safe, unscored, unsaved space. Surfaced by the
CAT work but **general to every mode**. Part of `mynclex/docs/product-plan/`.*

Last updated: 2026-07-25 (created — design thinking from the first discussion
captured; **nothing built**; three decisions open — see *Open decisions*)

---

## Status

**Design phase. Nothing built.** This doc records the thinking from the
2026-07-25 discussion and the decisions still to settle before any code.
The build is a **multi-slice feature**, not a quick add — see *Slice plan*.

## Why

On the real NCLEX, a tutorial runs *before* the exam so no candidate loses
marks fumbling the interface — how SATA works, how to drop answers into a
matrix, how drag-and-drop / cloze / bow-tie behave, how to use the
calculator, the navigation and submit rules. Two forces make this worth
building for us:

- **The CAT trigger + the 5-hour honesty.** The real NCLEX's 5 hours
  *includes* its tutorial; ours (§9.3, moved to 5h on 2026-07-25) is 5 hours
  of pure answering. An **optional, untimed tutorial offered before the exam**
  closes that gap honestly — the exam clock still starts at zero when the
  student begins, and we now mirror the real experience, not just the number.
- **General value.** Our core audience (Ghanaian nurses migrating) meets NGN
  item types for the first time here. The exam should test *nursing
  judgement*, not "can you work the UI." This applies to **every** mode, not
  just CAT — CAT is only what surfaced the need.

## Governing principle — reuse the real runner, never a mock

The whole point of a tutorial is to teach the **exact** interface used on the
day. So it must be driven by the **real runner's own components**, not a
parallel look-alike. A tutorial that teaches an interface even slightly
different from the real one is **worse than none** — it builds the wrong
muscle memory and leaves two things to keep in sync forever. This rules out
the tempting "just build a simple demo" path.

Precedent that this shape works: the public pages already carry a **sample
builder** (`app/(public)/bank-access/builder-demo.tsx`) and a **sample
runner** (`app/(public)/readiness/runner-demo.tsx`). The tutorial is a more
complete, *guided* version of that same idea.

## Architecture — the "sandbox mode" (the engineering crux)

The runner is built around a real **attempt**: it loads a student's questions
from the database, saves every answer, and scores at the end. A sandbox has
none of that. The real work is teaching the runner to run in a **sandbox
mode**:

- **Dummy questions, held in the app** — a small curated set (one per item
  type) shipped with the tutorial, *not* drawn from the question bank.
- **Every server action is a no-op** — submit, save-progress, complete,
  expire all do nothing; answers reveal instantly with friendly "here's how
  this works" feedback instead of being graded.
- **Nothing is recorded** — no attempt row, no history, no effect on the
  Readiness Signal.

The runner's existing **review mode** (reveals answers without submitting) is
a close cousin and a useful starting reference. The load-bearing safety
requirement: the sandbox path must be **provably unable to write real data** —
no accidental attempt rows, no score writes. This is the piece that is genuine
engineering, not a quick add.

## The coach layer (the new UI to design)

Reusing the runner gives the *interactions* for free. What does not exist yet
is the **guidance on top** — the thing that makes it a *tutorial* rather than
just a practice question:

- a **stepped walkthrough** ("Step 3 of 9 — Select All That Apply: tap every
  option that applies, then Submit");
- **coach marks** pointing at the real controls ("this is the calculator",
  "this is how you flag a question for review");
- a **"you can't get it wrong here"** tone, and a clear **"you're ready —
  start your exam"** at the end.

This coach layer is the main **design** work and the bulk of the risk — it is
a multi-screen guided experience and should go through a **Claude Design pass**
before building (per the CD-prototype-then-implement rule for dense/guided UI).

## Content — what it teaches

- **The question types.** The NGN set the runner renders: MCQ, SATA,
  Select-N, matrix (single + multi-response), cloze, drag-cloze, drag-order,
  highlight, bow-tie, true/false — plus how a **case study** and a **trend**
  question are laid out. (Coverage scope is an open decision — see below.)
- **The tools.** The **calculator** (see `calculator.md`), **mark-for-review**,
  the **question grid**, **navigation** (Prev/Next, and the no-going-back rule
  in sequential/CAT), **submit**, and the **timer**.

## Flow & entry points

- A **focused route** of its own (audience-neutral, distraction-free, like the
  runner at `/session/[id]`), **untimed and unfailable**.
- Offered as an **optional step before an exam** (CAT / pack / timed) — "New
  here? Take the short walkthrough" — and **remembered**, so once done the
  student gets a small link instead of a nag (needs a "tutorial completed"
  flag; store the DATA even if the nag-logic is minimal — [[feedback_analytics_deferred_per_feature]]).
- Reachable any time from **`/help`** and the **dashboard**.

## Open decisions (settle before building)

1. **Coverage** — all ~11 NGN item types up front, or a **core set first**
   (MCQ, SATA, matrix, cloze, drag-drop) with the rest added later?
2. **Shape** — a strict **linear** "next, next, next" guided tour (what the
   real NCLEX does), or a **free-explore** sandbox with optional coaching
   (friendlier, but easier to get lost in)?
3. **Design route** — brief **Claude Design** on the coach-layer UX first,
   then build from the prototype? (Recommended.)

## Slice plan (proposed)

0. **Design pass** — settle the sandbox-mode approach, the content list + order,
   the flow, and the coach-layer UX (Claude Design).
1. **The sandbox runner mode** — the engine work: dummy questions, no-op
   actions, provably no data writes. Nothing user-facing yet.
2. **The coach layer + flow** — the stepped walkthrough over the sandbox.
3. **Entry points + "done" memory** — the pre-exam offer, help/dashboard links,
   don't-nag-again flag.

## Related docs

- `bank-consumption-runner.html` — the runner this tutorial teaches (the
  chrome, per-type rendering, navigation, grid, mark-for-review).
- `bank-consumption-cat.html` — §3.2 the `/help/cat` explainer (the tutorial's
  text cousin); §9.3 the 5-hour limit this tutorial complements.
- `calculator.md` — one of the tools the tutorial covers.
- `main.md` — overall MyNclex product plan.
