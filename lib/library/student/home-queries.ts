// mynclex/lib/library/student/home-queries.ts
//
// Server read for the student library "Study Home" (slice 11.14c — the
// study front door). Built ON TOP of the existing StudentLibrarySnapshot
// (queries.ts) so we never re-resolve the tutor or re-fetch the visible
// note set: the route fetches the snapshot, then hands it here.
//
// Everything maps to data that already exists — no migration:
//   • per-note state  → nclex_library_note_state (done / bookmark / visit /
//     resume position; slice 11.1 columns, written since 11.13a)
//   • practice stats  → nclex_library_embed_answers (append-only attempt
//     history; slice 11.13b)
//   • names           → nclex_users (forename / surname)
//
// The shell derives the recent + bookmarked lists (and the read/bookmark
// COUNTS) from `stateByNote` joined to snapshot.notes — this file only
// supplies what the snapshot can't: the per-student state map, the names,
// the practice aggregate, and the body-derived progress of the single
// "continue reading" note.

import { createClient } from '@/lib/supabase/server';
import { bodyToTiptap } from '../body-tiptap';
import type { StudentLibrarySnapshot } from './queries';

/** One row of the student's per-note reading state, keyed by note_id. */
export type StudentNoteState = {
  done: boolean;
  bookmarkedAt: string | null;
  lastVisitedAt: string | null;
  lastHeadingId: string | null;
};

/** Body-derived progress for the single "continue reading" note. */
export type ContinueProgress = {
  noteId: string;
  /** Heading text of the deepest section reached, or null (no headings). */
  sectionLabel: string | null;
  /** 1-based section index + total (headings). Both 0 when no headings. */
  sIndex: number;
  sTotal: number;
  /** 0–100, how far through the note's sections the student is. */
  pct: number;
  /** Whole minutes of reading left at ~200 wpm. */
  minsLeft: number;
};

export type StudentPracticeStats = {
  /** Distinct embedded questions the student has attempted. */
  questionsPractised: number;
  /** % correct across ALL attempts, or null if none yet. */
  accuracyPct: number | null;
};

export type StudentLibraryHome = {
  studentForename: string | null;
  tutorName: string | null;
  stateByNote: Record<string, StudentNoteState>;
  practice: StudentPracticeStats;
  continueProgress: ContinueProgress | null;
};

// Count words in a normalised Tiptap doc (text nodes only; atoms like
// images / embeds aren't "reading"). Mirrors note-read-queries.countWords.
function countWords(node: { text?: string; content?: unknown }): number {
  let words = 0;
  if (typeof node.text === 'string') {
    const t = node.text.trim();
    if (t) words += t.split(/\s+/).length;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      words += countWords(child as { text?: string; content?: unknown });
    }
  }
  return words;
}

// Top-level heading blocks, in document order. Ids are ordinal (`h-0`,
// `h-1`, …) to match read-blocks.extractHeadings — last_heading_id is
// stored in that same scheme, so its index parses straight out.
function topLevelHeadings(
  content: unknown,
): { text: string }[] {
  if (!Array.isArray(content)) return [];
  const out: { text: string }[] = [];
  for (const block of content) {
    const b = block as { type?: string; content?: { text?: string }[] };
    if (b.type === 'heading') {
      out.push({
        text: (b.content ?? []).map((n) => n.text ?? '').join(''),
      });
    }
  }
  return out;
}

/**
 * Build the Study Home payload for an already-resolved snapshot. Three
 * RLS-gated reads (state + names + practice) run in parallel; a fourth
 * (the continue note's body) only fires when there's a note to resume.
 */
export async function getStudentLibraryHomeData(
  snapshot: StudentLibrarySnapshot,
): Promise<StudentLibraryHome> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id ?? null;

  const visibleIds = snapshot.notes.map((n) => n.note_id);

  const [stateRes, usersRes, practiceRes] = await Promise.all([
    supabase
      .from('nclex_library_note_state')
      .select(
        'note_id, marked_done_at, bookmarked_at, last_visited_at, last_heading_id',
      ),
    uid
      ? supabase
          .from('nclex_users')
          .select('id, forename, surname')
          .in('id', [uid, snapshot.tutorId])
      : Promise.resolve({ data: [] as UserRow[] }),
    visibleIds.length
      ? supabase
          .from('nclex_library_embed_answers')
          .select('item_id, is_correct')
          .in('note_id', visibleIds)
      : Promise.resolve({ data: [] as PracticeRow[] }),
  ]);

  // ── State map (scoped to visible notes) ────────────────────────────
  const visibleSet = new Set(visibleIds);
  const stateByNote: Record<string, StudentNoteState> = {};
  for (const raw of (stateRes.data ?? []) as StateRow[]) {
    if (!visibleSet.has(raw.note_id)) continue;
    stateByNote[raw.note_id] = {
      done: raw.marked_done_at != null,
      bookmarkedAt: raw.bookmarked_at,
      lastVisitedAt: raw.last_visited_at,
      lastHeadingId: raw.last_heading_id,
    };
  }

  // ── Names ──────────────────────────────────────────────────────────
  const users = (usersRes.data ?? []) as UserRow[];
  const me = users.find((u) => u.id === uid);
  const tutor = users.find((u) => u.id === snapshot.tutorId);
  const studentForename = me?.forename?.trim() || null;
  const tutorName = tutor
    ? `${tutor.forename ?? ''} ${tutor.surname ?? ''}`.trim() || null
    : null;

  // ── Practice aggregate ─────────────────────────────────────────────
  const practiceRows = (practiceRes.data ?? []) as PracticeRow[];
  const distinctItems = new Set(practiceRows.map((r) => r.item_id));
  const correct = practiceRows.filter((r) => r.is_correct).length;
  const practice: StudentPracticeStats = {
    questionsPractised: distinctItems.size,
    accuracyPct: practiceRows.length
      ? Math.round((correct / practiceRows.length) * 100)
      : null,
  };

  // ── Continue reading — most-recent visited, not-done, still visible ─
  const continueProgress = await resolveContinue(supabase, stateByNote);

  return { studentForename, tutorName, stateByNote, practice, continueProgress };
}

async function resolveContinue(
  supabase: Awaited<ReturnType<typeof createClient>>,
  stateByNote: Record<string, StudentNoteState>,
): Promise<ContinueProgress | null> {
  const candidate = Object.entries(stateByNote)
    .filter(([, s]) => !s.done && s.lastVisitedAt != null)
    .sort(
      ([, a], [, b]) =>
        (b.lastVisitedAt ?? '').localeCompare(a.lastVisitedAt ?? ''),
    )[0];

  if (!candidate) return null;
  const [noteId, state] = candidate;

  const { data, error } = await supabase
    .from('nclex_tutor_library_notes')
    .select('body')
    .eq('note_id', noteId)
    .maybeSingle();
  if (error || !data) return null;

  const doc = bodyToTiptap((data as { body: unknown }).body);
  const headings = topLevelHeadings(doc.content);
  const sTotal = headings.length;

  // last_heading_id is `h-<ordinal>`; clamp to the heading set in case the
  // tutor removed sections since the visit.
  let sIndex = 0;
  if (state.lastHeadingId && state.lastHeadingId.startsWith('h-')) {
    const ord = Number(state.lastHeadingId.slice(2));
    if (Number.isFinite(ord)) sIndex = Math.min(ord + 1, sTotal);
  }
  const sectionLabel =
    sIndex > 0 && headings[sIndex - 1] ? headings[sIndex - 1].text || null : null;

  const pct = sTotal > 0 ? Math.round((sIndex / sTotal) * 100) : 0;
  const words = countWords(doc as { content?: unknown });
  const totalMins = Math.max(1, Math.round(words / 200));
  const minsLeft = Math.max(0, Math.round(totalMins * (1 - pct / 100)));

  return { noteId, sectionLabel, sIndex, sTotal, pct, minsLeft };
}

// ── Row shapes ────────────────────────────────────────────────────────
type StateRow = {
  note_id: string;
  marked_done_at: string | null;
  bookmarked_at: string | null;
  last_visited_at: string | null;
  last_heading_id: string | null;
};
type UserRow = { id: string; forename: string | null; surname: string | null };
type PracticeRow = { item_id: string; is_correct: boolean };
