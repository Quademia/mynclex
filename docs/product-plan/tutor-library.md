# MyNclex — Tutor Library

*Living document. Part of the `mynclex/docs/product-plan/` set —
see [main.md](main.md) for the overall product plan.*
Last updated: 2026-05-24 (gap-review fold-back — 4 architectural
decisions and 20 confirmed gap resolutions folded in from the
separate working doc, now retired:
- **Multi-pillar from day 1** (full NCSBN names, `nclex_pillar`
  domain type, no abbreviation codes).
- **Visibility junction table** (`PROGRAMME_SCOPED` can scope to
  one or more programmes; same-tutor invariant + deferred
  constraint + RLS helper).
- **Shelf attachment as one atomic activity** (Option D —
  `note_id` XOR `shelf_id`, `skipped_note_ids JSONB` for per-unit
  hides, no per-unit reorder, completion derives from
  `nclex_library_note_state`).
- **Multi-question embedded blocks** (`embedded_questions` with
  `item_ids[]`; per-block 5/10 + per-note 20/50 caps; inline
  player walks the set).
- Plus mechanical resolutions: tag manager + drop `nclex_*`
  pre-seed; collapsible 5-lens sidebar; alt-text enforced at
  publish; same-user-two-tabs guard via `version_id`; custom
  views promoted to v1; student-side "By unit" view replaces
  "For this unit"; locked student URL paths; bookmarks +
  reading position + per-note completion collapsed into a
  single `nclex_library_note_state` table; full-text search
  via generated `body_tsv`; v1 leaves asset orphans (a future
  Tutor Media surface handles cleanup).

Earlier syncs:
- 2026-05-16 — architectural pivot + editor-side sync (visibility
  on the note; shelves added as a curated-pack lens; 12 block
  types in 4 groups; Tiptap chosen; embedded-question table
  separated from `nclex_attempts`).
- 2026-05-11 — attaches to **units** not weeks; rendered label
  per programme's `unit_label`.)

---

> **Terminology note — two senses of "block" in this doc.**
> "Block" is overloaded between this doc and the curriculum architecture:
> - **Editor block** *(the meaning used throughout this doc)* — a
>   typed unit inside a note's rich-text body (`paragraph`,
>   `heading`, `image`, `pdf`, `video`, `embedded_questions`,
>   etc.). Notion / Editor.js sense. Authoring-time, scoped to a
>   single note.
> - **Curriculum block** *(defined in [main.md](main.md) → Programme
>   Structure)* — a workflow grouping of related activities under a
>   curriculum unit (e.g. PDF + quiz + tutorial wrapped as one
>   "Cardiac Pharmacology Block"). Curriculum-time, scoped to a
>   programme.
>
> Where this doc says "block" without qualification it always means
> the editor sense. Architectural blocks are written as "**curriculum
> block**" when they appear (e.g. when a Library Note attaches under
> a curriculum block as one of its activities).

---

## What this covers

A **per-tutor study-notes library** — reusable teaching content
authored by tutors, organised across **five lenses** (folders,
shelves, pillars, tags, views), optionally attached to programme
units (rendered as Unit N or Module N per the programme's
`unit_label`) either as single notes or as whole curated shelves.
Think "the tutor's lecture notes for the platform": acid-base
balance, endocrine system, how to attack SATA questions, etc.

Sibling concept to the question bank: where the bank holds
*practice*, the library holds *teaching*. The two compose — a
library note can embed bank questions inline, turning a reading into
a guided practice. Both classify under the same NCLEX Client Needs
pillars, so a tutor can see at a glance whether their library
coverage matches their bank coverage by pillar.

---

## Settled / open status

**Architectural shape settled 2026-05-08, refined 2026-05-16.** Schema
sketched, visibility model locked **at the note level** (see below),
five organising lenses defined, integration with programmes specified.
Mockup at `docs/product-plan/mockups/tutor-library-mockup.html` reflects
the current architecture and is the source of truth for the UI.

**Visibility lives on the note.** Two modes: `TUTOR_WIDE` (every
student of this tutor sees it) and `PROGRAMME_SCOPED` (only students
in the programme(s) the tutor explicitly picked see it — one or more,
stored as rows in `nclex_tutor_library_note_visibility`). **Folders,
views, shelves, pillars and tags do not gate visibility** — they are
pure organisational tools. Students see the same organising structure
as the tutor, just visibility-filtered.

**Five organising lenses** (see [Organising lenses](#organising-lenses)
below):

- **Folders** — tutor's primary filing bin (1 per note)
- **Shelves** — curated cross-cutting packs (many per note)
- **Pillars** — NCLEX Client Needs classification (many per note,
  8 sub-categories)
- **Tags** — free-form attributes (many per note)
- **Views** — derived/saved queries

**Not queued for build.** Substantial feature (~6–8 weeks of focused
work — block-based editor is still the heavy lift) with no users
blocking on it today. Parked until programmes, payments, and runner
finish ship. Revisit when one of: (a) a tutor pilot asks for it, or
(b) consumption work is complete and tutor-side differentiation is
the next priority.

**No QAcademy-side library in v1.** The decision to leave self-study
students with rationales-as-teaching is deliberate; the library is a
tutor differentiator. The schema parallels the bank's parallel-
ownership pattern, so a `nclex_library_*` (admin) twin can land later
without redesign if rationale quality proves insufficient.

---

## Why this exists

Self-study bank students currently get questions, rationales, per-
option feedback, history, and analytics. They get no first-class
teaching content beyond rationales. Tutored students get the same plus
their tutor's curriculum (Text / PDF / Link activities inside units).

The gap: tutors have **no reusable teaching surface**. A great article
on acid-base balance has to live as a Text activity inside a single
unit of a single programme. Run the same programme next term, the
tutor copy-pastes. Run a different programme, copy-paste again. No
catalogue, no reuse, no library.

The library closes this gap. A tutor authors content once; it lives
in their personal library; they reuse it across cohorts and
programmes, and students browse it as a structured study resource.

---

## Mental model

A tutor's library is **their lecture notes for the platform** — a
catalogue of reusable teaching content they build up over time and
draw on across all their cohorts.

Three orthogonal concepts the design separates cleanly:

- **Visibility** — *who can read this note*. A property of the **note
  itself**: `is_published` flag + visibility mode (`TUTOR_WIDE`, or
  `PROGRAMME_SCOPED` with a one-or-more-programme set stored in the
  `nclex_tutor_library_note_visibility` junction). Not derived from
  folders, shelves, or any organisational container.
- **Organisation** — *how the tutor finds and groups their content*.
  Five lenses (folders, shelves, pillars, tags, views), each playing
  a distinct role. None of these affect who can read a note.
- **Scheduling** — *which programme treats this note as a tracked
  activity inside one of its units*. Governed by attaching the note
  (or a shelf, see [Scheduling](#scheduling--library-note-and-shelf-as-the-7th--8th-activity-types))
  to a specific programme/unit.

These are independent axes. A note can be visible without being
scheduled (browseable in library, no unit assignment). A note can be
visible AND scheduled (browseable in library AND appears as a tracked
task in a specific unit). A note cannot be scheduled without being
visible — publishing is a precondition of attachment.

**What students see.** Students see the same organisational structure
as the tutor — same folders, same shelves, same pillar list, same tag
cloud — but the *contents* of each container are filtered to notes the
student has access to. A folder of 7 for the tutor might show 3 to a
student in Cohort 5 (the other 4 are scoped to other cohorts). Empty
containers are hidden from the student's sidebar entirely. Sidebar
counts are viewer-relative.

---

## Authoring (tutor side)

### Library home

Route: `/tutor/library/`. Sits alongside `/tutor/bank/` in the global
tutor sidebar.

**Chrome — five-lens sidebar.** The library home has a secondary left
rail (inside the page, not a new global nav entry) carrying all five
organising lenses, top to bottom: **Views**, **Folders**, **Shelves**,
**Pillars**, **Tags**. Each section is collapsible via its chevron;
counts are shown per entry. A top-bar dropdown chrome was evaluated as
a v2 alternative — see the [mockup](mockups/tutor-library-mockup.html)
screen 3 "Library home — folder scope (top-bar variant)". Decision:
**sidebar default**.

**Sidebar collapse-to-rail (v1).** A `«` button at the top of the rail
collapses the whole sidebar to a 48-px icon strip — lens icons only,
tooltips on hover. Click `»` (or any icon) to expand. State saved in
localStorage per-tutor so the choice survives reloads. Ships in the
first library slice; matters because the rail eats horizontal space on
small / dense screens.

**Folders + Shelves sections each carry an "All folders" / "All
shelves" top entry** that opens a zoomed-out view of the lens (folder
cards grid for All folders; Spotify-style horizontal carousels per
shelf for All shelves). These are navigation aids — they're the
landing surface when the tutor wants to browse the lens rather than
drill into a specific container.

**Main pane structure** (folder or shelf scope):
- Crumb (`Folder / Cardiac` or `Shelf / Foundational SATA pack`)
- Title row + lens badge (`Folder` or `Shelf · curated`)
- Sub-line (count + clarifying copy)
- Filter bar (tag chips + pillar chips)
- Notes list with the **per-note lens row** — each note's title,
  subtitle (when set), `description` (or an auto-excerpt of `body`
  when description is null), and a single line below carrying all
  memberships inline: 📁 folder · 📚 shelf pip(s) · pillar chip ·
  \# tags. Right column carries status (`Pub` / `Draft`), `↳ used in
  N` pill, last-edited timestamp.

The per-note lens row is the single most important UI element on the
library home — it makes the m:n classification model legible at a
glance.

**Toolbar:** search input + `+ New folder` + `+ New note`. Primary
actions live at the top, above the lens bar / sidebar split.

**Search scope (locked).** The toolbar search input searches the
**content of the note**: title + subtitle + description + body
plain-text. Tags, pillars, folders, and shelves are NOT searched
through the text box — they have dedicated chip filters in the
toolbar. Search and chips compose via AND: tutor selects pillar
*Pharmacological and Parenteral Therapies* + types `furosemide` →
notes matching both. Backed by a Postgres generated `tsvector`
column on `nclex_tutor_library_notes` (title=A weight, subtitle=B,
description=C, body=D); GIN index for fast lookup; `ts_rank` so
title hits outrank body hits. The body walk uses an IMMUTABLE
helper that extracts text from paragraph / heading / list / quote
/ callout / drug_card / lab_values / table blocks (image / pdf /
video / embedded_questions are skipped).

### Folders

- **Tutor's primary organising bin.** Exactly one folder per note.
  Folders are a navigation tool; they do not gate visibility.
- **Flat, two-level structure** in v1: Folder → Note. No nesting.
  Two-level is enough for ~30 notes per tutor; nesting multiplies UI
  surface (move, breadcrumb, expand/collapse) for marginal benefit.
  Promote to nested in v2 if real tutors hit the limit.
- **Tutor-scoped namespace.** Two tutors can both have a folder
  called "Cardiac"; they don't see each other's. Enforced by
  `tutor_id` FK on the folder row.
- **Manual ordering** within the folder list via up/down arrows.
- A note can sit at the root (no folder) — `folder_id` is nullable.
- **Students see the tutor's folders** with their own visibility
  slice. A folder of 7 notes for the tutor may show 3 to a Cohort 5
  student; empty folders are hidden from the student's sidebar.

### Shelves

Curated cross-cutting packs. A note can sit on many shelves; a shelf
can hold many notes. Shelves do not gate visibility — see
[Visibility](#visibility-who-sees-what).

- **Why they earn their keep.** Folders are 1:N — a note has exactly
  one folder. That's not enough granularity for the "I want to group
  notes across folders into a curated pack" workflow. Examples:
  *"Foundational SATA pack"* spans Test strategies + Cardiac folders;
  *"Drug deep dives"* spans Pharm + Cardiac + Endocrine.
- **Each shelf has a colour.** Used as the rail-side dot in the
  sidebar, the pip in the per-note lens row, the outer border when
  the shelf is attached to a unit (see
  [Scheduling](#scheduling--library-note-and-shelf-as-the-7th--8th-activity-types)),
  and the dot on the All-shelves carousel section header. Identity
  travels with the shelf wherever it appears.
- **No visibility on the shelf itself.** A shelf is a pure
  organisational container. Its visibility (to whom) is computed at
  read time from the membership: a shelf is visible to a student if
  any of its notes are visible to that student.
- **All shelves view** (`/tutor/library/?lens=shelves`) lays out
  shelves as Spotify-style horizontal carousels — one section per
  shelf with colour dot + title + count + tagline at the top, then a
  row of note cards (title + subtitle when set + `description` or
  body-excerpt fallback + pillar chip + tags), ending in a dashed
  `+ Add to shelf` slot.

### NCLEX Pillars

The canonical NCLEX-RN Client Needs classification — every bank
question is classified by it, and the test plan distributes exam
items by it. Notes carry the same classification, so the library
becomes pillar-balanced study material.

- **8 sub-categories** (the Client Needs sub-level — the grain at
  which bank items are classified). The library stores the full
  NCSBN names verbatim — no abbreviation codes ever shown to users:
  - Management of Care
  - Safety and Infection Control
  - Health Promotion and Maintenance
  - Psychosocial Integrity
  - Basic Care and Comfort
  - Pharmacological and Parenteral Therapies
  - Reduction of Risk Potential
  - Physiological Adaptation
- **Multi-pillar from day 1.** Notes carry `pillars nclex_pillar[]
  NOT NULL` (CHECK length ≥ 1). Real NCLEX content routinely spans
  pillars: Furosemide is *Pharmacological and Parenteral Therapies*
  + *Reduction of Risk Potential*; wound-infection prevention is
  *Safety and Infection Control* + *Reduction of Risk Potential* +
  *Physiological Adaptation*. Forcing a single "primary" pillar
  would mean artificial judgment calls at save time and
  undercounted coverage analytics. No "primary" concept in v1 —
  every pillar in the array is equal weight. If primary-ish
  behaviour ever needs to exist later (chip render priority,
  weighted analytics), a separate column lands later without
  touching the array.
- **DB validation via domain type.** New `nclex_pillar` domain type
  with a CHECK constraint against the 8 full names. The notes
  table's `pillars` column uses that domain. Optional future
  follow-on, independent of library work: the bank's
  `client_needs_subcategory TEXT` column could adopt the same
  domain for free DB-level validation.
- **Editor UI.** Multi-select chip input constrained to the 8
  names.
- **Per-note lens row.** All pillar chips render inline (1–3
  typical), each colour-coded. Where the row gets crowded, names
  truncate with a tooltip — no abbreviation codes ever shown to
  users.
- **Pillar lens (sidebar).** Each of the 8 entries shows count of
  notes where that pillar appears in the array. Multi-pillar notes
  count in each of their pillars — correct, not misleading
  double-counting; the note genuinely IS relevant to each.
- **Filter chips.** Default OR semantics — selecting two pillars
  shows notes covering either. AND semantics could be a later
  power-user toggle.
- **URLs.** Filter parameters use slugified pillar names (e.g.
  `?pillar=pharmacological-and-parenteral-therapies`). A small
  client/server map handles slug↔name; cheap.
- **Top-level pillars (4) are derived**, not stored — the 8
  sub-categories roll up into Safe and Effective Care Environment,
  Health Promotion and Maintenance, Psychosocial Integrity, and
  Physiological Integrity. No expand/collapse in the sidebar; the
  flat 8-entry list is short enough to scan directly. The library
  uses sub-categories only as the storage grain — the array is the
  single source of truth.
- **Bank consistency — already aligned.** `lib/bank/classifications.ts`
  (sourced from the NCSBN 2023 NCLEX-RN Test Plan) already uses
  these exact 8 full names; the bank's `client_needs_subcategory
  TEXT` column stores them as-is. No parallel migration on the
  bank side — the library is adopting the bank's existing
  vocabulary.

### Tags

Free-form attributes — the catch-all lens for anything that
isn't a folder, shelf, or pillar (e.g. `bootcamp-cohort-5`,
`week-3`, `high-yield`, `revision`). Stored as `tags TEXT[]` on
the note. No separate table — TEXT[] keeps writes cheap and
read-grouping fast over a GIN index. Many tags per note; tags are
tutor-scoped (each tutor has their own tag vocabulary).

**No `nclex_*` pre-seed.** Earlier drafts proposed pre-seeding
`nclex_management-of-care`, `nclex_safety-and-infection-control`,
etc. as tags — that duplicated the dedicated `pillars` field and
muddied the lens model. Pillars are first-class via the `pillars`
array; the filter bar's pillar chips slice on that column, not on
tags. Drop the seed.

#### Tag manager

A kebab on the **Tags** lens section header opens *Manage tags* —
a panel listing every tag in the tutor's library with usage
counts. Three operations:

- **Rename** — one-step bulk update across all notes. Server
  action runs `array_replace(tags, 'old', 'new')` then dedupes
  the array. Resolves the inevitable *cardic / cardiac / Cardiac*
  drift.
- **Delete** — `array_remove(tags, 'tag')` from every note;
  confirms with the count of affected notes.
- **Merge** — rename A into B with auto-dedupe. Multi-source
  variant supports batched cleanup ("merge `cardic`, `Cardiac`
  into `cardiac`").

All scoped by `tutor_id` via RLS. Powered by the GIN index on
`tags` so the distinct-tag query stays fast.

### Views

Derived/saved queries on the tutor's library.

- **System views (tutor, v1):** *All notes*, *Recent*, *Drafts*,
  *Used nowhere* (orphans — notes with no programme attachment).
- **Custom views (tutor, v1).** Tutor sets the filter chips
  (pillars, tags, folder, shelf, status, search), clicks **Save
  as view** in the toolbar, names it. Examples: *"Stale but still
  in use"* (`edited > 60d AND attached somewhere`), *"Cohort 5"*
  (notes tagged `cohort-5`). Saved views render in the Views
  section beneath the four system views; edit / rename / delete
  via per-view kebab. Backed by `nclex_tutor_library_views`
  (`view_id, tutor_id, name, filters_json, position, …`) — no
  query language to invent; the filter chips are the building
  blocks.
- **Student-side views differ.** Students don't get *Drafts* or
  *Used nowhere* (authoring-only) or custom views (authoring
  tool). They get a hard-coded set:
  - *All notes* — the full visibility-filtered library.
  - *Recent* — most recently visited notes (uses
    `nclex_library_note_state.last_visited_at`).
  - *By unit* — a static index that groups notes by the unit
    they're attached to. Collapsible sections, one per unit the
    student is in. Works for students enrolled in multiple
    programmes (each unit is its own group). Replaces the
    earlier "For this unit" idea, which depended on a "current
    unit" detection that nothing else needed.
  - *Bookmarked* — notes the student has bookmarked (filters by
    `nclex_library_note_state.bookmarked_at IS NOT NULL`).

### Note editor

Block-based rich-text editor at `/tutor/library/notes/[note_id]`,
built on **[Tiptap](https://tiptap.dev)** (ProseMirror under the hood,
MIT-licensed, React-first). Tiptap's extension model + JSON output
match our typed-block + JSONB storage needs cleanly. Custom NCLEX-
domain blocks (Callout, Drug card, Lab values, Embedded question) are
React node components registered as ProseMirror nodes. Markdown
fallback is the build-time escape hatch if the editor work runs over.

Each note carries:

| Field | Notes |
|---|---|
| **Title** (text) | Required. Auto-saved. |
| **Folder** (FK) | The tutor's primary bin. Nullable (root-level note). |
| **Tags** (text array) | Free-form, comma-input. Tutor-scoped vocabulary. No pre-seed. |
| **Pillars** (`nclex_pillar[]`) | Multi-select. One or more of the 8 NCLEX Client Needs sub-categories (full NCSBN names). Required at save (≥ 1). |
| **Body** (JSONB block document) | Sequence of typed blocks — see Block types below. |
| **Status** | Draft / Published. |
| **Visibility mode** | Tutor-wide / Programme-scoped — set at publish time, editable thereafter. |
| **Visibility set** (junction) | For Programme-scoped notes: ≥ 1 row in `nclex_tutor_library_note_visibility`. Multi-select in the publish dialog. Empty for Tutor-wide notes. |
| **Version id** (UUID) | Regenerated on every save; rejected at save time if it doesn't match what the editor loaded with. Guards same-user-two-tabs overwrites. |

#### Editor UX

**Block insertion — three entry points**:
- **Slash command** (`/`) anywhere in the document opens a filtered block menu. Type to narrow (`/dr` → Drug card).
- **`+` button** between blocks (hover affordance) — same menu.
- **Permanent "+ Add block" button** at the foot of the editor — same menu.

All three open the same block-picker popover (12 types grouped into Text & structure, Visual & media, Nursing-shaped, Interactive).

**Block reordering** — drag handle (`⋮⋮`) on the left of a hovered/focused block. Alt+↑ / Alt+↓ keyboard shortcut as an accessibility equivalent.

**Block actions** — kebab menu (`⋮`) on a hovered/focused block, top-right of the block. Actions: Delete, Duplicate, Convert (text blocks only — Paragraph ↔ Heading ↔ Quote ↔ List). Domain blocks (Drug card, Lab values, Callout) cannot be converted to/from other types — they have structured schemas.

**Inline formatting toolbar** — always visible at the top of the editor, not floating. Marks: bold, italic, underline, strikethrough, inline code, link. Keyboard shortcuts mirror the toolbar (Cmd/Ctrl+B / I / U / Shift+S / E / K).

**Keyboard shortcuts** (locked):
- `Cmd/Ctrl+B/I/U`, `Cmd/Ctrl+Shift+S`, `Cmd/Ctrl+E`, `Cmd/Ctrl+K` — inline marks + link
- `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` — undo / redo
- `Cmd/Ctrl+Enter` — insert new block below
- `Alt+↑` / `Alt+↓` — move current block up/down
- `Backspace` at start of empty block — delete block, focus previous
- `/` — open block menu
- `Cmd/Ctrl+Shift+1/2` — convert to H2 / H3
- `Cmd/Ctrl+Shift+8/9` — convert to bulleted / numbered list

**Autosave** — every 3 seconds of inactivity (debounced). Indicator in the editor's top-right: *"Saving…"* during write, *"Saved 3s ago"* at rest, *"Unsaved changes"* on failure. No explicit Save button. Publish button stays separate (it's the visibility-mode flip, not save).

**Concurrent-edit guards** — two layers, defending against the "same tutor with the same note open in two tabs" case (the realistic v1 trigger; cross-tutor sharing isn't a v1 feature). Both layers carry through unchanged when co-tutor editing lands in v2.

- **`version_id` save guard (server, at save time).** The note row carries a `version_id UUID` that the server regenerates on every save. The editor records the version it loaded with and sends it on each save. Mismatch → server rejects with *"This note was saved in another tab. Reload to see the latest version."* No merge UI in v1 — last-write-wins with a guard. Catches every concurrent-edit case at the data layer.
- **`BroadcastChannel` presence warning (client, at open time).** When the editor mounts, it broadcasts on a per-note channel. If a peer responds, the second tab shows a banner: *"You have this note open in another tab — editing here may overwrite the other version."* Zero schema cost; pre-empts the most common case before the user invests typing time.

**Edit-propagation warning** — on the first significant save after 5+ minutes of inactivity (a "session break"), the save dialog surfaces the propagation reach: *"This note is attached to 3 programmes (~47 students). Your changes are now visible."* Subsequent autosaves within the session don't re-show the warning. "Significant" = block added/removed/converted, embedded question changed, drug-card fields edited — not micro-edits (typos, formatting).

#### Block types

A note's body is a sequence of blocks. Each block has a type and its
own typed content. Mirrors the bank's polymorphic-content approach.
**12 block types in 4 groups** (synced with
`docs/product-plan/mockups/tutor-library-mockup.html`):

##### Group 1 — Text & structure

| Type | Schema | Authoring notes |
|---|---|---|
| `heading` | `{ type, level: 2\|3, text }` | H2 + H3 only — no H4. |
| `paragraph` | `{ type, content: [{ text, marks: [...] }] }` | Inline marks: bold / italic / underline / strikethrough / code / link. |
| `list` | `{ type, kind: "bulleted"\|"numbered", items: [...] }` | One level of nesting (Tab / Shift+Tab). |
| `quote` | `{ type, content, citation? }` | Block quote with optional citation line. |

##### Group 2 — Visual & media

| Type | Schema | Authoring notes |
|---|---|---|
| `image` | `{ type, asset_id, alt, caption? }` | Alt text **required at publish** (not at block insert or autosave — drafts can have empty alt freely). 5MB cap, auto-resize to 1600px width on upload. Supabase Storage, signed URLs on-demand. See Publishing → Alt-text preflight. |
| `pdf` | `{ type, asset_id, title, caption? }` | Same storage strategy as Image. Renders as a **link card with "Open" button** (not inline iframe — inline embeds are unreliable across browsers). |
| `video` | `{ type, url, provider, caption? }` | External embeds only — YouTube + Vimeo + Loom in v1. Direct MP4 URLs render via `<video>`. No self-hosting. |
| `table` | `{ type, header_row: bool, cells: [[...], ...] }` | Generic comparison table. Rich-text cell contents (bold / italic / link within a cell). No images in cells in v1. Standard add/remove row/column controls. **First to defer if editor work runs over.** |

##### Group 3 — Nursing-shaped (the differentiators)

**Callout**
- Tinted box for emphasis. **5 tones**, each with a default icon + label: *Note* (ℹ), *Tip* (💡), *Warning* (⚠), *Critical* (⛔), *Memory* (🧠).
- Schema: `{ type: "callout", tone: "note"|"tip"|"warning"|"critical"|"memory", content }`
- No custom title (title derives from tone — keeps the scannable tone-vocabulary intact).
- Content is paragraph-like rich text. No nested blocks (a callout is emphasis, not a container).

**Drug card** — *extensible from day one*
- Header: drug name (required) + drug class (optional).
- Body: ordered array of `{ label, value }` fields. New cards pre-populate with the 4 NCLEX-canonical fields: *Indications · Typical dose · Side effects · Nursing considerations*. Tutor can rename, reorder, add, or remove fields.
- Field values are plain text, multi-line (line breaks render as breaks). No inline marks.
- Schema:
  ```json
  {
    "type": "drug_card",
    "name": "Furosemide",
    "drug_class": "Loop diuretic",
    "fields": [
      { "label": "Indications",           "value": "Heart failure, oedema, hypertension" },
      { "label": "Typical dose",           "value": "20–80 mg PO/IV daily" },
      { "label": "Side effects",           "value": "Hypokalaemia, ototoxicity, hypotension" },
      { "label": "Nursing considerations", "value": "Monitor K⁺, BP, daily weight, I&O" }
    ]
  }
  ```
- Authoring: per-field row with `label` input + `value` textarea + drag handle + remove. `+ Add field` button at foot.
- Validation: `name` required; at least one field with content; field labels required.
- Not linked to bank items in v1.

**Lab values** — *extensible columns from day one*
- Title (required — e.g. "Arterial Blood Gas (ABG)") + flexible columns + rows.
- New tables pre-populate with the 4 NCLEX-canonical columns: *Test · Normal · If high · If low*. Tutor can rename, reorder, add, or remove columns.
- Schema:
  ```json
  {
    "type": "lab_values",
    "title": "Arterial Blood Gas (ABG)",
    "columns": [
      { "label": "Test" }, { "label": "Normal" },
      { "label": "If high" }, { "label": "If low" }
    ],
    "rows": [
      ["pH",    "7.35–7.45",  "Alkalosis",            "Acidosis"],
      ["PaCO₂", "35–45 mmHg", "Respiratory acidosis", "Respiratory alkalosis"]
    ]
  }
  ```
- Authoring: standard column-add/remove + row-add/remove. **Column removal warns** ("This will delete the values in this column for all N rows. Continue?").
- Validation: title required; ≥1 column; ≥1 row; column labels required.

##### Group 4 — Interactive

**Embedded questions** — *the killer feature*
- Schema: `{ type: "embedded_questions", item_ids: string[], source: "TUTOR" }`. **Multi-question block** — `item_ids` is 1..N references. Single-question case is `item_ids: ["..."]`.
- Picks **from the tutor's own bank only** — not from the QAcademy bank (editorial control + attribution clarity + cross-ownership deletion concerns). Source field retained as forward-compat enum; v1 only allows `TUTOR`.
- **Authoring** — multi-select picker (pick 1..N bank items at once). Reorder + remove inside the block via a small list view.
- **Edit mode rendering** — one reference card per question (not the live question). Each card: `Question TUTOR_SATA_00012 · SATA · 4 options · Pharmacological and Parenteral Therapies chip` + "Open in bank" link. Reduces editor visual clutter; the tutor already knows the questions.
- **Read mode rendering** — inline player walks the set sequentially: "Question 1 of N" → Submit → feedback → Next → end-of-set "You got 2 of 3 right" card. See [Read-mode renderer](#read-mode-renderer) below.
- Question types in v1: MCQ + SATA + TF. NGN types deferred at the product level per `mynclex/CLAUDE.md`.
- **Per-block cap.** Soft 5 questions; hard 10. Past 5 nudges the tutor toward a quiz; past 10 is refused.
- **Per-note cap (summed across all blocks).** Soft 20; hard 50. Soft cap fires a warn-dialog at note save (*"Many embeds can be overwhelming for students. Consider splitting into a quiz."* [Cancel] [Save anyway]); hard cap is a server-side reject (*"A note can have at most 50 embedded questions. For longer question sets, build a quiz instead."*). Both checks fire at note-save, not at block insert.
- Only Published bank questions are embeddable. Drafts don't appear in the picker.
- **Empty-state**: when a brand-new tutor with zero published bank questions opens the block menu and picks Embedded questions, show an empty-state message with a deep link to their bank editor.
- **Question deletion**: `ON DELETE RESTRICT` on the embed reference — the tutor must remove the question from every block's `item_ids` array (or delete the block entirely) before deleting the question.

#### Storage strategy (Image + PDF blocks)

**On-demand signed URLs**. Same pattern as the PDF activity (Slice 10.4). When the editor or read view renders an Image/PDF block, the server mints a short-lived signed URL pointing at the Supabase Storage object. No long-lived URLs stored in the JSONB — only the `asset_id` (Storage path or bucket-relative key).

Trade-off: extra DB query per image render, but:
- Library content is paid (only enrolled students see it)
- Mirrors PDF-activity machinery — no new pattern
- Image-heavy notes batch-mint per page render, not per-image network round-trip

### Edit-anytime model

A published note can be edited by the tutor at any time. Edits go
live immediately — no republish flow, no revision approval, no
holding edits back.

This matches the bank's pattern (`is_published` boolean + edits live
immediately + student session integrity via attempt-start snapshots).
Same trade-off: simplicity over revision-control. Promote to a
revision model in v2 if real tutors create chaos.

### Publishing

Publishing a note is a deliberate two-step:

1. Tutor clicks **Publish** on a draft. An **alt-text preflight**
   runs first (below); if it passes, the dialog opens.
2. A dialog asks: *Who can read this note?*
   - **Tutor-wide** *(default)* — any student enrolled in any of my
     programmes can see this note in their library.
   - **Programme-scoped** — multi-select picker. Pick **one or more**
     of the tutor's programmes; only students enrolled in any of
     those programmes see the note. The picker defaults to the
     programme the tutor is currently working in (if any). Storage:
     ≥ 1 row inserted into `nclex_tutor_library_note_visibility`.

Default is Tutor-wide because foundational content (general teaching)
is the more common case. Programme-scoped is the deliberate choice for
cohort-specific content (*"Cohort 5 + Cohort 6 — Unit 3 study plan"* —
the kind of pair-specific scope a single-FK model can't express).
*(The "Unit 3" label depends on the programme's `unit_label` — a
programme that picked Module would say "Module 3" instead.)*

Visibility is set per-note. Folders, shelves, pillars, tags, and views
do not affect it — they are pure organisational tools.

#### Alt-text preflight (image accessibility gate)

Drafts can have empty `alt` on image blocks freely — tutor's working
scratch space. The Publish action runs a preflight scan; if any image
block has empty `alt`, publishing is blocked with *"3 images are
missing alt text — click here to jump to the first one."* The
click-through scrolls the editor to the first offender and focuses
its alt field. After publish, edits to existing images don't
re-trigger the check (the gate fired once; the note has met the
bar). If a tutor later removes alt text from a published image, that
is their call — no rolling enforcement.

### Used-in count

Each note row shows a count of how many programme units it's attached
to. Clicking the count opens a list ("Bootcamp Cohort 5 — Week 3,
Pharm Intensive — Week 1") with deep links into each.

The count is **transparency on edit propagation**: when the tutor
saves changes to a note attached to 3 programmes with ~50 students
total, they should know what they're affecting. The save dialog shows
*"This note is attached to 3 programmes (~47 students). Your changes
will be visible immediately."*

---

## Visibility (who sees what)

Visibility is a property of the **note**, not of any organisational
container. Two modes, set when the tutor publishes:

| Note state | Who sees it |
|---|---|
| Draft | Only the tutor |
| Published, **Tutor-wide** | Every student enrolled in any of this tutor's programmes |
| Published, **Programme-scoped** | Only students in the programme(s) the tutor explicitly picked — one or more, chosen at publish |

**Storage uses a junction table**, not a single FK. A single-FK
model couldn't express the realistic "this note belongs to two of
my cohorts but not the third" case. The junction:

- `nclex_tutor_library_note_visibility (note_id, programme_id)` —
  one row per (note, programme) pairing.
- **Tutor-wide** notes have **zero rows** in the junction.
- **Programme-scoped** notes have **≥ 1 row** in the junction.
- The publish dialog's programme picker is a multi-select. Default
  selection on first publish is whichever programme the tutor is
  currently working in (if any).

A scenario:

> Tutor has three programmes running: Bootcamp Cohort 5, Bootcamp
> Cohort 6, Weekend Pharm Intensive.
>
> They publish "How to attack SATA questions" as **Tutor-wide**.
> The junction stays empty. Every student in all three programmes
> sees it in their library.
>
> They publish "Pharm essentials — Unit 3 study plan" as
> **Programme-scoped** to both Bootcamp cohorts (the two that share
> the same Unit 3 reading). The junction gets two rows. Cohort 5
> and Cohort 6 students see it; Pharm Intensive students don't —
> not in the scope set.

### Same-tutor invariant

Every `programme_id` in a note's visibility junction must belong to
that note's tutor. A tutor can't accidentally (or intentionally)
add another tutor's programme to their note's scope.

- App layer: `saveLibraryNote` rejects any `programme_id` whose
  owning tutor doesn't match the note's `tutor_id`.
- SQL layer: `BEFORE INSERT/UPDATE` trigger on
  `nclex_tutor_library_note_visibility` looks up
  `nclex_programmes.tutor_id` and refuses mismatches.

Matches CLAUDE.md rule #4 — TypeScript for UX-friendly errors, SQL
for the security floor.

### Programme-scoped with no programmes is impossible

A `PROGRAMME_SCOPED` note must end every transaction with at least
one junction row. Two layers:

- **Save-time invariant (app):** the save action refuses to commit
  a `PROGRAMME_SCOPED` note with an empty visibility set, with a
  UX-friendly error.
- **Deferred constraint trigger (SQL):** a `DEFERRABLE INITIALLY
  DEFERRED` trigger on the junction runs at transaction commit; if
  a `PROGRAMME_SCOPED` note ends the transaction with zero junction
  rows, the trigger raises.

Belt-and-braces.

### Student-side RLS helper

A SQL function `nclex_student_can_see_note(note_id)` centralises
the visibility check used by every student-side query:

- Returns true if the note is published AND
  - `visibility_mode = 'TUTOR_WIDE'` AND the student is enrolled in
    any programme of this tutor, OR
  - `visibility_mode = 'PROGRAMME_SCOPED'` AND the student is
    enrolled in at least one programme in the note's visibility
    junction.

RLS policies and content queries both call this; one function, one
truth.

### Containers don't gate visibility

A note's folder, shelf, pillar, or tags do not affect who can see it.

- A folder can contain a mix of Tutor-wide and Programme-scoped notes.
  Different students see different slices of the same folder. A
  folder of 7 for the tutor might show 3 to a Cohort 5 student.
- A shelf can contain a mix similarly. The same student-side counts
  apply.
- Empty containers (zero visible notes for this student) are hidden
  from the student's sidebar automatically — only containers with at
  least one visible note appear.
- Sidebar counts are viewer-relative.

### Mixed-visibility shelves — attach-time dialog

When a tutor attaches a shelf to a unit, the system scans the
shelf's notes. If any are `PROGRAMME_SCOPED` to a set that doesn't
include the target programme, a dialog appears with three explicit
choices:

- **Attach anyway** — students here won't see those rows.
- **Add this programme to their visibility, then attach** —
  students here WILL see them.
- **Cancel.**

If the tutor picks the middle option, the necessary rows insert
into `nclex_tutor_library_note_visibility` in the same transaction
as the attach. The dialog lists the affected notes by title so the
choice is informed. Three explicit options (not defaulted) so the
visibility expansion is always deliberate. No permanent badge —
the moment-of-decision interaction is substantive enough.

### The combination case

A Tutor-wide note can also be attached to a specific programme's
unit. Both surfaces co-exist:

- All this tutor's students see it in their library (Tutor-wide
  visibility).
- Bootcamp Cohort 5 students additionally see it as a scheduled
  activity in Unit 3 (attachment — loose under the unit, or inside
  one of its curriculum blocks).

No content duplication — same note, two surfaces showing it.
Visibility and scheduling are independent axes, by design.

A `PROGRAMME_SCOPED` note can only be attached to units in
programmes within its visibility set. Attaching it to a unit
outside that set is refused; the tutor can re-attempt after
widening the note's scope (via the publish dialog, or via the
attach-time dialog above).

---

## Scheduling — Library Note and Shelf as the 7th + 8th activity types

The unit-builder's add-activity picker grows from a 3×2 grid (six
types) to a 4×2 grid with **two new types**: **Library Note** (a
single reusable note) and **Shelf** (a whole curated pack — attached
as one atomic activity, all notes rendered together). Both flagged
NEW in the picker. This is documented as a structural revision to
[curriculum-authoring-ux.md](curriculum-authoring-ux.md) and
[main.md](main.md) (Programme Structure → Activity types).

### Adding a Library Note activity

1. Tutor clicks **+ Add activity** at the unit level (loose) OR
   **+ Add activity to block** inside a curriculum block.
2. Picker appears with 8 tile options. Tutor picks **Library Note**.
3. A modal opens showing the tutor's library — folders on the left,
   notes on the right, search + tag filter.
4. Tutor picks one note; the modal closes and the note slots in
   loose under the unit (or into the curriculum block, depending on
   which entry point fired the picker) as an activity.

The attachment row shape: `{attachment_id, note_id, programme_id,
unit_id, block_id, position, caption?, …}` — `shelf_id` is null.

The activity row shows: type icon, note title, optional tutor-set
caption ("Read before Wednesday's session"), and the standard
up/down arrows for reordering.

### Adding a Shelf activity (atomic-activity model)

1. Picker → Tutor picks **Shelf**.
2. A modal opens listing the tutor's shelves with colour dot, title,
   description, count, and a preview of the first 3 notes per shelf.
3. Tutor picks one shelf. If any note on the shelf is
   `PROGRAMME_SCOPED` to a set that doesn't include the target
   programme, the visibility attach-time dialog fires (see
   *Visibility → Mixed-visibility shelves*).
4. Modal closes; the shelf slots in under the unit (or curriculum
   block) as **one atomic activity** — a single attachment row, not
   a fan-out of per-note rows.

The attachment row shape for a shelf: `{attachment_id, shelf_id,
programme_id, unit_id, block_id, position, caption?,
skipped_note_ids JSONB, …}` — `note_id` is null. A CHECK constraint
on the table ensures exactly one of `note_id` / `shelf_id` is set
per row.

**Why atomic, not per-note rows.** The original plan fanned a shelf
out into one attachment row per note, all stamped with a shared
`shelf_id`. The attachments table then had to be kept in sync with
shelf membership via insert/delete sweeps every time the shelf
changed. The atomic model collapses all of that — the shelf is the
source of truth for its contents; the unit just points at it.

**The grouped block** in the unit view shows: a coloured outer
border (the shelf's colour), an identity bar at the top (shelf
colour dot + title + optional kebab), and the shelf's notes as
individual activity rows beneath. Order always mirrors the shelf's
current master order.

### Ordering inside a shelf-attached block

**Read-only inside the unit.** The grouped block always renders the
master shelf's current order. To change the order, the tutor goes
to the shelf in the library and reorders it there — the change
propagates to every unit using the shelf (they're all pointers to
the same master). One rule, one place. No "shelf-order overridden"
flag, no "moved" indicator, no "reset to shelf order" action.

### Skipping a note within a shelf attachment

A tutor can omit specific notes from a particular unit's shelf
render without breaking the shelf-link or forking the shelf:

1. Open the unit's grouped block, tap the kebab on a single note
   row.
2. **Hide in this unit** → that `note_id` is appended to the
   attachment row's `skipped_note_ids JSONB` array.
3. The hidden note no longer renders to students and no longer
   counts toward the shelf-activity's completion rollup.
4. In the tutor's unit view the row appears dimmed with a "Hidden
   in this unit" pill and an **Unhide** action.

**Real case.** The shelf is the tutor's master pack — reused across
cohorts. Cohort 5 already covered note X elsewhere, so the tutor
hides it for Cohort 5's Unit 3 only. The shelf itself stays
unchanged for Cohort 6 and Pharm Intensive. The alternative —
forking the shelf into a Cohort-5 variant — creates near-identical
shelves that drift over time.

Caption inside a shelf attachment is shelf-level only — no per-note
caption inside a shelf. Per-attachment caption still works for
loose Library Note attachments.

### Shelf membership changes after attachment

If the tutor adds a note to a shelf, every unit using that shelf
automatically picks up the new note in the shelf's master order. A
student who had previously completed the shelf-activity reverts to
in-progress until the new note is ticked. If the tutor removes a
note that some students hadn't ticked, those students' activity may
complete retroactively.

Both behaviours are correct. Communicated to students with a small
"your tutor updated this shelf" hint above the grouped block when
membership has changed since their last view.

### Single source of truth

Both attachment paths are *pointers*, not copies. The actual
content lives once, in `nclex_tutor_library_notes`. When the tutor
edits the master note, every attachment renders the updated content
immediately. There is no "per-attachment copy" model in v1.
Confirmed call: it would feel wrong if editing your acid-base notes
left stale copies scattered across old cohorts.

### Completion (shelf rollup)

Shelf-activity completion derives at query time from
`nclex_library_note_state.marked_done_at` (the merged per-(student,
note) state table — see *Student side → Reading a note*). A
shelf-activity is complete for a student when every member note
that isn't in `skipped_note_ids` has `marked_done_at IS NOT NULL`
for that student. Auto-rolls up — no separate "Mark shelf done"
click. One source of truth for note-level completion; no per-shelf
JSONB column to keep in sync.

### Visibility precondition

A note can only be attached to a unit if it is published. Draft
notes don't appear in the attach modal.

A `PROGRAMME_SCOPED` note can be attached to units in any programme
within its visibility set. Attaching it to a unit outside that set
is refused; the tutor can re-attempt after widening the note's
scope.

A shelf can mix Tutor-wide and Programme-scoped notes freely; when
the shelf is attached to a unit, each member note's visibility
determines whether students see that row. The attach-time dialog
catches the mixed-visibility case so the outcome is never silent.

### Detach / delete behaviour

- **Detaching** a Library Note from a unit removes the attachment
  row but leaves the master note untouched in the library.
- **Detaching** a shelf from a unit removes the single shelf
  attachment row. The shelf itself stays in the library.
- **Detaching a single note from a shelf attachment is no longer a
  separate action.** Use **Hide in this unit** (above) — the
  attachment row stays, just with that `note_id` appended to
  `skipped_note_ids`. To restore the row, **Unhide**. (The old
  "set `shelf_id` NULL on that row" behaviour is retired by the
  atomic-activity model — there are no per-note rows to mutate.)
- **Deleting** a master note is refused if it's attached anywhere
  (`ON DELETE RESTRICT`). The tutor must detach all attachments
  first. Same pattern as Trend datasets in the bank.
- **Deleting** a shelf is refused if any unit attaches it (`ON
  DELETE RESTRICT`). Same pattern.
- **Unpublishing** a note that's attached: the note becomes
  invisible again (back to draft state), the attachments stay in
  place but render a "Note hidden by tutor" placeholder. Tutor can
  republish to restore.

---

## Student side

### Programme library surface

**Routes (locked).** The library is **always programme-scoped** on
the student side — mirroring the Quizzes pattern. There is no global
`/student/library/` page and no merged "all my tutors" view; a
student switches libraries by switching programmes via the existing
`<ProgrammeSwitcher>`.

- `/student/programme/[programme_id]/library/` — programme-scope
  list.
- `/student/cohort/[cohort_id]/library/` — cohort-scope list
  (renders the parent programme's library).
- `/student/programme/[programme_id]/library/note/[note_id]` — read
  view (cohort equivalent at
  `/student/cohort/[cohort_id]/library/note/[note_id]`).

Sidebar entry lives in `lib/nav/student.ts` — one item in
`STUDENT_PROGRAMME_DETAIL_NAV` and one in
`STUDENT_COHORT_DETAIL_NAV`, between *Curriculum* and *Quizzes*.

The student library always carries a programme/cohort context in
the URL so back-pills, sidebar state, and "next in shelf/folder"
navigation have unambiguous context. A student enrolled with two
tutors works through one programme at a time, never sees two
libraries side-by-side.

**The student library mirrors the tutor library's structure** — same
five-lens sidebar (Views, Folders, Shelves, Pillars, Tags) with the
same collapse-to-rail affordance (per-student localStorage), same
per-note lens row, same All folders / All shelves zoomed-out views.
Three adaptations:

| Aspect | Tutor | Student |
|---|---|---|
| Views section | All notes / Recent / **Drafts** / **Used nowhere** / + custom views | All notes / Recent / **By unit** / **Bookmarked** (no Drafts / Used nowhere; no custom views — system-only) |
| Folder / Shelf entries | All shown | Only those with ≥1 visible note (empty containers hidden) |
| Sidebar counts | Total | Student-visible only (a folder of 7 for the tutor may show 5 to a Cohort 5 student) |
| Action affordances | + New folder / + New note / drag-to-add | None — read-only |
| Per-note right column | Status pill (Pub/Draft) + ↳ used-in pill + edited timestamp | Read button / Continue button / bookmark icon + read time + Unit-N task pill if attached to current unit |
| Note editor | Yes (full block-based editor) | No — clicking a note opens the read view |

**The student sees the same organisational structure as the tutor**,
just visibility-filtered. A folder of 7 for the tutor might show 3 to
a Cohort 5 student — sidebar counts reflect what's available to that
student, and folder contents are filtered automatically. Empty
containers are hidden from the student's sidebar entirely.

**No author-side framing on the student side.** No "Folder · private"
label (folders aren't private anymore — they're the tutor's primary
bin, and the student sees the same bin). No "Attached to / Visibility"
metadata panels on the shelf-scope view (that's tutor metadata). The
student-side All shelves view has the same Spotify-style carousels
but no trailing "+ Add to shelf" slot.

**Why mirror?** Two reasons:
- The tutor's organising structure (folders, shelves, pillars, tags)
  is *also* the most useful structure for the student to browse by.
  "I want to study pharm" → Shelves: Drug deep dives. "I want NCLEX
  PA coverage" → Pillars: PA. Same lens, same value, different
  audience.
- Architectural consistency means anyone who becomes a tutor (or
  vice versa) doesn't have to relearn the model.

### Reading a note (read-mode renderer)

A dedicated full-page route (not a modal) — see *Programme library
surface → Routes (locked)* above — with a read-only renderer that's
a separate component from the editor. Same JSONB block document
drives both; the renderer just omits the authoring affordances
(toolbar, drag handle, kebab menu).

Per-(student, note) state — reading position, bookmark, manual
completion, last-visited — lives in a single merged table
`nclex_library_note_state` (PK `(student_id, note_id)`). Three
originally-separate concerns collapse into one row: bookmarks (was
`nclex_library_note_bookmarks`), reading position (was
`nclex_library_note_progress`), per-note completion (was a JSONB
column on the progress engine's completion row). One source of
truth for note-level student state.

**Page chrome** (top to bottom):

1. **Back pill** — context-aware: "Back to Cardiac" (folder),
   "Back to Foundational SATA pack" (shelf), "Back to Unit 3" (when
   arriving from a unit activity row).
2. **Bookmark toggle** — top-right of the header. Writes
   `nclex_library_note_state.bookmarked_at` (toggles on/off); powers
   the student *Bookmarked* view.
3. **Title** — large.
4. **Metadata row** — pillar chips (multi — see NCLEX Pillars) + tag
   chips (clickable to filter the library) + reading-time estimate
   (auto-calculated at ~200 wpm) + last-updated timestamp. Tutor
   name implicit by programme context, not labelled.
5. **Body** — the rendered block document.
6. **Foot** — *Mark as done* button (primary CTA — see Completion
   below) + "Next in [shelf/folder] →" link when reading from a
   container.

**Resume-on-reopen.** On mount, the renderer reads
`nclex_library_note_state.last_heading_id` for this note. If set, it
scrolls to that heading's anchor; if the heading has since been
deleted, it falls back to the top of the note and shows a small
"this note has been updated" hint. Scroll-spy maintains
`last_heading_id` as the student moves past H2/H3 headings —
debounced, never overwriting a more advanced position with an
earlier one within the same session.

**Left rail — Contents panel**:
- Auto-built from H2/H3 headings in the body.
- Click an entry to jump.
- Scroll-spy highlights the active section + writes
  `last_heading_id` as headings are passed.
- Foot of rail: **"section N of M"** progress meter, derived from
  the position of `last_heading_id` in the heading sequence. Replaces
  the earlier "% scrolled" bar — meaningful units that survive
  body-length edits.
- Collapses to a hamburger / floating button on narrow viewports
  (build-time refinement).

**Per-block read rendering**:
- `paragraph` / `heading` / `list` / `quote` / `table` / `callout` /
  `drug_card` / `lab_values` — render in their authored shape,
  minus the authoring affordances.
- `image` — `<img>` + optional caption. Signed URL minted
  on-demand per render.
- `pdf` — **link card with "Open" button** (opens in new tab via
  signed URL). No inline iframe.
- `video` — embedded iframe (YouTube / Vimeo / Loom). Caption
  underneath.
- `embedded_questions` — **interactive practice block** (see below).

**Embedded questions flow** (the differentiator):

*First time the student reaches the block (scrolling through the note):*
1. Header renders: *"Question 1 of N"* (or just the single question
   if N=1, with no counter).
2. Question 1 renders in answering mode — stem, options, Submit
   button.
3. Student answers, clicks Submit.
4. Transitions to feedback mode **inline** — right/wrong + per-option
   feedback + rationale + snapshot frozen to
   `nclex_library_embed_answers` (one row per question slot, keyed
   `(student_id, note_id, block_id, question_index)`).
5. Next button advances to question 2; repeat.
6. End of set: a small summary card — *"You got 2 of 3 right."*
7. Note continues below the block.

*Re-entering the note later (after some questions submitted):*
1. Note renders fully top-to-bottom.
2. Each previously-submitted question shows submitted-answer +
   feedback in read-only state (the snapshot, not the live question
   — preserves the moment-of-submit content).
3. New questions (added to the block after the student's last read)
   render in answering mode when reached.
4. Student scrolls unfettered — no gating, no re-answer.

Same per-question-runner components as the main runner uses (with a
`mode="library_embed"` variant). No re-answer button in v1. No
"required to proceed" gating in v1.

#### Completion semantics

**Manual mark-done only.** A *Mark as done* button at the foot of
the note records completion to
`nclex_library_note_state.marked_done_at` (one row per (student,
note); the timestamp toggles set/clear when the student taps the
button). Same table holds bookmarks + reading position — one source
of truth for note-level student state.

**Write-through to the progress engine** when the read came from a
Library Note activity — the same action that stamps
`marked_done_at` also calls the existing
`markActivityDone` / `unmarkActivityDone` server actions so the
curriculum tick fires. Consistent with the other passive-content
activity types (Text, PDF, External link, Live session) — no new
completion concept introduced.

**Shelf-activity completion derives** from this table — a shelf
attached to a unit is complete for the student when every member
note that isn't in `skipped_note_ids` has `marked_done_at IS NOT
NULL`. No `notes_completed` JSONB column on the progress engine's
row; one source of truth.

Embedded-question submissions live in `nclex_library_embed_answers`
— they are *question*-level state, not *note*-level state. A student
might submit every embed and still not mark the note done (stopped
mid-rationale); a student might mark a note done having skimmed past
the embeds. Both are valid; the two signals stay separate.

Rejected alternatives:
- *Auto-done on scroll-to-bottom* — game-able (fast-scroll without
  reading).
- *Auto-done when all embeds answered* — only works if the note has
  embeds; would need fallback rules and adds a completion concept.

#### Smaller calls

- **Reading-time** estimate auto-calculated at ~200 wpm at save time;
  shown in the header.
- **Tag chips** in the metadata row are clickable → filter the
  library by that tag.
- **Bookmark icon** in the header toggles
  `nclex_library_note_state.bookmarked_at`; powers the student
  *Bookmarked* view.
- **Print / export** — deferred per *What's NOT in v1*.

### Scheduled vs unscheduled appearance

- Notes attached to a unit of an enrolled programme also appear in
  that **unit's activity list** as a tracked task with completion
  tick (passive content — student-ticked, not auto-completed unless
  the note contains embedded questions, in which case completion
  rules per programme structure apply). When attached inside a
  curriculum block, the note participates in that block's done
  rollup like any other in-block activity. When attached via a
  shelf-grouped block, the note participates in the shelf block's
  visual grouping in the unit view.
- Notes only visible via Tutor-wide (not attached) appear in the
  library only — not in any unit's activity list.

The mental model: library = "what's available to read." Unit
activities = "what your tutor wants you to read this unit." Same
content surface in two contexts.

---

## Embedded questions — the differentiating feature

The `embedded_questions` block (Group 4 — Interactive) is the
differentiating capability of the library. A note on *"How to attack
SATA questions"* embeds three real SATA questions inline as guided
practice — student reads, attempts, sees feedback, reads on.
Without this, the library is a notes app; with it, it's a teaching
surface.

Provisional in earlier drafts (likely to slip if runner reuse
turned out painful) — now treated as **v1**, with the
markdown-fallback escape hatch still available for the whole editor
if cost runs over.

### Mechanics

A note's body can include `embedded_questions` blocks (note the
plural). Each block references **one or more** bank items by id,
from the **tutor's own bank only** (not the QAcademy shared bank —
locked 2026-05-16 for editorial control + attribution clarity +
cross-ownership deletion hygiene). Source field retained as a
forward-compat enum (currently fixed at `TUTOR`).

Block shape: `{ type: "embedded_questions", item_ids: string[],
source: "TUTOR" }`. The single-question case is just an array of
length 1 — nothing is lost. Multi-question is the natural shape for
*"now try these three"* teaching moments: pedagogical coherence,
one reading break instead of three scattered widgets, cleaner
authoring (multi-select picker once vs adding three blocks).

**Per-block caps.** Soft 5, hard 10 questions per block. Past 5
nudges the tutor toward a quiz; past 10 is refused — at that size
the content is a quiz, not a teaching break.

**Per-note caps.** Soft 20, hard 50 embedded questions per note,
**summed across every `embedded_questions` block**:

- **Soft cap (20)** — warn dialog at note save: *"This note has N
  embedded questions. Many embeds can be overwhelming for students.
  Consider splitting into a quiz."* [Cancel] [Save anyway].
- **Hard cap (50)** — server-side reject at 51+ with an error
  toast: *"A note can have at most 50 embedded questions. For
  longer question sets, build a quiz instead."*

Both checks fire at note-save, not at block insert — so the tutor
isn't blocked mid-authoring while shuffling. The 20–50 range gives
room for honest outliers (a comprehensive drug-card note with 30
quick checks); past 50 it isn't a note any more.

When the student reads the note and reaches an embed block, an
inline player walks through the questions sequentially:

- Header: *"Question 1 of N."*
- Student answers; per-question Submit fires.
- Student sees right/wrong + per-option feedback + rationale.
- Next button advances to the next question.
- End of set: a small summary card — *"You got 2 of 3 right."*
- Reading continues below the block.

Reuses the existing per-question runner components in
`lib/bank/runner/types/` (MCQ / SATA / etc.) — same review-mode
rendering. The inline player is a thin wrapper over those.

On re-render later (same student, same note):
- Previously-submitted questions show in **read-only submitted
  state** (submitted answer + feedback visible).
- New questions (added to the block after the student last read)
  show in answering mode.
- No re-answer in v1 — once submitted, each question is locked.

### Attempt-tracking — separate table, no pollution of student analytics

**Locked 2026-05-16: embed answers live in their own table
`nclex_library_embed_answers`, NOT in `nclex_attempts`.**

Three reasons drove the separation:
1. **Semantic fit.** `nclex_attempts` is built around the "session of
   questions" model (start time, end time, status, duration, pass/fail).
   An embedded question is one-shot, asynchronous, mid-reading — no
   session. Forcing it into the session model muddies what
   `nclex_attempts` actually means.
2. **Pollution risk.** Analytics queries that read `nclex_attempts`
   and forget a `source != 'LIBRARY_EMBED'` filter are a recurring
   quiet bug class. Physical separation eliminates the whole class —
   embed answers are never in the attempts table to begin with.
3. **Lighter rows.** Embed answers don't need status / duration /
   intent fields; a dedicated table can be slim.

**Row shape:** `(student_id, note_id, block_id, question_index,
item_id, snapshot_json, answer_json, is_correct, submitted_at)`
with `UNIQUE (student_id, note_id, block_id, question_index)` —
one row per question per student. A multi-question block produces
multiple rows (one per array slot); a single-question block
produces one. `ON DELETE RESTRICT` on the bank-item FK (see
*Question deletion behaviour* below).

A student's answer on an embedded question:
- Does **not** count toward their main practice analytics
- Does **not** affect their pool state (Unseen → Seen, Correct/Incorrect)
- Does **not** appear in their question history
- Does **not** affect Readiness Signal or any other analytic surface

The reason: a note-embedded question is a teaching interaction, not
a quiz. Polluting analytics with one-off embed answers would distort
the student's signal. They might re-read a note three times to study;
their pool state shouldn't shift.

### Tutor-side analytics — v2+, schema-supported from day one

Once tutor analytics arrives, rows from `nclex_library_embed_answers`
become a powerful signal for tutors: *"80% of students failed the
second SATA in my acid-base note"* is exactly the kind of teaching
insight that justifies the feature. The schema is shaped right from
day one — `student_id` + `note_id` + `block_id` + `question_index`
+ `item_id` + `is_correct` are all in place.

### Snapshot at submit time

When a tutor edits a note (or the embedded question itself) while a
student is mid-read, what does the student see?

For text content (paragraphs, headings, callouts, drug cards, etc.),
immediate visibility is fine — even desirable. The student sees the
latest authoritative content.

For embedded questions where a student has already submitted an
answer, the *content + correct* snapshot at submit time **must** be
preserved. Otherwise a tutor editing the question rationale after a
student submits could retroactively change what the student is
deemed right/wrong against.

**Resolved** — same snapshot pattern the runner already uses for
`nclex_attempt_items`: when the student submits an embed, capture
`body_json` + `correct_options` + `rationale` at that moment into
`nclex_library_embed_answers.snapshot_json`. Re-renders read from
the snapshot, not the live question.

### Question deletion behaviour

A bank question embedded in any note cannot be deleted from the
tutor's bank. `ON DELETE RESTRICT` on the embed reference. Tutor
must remove the question from every block's `item_ids` array (or
delete the block entirely) before deleting the question.

Same pattern as Case Study children and Trend dataset children.

---

## Schema sketch

Nine tables plus one domain type. Tutor-owned tables use the
`nclex_tutor_*` prefix; student-owned tables use `nclex_library_*`
(matching `nclex_library_embed_answers` which predates this doc).

```
nclex_pillar
  -- Domain type. CHECK against the 8 NCLEX-RN Client Needs
  -- sub-category names (full NCSBN names, no abbreviation codes).
  CREATE DOMAIN nclex_pillar AS TEXT
    CHECK (VALUE IN (
      'Management of Care',
      'Safety and Infection Control',
      'Health Promotion and Maintenance',
      'Psychosocial Integrity',
      'Basic Care and Comfort',
      'Pharmacological and Parenteral Therapies',
      'Reduction of Risk Potential',
      'Physiological Adaptation'
    ));

nclex_tutor_library_folders
  folder_id          TEXT PK
  tutor_id           UUID FK -> nclex_users(id) ON DELETE CASCADE
  name               TEXT NOT NULL
  description        TEXT                          -- nullable; brief copy
                     -- explaining what this folder is for. Shown as the
                     -- sub-line on the folder card in the "All folders"
                     -- zoomed-out view, and as a sub-head under the
                     -- title on the folder scope page.
  position           INTEGER NOT NULL DEFAULT 0   -- folder sort order
  created_at         TIMESTAMPTZ DEFAULT NOW()
  updated_at         TIMESTAMPTZ DEFAULT NOW()

nclex_tutor_library_shelves
  shelf_id           TEXT PK
  tutor_id           UUID FK -> nclex_users(id) ON DELETE CASCADE
  title              TEXT NOT NULL
  description        TEXT                          -- nullable; the "Every cohort gets these in week 1" tagline
  color              TEXT NOT NULL                 -- hex; used for rail-side dot, pip, attached grouped-block border
  position           INTEGER NOT NULL DEFAULT 0    -- shelf sort order in sidebar
  created_at         TIMESTAMPTZ DEFAULT NOW()
  updated_at         TIMESTAMPTZ DEFAULT NOW()

  -- No visibility_mode, no is_published. Shelves are pure
  -- organisational containers. Their visibility is implicit from
  -- membership — a shelf is visible to a student if any of its notes
  -- are visible to them.

nclex_tutor_library_shelf_memberships
  shelf_id           TEXT FK -> nclex_tutor_library_shelves ON DELETE CASCADE
  note_id            TEXT FK -> nclex_tutor_library_notes ON DELETE CASCADE
  position           INTEGER NOT NULL DEFAULT 0    -- order within shelf
  added_at           TIMESTAMPTZ DEFAULT NOW()
  PRIMARY KEY (shelf_id, note_id)

  -- M:N join. A note can be on 0..N shelves; a shelf can hold 0..M
  -- notes. Position is per-shelf — same note can have different
  -- ordinal in different shelves.

nclex_tutor_library_notes
  note_id            TEXT PK
  tutor_id           UUID FK -> nclex_users(id) ON DELETE CASCADE
  folder_id          TEXT FK -> nclex_tutor_library_folders ON DELETE SET NULL
                     -- nullable; null = root-level note (no folder)
  title              TEXT NOT NULL
  subtitle           TEXT                          -- nullable; shorter
                     -- secondary headline shown directly under the title
                     -- (tutor edit view + student read-mode view).
                     -- Example: title "Acid-base balance" + subtitle
                     -- "Compensation mechanisms and ABG interpretation".
  description        TEXT                          -- nullable; brief abstract
                     -- of the note. Drives the per-note lens row on the
                     -- library home (replaces the auto-excerpt of `body`
                     -- when set), the sub-line on attached-activity rows
                     -- in the unit view, and the card text on shelf
                     -- carousel tiles. Falls back to an auto-generated
                     -- excerpt of `body` when null.
  body               JSONB NOT NULL DEFAULT '[]'::jsonb
                     -- array of typed blocks
  body_tsv           TSVECTOR GENERATED ALWAYS AS (
                       setweight(to_tsvector('english', coalesce(title,'')),       'A') ||
                       setweight(to_tsvector('english', coalesce(subtitle,'')),    'B') ||
                       setweight(to_tsvector('english', coalesce(description,'')), 'C') ||
                       setweight(to_tsvector('english', nclex_extract_body_text(body)), 'D')
                     ) STORED
                     -- Powers the search input (point 11). An IMMUTABLE
                     -- helper `nclex_extract_body_text(body JSONB)` walks
                     -- the block tree and extracts plain text from
                     -- paragraph / heading / list / quote / callout /
                     -- drug_card / lab_values / table blocks. Image /
                     -- PDF / video / embedded_questions are skipped.
                     -- `ts_rank` orders results so title hits outrank
                     -- body hits.
  tags               TEXT[] NOT NULL DEFAULT '{}'
  pillars            nclex_pillar[] NOT NULL
                     CHECK (array_length(pillars, 1) >= 1)
                     -- Multi-pillar from day 1. No "primary" concept;
                     -- every pillar in the array is equal weight.
  version_id         UUID NOT NULL DEFAULT gen_random_uuid()
                     -- Regenerated on every save. The editor records
                     -- the version it loaded with and sends it on save;
                     -- server rejects saves whose `version_id` doesn't
                     -- match. Guards against same-user-two-tabs
                     -- overwrites in v1 (and reused for co-tutor
                     -- editing when that lands in v2).
  position           INTEGER NOT NULL DEFAULT 0   -- order within folder
  is_published       BOOLEAN NOT NULL DEFAULT FALSE
  visibility_mode    TEXT NOT NULL DEFAULT 'TUTOR_WIDE'
                     CHECK (visibility_mode IN ('TUTOR_WIDE','PROGRAMME_SCOPED'))
  -- (No `scoped_programme_id` column. PROGRAMME_SCOPED notes carry
  --  their visibility set in `nclex_tutor_library_note_visibility`.)
  created_at         TIMESTAMPTZ DEFAULT NOW()
  updated_at         TIMESTAMPTZ DEFAULT NOW()

  INDEX gin (body_tsv)
  INDEX gin (tags)

nclex_tutor_library_note_visibility
  note_id            TEXT FK -> nclex_tutor_library_notes ON DELETE CASCADE
  programme_id       TEXT FK -> nclex_programmes ON DELETE CASCADE
  added_at           TIMESTAMPTZ DEFAULT NOW()
  PRIMARY KEY (note_id, programme_id)

  -- Junction defining the visibility set for PROGRAMME_SCOPED notes.
  --   TUTOR_WIDE notes:        empty junction.
  --   PROGRAMME_SCOPED notes:  ≥ 1 row.
  --
  -- DEFERRABLE INITIALLY DEFERRED constraint trigger enforces the
  -- ≥-1-row rule at transaction commit. The app-layer save also
  -- refuses to commit an empty visibility set with a UX-friendly
  -- error (TS for UX, SQL for the security floor).
  --
  -- BEFORE INSERT/UPDATE trigger enforces the same-tutor invariant:
  -- every `programme_id` must belong to the note's `tutor_id`
  -- (resolves the cross-tutor leak — point 17).

nclex_tutor_library_note_attachments
  attachment_id      TEXT PK
  note_id            TEXT FK -> nclex_tutor_library_notes ON DELETE RESTRICT
                     -- nullable; set for loose Library Note activity rows
  shelf_id           TEXT FK -> nclex_tutor_library_shelves ON DELETE RESTRICT
                     -- nullable; set for shelf-as-atomic-activity rows
  programme_id       TEXT FK -> nclex_programmes ON DELETE CASCADE
  unit_id            TEXT FK -> nclex_programme_units ON DELETE CASCADE
  block_id           TEXT FK -> nclex_programme_blocks ON DELETE CASCADE
                     -- nullable; null = loose under unit, set = inside a curriculum block
  position           INTEGER NOT NULL DEFAULT 0   -- order within parent (unit or block)
  caption            TEXT                          -- nullable; tutor's "Read before Wednesday" annotation
  skipped_note_ids   JSONB NOT NULL DEFAULT '[]'::jsonb
                     -- For shelf attachments only: note_ids hidden in
                     -- this unit's render. See Scheduling → Skipping a
                     -- note within a shelf attachment (point 2).
  created_at         TIMESTAMPTZ DEFAULT NOW()

  CHECK (
    (note_id IS NOT NULL AND shelf_id IS NULL) OR
    (note_id IS NULL     AND shelf_id IS NOT NULL)
  )
  -- Row shape diverges by kind (Option D):
  --   Loose Library Note attach: note_id set, shelf_id null.
  --   Shelf attach (atomic):     shelf_id set, note_id null —
  --     one row, not a fan-out. Member notes derive at render time
  --     from `nclex_tutor_library_shelf_memberships`.

nclex_library_note_state
  student_id         UUID FK -> nclex_users(id) ON DELETE CASCADE
  note_id            TEXT FK -> nclex_tutor_library_notes ON DELETE CASCADE
  last_heading_id    TEXT                          -- nullable; resume position
                     -- ID of the deepest H2/H3 heading the student
                     -- has scrolled past. Drives the "section N of M"
                     -- progress meter + the resume-scroll on re-open
                     -- (falls back to top if the heading was deleted,
                     -- with a "this note has been updated" hint).
  marked_done_at     TIMESTAMPTZ                   -- nullable; manual completion
                     -- Written when the student taps "Mark as done".
                     -- Also write-through to the progress engine when
                     -- the read came from a Library Note activity (so
                     -- the curriculum tick fires).
  bookmarked_at      TIMESTAMPTZ                   -- nullable; bookmark toggle
                     -- Powers the student "Bookmarked" view (point 7).
  last_visited_at    TIMESTAMPTZ DEFAULT NOW()     -- any interaction
  PRIMARY KEY (student_id, note_id)

  -- Merged per-(student, note) state. Collapses three originally
  -- separate concerns into one row:
  --   1. Bookmarks  (was `nclex_library_note_bookmarks`)
  --   2. Reading position (was `nclex_library_note_progress`)
  --   3. Per-note completion (was a JSONB column on the progress
  --      engine's completion row; retired so completion has one
  --      source of truth).
  --
  -- Shelf-activity completion derives at query time from this table:
  --   "every member note minus skipped_note_ids has marked_done_at
  --    IS NOT NULL for this student."

nclex_tutor_library_views
  view_id            TEXT PK
  tutor_id           UUID FK -> nclex_users(id) ON DELETE CASCADE
  name               TEXT NOT NULL
  filters_json       JSONB NOT NULL
                     -- saved filter set (pillars, tags, folder, shelf,
                     -- status, search). Replayed into the toolbar
                     -- chip state when the view is opened.
  position           INTEGER NOT NULL DEFAULT 0
  created_at         TIMESTAMPTZ DEFAULT NOW()
  updated_at         TIMESTAMPTZ DEFAULT NOW()

  -- Tutor-side only. The student library uses hard-coded system
  -- views (All notes, Recent, By unit, Bookmarked) — saved tutor
  -- views don't propagate to students.

nclex_library_embed_answers
  answer_id          TEXT PK
  student_id         UUID FK -> nclex_users(id) ON DELETE CASCADE
  note_id            TEXT FK -> nclex_tutor_library_notes(note_id) ON DELETE CASCADE
  block_id           TEXT NOT NULL                 -- the embedded_questions block's ID within the note
  question_index     INTEGER NOT NULL              -- 0-based index into the block's item_ids[] array
  item_id            TEXT FK -> nclex_bank_items(item_id) ON DELETE RESTRICT
                     -- prevents deletion of a bank question while embed answers exist
  answer_json        JSONB NOT NULL                -- the student's submitted answer (per question type)
  is_correct         BOOLEAN NOT NULL
  snapshot_json      JSONB NOT NULL                -- content + correct + rationale at submit time
                     -- preserves attempt integrity if the tutor edits the question later
  submitted_at       TIMESTAMPTZ DEFAULT NOW()

  UNIQUE (student_id, note_id, block_id, question_index)
  -- One row per (student, embed-block, question slot). A multi-question
  -- block produces N rows per student; a single-question block
  -- produces 1. Distinct blocks of the same `item_id` in the same note
  -- still distinguish via different `block_id`.

  -- Deliberately NOT in nclex_attempts:
  --   1. No "session" semantic — embeds are one-shot, asynchronous
  --   2. Eliminates the recurring "forgot to filter LIBRARY_EMBED"
  --      pollution-risk bug class in analytics queries
  --   3. Lighter rows — no status/duration/intent fields needed
```

**Shelf attaches as one atomic row, not a fan-out.** When a tutor
picks "Shelf" in the activity picker and selects shelf X for unit U,
exactly one attachment row is created (`shelf_id = X`, `note_id =
NULL`, `unit_id = U`). The runtime groups the shelf's notes in the
unit view by joining the attachment to
`nclex_tutor_library_shelf_memberships` at render time. Behaviour on
shelf-content changes (no row-sync needed — derivation handles it):

- **Add note to shelf** → no attachment-table writes. Every unit
  using the shelf picks the new note up at render time. Students
  who had completed the shelf-activity revert to in-progress until
  they tick the new note.
- **Remove note from shelf** → no attachment-table writes. The note
  stops appearing in every unit using the shelf. If a student
  hadn't ticked it, their shelf-activity may complete retroactively.
- **Reorder shelf** → `nclex_tutor_library_shelf_memberships.position`
  is the only place to update. Every unit using the shelf renders
  the new order on next load.
- **Hide a note in this unit** → append the `note_id` to the
  attachment row's `skipped_note_ids JSONB` array. Skipped notes
  don't render and don't count toward completion.
- **Detach shelf from unit** → delete the single attachment row.
- *(The old "detach a single note from a shelf-grouped attachment
  by setting `shelf_id = NULL`" is retired — there are no per-note
  rows to mutate. Use "Hide in this unit" instead.)*

> **Schema note (curriculum architecture rework, 2026-05-11).** The
> attachment row's curriculum FKs were updated from `week_id` /
> `module_id` to `unit_id` / `block_id` (nullable). This matches
> the new generic-units + optional-blocks model. The exact table
> names (`nclex_programme_units`, `nclex_programme_blocks`) are
> placeholders — the canonical names get fixed in the slice 9.x
> programme schema work; this doc will inherit whatever lands there.

Body shape (JSONB):

```
[
  { "type": "heading", "level": 2, "text": "Acid-base balance" },
  { "type": "paragraph", "content": [{ "text": "The body keeps blood pH between ", "marks": [] }, { "text": "7.35–7.45", "marks": ["code"] }] },
  { "type": "callout", "tone": "warning", "content": [...] },
  { "type": "image", "asset_id": "img_abc123", "alt": "ABG compensation diagram", "caption": "Optional caption" },
  { "type": "embedded_questions", "item_ids": ["TUTOR_SATA_00012", "TUTOR_MCQ_00041", "TUTOR_SATA_00018"], "source": "TUTOR" },
  { "type": "paragraph", "content": [...] }
]
```

Each `embedded_questions` block holds 1..N bank-item references
(soft cap 5, hard cap 10 per block; soft 20 / hard 50 per note,
summed across all blocks). The single-question case is `item_ids:
["..."]`.

Block types extend additively — adding a new block type is a
schema-free change (just teach the editor and renderer about it).

### RLS policies (sketch)

- `nclex_tutor_library_folders`: tutor sees own; **enrolled students
  see folders whose tutor's library they have access to** (i.e. any
  tutor running a programme they're enrolled in); SUPER_ADMIN bypass.
- `nclex_tutor_library_shelves`: same pattern as folders — tutor sees
  own, enrolled students see their tutors' shelves, SUPER_ADMIN
  bypass.
- `nclex_tutor_library_shelf_memberships`: derived from the shelf +
  note RLS — accessible if the viewer can see the shelf AND the note.
- `nclex_tutor_library_notes`: tutor sees own (any state); enrolled
  students see notes per the visibility helper below; SUPER_ADMIN
  bypass.
- `nclex_tutor_library_note_visibility`: tutor sees own (rows for
  notes they own); enrolled students see rows only as input to the
  visibility helper, never directly queried from the client. INSERT/
  UPDATE/DELETE restricted to the tutor's `saveLibraryNote` action;
  same-tutor invariant enforced by `BEFORE INSERT/UPDATE` trigger.
  SUPER_ADMIN bypass.
- `nclex_tutor_library_note_attachments`: tutor sees own; enrolled
  students see attachments for their programmes (filtered to notes
  they can see); SUPER_ADMIN bypass.
- `nclex_library_note_state`: **student sees own rows only**; tutor
  has no read access in v1 (per-note state is private student
  reading behaviour; tutor analytics is v2+). INSERT/UPDATE
  restricted to the student-side actions (`markNoteDone`,
  `setBookmark`, `updateReadingPosition`); SUPER_ADMIN bypass.
- `nclex_tutor_library_views`: tutor sees own only; SUPER_ADMIN
  bypass. Student-side has no access (saved views are an authoring
  tool — students get hard-coded system views).
- `nclex_library_embed_answers`: **student sees own rows only**;
  tutor sees rows for embeds of their own bank questions (for future
  v2+ analytics); SUPER_ADMIN bypass. INSERT is restricted to the
  student-side `submitLibraryEmbedAnswer` action; UPDATE is
  disallowed (snapshot is captured once and frozen).

The student-visibility rule for notes is the load-bearing one. A
SQL helper function `nclex_student_can_see_note(note_id)` returns
true iff:

- The note is `is_published = TRUE`, AND either
  - `visibility_mode = 'TUTOR_WIDE'` AND the student is enrolled in
    ANY programme run by the note's tutor, OR
  - `visibility_mode = 'PROGRAMME_SCOPED'` AND the student is
    enrolled in at least one programme in the note's
    `nclex_tutor_library_note_visibility` junction.

Every student-side read path (RLS policies and query helpers) calls
this single function — one truth.

Folders and shelves use the same helper transitively — a folder is
visible to a student if any note in it is; same for shelves. The
"empty container hiding" on the student side is implemented as
filtering folders/shelves whose `COUNT(visible notes) = 0` out of
the sidebar query.

---

## Build size estimate

Realistic: **6–8 weeks of focused work** for v1 (revised after the
editor side was fully specified — 12 block types including extensible
Drug card + Lab values, dedicated embed-answers table, end-to-end
read-mode renderer).

| Stage | Size |
|---|---|
| Schema + RLS — 9 tables + `nclex_pillar` domain + visibility helper function + same-tutor / deferred-row triggers + `nclex_extract_body_text` helper + `body_tsv` generated column + GIN indexes | ~1.5 weeks |
| Library list + 5-lens sidebar (with collapse-to-rail) + folder/shelf management + Tags lens + All-folders / All-shelves zoomed-out views | ~5 days |
| NCLEX pillars — multi-select chip input + sidebar entries + filter chips + per-note lens-row chips | ~3 days |
| Tiptap editor scaffold — starter-kit + slash command + `+` button + drag handle + always-visible toolbar + autosave + `version_id` guard + BroadcastChannel presence + propagation warning | ~1 week |
| Standard blocks (8) — Heading / Paragraph / List / Quote / Image / PDF / Video / Table + media-upload pipeline + publish-time alt-text preflight | ~1 week |
| NCLEX domain blocks (3) — Callout (5 tones) + Drug card (extensible fields) + Lab values (extensible columns) | ~1 week |
| Embedded-questions block — multi-select picker (tutor bank only) + 1..N `item_ids[]` + per-block 5/10 caps + per-note 20/50 caps + reference-card edit-mode rendering + inline player read-mode rendering + per-question snapshot writes to `nclex_library_embed_answers` | ~1 week |
| Programme integration — Library Note + Shelf as atomic activities, attach modal, shelf-picker modal (with mixed-visibility attach-time dialog), grouped block render via shelf-membership join, "Hide in this unit" via `skipped_note_ids`, used-in count | ~1.5 weeks |
| Student read-mode renderer — full-page route + Contents rail (scroll-spy + "section N of M" progress driven by `last_heading_id`) + per-block rendering + embedded-questions inline player + manual Mark as done writing to `nclex_library_note_state` (with write-through to progress engine) | ~1 week |
| Student library — same 5-lens sidebar with collapse-to-rail + visibility-filtered counts + empty-container hiding + system views (All notes / Recent / By unit / Bookmarked) | ~4 days |
| Tag manager + custom views — kebab on Tags section opens *Manage tags* (rename / delete / merge); custom-view save/edit/delete from toolbar; `nclex_tutor_library_views` writes | ~3 days |
| Search — `tsvector`-backed search input with chip-AND composition + `ts_rank` ordering | ~2 days |

Block editor is still the dominant unknown — the markdown-fallback
gate from the original plan still applies, and would compress the
"Standard blocks" + "NCLEX domain blocks" stages (~2 weeks of work)
into a markdown-textarea slice of a few days. The NCLEX-domain blocks
(Drug card, Lab values, Callout) would survive the fallback as
structured markdown patterns rather than typed React nodes.

---

## What's NOT in v1

Tracking deliberately deferred:

- **QAcademy-side library** — admin-authored notes for self-study
  bank students. Schema-parallel; can land later without redesign.
- **Nested folders** — flat two-level (Folder → Note) is enough.
- **Per-attachment content variants** — single-source-of-truth only.
- **Tutor-side analytics on embedded questions** — schema supports it
  (per-question_index rows in `nclex_library_embed_answers`); UI is
  v2+.
- **Revision history / draft-of-published edits** — edit-anytime
  goes live immediately.
- **Co-tutor (cross-tutor) edit conflict handling** — cross-tutor
  sharing isn't a v1 feature. (The `version_id` save guard already
  covers same-user-two-tabs; co-tutor co-editing reuses the same
  mechanism unchanged when sharing lands.)
- **Asset cleanup / orphan sweep** — v1 leaves orphan Storage
  objects untouched when a tutor deletes an image or PDF block. A
  future "Tutor Media" management surface (per-asset usage status +
  permanent-delete) puts cleanup authority with the tutor. Until
  then, orphans accumulate harmlessly — Storage is cheap at v1
  scale.
- **Per-pillar AND filter semantics** — pillar filter chips compose
  via OR in v1. AND-mode could be a power-user toggle later.
- **Student annotations / highlights / personal notes on tutor
  notes** — read-only on the student side in v1.
- **Comments / questions on notes** — no discussion surface.
- **Export / print / offline reading** — read in-browser only.
- **Cross-tutor sharing** — every tutor's library is private to them.

---

## Build order (when this gets queued)

Status legend: ✅ done · 🔨 in progress · ⏭ next · ⬜ pending. Slices
under top-level **11.x** (the canonical product slot per BUILD_LIST.md).

- ✅ **11.1a** Schema + RLS — 9 tables (`_folders`, `_shelves`,
  `_shelf_memberships`, `_notes`, `_note_visibility`,
  `_note_attachments`, `_note_state`, `_views`, `_embed_answers`)
  + `nclex_pillar` domain type + same-tutor invariant trigger on
  `_note_visibility` + deferred-row trigger on `_note_visibility`
  + `nclex_extract_body_text(body JSONB)` IMMUTABLE helper +
  `body_tsv` generated column on `_notes` + GIN indexes on
  `body_tsv` and `tags` + policies + `nclex_student_can_see_note`
  helper function. Migration
  `20260616120000_slice_11_1_tutor_library_schema.sql`. Committed
  `23c23e7`. ⚠️ Not yet applied to `mynclex-dev` — the dev MCP
  didn't come online; apply + smoke test is the first action of
  the next session.
- ✅ **11.1b** Library home shell — chrome only, no data. Route
  `/tutor/library`. Five-lens sidebar (Views, Folders, Shelves,
  Pillars, Tags) with per-section chevron collapse + whole-sidebar
  collapse-to-rail (`«` / `»` button, 48-px icon strip, localStorage
  persisted). System views + 8 pillar names render statically; data
  lenses show "no folders yet" / "no shelves yet" / "tags appear
  here" hints. Main pane empty-state hero with two disabled CTAs.
  Library entry in `TUTOR_GLOBAL_NAV` (icon `tutor`, between Bank
  and Quizzes). New `styles/library.css`. Committed `763872b`.
- ✅ **11.2** Folder CRUD + folder lens data + note CRUD. Shipped in
  two sub-slices:
  - ✅ **11.2a** (2026-05-26) — folder CRUD. Sidebar Folders lens
    renders real rows (real counts + "All folders" entry); main pane
    branches on `?folder=` URL state — empty/grid/per-folder/not-found.
    `+ New folder` wired through a name + description modal with
    inline validation (2..60 chars, dup check, length cap). The home
    shell is now a server-component-fed client component. Files in
    `lib/library/`: `types.ts`, `queries.ts`, `actions.ts`,
    `folder-rows.tsx`, `all-folders-grid.tsx`, `new-folder-modal.tsx`.
  - ✅ **11.2b** (2026-05-26) — note CRUD + editor route.
    `+ New note` wired through a title + folder + pillar multi-select
    modal; notes render in the per-folder lens-row list (title +
    subtitle + description-fallback + pillar chips + #tags + Draft/Pub
    pill); editor at `/tutor/library/note/[note_id]` with a
    CD-faithful three-zone layout (sticky toolbar with clickable
    breadcrumb + save badge + Save; main `1fr 240px` grid with
    inline meta row Folder/Pillars/Tags chips between text headers
    and the body textarea; right rail with Status / Outline /
    Embedded questions / Used in / Guards sections). Embedded-question
    count walks the persisted body JSONB (live-ready for 11.15);
    "Used in" count via PostgREST embed on
    `nclex_tutor_library_note_attachments` (live-ready for 11.11).
    `version_id` rotates on every save (forward-compat for the 11.5
    two-tabs guard). DiscardConfirm guards both breadcrumb-leave and
    browser-unload when dirty. Pillars are multi-select (popover
    with the 8 NCLEX domain values + short-form labels); tags are
    chip + free-text input with Enter / comma / Tab commit. Body is
    a single textarea over a single paragraph JSONB block — Tiptap
    rich editor lands in 11.5 with the same block shape preserved.
    Files in `lib/library/`: `format.ts`, `pillar-picker.tsx`,
    `folder-picker.tsx`, `tag-input.tsx`, `new-note-modal.tsx`,
    `notes-list.tsx`, `note-editor.tsx`, plus
    `app/(app)/tutor/library/note/[note_id]/page.tsx`.
- ✅ **11.3a** (2026-05-26) Shelf entity + sidebar lens. Migration
  `20260617120000_slice_11_3a_shelf_tagline.sql` adds `tagline TEXT
  NULL` so the carousel header (11.3b) and the shelf detail page
  (11.4) have separate copy. New `<ShelfRows>` lights up the
  Shelves lens with real rows (coloured 9px dot + title + count) +
  All shelves entry; hover-revealed kebab menu drives Edit /
  Delete. `<NewShelfModal>` is a unified create/edit modal with
  title + tagline + description + 8-swatch SHELF_PALETTE picker
  (smart default — first unused colour); CD-derived from the
  prototype's `NewShelfDialog`. `?shelf=` URL param wired in
  `page.tsx` (parallel folders + shelves fetch). 11.3a routes every
  `?shelf=…` URL to the All-shelves placeholder pane until 11.4
  ships shelf-detail; 11.3b replaces that placeholder with the real
  carousel. Files: `lib/library/{new-shelf-modal,shelf-rows}.tsx`
  new; `types.ts` / `queries.ts` / `actions.ts` / `home-shell.tsx`
  / `page.tsx` / `styles/library.css` updated.
- ✅ **11.3b** (2026-05-26) Spotify-style All Shelves carousel main
  pane + add-to-shelf flow + per-card remove. One section per shelf
  — coloured dot + clickable title (links to `?shelf=<id>` —
  destination lands in 11.4) + count + tagline (italic, right-
  aligned, truncates). Horizontal-scrolling row of note cards with
  the shelf's identity colour as a 3px left-edge accent bar; cards
  carry Pub/Draft pill + title (2-line clamp) + description-or-
  subtitle fallback (2-line clamp) + ≤2 pillar chips. Trailing
  dashed `+ Add to shelf` tile opens AddNotesToShelfModal —
  multi-select picker with search (title/subtitle/folder) + folder
  dropdown + Select all / Clear. Per-row: checkbox + title +
  subtitle + folder + "also on N shelves" badge + Pub/Draft pill.
  **Both DRAFT and PUBLISHED notes eligible** (revised from CD's
  PUBLISHED-only gate — shelves don't gate visibility; drafts on
  shelves are harmless and pre-organising is a real authoring
  workflow). Hover-revealed ✕ on each carousel card opens a
  reassuring confirm → `removeNoteFromShelfAction`. New reads:
  `getShelvesWithNotes()` (members embedded via PostgREST),
  `getEligibleNotesForShelf(shelfId)` (folder + other-shelf count
  joined). New actions: `attachNotesToShelfAction` (bulk),
  `removeNoteFromShelfAction` (single). `page.tsx` pre-fetches
  eligibles for every shelf in parallel when the shelf scope is
  active so the picker opens instantly. Files:
  `lib/library/{all-shelves-carousel,add-notes-to-shelf-modal}.tsx`
  new; types / queries / actions / home-shell / page /
  `styles/library.css` updated.
- ✅ **11.4 follow-on** (2026-05-26) Folder kebab + editor edit-cue.
  Folder rows gain the hover-revealed `⋮` + Edit / Delete menu
  pattern from `<ShelfRows>`. New `editFolderAction` + 
  `deleteFolderAction` (delete orphans notes to root via UPDATE-
  then-DELETE — body content, shelf memberships, programme
  attachments and visibility all kept; notes survive intact).
  `<NewFolderModal>` refactored to discriminated `{ mode }` union
  mirroring the shelf modal. Editor's title / subtitle /
  description inputs each wrapped in a `.lib-editor-editable`
  div with a hover- and focus-within-revealed `✎` icon + subtle
  accent tint, fixing the "looks like display text" UX gap for
  new tutors. Pencil has `pointer-events: none` so clicks fall
  through to the input. Files new: `delete-folder-confirm.tsx`;
  files modified: actions / new-folder-modal / folder-rows /
  home-shell / note-editor / `styles/library.css`.
- ✅ **11.4** (2026-05-26) Shelf scope — per-shelf detail view.
  `?shelf=<uuid>` activates as a real destination (the sidebar
  shelf rows route there now; `?shelf=all` still renders the
  carousel; unknown UUID → `<ShelfNotFound>`). New
  `<ShelfDetail>` pane: crumb (Library / Shelves / <title>) +
  title row with the identity dot + `Shelf · curated` lens
  badge + sub-line (count · tagline · description) + ordered
  numbered list. Each row carries the lens row (📁 folder ·
  📚 +N other-shelf badge · pillar chips · #tags) + Pub/Draft
  pill + a hover-revealed tool group (▲ / ▼ reorder + ✕
  remove) overlapping the right edge. Reorder ships as a
  swap-with-neighbour action; tool group disabled at boundaries.
  Empty state offers a + Add notes hero (reuses 11.3b's picker
  modal). New `getShelfDetail()` query (single round trip with
  nested PostgREST embed for folder + membership-count → derived
  `other_shelf_count = total - 1`). New `reorderShelfMemberAction()`
  (two UPDATEs, no UNIQUE on (shelf_id, position) so the swap
  writes directly). Files: `lib/library/{shelf-detail,
  remove-from-shelf-confirm}.tsx` new; the carousel and
  shelf-rows + page + home-shell + types + queries + actions +
  `styles/library.css` updated. Filter chips (pillar/tag) inside
  the shelf — deferred; most v1 shelves are small enough that
  the lens row carries the metadata, can land in a polish slice
  once a tutor with a big shelf asks.
- ⬜ **11.5** Tiptap editor scaffold — starter-kit (paragraph,
  heading, list, quote, marks) + slash command + `+` button +
  drag handle + always-visible toolbar + autosave + `version_id`
  save guard + `BroadcastChannel` two-tabs presence warning +
  edit-propagation warning. Ship with text-only blocks; verify
  the editor feel before adding custom nodes. **Provisional gate**
  — if the framework's going badly, fall back to markdown textarea
  and ship the rest of the library without rich blocks.
- ⬜ **11.6** Standard visual blocks — Image (Supabase Storage +
  on-demand signed URL pipeline + auto-resize) + PDF (link-card)
  + Video (YouTube/Vimeo/Loom embeds) + Table. Alt-text preflight
  wires into Publish (slice 11.10).
- ⬜ **11.7** NCLEX domain block — Callout (5 tones + icons).
- ⬜ **11.8** NCLEX domain block — Drug card (extensible field
  array, drag-reorder, add-field, remove-field; NCLEX-canonical
  4 fields pre-populated).
- ⬜ **11.9** NCLEX domain block — Lab values (extensible columns,
  column-add/rename/remove with deletion warning, row add/remove;
  NCLEX-canonical 4 columns pre-populated).
- ⬜ **11.10** Publish flow + visibility mode + status pills +
  alt-text preflight. Wire draft/published + tutor-wide /
  programme-scoped (multi-select picker writing to
  `_note_visibility`) end-to-end. Publish runs the alt-text
  preflight (refuses to publish if any image has empty `alt`,
  click-through scrolls to the first offender).
- ⬜ **11.11** Programme integration — Library Note path. Library
  Note as the 7th activity type, attach modal (single note),
  detach, used-in count.
- ⬜ **11.12** Programme integration — Shelf path (atomic activity).
  Shelf as the 8th activity type, shelf-picker modal,
  mixed-visibility attach-time dialog, **single-row atomic
  attachment** (CHECK ensures `note_id` XOR `shelf_id`), grouped
  block render via shelf-membership join, "Hide in this unit"
  kebab writing `note_id` into `skipped_note_ids JSONB`, "your
  tutor updated this shelf" hint on membership change.
- ⬜ **11.13** Student read-mode renderer — full-page route at
  `/student/programme/[programme_id]/library/note/[note_id]` +
  Contents rail + scroll-spy writing `last_heading_id` to
  `nclex_library_note_state` + per-block rendering + Mark as done
  (writes `marked_done_at` with write-through to the progress
  engine when from a Library Note activity) + Bookmark toggle
  (writes `bookmarked_at`). Embedded-questions block renders in
  answering mode (no submit yet — gated by 11.15).
- ⬜ **11.14** Student library — same five-lens sidebar (read-only
  adaptations) with collapse-to-rail, visibility-filtered counts,
  empty-container hiding, Views adapted (**By unit** + **Bookmarked**
  replace Drafts / Used nowhere). Wired at
  `/student/programme/[programme_id]/library/` and the cohort
  sibling. Sidebar entry added to `STUDENT_PROGRAMME_DETAIL_NAV`
  + `STUDENT_COHORT_DETAIL_NAV`.
- ⬜ **11.15** Embedded questions — full loop. Multi-select picker
  in editor (tutor bank only), per-block 5/10 caps, per-note
  20/50 caps (warn at 20, reject at 50, both at save), reference-
  card edit-mode rendering (one per question), inline player
  read-mode rendering (Question 1 of N + Next + end-of-set
  summary), submit → per-question write to
  `nclex_library_embed_answers` keyed `(student_id, note_id,
  block_id, question_index)` with snapshot, on-re-render show
  submitted state.
- ⬜ **11.16** Tag manager + custom views + search. Kebab on Tags
  lens opens *Manage tags* (rename / delete / merge); custom view
  save/edit/delete from toolbar; `tsvector`-backed search
  composing with chip filters via AND.
- ⬜ **11.17** Polish — used-in click-through, save dialogs, all the
  smaller affordances.

### Queued out-of-numbered-order slices (design-locked 2026-05-26)

Two near-term polish slices that touch the lens row + library
home directly. Settled with Sam mid-11.4 session — bumped ahead
of 11.5+ because they fix discoverability gaps a tutor hits in
their first 30 seconds with the library.

- ⬜ **Note-card consistency + editor "On shelves" rail (bundled).**
  Extract `<NoteLensRow>` as the single source of truth for every
  full-width note row (folder list, shelf detail, future All
  Notes / Drafts / Used nowhere views). Canonical fields:
  title + subtitle inline + description-or-body-excerpt fallback,
  meta line carrying 📁 folder · coloured shelf pip(s) · pillar
  chips · #tags, right column carrying Pub/Draft pill + ↳ used-in
  N pill + edited-relative-time. Folder chip always shown (slight
  redundancy in folder scope is fine). Shelf membership renders
  as one coloured dot per shelf carrying that shelf's identity
  colour + tooltip with title — not a `+N` count. Carousel keeps
  its compact card (horizontal scroll demands it). Editor right
  rail gains a read-only **On shelves** section (clickable pip +
  title → `?shelf=<id>`) — edit affordance stays on the
  shelf-side flows (carousel add-to-shelf, shelf-detail add). Both
  surfaces depend on the same `shelf_memberships(shelf_id, title,
  color)` projection on the note + the `used_in_count` rollup
  (already in `getNoteForEdit`; needs adding to the list query).
- ⬜ **Library Overview + system Views.** `/tutor/library` (no
  scope) becomes a dashboard rather than the EmptyState hero:
  stat cards (Total notes · Folders · Shelves · Drafts · Not yet
  in any programme unit) + Recent activity (last 5 edited) +
  Pillar coverage (horizontal bar per pillar showing relative
  count — surfaces gaps) + Quick links to each system view.
  `?view=<key>` wires three system views — **All notes**,
  **Drafts** (`is_published = false`), **Used nowhere** (zero
  programme attachments). **Recent** stays disabled until the
  `last_visited_at` visit-tracking infrastructure ships. View
  rows reuse `<NoteLensRow>` from the previous slice. Counts on
  each lens entry derived at query time.

### Deferred follow-ons (post-build)

- **Note deletion** — schema is ready
  (`_note_attachments.note_id` is `ON DELETE RESTRICT`;
  `_shelf_memberships.note_id` is `ON DELETE CASCADE`) but
  there's no UI or `deleteNoteAction` yet. Surfaced 2026-05-26
  during the 11.4 follow-on session. Shape when it lands: kebab
  on each note row in `<NotesList>` / `<ShelfDetail>` /
  `<NoteLensRow>` + a Delete entry in a future editor toolbar
  overflow menu + a `deleteNoteAction` that catches FK 23503 and
  surfaces "detach from N units first." Pairs naturally with the
  note-card-consistency slice (which is touching the same row
  components anyway) or with Publish (11.10).

---

## Cross-references — TODO

To be done as the **first step of the library build slice**, not
later. Three sibling planning docs + one student-nav file need
updating:

- **[main.md](main.md) — Programme Structure → Activity types.** Add
  **Library Note** as the 7th activity type AND **Shelf** as the 8th
  (8 types total). Document the **intent/lifecycle distinction**
  between Text / PDF / External Link / Library Note so the surface
  overlap (paragraph block vs library note, PDF block vs PDF
  activity) isn't mistaken for redundancy — Text = ephemeral
  unit-specific framing copy; PDF = external uploaded reference the
  tutor didn't author; External Link = off-platform URL; Library
  Note = tutor-authored, library-owned, reusable, classified.
- **[curriculum-authoring-ux.md](curriculum-authoring-ux.md) —
  Activity editors.** Add Library Note (7th) and Shelf (8th) editor
  rows in the table (Type / Fields columns). The editors are "pick
  from library" / "pick a shelf" not "edit inline." Document the
  **shelf attachment Option D model** (atomic activity, single
  attachment row, `skipped_note_ids JSONB` for per-unit hides,
  completion derives from `nclex_library_note_state.marked_done_at`)
  and the **mixed-visibility attach-time dialog** (three explicit
  options: attach anyway / widen visibility + attach / cancel).
- **`docs/product-plan/tutor-nav.html`** — programme sidebar gains a
  **Library** entry alongside Curriculum, Live Sessions, etc., for
  the tutor's quick access into their own library from inside a
  programme context.
- **`lib/nav/student.ts`** — student programme + cohort sidebars
  gain a **Library** entry between *Curriculum* and *Quizzes* in
  both `STUDENT_PROGRAMME_DETAIL_NAV` and `STUDENT_COHORT_DETAIL_NAV`.

Doing all four at the top of the build slice keeps the docs
honest — if the library ever slips out of v1 (the gate from step 5
above), revert these changes in one commit.

---

## Open questions deferred to build

Resolved during the 2026-05-16 sync:

- ~~Student library landing UX~~ → resolved: mirror tutor structure
  (same 5-lens sidebar, read-only adaptations, visibility-filtered
  counts).
- ~~Folder visibility model~~ → resolved: folders are not private;
  visibility lives on the note.
- ~~Shelf visibility model~~ → resolved: shelves have no visibility
  field; visibility is implicit from membership.
- ~~Pillars as lens vs metadata~~ → resolved: both. Sidebar lens for
  browsing + chip on every note row.
- ~~Block editor framework~~ → resolved: **Tiptap** (MIT,
  ProseMirror-based, React-first). Markdown-textarea fallback retained
  as build-time escape hatch.
- ~~Embedded-question snapshot policy~~ → resolved: snapshot at submit
  time, frozen to `nclex_library_embed_answers.snapshot_json`. Same
  conceptual pattern the runner uses for `nclex_attempt_items`.
- ~~Where embed answers live~~ → resolved: **separate table
  `nclex_library_embed_answers`**, not in `nclex_attempts`. Reasons:
  semantic fit (no session model forced), pollution-risk elimination
  (analytics queries never accidentally include embeds), lighter rows.
- ~~Embed source — tutor bank vs QAcademy bank~~ → resolved: **tutor's
  own bank only**. Editorial control + attribution clarity +
  cross-ownership deletion hygiene.
- ~~Drug card extensibility~~ → resolved: extensible from day one
  (no v1.5 migration). NCLEX-canonical 4 fields pre-populated.
- ~~Lab values extensibility~~ → resolved: extensible columns from
  day one. NCLEX-canonical 4 columns pre-populated.

Resolved during the 2026-05-24 gap-review pass (the working doc
that produced these decisions has been retired; see *Last updated*
at the top for the headline list):

- ~~Per-attachment reorder override for shelf-grouped notes~~ →
  resolved: no per-unit reorder. Atomic-activity attachments always
  render the shelf's master order; reordering happens on the shelf,
  propagating everywhere it's attached. The old "store
  `attachment.position` independently with a manual-move cue" idea
  is retired.
- ~~Skip-one-note from a shelf attachment~~ → resolved: shipped as
  the **"Hide in this unit"** kebab action writing into the shelf
  attachment row's `skipped_note_ids JSONB` array. The earlier "set
  `shelf_id = NULL` to break the link" mechanism is retired — there
  are no per-note rows to mutate under the atomic-activity model.
- ~~Visibility intersection conflict warning~~ → resolved: **attach-
  time dialog** when a shelf containing `PROGRAMME_SCOPED` notes is
  attached to a unit outside their visibility set, with three
  explicit choices (attach anyway / widen + attach / cancel). No
  permanent badge — the moment-of-decision interaction is enough.
- ~~Collapsible library sidebar~~ → resolved: ships in v1. `«` button
  collapses to a 48-px icon rail; state saved per-tutor in
  localStorage.
- ~~Concurrent-edit conflicts~~ → resolved for the same-tutor-two-
  tabs v1 case via `version_id` save guard + `BroadcastChannel`
  presence warning. Cross-tutor sharing isn't a v1 feature; when it
  lands, the same `version_id` guard carries through unchanged.
- ~~Multi-pillar per note~~ → resolved: multi-pillar from day 1
  (`pillars nclex_pillar[]`). No v1.5 migration.
- ~~Multi-programme visibility scope~~ → resolved: junction table
  (`nclex_tutor_library_note_visibility`) supports one-or-more
  programmes per PROGRAMME_SCOPED note. Same-tutor invariant
  enforced TS + SQL.
- ~~Custom views~~ → resolved: ship in v1 via `nclex_tutor_library_views`.
- ~~Tag-vocabulary drift~~ → resolved: tag manager (rename / delete
  / merge) ships in v1; `nclex_*` pre-seed dropped.
- ~~Search scope~~ → resolved: title + subtitle + description + body
  plain-text, backed by generated `tsvector` + GIN. Chip filters
  compose via AND.
- ~~Alt-text enforcement timing~~ → resolved: at publish only (not
  at insert or autosave).
- ~~Reading-progress / bookmark / completion storage~~ → resolved:
  one merged table `nclex_library_note_state`. Replaces three
  originally-separate tables.
- ~~Asset orphan cleanup~~ → deferred to a future Tutor Media
  surface (v1 leaves orphans).
- ~~Student "For this unit" view~~ → replaced with a static "By
  unit" index (multi-programme-safe, no "current unit" detection
  needed).
- ~~Student URL paths~~ → locked; programme/cohort-rooted, no global
  library route.
- ~~Multi-tutor student support~~ → resolved as a non-problem; the
  existing `/student/picker` → programme-scoped architecture
  already prevents the situation. No global library page; library
  is always programme-scoped on the student side.
- ~~Should Text + PDF activity types fold into Library Note?~~ →
  resolved: no. The eight types are distinct by **intent and
  lifecycle**, even though some share content shapes. Documented in
  `main.md` activity registry.
- ~~Embedded-question multi-question shape~~ → resolved: blocks hold
  1..N questions (`item_ids[]`), with per-block (5/10) and
  per-note (20/50) caps; inline player walks the set.
- ~~How required alt-text gets enforced~~ → resolved: publish-time
  preflight (drafts free, edits to existing images don't re-trigger).

Still open:

- **Lock-attached-shelf as snapshot** (v1.5) — for tutors who want
  "snapshot the shelf as it is today" rather than the auto-sync
  behaviour. The atomic-activity model handles auto-sync cleanly; a
  snapshot variant would mean a separate attachment kind (e.g.
  `shelf_snapshot_id` referencing a frozen point-in-time
  membership). Defer until a tutor asks.

---

## Related

- [main.md](main.md) — overall product plan; Programme Structure
  defines the activity-type registry this feature extends.
- [curriculum-authoring-ux.md](curriculum-authoring-ux.md) — the
  unit-builder UI this feature plugs into (loose-or-in-block
  attachment).
- [bank.md](bank.md) — the question bank that embedded-question
  blocks reference.
- [payments-and-enrolment.md](payments-and-enrolment.md) — the
  enrolment that grants student visibility to the library.
- `mynclex/CLAUDE.md` — stack, conventions, parallel-ownership
  pattern that this feature mirrors.
