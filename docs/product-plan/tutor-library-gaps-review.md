# Tutor Library — Gap Review & Proposals

*Working document. Created 2026-05-24 to close out every open / under-specified
item in [tutor-library.md](tutor-library.md) in a single coherent pass.
Each row carries a proposal; decisions get marked here as Sam confirms or
amends them, then folded back into `tutor-library.md` once the whole table
is settled.*

**Status legend** — used in the right-hand margin once decisions land:
- 🟡 Proposed (default — awaiting Sam's call)
- 🟢 Confirmed
- 🔵 Amended (proposal changed during discussion — note the change inline)
- 🔴 Rejected

---

## Architectural decision — Embedded questions block (refined 2026-05-24)

Settled 2026-05-24 (mid-#19 discussion). The original plan's embedded-questions model stays — full server-side persistence, snapshot at submit, separate `nclex_library_embed_answers` table, `ON DELETE RESTRICT`, one-time submit semantics, day-one schema support for v2+ tutor analytics. The build is heavier than the alternatives we explored (linked-quiz / stripped-no-persistence / localStorage-memory) but the long-term benefits — cross-device persistence, analytics signal, snapshot integrity — are worth it.

**One refinement to the original plan: multi-question blocks instead of single-question.** Walking back from the single-question-per-block original to a question-set-per-block shape:

- **Block schema** becomes `{ type: "embedded_questions", item_ids: string[], source: "TUTOR" }` — note the plural type name and the array. Single-question case is just an array of length 1; nothing is lost.
- **Read-mode rendering** becomes a small inline player walking through the questions sequentially: "Question 1 of N" with Next button, per-question Submit + immediate feedback + rationale, end-of-set summary ("You got 2/3 right"). Reuses the existing per-question runner components.
- **Storage** — `nclex_library_embed_answers` keyed on `(student_id, note_id, block_id, question_index)`. UNIQUE constraint adjusts accordingly. Multiple rows per block per student (one per question in the set).
- **Snapshot, lock-after-submit, ON DELETE RESTRICT** all carry through unchanged — same per-question semantics, just multiple rows per block.
- **Per-block caps.** Soft 5, hard 10 questions per block (nudges tutors toward quizzes for longer sets). Per-note caps from #19 (20 soft, 50 hard, summed across all blocks) still apply.
- **Why this is materially better than single-question.** Pedagogical coherence ("Now try these three" is a natural teaching moment), tighter reading flow (one practice break vs three scattered widgets), cleaner authoring (multi-select picker once vs adding three blocks).

This refinement folds back into `tutor-library.md`'s embedded-question section — see #21 for the cross-doc update.

---

## Architectural decision — Multi-pillar notes from day 1

Settled 2026-05-24 (mid-#10 discussion). The original plan stored one pillar per note as a single `TEXT` column with a CHECK constraint, deferring multi-pillar to v1.5. Real NCLEX content routinely spans pillars (Furosemide is Pharmacological and Parenteral Therapies + Reduction of Risk Potential; wound-infection prevention is Safety and Infection Control + Reduction of Risk Potential + Physiological Adaptation; pre-op patient education is Management of Care + Health Promotion and Maintenance + Psychosocial Integrity). Forcing a "primary" pillar means artificial judgment calls at save time and undercounted coverage analytics. The migration cost of starting single and promoting later is real; the cost of starting multi is small.

**Storage uses the full NCLEX names, not codes.** The original draft used abbreviation codes (`MoC`, `SIC`, `HPM`, `PI`, `BCC`, `PPT`, `ROR`, `PA`). Those were a programming convenience that didn't earn their keep — they require a constants-file translation layer, don't match the vocabulary tutors and students actually use, and the rename-safety argument is weak (NCLEX category names are decades-stable). Self-documenting raw data wins.

- **Schema.** New domain type `nclex_pillar` with a CHECK constraint against the 8 full NCLEX-RN Client Needs sub-category names:
  - `Management of Care`
  - `Safety and Infection Control`
  - `Health Promotion and Maintenance`
  - `Psychosocial Integrity`
  - `Basic Care and Comfort`
  - `Pharmacological and Parenteral Therapies`
  - `Reduction of Risk Potential`
  - `Physiological Adaptation`
  
  The notes table carries `pillars nclex_pillar[] NOT NULL` with a length-≥-1 check.
- **No "primary" concept.** All pillars in the array are equal weight. If primary ever needs to exist (chip rendering priority, weighted analytics), a separate column lands later without touching the array.
- **Editor UI.** Multi-select chip input constrained to the 8 names.
- **Per-note row.** All pillar chips render inline (1-3 typical), each color-coded. Where the per-note lens row gets crowded, names truncate with a tooltip — no abbreviated codes ever shown to users.
- **Pillar lens (sidebar).** Each of the 8 entries shows count of notes where that pillar appears in the array. Multi-pillar notes count in each of their pillars (correct, not double-counting in a misleading sense — the note genuinely IS relevant to each).
- **Filter chips.** Default OR semantics — selecting two pillars shows notes covering either. (AND semantics could be a later power-user toggle.)
- **URLs.** Filter parameters use slugified pillar names (e.g. `?pillar=pharmacological-and-parenteral-therapies`). A small client/server map handles slug↔name; cheap.
- **Bank consistency — already aligned.** Verified 2026-05-24: `lib/bank/classifications.ts` (sourced from the NCSBN 2023 NCLEX-RN Test Plan) already uses these exact 8 full names; the bank's `client_needs_subcategory TEXT` column stores them as-is. No parallel migration needed on the bank side — the library is adopting the bank's existing vocabulary. The bank validates the values only in TypeScript; the library will additionally validate at the DB level via the `nclex_pillar` domain type. Optional follow-up later: the bank could adopt the same domain type for free DB-level validation. Independent of library work.
- **Library uses sub-categories only.** Top-level categories (the 4-entry roll-up — Safe and Effective Care Environment, Health Promotion and Maintenance, Psychosocial Integrity, Physiological Integrity) are derived from the sub-category array at query time, not stored separately. The bank chose to denormalize and store both `client_needs_category` and `client_needs_subcategory`; the library doesn't follow suit — single source of truth (the array).

This decision also retires the old text in `tutor-library.md` that says "Single primary pillar per note in v1 ... Promote to many in v1.5" and the entire codes-based vocabulary — needs folding back into the spec.

---

## Architectural decision — Visibility model (drives #3, #16, #17)

Settled 2026-05-24. The original plan modelled `PROGRAMME_SCOPED` as a single-programme FK, which couldn't express the realistic "this note belongs to two of my cohorts but not the third" case. Refined model:

- **Two visibility modes.** `TUTOR_WIDE` (every programme this tutor runs) and `PROGRAMME_SCOPED` (one *or more* programmes from a tutor-chosen set).
- **Storage.** A junction table `nclex_tutor_library_note_visibility (note_id, programme_id)`. One row per (note, programme) pairing. For `TUTOR_WIDE` notes the junction is empty. For `PROGRAMME_SCOPED` notes the junction has ≥ 1 row.
- **UI.** Publish dialog's programme picker becomes a multi-select. Default selection on first publish is whichever programme the tutor is currently working in (if any).
- **Same-tutor invariant.** Every programme in a note's visibility set must belong to that note's tutor. Enforced app-layer and via SQL trigger (resolves #17 cleanly).
- **RLS helper.** `nclex_student_can_see_note(note_id)` returns true if the note is published AND either `visibility_mode = 'TUTOR_WIDE'` AND the student is enrolled in any of this tutor's programmes, OR `visibility_mode = 'PROGRAMME_SCOPED'` AND the student is enrolled in at least one programme in the note's visibility set.

This narrows #3's silent-mismatch problem to a real edge case (tutor genuinely meant a note for one cohort only, then forgot when attaching a shelf containing it elsewhere) — solvable with an attach-time confirm alone, no permanent badge.

---

## Architectural decision — Shelf attachment model (drives #1, #2, #14)

Settled 2026-05-24. A shelf attached to a unit is **one atomic activity**, not a fan-out into per-note rows. The shape:

- **Attachment table.** One row per shelf-attach (`{shelf_id, unit_id, block_id, caption, ...}`). Loose Library Notes still get one row each (`{note_id, ...}`). No per-note rows inside a shelf.
- **Completion.** Derived at query time from `nclex_library_note_state.marked_done_at` (the merged per-(student, note) state table from #13). A shelf-activity is complete when every member note (minus those in `skipped_note_ids`) has `marked_done_at IS NOT NULL` for this student. Auto-rolls up; no separate "Mark shelf done" click. *(Earlier draft used a `notes_completed JSONB` field on the progress engine's row — retired when #13 merged note-state into one table.)*
- **Skip in a unit.** `skipped_note_ids JSONB` on the shelf attachment row lets a tutor omit specific notes from this unit's render without breaking the shelf-link. Resurrects #2 without re-introducing per-note rows.
- **Ordering.** Always the shelf's master order, read at render time. No `position` on attachment for shelf-grouped notes. #1 + #14 fall out of this.
- **Membership change behaviour.** If the tutor adds a note to a shelf after a student completed it, the activity reverts to in-progress until the new note is ticked. If the tutor removes a note the student hadn't ticked, the activity may complete retroactively. Both are correct behaviour — communicated to students with a small "your tutor updated this shelf" hint.

Trade-offs accepted:
- No per-note caption *inside* a shelf — caption is shelf-level. Per-attachment caption still works for loose Library Notes.
- No per-shelf per-unit ordering — to reorder, edit the shelf itself.

---

## The 21 gaps

| # · Point | Issue (in plain terms) | Proposal | Status |
|---|---|---|---|
| **1. Reorder inside a shelf-attached block** | A shelf can be dropped into a unit as a grouped block. If the tutor drags one of those notes up *inside the unit*, should the shelf itself reorder, or is it a unit-local move? Without a rule, you get silent drift — the shelf says one order, the unit shows another, and nobody knows which is "right." | **No reordering inside a shelf-as-activity.** The grouped block in a unit always renders the master shelf's current order, read-only. To change order, the tutor goes to the shelf in the library and reorders it there — that change then propagates to every unit using the shelf (they're all pointers to the same master). One rule, one place. No `is_position_overridden` flag, no "moved" indicator, no "reset to shelf order" action. Also makes #14 trivial — new notes added to a shelf always slot in at their shelf position in every attached unit. | 🟢 |
| **2. Skip one note from a shelf attachment** | Right now the only way to remove a single note from a shelf inside a unit is to "detach" it, which severs the shelf link and turns it into a loose Library Note. That's overkill if the tutor just wants to hide that note in that unit but keep the shelf connection. **Real case:** the shelf is the tutor's master pack — reused across cohorts. Cohort 5 already covered note X elsewhere, so the tutor wants to omit it for Cohort 5 only. The alternative (fork the shelf into a Cohort-5 variant) creates two near-identical shelves that drift over time. | **`skipped_note_ids JSONB` on the shelf attachment row.** Tutor opens the grouped block's kebab → "Hide in this unit" on a single note row → its `note_id` is appended to the array. Hidden notes don't render to students and don't count toward the shelf's completion rollup. Tutor unit view shows the row dimmed with a "Hidden in this unit" pill and an "Unhide" action. Survives the Option D refactor cleanly — no per-note rows required. Keeps the master shelf clean while letting each cohort's attachment carry small exceptions. | 🟢 |
| **3. Mixed-visibility shelves** | A shelf can hold notes with different visibility scopes. If a tutor attaches such a shelf to a programme that isn't in some notes' scope, those rows silently won't render — and the tutor probably didn't intend that. Narrowed considerably by the visibility-model refinement (see callout above): tutors who *want* a note visible to multiple programmes now scope it explicitly. Remaining case: tutor genuinely meant a note for one cohort only, forgets when attaching the containing shelf elsewhere. | **Attach-time dialog with active-resolution option.** When attaching a shelf to a unit, scan the shelf's notes. If any are programme-scoped to a set that doesn't include the target programme, show a dialog with three explicit choices: *(a) Attach anyway — students here won't see those rows.* *(b) Add this programme to their visibility, then attach — students here WILL see them.* *(c) Cancel.* If the tutor picks (b), insert the necessary rows into `nclex_tutor_library_note_visibility` in the same transaction as the attach. The dialog lists the affected notes by title so the choice is informed. Three explicit options (not defaulted) so the visibility expansion is always a deliberate act. No permanent badge needed — the moment-of-decision interaction is substantive enough. | 🟢 |
| **4. Concurrent edits (same-user-two-tabs in v1; co-tutors later)** | Cross-tutor sharing isn't a v1 feature, so the "two different people editing" case can't happen yet. The realistic v1 trigger is the same tutor with the same note open in two tabs — autosave in the older tab silently overwrites whatever the newer tab saved. | **Two layers — data-integrity floor + friendly early warning.** *(a) `version_id` guard (server, save-time):* note row carries a `version_id UUID` that the server regenerates on every save. The editor records the version it loaded with and sends it on save. Mismatch → server rejects, editor shows *"This note was saved in another tab. Reload to see the latest version."* No merge UI — last-write-wins with a guard. *(b) Browser-level presence (client, open-time):* uses `BroadcastChannel` / `localStorage` events to detect "is this note already open in another tab of this browser?" If yes, the second tab shows a banner *"You have this note open in another tab — editing here may overwrite the other version."* Zero schema cost. Catches the most common v1 case before the user invests typing time; the `version_id` guard catches everything else at save time. Co-tutor editing (when it lands in v2) reuses the `version_id` mechanism unchanged; server-side presence is a v2 add-on. | 🟢 |
| **5. Collapsible sidebar** | The five-lens sidebar is tall and eats horizontal space on small screens. | **Build it in the first slice.** Sidebar defaults to expanded; a "«" button at the top collapses it to a 48-px icon rail (lens icons only, tooltips on hover). State saved in localStorage. Each lens section also collapses independently via its chevron. Small enough to ship with the library list page. | 🟢 |
| **6. Text + PDF activity overlap with Library Notes** | A Text activity is essentially a paragraph block, and a PDF activity is essentially a PDF block — both shapes a Library Note can also contain. Surface overlap. | **Keep all 8 — overlap is at the content layer, not the intent layer.** The eight types are distinct by *intent* and *lifecycle*, even though some share content shapes: **Text** = ephemeral unit-specific framing copy (no library life). **PDF** = external uploaded reference the tutor didn't author (no pillar, no classification, no draft/published gate). **External Link** = off-platform URL reference. **Library Note** = tutor-authored teaching, library-owned, reusable, classified. **Shelf** = curated pack of Library Notes. **Mock Quiz / Practice Quiz / Tutorial Session** = existing curriculum types. Forcing external PDFs through the Library Note flow would impose authoring bureaucracy (pillar, folder, subtitle, draft/published) on content the tutor didn't write. Document this rationale in `main.md`'s activity-type registry so the distinction is preserved in writing and we don't accidentally try to fold them again later. | 🟢 |
| **7. Student bookmarks** | The student-side Views section promises a "Bookmarked" view, but the schema has nowhere to store bookmarks. | **Originally: separate `nclex_library_note_bookmarks` table. Now collapsed into the merged `nclex_library_note_state` table from #13** — `bookmarked_at` is one of three nullable timestamps on the shared per-(student, note) row. Same semantics as the original proposal: student toggles the bookmark icon in the read view, the "Bookmarked" view filters by `bookmarked_at IS NOT NULL`. RLS: student sees own only. | 🔵 |
| **8. "For this unit" student view** | The student-side Views section promises a "For this unit" view, but a student in two programmes has no single "current unit." Beyond that, the dynamic "current unit" filter is a feature looking for a use case — students mostly enter the library via a unit page (which already gives them the note in unit context) or by topic browsing, not by opening the library and asking "what's scheduled for now?" | **Drop "For this unit" entirely; replace with a structural "By unit" view.** Same slot in the Views section, different shape: a static index that groups notes by the unit they're attached to. Renders as collapsible sections — one per unit the student is in — with the unit's notes listed under each. Works for any number of programmes (each unit is its own group regardless of programme), needs no "current unit" detection, and decouples from #9 (works whether the library is per-programme isolated or merged). Optional tiny polish: a "← you are here" tag on the current unit group header if the progress engine can supply it cheaply. | 🟢 |
| **9. Multi-tutor students** | The original concern was that a student enrolled with two tutors might need a merged view or a programme picker. Walking through the existing architecture: it's a phantom problem. The student lands at `/student/picker` after login (showing all enrolled programmes as cards), picks one, drops into a programme-scoped surface (`/student/programme/[id]/...`), and from there is always in exactly one programme context. There is no UI surface where two tutors' libraries would need to coexist. | **Library is always programme-scoped. No global library page. No merged view. No programme picker for libraries.** The library is a new sidebar entry inside the programme-detail and cohort-detail navs, mirroring the Quizzes pattern. To switch libraries, the student switches programmes via the existing `<ProgrammeSwitcher>`. One-line edit in `lib/nav/student.ts` adds the entry to both `STUDENT_PROGRAMME_DETAIL_NAV` and `STUDENT_COHORT_DETAIL_NAV` (between Curriculum and Quizzes). | 🟢 |
| **10. Tag management** | Tags are free-form text. Tutors will create "cardic", "cardiac", "Cardiac" within a week, and there's no way to rename, delete, or merge them. The mockup also seeds `nclex_*` pillar tags, which duplicates the dedicated pillar field. | **Build a tag-manager panel + drop the `nclex_*` pre-seed.** A kebab → "Manage tags" off the Tags lens section header opens a panel listing every tag in the tutor's library with usage counts, supporting three operations: **Rename** (one-step bulk update across all notes — server action runs `array_replace` then dedupes), **Delete** (`array_remove` from all notes; confirm with affected count), **Merge** (rename A into B with auto-dedupe; multi-source variant for batched cleanup). All scoped by `tutor_id` via RLS. **Drop the `nclex_*` tag seed entirely** — pillars are first-class via the `pillars` array (architectural decision above); the filter bar's pillar slicing operates on that column, not on tags. Tags stay as `TEXT[]` (no separate table); a **GIN index on `tags`** speeds both the manager's distinct-tag query and the filter chips. | 🟢 |
| **11. Search scope** | The toolbar has a search input but doesn't say what it searches. Title-only search is the worst default — a tutor typing `furosemide` would miss a note titled "Loop diuretics" that discusses furosemide throughout the body. | **Search the content of the note: title + subtitle + description + body plain-text.** Tags, pillars, folders, and shelves are NOT searched via the text box — they have dedicated chip filters in the toolbar. Search and chips compose via AND: tutor selects pillar `Pharmacological and Parenteral Therapies` AND types `furosemide` → notes matching both. **Implementation (plumbing only):** Postgres generated `tsvector` column on `nclex_tutor_library_notes` concatenating the four content fields with weights (title A, subtitle B, description C, body D); GIN index for fast lookup; an `IMMUTABLE` SQL function (`nclex_extract_body_text(body JSONB)`) walks the block tree and extracts plain text from paragraph / heading / list / quote / callout / drug_card / lab_values / table blocks (image / PDF / video / embedded_question are skipped). `ts_rank` orders results so title hits outrank body hits. Student-side search runs over the visibility-filtered set. | 🟢 |
| **12. Custom views** | The plan promises tutors can save filter combos (e.g. "Stale but still in use" = edited >60d AND attached somewhere) but doesn't specify storage. Without a place to put the saved filters, the feature can't exist. | **Add `nclex_tutor_library_views`** with `(view_id, tutor_id, name, filters_json, position, created_at, updated_at)`. Tutor sets filter chips (pillars, tags, folder, shelf, status, search), clicks **"Save as view"** in the toolbar, names it. Saved views render in the Views section below the four system views (All notes, Recent, Drafts, Used nowhere). Edit / rename / delete via per-view kebab. Server actions scoped by `tutor_id` via RLS. **Student side stays hard-coded** — system views only (All notes, Recent, By unit per #8, Bookmarked per #7); saved tutor views are authoring tools and don't propagate to students. | 🟢 |
| **13. Reading-progress persistence + completion + bookmarks (merged)** | The read view shows a "% scrolled" bar but doesn't persist position. Long notes are painful to return to. Separately, the original plan had no clean home for "did this student mark this note done" outside of the progress engine's activity-completion table — fine for unit-context reads, but library-context reads have no activity_id. And #7 wanted a separate bookmarks table. All three are per (student, note) state. | **One merged table `nclex_library_note_state`** holding three pieces of per-(student, note) state: `last_heading_id` (resume position; advances as student passes section headings, scroll-spy already computes this for the Contents rail), `marked_done_at` (manual completion timestamp — student clicks "Mark as done"; auto-done-on-scroll deliberately not implemented per existing plan), `bookmarked_at` (collapses #7's separate table). Plus `last_visited_at` updated on any interaction. **The progress bar derives from `last_heading_id`** ("section N of M" — meaningful units, not arbitrary pixel %). **Resume on re-open** scrolls to `last_heading_id`'s heading; falls back to top if deleted ("this note has been updated" hint). **Mark Done writes to this table only**, then **write-through to the progress engine** if the student reached the note via a Library Note activity (so the curriculum tick fires). **Shelf-activity completion derives** from this table — "all member notes minus skipped have `marked_done_at IS NOT NULL` for this student." This retires the `notes_completed JSONB` field on the progress engine's row from the original Option D shelf model. One source of truth for note-level state. PK `(student_id, note_id)`. RLS: student sees own only. | 🟢 |
| **14. Shelf changes after a shelf is attached** | If a tutor adds a new note to a shelf that's already attached to Unit 3, where does the new row appear in Unit 3? | **Always mirror the shelf's current order.** Trivially resolved by #1: since unit-side reordering doesn't exist, attached grouped blocks always render the shelf's live order. Adding, removing, or reordering on the shelf propagates everywhere it's attached. No `position` field needed on the attachment row for shelf-grouped notes. | 🟢 |
| **15. Student URL paths** | Marked "TBD." | Lock the routes — mirroring the Curriculum / Quizzes pattern, programme-rooted throughout per #9: `/student/programme/[programme_id]/library/` (library list, programme scope), `/student/cohort/[cohort_id]/library/` (library list, cohort scope — renders the parent programme's library), and the read view at `/student/programme/[programme_id]/library/note/[note_id]` (or the cohort equivalent). No global library route, no bare `/student/library/...`. Programme/cohort is always in the path so the back pill, sidebar state, and "next in shelf/folder" navigation have unambiguous context. | 🟢 |
| **16. "Programme-scoped" without a programme** | Under the refined visibility model (see callout), `visibility_mode = 'PROGRAMME_SCOPED'` requires at least one row in the `nclex_tutor_library_note_visibility` junction; the contradictory state would be a PROGRAMME_SCOPED note with zero junction rows. The original single-FK-CHECK approach doesn't apply anymore — we need a junction-aware rule. | **Save-time invariant + post-write trigger.** The save action refuses to commit a `PROGRAMME_SCOPED` note with an empty visibility set (UX-friendly error). A `DEFERRABLE INITIALLY DEFERRED` constraint trigger on the junction also runs at transaction commit: if a `PROGRAMME_SCOPED` note ends a transaction with zero junction rows, the trigger raises. Belt-and-braces — TS for nice errors, SQL for the security floor. | 🟢 |
| **17. Cross-tutor visibility leak** | Under the refined model, the risk shifts: nothing stops a tutor from adding a *different* tutor's `programme_id` to their note's visibility set. Same leak, new shape. | **Same-tutor invariant on the junction.** App-layer check in `saveLibraryNote`: every `programme_id` being added to a note's visibility set must belong to the note's `tutor_id`. `BEFORE INSERT/UPDATE` trigger on `nclex_tutor_library_note_visibility` enforces the same rule via a lookup on `nclex_programmes`. Matches CLAUDE.md rule #4 (TS for UX, SQL for security). | 🟢 |
| **18. Asset orphans** | When a tutor deletes an image or PDF block, the underlying Storage file isn't cleaned up. Over time the bucket fills with garbage. | **v1: leave orphans. No automatic deletion, no reference table, no sweep.** Storage is cheap at v1 scale; the engineering cost of automated cleanup isn't worth it. Tutors who delete blocks see the block disappear in the editor; the underlying file just sits in Storage. **Future: a "Tutor Media" management surface** where tutors see every asset they've uploaded with usage status (in-use / orphaned), file size, upload date, and a per-asset permanent-delete action. Puts cleanup authority with the tutor — they decide what's worth keeping. Until that surface lands, orphans accumulate harmlessly. No schema additions in v1. | 🟢 |
| **19. The 20-embed cap** | The doc says "soft cap 20, hard cap 50" but not what each means in practice. | **Soft cap = warn dialog at save** when count crosses 20: *"This note has N embedded questions. Many embeds can be overwhelming for students. Consider splitting into a quiz."* [Cancel] [Save anyway]. **Hard cap = server-side reject** at 51+ with an error toast: *"A note can have at most 50 embedded questions. For longer question sets, build a quiz instead."* Both checked at note-save, not at block insert (so the tutor isn't blocked mid-authoring while shuffling). The 20-50 range gives room for honest outliers (e.g. a comprehensive drug-card note with 30 quick checks); past 50, it's not a note at all and should be a quiz. | 🟢 |
| **20. Required image alt-text — enforced when?** | "Alt text required" is in the spec but doesn't say when it's enforced. Enforcing at block insert would interrupt authoring; enforcing at every autosave would be hostile; never enforcing defeats the rule. | **Enforce at publish, not at block insert or save.** Drafts can have empty alt freely — tutor's working scratch space. The Publish action runs a preflight scan; if any image block has empty `alt`, publishing is blocked with *"3 images are missing alt text — click here to jump to the first one"* + a click-through that scrolls the editor to the first offender and focuses its alt field. After publish, edits to existing images don't re-trigger the check (the gate fired once; the note has met the bar). If a tutor removes alt text from a published image later, that's their call. | 🟢 |
| **21. Three cross-doc updates** | `main.md`, `curriculum-authoring-ux.md`, and `tutor-nav.html` all need updating to reflect the library. Currently marked TODO. The architectural decisions from this gap-review pass also need folding back into `tutor-library.md`. | **Do them as the first step of the library build slice, not later.** (a) `main.md` activity registry → 8 types per #6 (add Library Note + Shelf; document the intent/lifecycle distinction between Text / PDF / External Link / Library Note so the surface overlap isn't mistaken for redundancy). (b) `curriculum-authoring-ux.md` editor table → add Library Note + Shelf editor rows + document the Option D shelf attachment model (atomic activity, completion derives from `nclex_library_note_state.marked_done_at`, `skipped_note_ids JSONB` per-unit hide) and the visibility-mismatch attach-time dialog from #3. (c) `tutor-nav.html` → programme sidebar gains a "Library" entry; student programme sidebar gains a "Library" section per #9. (d) **`tutor-library.md` itself needs updating** — fold in all architectural decisions from this gap-review pass: multi-programme visibility model, shelf attachment Option D, multi-pillar full-name storage, embedded-questions multi-question block, merged `nclex_library_note_state` table, all per-row resolutions. Significant rewrite — easier to do once at the end than piecemeal. | 🟡 |

---

## Net deltas this report introduces

*New schema objects*
- `nclex_tutor_library_note_visibility` — junction `(note_id, programme_id)` for the multi-programme visibility model (architectural decision above)
- `nclex_library_note_state` — merged per-(student, note) state table covering bookmarks (point 7), reading position (point 13), and completion (point 13). Replaces the originally separate `nclex_library_note_bookmarks` and `nclex_library_note_progress` tables.
- `nclex_tutor_library_views` (point 12)
- *(point 18 originally added `nclex_library_note_assets`; dropped — v1 leaves orphans; future Tutor Media surface handles cleanup tutor-side.)*

*Removed from the original schema*
- `scoped_programme_id` column on `nclex_tutor_library_notes` — superseded by the junction table above

*Schema change to `nclex_tutor_library_note_attachments` — Option D model*
- **Row shape diverges by kind:**
  - *Loose Library Note attachment*: `{attachment_id, note_id, programme_id, unit_id, block_id, position, caption, ...}` — `shelf_id` null. Unchanged from original plan.
  - *Shelf attachment*: `{attachment_id, shelf_id, programme_id, unit_id, block_id, position, caption, skipped_note_ids JSONB, ...}` — `note_id` null. **One row per shelf-attach (not per note).**
- Implies a CHECK: exactly one of `note_id` / `shelf_id` is set.
- `skipped_note_ids JSONB` — array of note_ids the tutor has hidden in this unit (point 2).
- *(point 1 originally added `is_position_overridden`; dropped — see architectural decision above.)*

*Progress engine — no new column*
- Earlier draft added `notes_completed JSONB` on the progress engine's completion row for shelf rollup. **Retired** — shelf completion now derives at query time from `nclex_library_note_state.marked_done_at`. Cleaner: one source of truth for note-level completion, no JSONB to keep in sync.

*New columns on `nclex_tutor_library_notes`*
- `version_id UUID` (point 4)
- `pillars nclex_pillar[]` — replaces the single `pillar TEXT` column from the original plan (multi-pillar architectural decision above)

*New types*
- `nclex_pillar` domain type — CHECK constraint against the 8 full NCLEX-RN Client Needs sub-category names (no abbreviation codes); used by the `pillars` column above and ideally by the bank's question classification too

*New constraints / indexes*
- Deferred constraint trigger: `PROGRAMME_SCOPED` notes must end every transaction with ≥1 junction row (point 16)
- Trigger on `nclex_tutor_library_note_visibility`: every `programme_id` must belong to the note's tutor (point 17)
- Generated `tsvector` column + GIN index (point 11)
- GIN index on `nclex_tutor_library_notes.tags` (point 10 — speeds both tag-manager queries and filter chips)

*Activity-type registry stays at 8 types* (point 6 — Text, PDF, External Link, Library Note, Shelf, Mock Quiz, Practice Quiz, Tutorial Session — distinct by intent/lifecycle, not by content shape)

*Student route map locked* (point 15) — programme/cohort-rooted; no global library route

*Student nav additions* (point 9) — one entry added to both `STUDENT_PROGRAMME_DETAIL_NAV` and `STUDENT_COHORT_DETAIL_NAV` in `lib/nav/student.ts`, between Curriculum and Quizzes

*Mockup edits needed*
- Drop `nclex_*` tag pre-seed (point 10)
- Add collapse-rail button (point 5)
- Add mixed-visibility shelf badge (point 3)
- Add "Hidden in this unit" row indicator on shelf-grouped blocks (point 2)
- Add "your tutor updated this shelf" hint when membership change re-opens completion (Option D)

---

## Likely contention

Both originally-flagged contentious rows resolved without dispute, in ways simpler than the original proposals:
- **#6** — kept all 8 activity types (distinct by intent/lifecycle, not by content shape) after Sam pushed back on the "drop PDF" proposal.
- **#9** — the "multi-tutor problem" turned out to be a phantom; the existing `/student/picker` → programme-scoped surface architecture already prevents the situation. Library lives as a programme-detail sidebar entry, no global page needed.

The rest are smaller, more mechanical decisions.
