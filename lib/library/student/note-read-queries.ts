// mynclex/lib/library/student/note-read-queries.ts
//
// Server read for the student note read-view (slice 11.13a). RLS does
// the gating: nclex_tutor_library_notes_student_select →
// nclex_student_can_see_note() returns the row only if the note is
// published AND the student is entitled (tutor-wide for an enrolled
// programme, or programme-scoped matching their enrolment). A note the
// student can't see → maybeSingle returns null → the route 404s.
//
// Per-student reading state (bookmark / done / resume position) lives
// in nclex_library_note_state, read here in the same call. No row yet =
// first visit (all-null defaults).

import { createClient } from '@/lib/supabase/server';
import { bodyToTiptap, type TiptapDoc } from '../body-tiptap';
import type { NclexPillar } from '../types';

export type StudentNoteReadState = {
  bookmarked: boolean;
  done: boolean;
  lastHeadingId: string | null;
};

export type StudentNoteRead = {
  note_id: string;
  title: string;
  subtitle: string | null;
  pillars: NclexPillar[];
  tags: string[];
  updated_at: string;
  body: TiptapDoc;
  readingMinutes: number;
  state: StudentNoteReadState;
};

// Walk the Tiptap doc collecting plain text, for the ~200-wpm reading
// estimate. Text lives on `text` nodes; we ignore atoms (image / pdf /
// embeds) — they aren't "reading," and counting their attrs would
// inflate the estimate.
function countWords(doc: TiptapDoc): number {
  let words = 0;
  const walk = (node: { type?: string; text?: string; content?: unknown }) => {
    if (typeof node.text === 'string') {
      const t = node.text.trim();
      if (t) words += t.split(/\s+/).length;
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child as { type?: string; text?: string; content?: unknown });
      }
    }
  };
  walk(doc);
  return words;
}

export async function getStudentNoteForRead(
  noteId: string,
): Promise<StudentNoteRead | null> {
  const supabase = await createClient();

  const { data: note, error } = await supabase
    .from('nclex_tutor_library_notes')
    .select('note_id, title, subtitle, pillars, tags, body, updated_at')
    .eq('note_id', noteId)
    .maybeSingle();

  if (error || !note) return null;

  const row = note as {
    note_id: string;
    title: string;
    subtitle: string | null;
    pillars: NclexPillar[];
    tags: string[];
    body: unknown;
    updated_at: string;
  };

  const body = bodyToTiptap(row.body);
  const words = countWords(body);
  const readingMinutes = Math.max(1, Math.round(words / 200));

  // Per-student state. RLS scopes to the caller's own row; no row yet =
  // first visit. Failures here are non-fatal — the note still reads.
  const { data: stateRow } = await supabase
    .from('nclex_library_note_state')
    .select('bookmarked_at, marked_done_at, last_heading_id')
    .eq('note_id', noteId)
    .maybeSingle();

  const s = stateRow as {
    bookmarked_at: string | null;
    marked_done_at: string | null;
    last_heading_id: string | null;
  } | null;

  return {
    note_id: row.note_id,
    title: row.title,
    subtitle: row.subtitle,
    pillars: row.pillars,
    tags: row.tags,
    updated_at: row.updated_at,
    body,
    readingMinutes,
    state: {
      bookmarked: s?.bookmarked_at != null,
      done: s?.marked_done_at != null,
      lastHeadingId: s?.last_heading_id ?? null,
    },
  };
}
