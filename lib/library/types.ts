// mynclex/lib/library/types.ts
//
// Shapes for the tutor library. Slice 11.2a introduces folders;
// notes + their attendant types land in 11.2b.
//
// Source of truth: db/migrations/20260616120000_slice_11_1_*.sql
// applied to mynclex-dev 2026-05-26. Field names and nullability
// match the SQL exactly so the supabase-js return rows can be cast
// directly to these types.

/**
 * One row in `nclex_tutor_library_folders`. Flat — no nesting in v1.
 */
export type LibraryFolder = {
  folder_id: string;
  tutor_id: string;
  name: string;
  description: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

/**
 * Display projection for sidebar + grid rendering. Adds the per-
 * folder note count derived at query time so the UI doesn't have
 * to fetch notes just to label the row.
 *
 * `note_count` will always be 0 until slice 11.2b ships note CRUD;
 * the field is still computed so 11.2b becomes a query-side change
 * only — no shape ripple through the components.
 */
export type LibraryFolderWithCount = LibraryFolder & {
  note_count: number;
};

/**
 * Mutation input — the subset of folder fields the tutor edits.
 * Used by `createFolderAction` (and `editFolderAction` when rename
 * is added later).
 */
export type LibraryFolderFormValues = {
  name: string;
  description: string | null;
};

// =====================================================================
// Slice 11.2b — notes
// =====================================================================

/**
 * NCLEX-RN Client Needs sub-categories. Must match the `nclex_pillar`
 * domain exactly (CHECK constraint in the migration), so we keep the
 * canonical 8 names as a typed tuple at the TS layer too.
 */
export const NCLEX_PILLARS = [
  'Management of Care',
  'Safety and Infection Control',
  'Health Promotion and Maintenance',
  'Psychosocial Integrity',
  'Basic Care and Comfort',
  'Pharmacological and Parenteral Therapies',
  'Reduction of Risk Potential',
  'Physiological Adaptation',
] as const;

export type NclexPillar = (typeof NCLEX_PILLARS)[number];

/**
 * Visibility mode is set via the Publish flow (slice 11.10). Stored
 * on the note row from day 1 (default TUTOR_WIDE per the migration)
 * but not yet user-editable in 11.2b — kept here so server reads can
 * stay typed.
 */
export type LibraryVisibilityMode = 'TUTOR_WIDE' | 'PROGRAMME_SCOPED';

/**
 * One row in `nclex_tutor_library_notes`. Mirror of the migration's
 * column set with the JSONB body kept generic — block-shape lands
 * in slice 11.5. For 11.2b the body is stored as a single-element
 * array carrying the textarea's plain-text payload (see
 * `bodyToTextarea` / `textareaToBody` in note-editor.tsx).
 */
export type LibraryNote = {
  note_id: string;
  tutor_id: string;
  folder_id: string | null;          // NULL = root note
  title: string;
  subtitle: string | null;
  description: string | null;
  body: unknown;                     // JSONB; per-block typing ships in 11.5
  tags: string[];
  pillars: NclexPillar[];            // domain-constrained at DB layer
  version_id: string;                // save-conflict guard, used in 11.5
  position: number;
  is_published: boolean;
  visibility_mode: LibraryVisibilityMode;
  created_at: string;
  updated_at: string;
};

/**
 * Display projection for the per-folder notes list. Now an alias of
 * `LibraryNoteLensRow` — see that type below for the canonical
 * fields. Kept as a named export so existing call sites still type-
 * check.
 */
export type LibraryNoteListRow = LibraryNoteLensRow;

/**
 * Editor projection — `LibraryNote` plus the "Used in" rollup
 * counted off `nclex_tutor_library_note_attachments` and the
 * shelf-membership list (one pip per shelf, used by the
 * editor's "On shelves" rail section — slice 11.4 follow-on).
 * Always 0 / [] in 11.2b notes that haven't been attached or
 * shelved yet; lights up as the relevant slices ship.
 *
 * Kept as a separate type so the strict per-row `LibraryNote` shape
 * isn't polluted with derived counts.
 */
export type LibraryNoteForEdit = LibraryNote & {
  used_in_count: number;
  shelf_memberships: LibraryShelfPip[];
};

/**
 * Mutation input for the new-note modal (modal-first flow per the
 * 11.2b UX call). Title + folder_id + ≥1 pillar are all required at
 * the action layer; the modal-side validation also enforces them
 * before submit.
 */
export type LibraryNoteCreateValues = {
  title: string;
  folder_id: string | null;          // null = root note
  pillars: NclexPillar[];            // length >= 1
};

/**
 * Mutation input for the in-editor save. Carries every editable field
 * the v1 editor surfaces. The DB-level invariant of >= 1 pillar
 * survives because the same constraint is on the table; the action
 * also rechecks before UPDATE.
 *
 * `body` is `unknown` so the editor can ship its own textarea-shape
 * → JSONB transform without leaking that into the type layer.
 *
 * `expected_version_id` (slice 11.5) is the version the editor
 * loaded the note with. The action compares it against the row's
 * current `version_id` and rejects the save with a stale-conflict
 * error if they differ. Catches the same-tutor-two-tabs case
 * where one tab saves and the other is still working off the
 * older snapshot.
 */
export type LibraryNoteUpdateValues = {
  title: string;
  subtitle: string | null;
  description: string | null;
  body: unknown;
  pillars: NclexPillar[];
  tags: string[];
  folder_id: string | null;
  expected_version_id: string;
};

// =====================================================================
// Slice 11.3a — shelves
// =====================================================================

/**
 * The fixed 8-colour palette for shelf identity. The migration's
 * `color` column is `TEXT NOT NULL` (free hex), so the constraint is
 * application-level only — the New Shelf modal picks one of these
 * eight and the smart default cycles through whichever colour isn't
 * already used by an existing shelf.
 *
 * Source: the Claude Design `tutor-library/note-editor.jsx`
 * SHELF_PALETTE constant from the 2026-05-26 handoff. Matches the
 * 5 colours already in the CD seed data + 3 coordinated extras.
 */
export const SHELF_PALETTE = [
  { color: '#2d7d72', name: 'Teal' },
  { color: '#c97a16', name: 'Amber' },
  { color: '#2d6fc0', name: 'Blue' },
  { color: '#6a55c7', name: 'Purple' },
  { color: '#c43e3e', name: 'Red' },
  { color: '#1f8a5b', name: 'Green' },
  { color: '#a25e83', name: 'Plum' },
  { color: '#4a6fa5', name: 'Slate' },
] as const;

export type ShelfColor = (typeof SHELF_PALETTE)[number]['color'];

/**
 * One row in `nclex_tutor_library_shelves`. Mirror of the migration
 * column set including the new `tagline TEXT NULL` added by slice
 * 11.3a's migration (`20260617120000_slice_11_3a_shelf_tagline.sql`).
 *
 * Two descriptive fields side-by-side:
 *   • tagline     — short, carousel-header one-liner
 *   • description — longer copy for the shelf detail page (slice 11.4)
 *
 * Both nullable. New shelves can ship without either; the UI degrades
 * by hiding the corresponding span.
 */
export type LibraryShelf = {
  shelf_id: string;
  tutor_id: string;
  title: string;
  tagline: string | null;
  description: string | null;
  color: string; // hex string, app-validated against SHELF_PALETTE
  position: number;
  created_at: string;
  updated_at: string;
};

/**
 * Display projection for sidebar lens rows + the All Shelves
 * carousel. Adds the per-shelf note count derived at query time via
 * a PostgREST `nclex_tutor_library_shelf_memberships(count)` join,
 * mirroring the folder pattern in slice 11.2a.
 *
 * 11.3a's UI surfaces — the Shelves sidebar lens and the placeholder
 * routing — only need this count. 11.3b's All Shelves carousel will
 * need the actual member-note rows; it gets a separate richer
 * projection at that slice.
 */
export type LibraryShelfWithCount = LibraryShelf & {
  note_count: number;
};

/**
 * Mutation input shared by `createShelfAction` + `editShelfAction`.
 * All four fields are user-controlled in the New Shelf modal:
 *   • title is required (>= 2 chars, <= 60 chars, dup-checked)
 *   • tagline + description are optional, capped on length only
 *   • color must be one of SHELF_PALETTE (app-layer enum, not DB)
 *
 * Used by the modal's submit handler and the server action; the
 * action revalidates everything before the INSERT/UPDATE.
 */
export type LibraryShelfFormValues = {
  title: string;
  tagline: string | null;
  description: string | null;
  color: string;
};

// =====================================================================
// Slice 11.3b — shelf carousels + add-to-shelf
// =====================================================================

/**
 * Thin per-note projection rendered in the All Shelves carousel
 * cards. Carries everything the card needs: title + subtitle +
 * description (or a body-excerpt fallback in a later slice), the
 * first 2 pillars for the chip-row, and the publish flag for the
 * Pub/Draft pill at the head of the card.
 *
 * Deliberately excludes body / body_tsv / tags — the carousel
 * card doesn't render them, and `body_tsv` is heavy.
 */
export type LibraryShelfCardNote = {
  note_id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  pillars: NclexPillar[];
  is_published: boolean;
  updated_at: string;
};

/**
 * Per-shelf projection for the All Shelves carousel — extends the
 * sidebar's LibraryShelfWithCount with the actual note rows
 * embedded for the horizontal card strip. One row per shelf, with
 * `notes` ordered by the membership table's `position` (curator's
 * within-shelf order).
 *
 * Membership rows are joined via PostgREST embed; the carousel
 * renders the resulting `notes` array directly.
 */
export type LibraryShelfWithNotes = LibraryShelfWithCount & {
  notes: LibraryShelfCardNote[];
};

/**
 * Eligible-notes row for the AddNotesToShelfDialog picker. Per the
 * 11.3b scope decision the dialog shows BOTH draft and published
 * notes — shelves don't gate visibility, so a draft on a shelf is
 * harmless. The status pill lets the tutor see which is which.
 *
 * `folder_name` is computed at query time (LEFT JOIN to folders)
 * so the picker's "Folder · {name}" meta line doesn't need a
 * second round trip; `other_shelf_count` is the number of OTHER
 * shelves this note is already on (powers the "also on N shelf"
 * badge).
 */
export type LibraryEligibleNote = {
  note_id: string;
  title: string;
  subtitle: string | null;
  folder_id: string | null;
  folder_name: string | null; // null = root
  pillars: NclexPillar[];
  is_published: boolean;
  other_shelf_count: number;
};

// =====================================================================
// Slice 11.4 — shelf detail (single-shelf scope)
// =====================================================================

/**
 * Per-shelf detail row — the shared `LibraryNoteLensRow` shape
 * plus the membership's `position` so the reorder action can
 * compute neighbours without a second round trip.
 */
export type LibraryShelfDetailNote = LibraryNoteLensRow & {
  position: number; // membership.position
};

/**
 * One-shelf-with-its-notes projection — feeds the ShelfDetail
 * main pane. Same surface area as the shelf row + an ordered
 * note list (sorted by `membership.position`). `note_count`
 * is `notes.length` (cheap; kept for parity with the lean
 * `LibraryShelfWithCount` shape).
 */
export type LibraryShelfDetail = LibraryShelf & {
  notes: LibraryShelfDetailNote[];
  note_count: number;
};


// =====================================================================
// Slice 11.4 follow-on — shared note-lens-row shape (P3 + P4 bundle)
// =====================================================================

/**
 * Thin per-shelf reference rendered as a coloured pip inside a
 * note's lens row + inside the editor's "On shelves" rail
 * section. The note may sit on 0..N shelves; each one carries
 * its identity colour so the pip cluster doubles as a visual
 * signal of where the note appears.
 */
export type LibraryShelfPip = {
  shelf_id: string;
  title: string;
  color: string; // hex; app-validated against SHELF_PALETTE
};

/**
 * Canonical lens-row projection used by every full-width note
 * context (folder list, shelf detail, future All Notes / Drafts
 * / Used nowhere / custom views). Replaces the ad-hoc shapes the
 * earlier slices were each defining.
 *
 * Field set per the planning doc lens-row spec:
 *   • title + subtitle + description-or-body-excerpt fallback
 *   • inline meta — folder name + shelf pips + pillars + tags
 *   • right column — is_published + used_in_count + updated_at
 *
 * `shelf_memberships` lists every shelf the note is on (in
 * arbitrary order); the row component can optionally filter out
 * a `currentShelfId` so shelf-detail rows don't repeat the
 * page-scope shelf's pip.
 *
 * Excludes `body` + `body_tsv` so list queries don't drag JSONB
 * over the wire.
 */
export type LibraryNoteLensRow = {
  note_id: string;
  folder_id: string | null;
  folder_name: string | null; // null = root
  title: string;
  subtitle: string | null;
  description: string | null;
  pillars: NclexPillar[];
  tags: string[];
  shelf_memberships: LibraryShelfPip[];
  is_published: boolean;
  visibility_mode: LibraryVisibilityMode;
  updated_at: string;
  used_in_count: number;
};


// =====================================================================
// Slice 11.4 follow-on (P2) — Library Overview + system Views
// =====================================================================

/**
 * Identifier for each system view in the Views lens. Three are
 * wired in v1; `Recent` stays disabled until visit-tracking
 * infrastructure (`last_visited_at` on the note-state table) is
 * populated by a future slice.
 */
export type LibraryViewKey = 'all-notes' | 'drafts' | 'used-nowhere';

/**
 * Counts powering the sidebar Views lens entries. Always 0 when
 * the tutor has no notes yet.
 */
export type LibraryViewCounts = {
  all: number;
  drafts: number;
  used_nowhere: number;
};

/**
 * Data feeding the Overview dashboard at `/tutor/library` (no
 * scope). Five stat cards + a Recent activity list (last 5 by
 * `updated_at`) + an 8-row Pillar coverage breakdown.
 */
export type LibraryOverviewStats = {
  total_notes: number;
  folders: number;
  shelves: number;
  drafts: number;
  used_nowhere: number;
  pillar_counts: Record<NclexPillar, number>;
  recent: LibraryNoteLensRow[];
};
