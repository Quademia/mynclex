// mynclex/lib/library/actions.ts
//
// Server actions for the tutor library (slice 11.2a — folders).
// RLS enforces tutor ownership on INSERT via
// `nclex_tutor_library_folders_self_insert` (tutor_id = auth.uid()).
// The action layer adds an auth check + input validation + name
// uniqueness so the UX-friendly error surfaces before the DB.
//
// Slice 11.2b extends this with note actions.

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  NCLEX_PILLARS,
  type LibraryFolderFormValues,
  type LibraryNoteCreateValues,
  type LibraryNoteUpdateValues,
  type NclexPillar,
} from './types';

export type CreateFolderResult =
  | { ok: true; folder_id: string }
  | { ok: false; error: string };

// Mirror the CD prototype's input constraints: 2..60 chars, trimmed,
// no duplicate names within the tutor's library.
const NAME_MIN = 2;
const NAME_MAX = 60;

function validate(input: LibraryFolderFormValues): string | null {
  const trimmed = input.name.trim();
  if (trimmed.length < NAME_MIN) {
    return `Folder name must be at least ${NAME_MIN} characters.`;
  }
  if (trimmed.length > NAME_MAX) {
    return `Folder name must be ${NAME_MAX} characters or fewer.`;
  }
  if (input.description != null && input.description.length > 280) {
    return 'Description must be 280 characters or fewer.';
  }
  return null;
}

/**
 * Create a folder owned by the signed-in tutor. Returns the new
 * folder_id on success. Errors come back as a discriminated-union
 * `{ ok: false, error }` so the calling client can render them
 * inline + via ErrorToast.
 *
 * `position` is set to current folder count so new folders land at
 * the tail of the tutor's existing order.
 */
export async function createFolderAction(
  input: LibraryFolderFormValues
): Promise<CreateFolderResult> {
  const validationError = validate(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const name = input.name.trim();
  const description =
    input.description != null && input.description.trim().length > 0
      ? input.description.trim()
      : null;

  // Case-insensitive uniqueness check before insert. The DB doesn't
  // enforce this (no unique index on (tutor_id, lower(name))) — it's
  // a UX-friendly app-layer gate so the tutor gets a specific
  // message rather than a generic constraint error. Race condition
  // window is microseconds; if a duplicate slips through we just
  // accept the two rows (extremely unlikely in single-user flow).
  const { data: existing } = await supabase
    .from('nclex_tutor_library_folders')
    .select('folder_id, name')
    .ilike('name', name);
  if (existing && existing.length > 0) {
    return { ok: false, error: `A folder named "${name}" already exists.` };
  }

  // Position = current count, so new folders go to the tail.
  const { count } = await supabase
    .from('nclex_tutor_library_folders')
    .select('folder_id', { count: 'exact', head: true });
  const position = count ?? 0;

  const { data, error } = await supabase
    .from('nclex_tutor_library_folders')
    .insert({
      tutor_id: user.id,
      name,
      description,
      position,
    })
    .select('folder_id')
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? 'Failed to create folder.',
    };
  }

  revalidatePath('/tutor/library');
  return { ok: true, folder_id: data.folder_id };
}


// =====================================================================
// Slice 11.2b — notes
// =====================================================================

// Mirror the migration's CHECK constraint. The 8 NCLEX-RN Client Needs
// sub-categories are a closed set; the action rejects anything outside.
const PILLAR_SET = new Set<string>(NCLEX_PILLARS);

const TITLE_MIN = 2;
const TITLE_MAX = 120;
const SUBTITLE_MAX = 200;
const DESC_MAX = 280;
const TAG_MAX_LEN = 40;
const TAGS_MAX = 16;

function validatePillars(pillars: NclexPillar[]): string | null {
  if (!Array.isArray(pillars) || pillars.length < 1) {
    return 'Pick at least one NCLEX pillar.';
  }
  for (const p of pillars) {
    if (!PILLAR_SET.has(p)) {
      return `"${p}" is not a recognised NCLEX pillar.`;
    }
  }
  // Reject duplicates — the DB doesn't enforce uniqueness across array
  // elements, but a doubled pillar is a UX error not a real intent.
  if (new Set(pillars).size !== pillars.length) {
    return 'A pillar can only be added once.';
  }
  return null;
}

function validateTags(tags: string[]): string | null {
  if (!Array.isArray(tags)) return 'Tags must be a list.';
  if (tags.length > TAGS_MAX) {
    return `A note can have at most ${TAGS_MAX} tags.`;
  }
  for (const t of tags) {
    if (typeof t !== 'string') return 'Each tag must be text.';
    if (t.length === 0) return 'Empty tags are not allowed.';
    if (t.length > TAG_MAX_LEN) {
      return `Tags must be ${TAG_MAX_LEN} characters or fewer.`;
    }
  }
  if (new Set(tags).size !== tags.length) {
    return 'Duplicate tags are not allowed.';
  }
  return null;
}

function validateCreate(input: LibraryNoteCreateValues): string | null {
  const trimmed = input.title.trim();
  if (trimmed.length < TITLE_MIN) {
    return `Title must be at least ${TITLE_MIN} characters.`;
  }
  if (trimmed.length > TITLE_MAX) {
    return `Title must be ${TITLE_MAX} characters or fewer.`;
  }
  const pillarErr = validatePillars(input.pillars);
  if (pillarErr) return pillarErr;
  return null;
}

function validateUpdate(input: LibraryNoteUpdateValues): string | null {
  const trimmed = input.title.trim();
  if (trimmed.length < TITLE_MIN) {
    return `Title must be at least ${TITLE_MIN} characters.`;
  }
  if (trimmed.length > TITLE_MAX) {
    return `Title must be ${TITLE_MAX} characters or fewer.`;
  }
  if (input.subtitle != null && input.subtitle.length > SUBTITLE_MAX) {
    return `Subtitle must be ${SUBTITLE_MAX} characters or fewer.`;
  }
  if (input.description != null && input.description.length > DESC_MAX) {
    return `Description must be ${DESC_MAX} characters or fewer.`;
  }
  const pillarErr = validatePillars(input.pillars);
  if (pillarErr) return pillarErr;
  const tagErr = validateTags(input.tags);
  if (tagErr) return tagErr;
  return null;
}

export type CreateNoteResult =
  | { ok: true; note_id: string }
  | { ok: false; error: string };

/**
 * Create a draft note owned by the signed-in tutor. Body starts
 * empty (single placeholder paragraph block); the editor route
 * shows a textarea over it until the rich editor ships in 11.5.
 *
 * `version_id` is auto-generated by the table default. `position`
 * is set to the current note count within the folder so new notes
 * land at the tail.
 */
export async function createNoteAction(
  input: LibraryNoteCreateValues,
): Promise<CreateNoteResult> {
  const validationError = validateCreate(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Verify the folder (if specified) belongs to this tutor. RLS would
  // catch the cross-tutor case at INSERT time via the deferred
  // visibility trigger, but a clean app-layer check gives a UX-friendly
  // error and avoids the DB-error surface.
  if (input.folder_id) {
    const { data: folder } = await supabase
      .from('nclex_tutor_library_folders')
      .select('folder_id')
      .eq('folder_id', input.folder_id)
      .maybeSingle();
    if (!folder) {
      return {
        ok: false,
        error: 'That folder no longer exists. Refresh and try again.',
      };
    }
  }

  // Position = current count within the same folder (or root).
  let countQuery = supabase
    .from('nclex_tutor_library_notes')
    .select('note_id', { count: 'exact', head: true });
  countQuery =
    input.folder_id == null
      ? countQuery.is('folder_id', null)
      : countQuery.eq('folder_id', input.folder_id);
  const { count } = await countQuery;
  const position = count ?? 0;

  // Empty body — single placeholder paragraph block. The shape mirrors
  // what the eventual block editor (slice 11.5) will produce; 11.2b's
  // textarea path reads/writes this same field via a helper in
  // note-editor.tsx that flattens the array to/from plain text.
  const emptyBody = [
    { id: `b_${Math.random().toString(36).slice(2, 10)}`, type: 'paragraph', content: [{ text: '' }] },
  ];

  const { data, error } = await supabase
    .from('nclex_tutor_library_notes')
    .insert({
      tutor_id: user.id,
      folder_id: input.folder_id,
      title: input.title.trim(),
      pillars: input.pillars,
      body: emptyBody,
      position,
      // tags, subtitle, description, is_published, visibility_mode all
      // default to their migration values.
    })
    .select('note_id')
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? 'Failed to create note.',
    };
  }

  // Library home + the source folder both surface the new note.
  revalidatePath('/tutor/library');
  return { ok: true, note_id: data.note_id };
}


export type UpdateNoteResult =
  | { ok: true; version_id: string }
  | { ok: false; error: string };

/**
 * Save the in-editor form. Rotates `version_id` on every successful
 * save — used by the two-tabs save-conflict guard in slice 11.5.
 * For 11.2b the UI doesn't yet send the previous version_id (the
 * editor is single-tab from the user's perspective), so the rotate
 * is forward-compat scaffolding.
 *
 * `updated_at` is set explicitly so the lens-row "edited X ago" copy
 * is accurate the moment Save returns.
 */
export async function updateNoteAction(
  noteId: string,
  input: LibraryNoteUpdateValues,
): Promise<UpdateNoteResult> {
  const validationError = validateUpdate(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Same folder-ownership cross-check as create — guards against the
  // tutor moving a note into a folder they no longer own / never owned.
  if (input.folder_id) {
    const { data: folder } = await supabase
      .from('nclex_tutor_library_folders')
      .select('folder_id')
      .eq('folder_id', input.folder_id)
      .maybeSingle();
    if (!folder) {
      return {
        ok: false,
        error: 'That folder no longer exists. Refresh and try again.',
      };
    }
  }

  // Generate a fresh version_id (cheap UUID — crypto.randomUUID is
  // available in the Node runtime that Server Actions execute under).
  const nextVersionId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('nclex_tutor_library_notes')
    .update({
      title: input.title.trim(),
      subtitle: input.subtitle?.trim() || null,
      description: input.description?.trim() || null,
      body: input.body,
      pillars: input.pillars,
      tags: input.tags,
      folder_id: input.folder_id,
      version_id: nextVersionId,
      updated_at: nowIso,
    })
    .eq('note_id', noteId)
    .select('note_id, version_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: 'Note not found, or not yours to edit.',
    };
  }

  revalidatePath('/tutor/library');
  revalidatePath(`/tutor/library/note/${noteId}`);
  return { ok: true, version_id: data.version_id };
}
