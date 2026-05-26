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
