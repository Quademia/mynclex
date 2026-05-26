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
 * Display projection for the per-folder notes list. Carries everything
 * the lens-row needs (title + subtitle + description + pillars + tags)
 * plus the timestamps for "edited X ago" copy when we add it.
 *
 * Excludes `body` + `body_tsv` so the list query doesn't drag JSONB
 * over the wire — list views never need the body text.
 */
export type LibraryNoteListRow = Pick<
  LibraryNote,
  | 'note_id'
  | 'folder_id'
  | 'title'
  | 'subtitle'
  | 'description'
  | 'tags'
  | 'pillars'
  | 'is_published'
  | 'visibility_mode'
  | 'updated_at'
>;

/**
 * Editor projection — `LibraryNote` plus the "Used in" rollup
 * counted off `nclex_tutor_library_note_attachments`. Always 0 in
 * 11.2b (no attachment UI yet); lights up as the count starts
 * incrementing when slice 11.11 ships note-as-activity attachment.
 *
 * Kept as a separate type so the strict per-row `LibraryNote` shape
 * isn't polluted with derived counts.
 */
export type LibraryNoteForEdit = LibraryNote & {
  used_in_count: number;
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
 */
export type LibraryNoteUpdateValues = {
  title: string;
  subtitle: string | null;
  description: string | null;
  body: unknown;
  pillars: NclexPillar[];
  tags: string[];
  folder_id: string | null;
};
