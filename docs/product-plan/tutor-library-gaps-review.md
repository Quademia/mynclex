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

## The 21 gaps

| # · Point | Issue (in plain terms) | Proposal | Status |
|---|---|---|---|
| **1. Reorder inside a shelf-attached block** | A shelf can be dropped into a unit as a grouped block. If the tutor drags one of those notes up *inside the unit*, should the shelf itself reorder, or is it a unit-local move? Without a rule, you get silent drift — the shelf says one order, the unit shows another, and nobody knows which is "right." | **No reordering inside a shelf-as-activity.** The grouped block in a unit always renders the master shelf's current order, read-only. To change order, the tutor goes to the shelf in the library and reorders it there — that change then propagates to every unit using the shelf (they're all pointers to the same master). One rule, one place. No `is_position_overridden` flag, no "moved" indicator, no "reset to shelf order" action. Also makes #14 trivial — new notes added to a shelf always slot in at their shelf position in every attached unit. | 🟢 |
| **2. Skip one note from a shelf attachment** | Right now the only way to remove a single note from a shelf inside a unit is to "detach" it, which severs the shelf link and turns it into a loose Library Note. That's overkill if the tutor just wants to hide that note in that unit but keep the shelf connection. | **Add a skip toggle.** New `is_skipped BOOLEAN` flag on the attachment row. Skipped rows: hidden from students, dimmed in the tutor unit view with a "Hidden in this unit" pill and an "Unhide" action. The existing "detach to loose" stays — it's a different intent ("I want to keep this note here independently of the shelf"). Two distinct actions, two distinct meanings. | 🟡 |
| **3. Mixed-visibility shelves** | A shelf can hold a mix of Tutor-wide notes and Programme-scoped notes. If a tutor attaches such a shelf to a programme it isn't scoped to, some rows silently won't render for those students — and the tutor probably didn't intend that. | **Attach-time check + permanent badge.** When attaching a shelf to a unit, run a visibility-intersection check. If any note on the shelf is scoped to a *different* programme, show a confirm dialog: "2 notes on this shelf are scoped to Cohort 5 — students in Cohort 6 won't see them. Continue?" After attach, the grouped block carries a small "⚠ 2 hidden for this cohort" pill that opens a list. | 🟡 |
| **4. Co-tutor concurrent edits** | Two people editing the same note at the same time could overwrite each other. The doc calls this low-priority, but it can also happen with one tutor in two browser tabs. | **Last-write-wins with a soft guard.** Each note row carries a `version_id` that the server regenerates on every save. The editor sends the version it loaded with; if it doesn't match on save, the editor shows "This note was saved in another tab. Reload to continue." No merge UI. Cheap, covers the only realistic case in v1 (no cross-tutor sharing yet). | 🟡 |
| **5. Collapsible sidebar** | The five-lens sidebar is tall and eats horizontal space on small screens. | **Build it in the first slice.** Sidebar defaults to expanded; a "«" button at the top collapses it to a 48-px icon rail (lens icons only, tooltips on hover). State saved in localStorage. Each lens section also collapses independently via its chevron. Small enough to ship with the library list page. | 🟡 |
| **6. Text + PDF activity overlap with Library Notes** | A Text activity is essentially a paragraph block, and a PDF activity is essentially a PDF block. Keeping both alongside Library Notes creates two ways to do the same thing — tutors will be confused. But a Text activity is also legitimately useful for one-liner unit instructions ("Read before Wednesday's session"), where filing a Library Note is overkill. | **Drop standalone PDF, keep Text.** Remove "PDF" as a standalone activity type — any PDF worth attaching is worth filing, so it goes via a Library Note (with a single PDF block). Keep "Text" as the lightweight one-liner. Activity-picker becomes **7 types**: Text, Library Note, Shelf, Mock Quiz, Practice Quiz, Tutorial Session, External Link. Updates `main.md` and `curriculum-authoring-ux.md` (see #21). | 🟡 |
| **7. Student bookmarks** | The student-side Views section promises a "Bookmarked" view, but the schema has nowhere to store bookmarks. | **Add `nclex_library_note_bookmarks`** with `(student_id, note_id, bookmarked_at)`, PK on `(student_id, note_id)`. Inserted/deleted by the student via the bookmark toggle in the read view. RLS: student sees own only. Drives the "Bookmarked" view and the bookmark-icon state on every per-note row. | 🟡 |
| **8. "For this unit" student view** | The student-side Views section promises a "For this unit" view, but a student in two programmes has no single "current unit." | **Make it programme-scoped, not global.** "For this unit" only appears on `/student/programme/[id]/library/` (where the programme is unambiguous). On the global student library landing it doesn't appear. "This unit" = the student's "Up next" unit in that programme, per the progress engine. Pairs with #9. | 🟡 |
| **9. Multi-tutor students** | A student enrolled with two tutors at once — does the library show one merged feed of both tutors' content, or one per tutor? Folder and tag vocabularies are each tutor's own; merging them produces incoherent lists (two "Cardiac" folders, conflicting tag conventions). | **Per-programme isolation, with a global picker.** Each enrolled programme has its own library surface at `/student/programme/[id]/library/` — sidebar reflects that tutor's lenses only. The global `/student/library/` is a landing page with a card per enrolled programme ("Tutor A's library — 47 notes"). No merged view. Each tutor's vocabulary stays intact. | 🟡 |
| **10. Tag management** | Tags are free-form text. Tutors will create "cardic", "cardiac", "Cardiac" within a week, and there's no way to rename, delete, or merge them. The mockup also seeds `nclex_*` pillar tags, which duplicates the dedicated pillar field. | **Build a tag-manager panel + drop the `nclex_*` pre-seed.** A kebab → "Manage tags" off the Tags lens section header lists every tag in the tutor's library with counts and supports Rename, Delete, Merge (server actions scoped by `tutor_id`). Drop the `nclex_*` tag seed entirely — pillars are first-class via the `pillar` column; the filter bar's pillar filter operates on that column, not on tags. Tags stay as `TEXT[]` (no separate table). | 🟡 |
| **11. Search scope** | The toolbar has a search input but doesn't say what it searches. | **Search title + subtitle + description + body plain-text.** Postgres `tsvector` index on a generated column that concatenates these four. Filter chips (pillar, tags, folder, shelf, status) compose with the query via AND. Tag and pillar searching is done through chips, not the text box. | 🟡 |
| **12. Custom views** | The doc promises saved filter combos but doesn't specify storage. | **Add `nclex_tutor_library_views`** with `(view_id, tutor_id, name, filters_json, position, created_at, updated_at)`. Tutor sets filter chips, clicks "Save as view," names it. Custom views render under the four system views in the Views section. Edit/rename/delete via kebab. Student-side views stay hard-coded (system views only) — saved tutor views are authoring tools and don't propagate. | 🟡 |
| **13. Reading-progress persistence** | The read view shows a "% scrolled" bar but doesn't persist it. Students who close a long note halfway through have to re-find their place on return. | **Persist one resume position per (student, note).** New `nclex_library_note_progress` table: `(student_id, note_id, scroll_position, last_visited_at)`, PK on `(student_id, note_id)`. Debounced write ~3s after scroll stops. On re-open, scroll to that position with a small "Resume reading · Back to top" toast. Reset on mark-done. Also drives the student-side "Recent" view ordering. | 🟡 |
| **14. Shelf changes after a shelf is attached** | If a tutor adds a new note to a shelf that's already attached to Unit 3, where does the new row appear in Unit 3? | **Always mirror the shelf's current order.** Trivially resolved by #1: since unit-side reordering doesn't exist, attached grouped blocks always render the shelf's live order. Adding, removing, or reordering on the shelf propagates everywhere it's attached. No `position` field needed on the attachment row for shelf-grouped notes. | 🟢 |
| **15. Student URL paths** | Marked "TBD." | Lock the routes: `/student/library/` (global landing with programme picker), `/student/programme/[id]/library/` (per-programme library surface), `/student/library/note/[id]` (read view — already specified). Read-view URL accepts `?from=programme:[id]` for the back-pill context. Coherent with #8 and #9. | 🟡 |
| **16. "Programme-scoped" without a programme** | The schema lets `visibility_mode = 'PROGRAMME_SCOPED'` coexist with a null `scoped_programme_id`, which is a contradictory state. | **Add a DB CHECK constraint:** `CHECK ((visibility_mode = 'TUTOR_WIDE' AND scoped_programme_id IS NULL) OR (visibility_mode = 'PROGRAMME_SCOPED' AND scoped_programme_id IS NOT NULL))`. Save action also validates upfront for friendlier errors. | 🟡 |
| **17. Cross-tutor visibility leak** | Nothing stops a tutor from scoping their note to a *different* tutor's programme (which would let that tutor's students see it). | **Defence in depth.** App-layer check in `saveLibraryNote`: refuse if `scoped_programme_id`'s `tutor_id` ≠ the note's `tutor_id`. SQL trigger on insert/update enforces the same rule — Postgres `CHECK` can't reference other tables, so a `BEFORE INSERT/UPDATE` trigger function does the lookup. Matches CLAUDE.md rule #4 (TS for UX, SQL for security). | 🟡 |
| **18. Asset orphans** | When a tutor deletes an image or PDF block, the underlying Storage file isn't cleaned up. Over time the bucket fills with garbage. | **Reference-counting table + delayed sweep.** Add `nclex_library_note_assets (note_id, asset_id, asset_type)`. On every note save, the server diffs body asset references against this table and updates rows. A daily Worker job deletes Storage objects whose row is gone AND whose `removed_at` is > 7 days old (grace window for accidental deletes). If an asset is still referenced by another row anywhere, it stays. | 🟡 |
| **19. The 20-embed cap** | The doc says "soft cap 20, hard cap 50" but not what each means in practice. | **Soft cap = warn dialog at save** when count crosses 20: "This note has N embedded questions. Many embeds can be overwhelming for students. Continue saving?" **Hard cap = server-side reject** at 50 with an error toast. Both checked on note-save, not on block insert (so a tutor mid-authoring isn't blocked while shuffling). | 🟡 |
| **20. Required image alt-text — enforced when?** | "Alt text required" is in the spec but doesn't say when it's enforced. Enforcing at block insert would interrupt authoring; never enforcing defeats the rule. | **Enforce at publish, not at block insert.** Drafts can have empty alt. The Publish action runs a preflight scan; if any image block has empty `alt`, publishing is blocked with "3 images are missing alt text" + a click-through that scrolls the editor to the first offender. Edits to a published note's images don't re-trigger (the original publish established the bar). | 🟡 |
| **21. Three cross-doc updates** | `main.md`, `curriculum-authoring-ux.md`, and `tutor-nav.html` all need updating to reflect the library. Currently marked TODO. | **Do them as the first step of the library build slice, not later.** (a) `main.md` activity registry → 7 types per #6 (drop standalone PDF, add Library Note + Shelf). (b) `curriculum-authoring-ux.md` editor table → add Library Note + Shelf editor rows + document shelf-attach fan-out, grouped-block UI, override flag from #1, skip flag from #2. (c) `tutor-nav.html` → programme sidebar gains a "Library" entry; student programme sidebar gains a "Library" section per #9. | 🟡 |

---

## Net deltas this report introduces

*New schema objects*
- `nclex_library_note_bookmarks` (point 7)
- `nclex_library_note_progress` (point 13)
- `nclex_tutor_library_views` (point 12)
- `nclex_library_note_assets` (point 18)

*New columns on `nclex_tutor_library_note_attachments`*
- `is_skipped BOOLEAN` (point 2)
- *(point 1 originally added `is_position_overridden`; dropped after #1 resolved as "no unit-level reordering")*

*New columns on `nclex_tutor_library_notes`*
- `version_id UUID` (point 4)

*New constraints*
- CHECK on visibility / scoped_programme pair (point 16)
- Trigger enforcing same-tutor scope (point 17)
- Generated `tsvector` column + GIN index (point 11)

*Activity-type registry shrinks from 8 to 7* (point 6 — drop standalone PDF)

*Student route map locked* (point 15)

*Mockup edits needed*
- Drop `nclex_*` tag pre-seed (point 10)
- Add collapse-rail button (point 5)
- Add mixed-visibility shelf badge (point 3)
- Add skipped row indicator (point 2)
- Add programme-picker landing page (point 9)

---

## Likely contention

Expecting pushback on:
- **#6** (folding PDF activity into Library Notes — structural call)
- **#9** (no merged multi-tutor view — biggest student-side simplification)

The rest are smaller, more mechanical decisions.
