// mynclex/lib/programme-quizzes/queries.ts
//
// Server-side fetches for the programme Quizzes surface (Tutor
// Quiz Slice 5). RLS on nclex_programme_quizzes scopes the read to
// the signed-in tutor's own programmes (FOR ALL through programme
// ownership). All three queries are tutor-side; the student
// counterparts ship in Slice 6.

import { createClient } from '@/lib/supabase/server';
import type {
  BlockingActivity,
  PickerQuizRow,
  ProgrammeQuizRow,
  ProgrammeQuizSourceHint,
} from './types';
import type {
  QuizKind,
  QuizMode,
  QuizStatus,
} from '@/lib/tutor-quiz/types';
import type { UnitLabel } from '@/lib/programmes/types';

// =========================================================
// getProgrammeQuizzes
// =========================================================
// Lists every quiz attached to this programme via the junction.
// Each row carries the joined quiz metadata + item count + a
// derived "Linked to Unit N" / null source hint.
//
// Source hint derivation: a separate fetch of every MOCK /
// PRACTICE_QUIZ activity in this programme that has a non-null
// quiz_id in its payload. We pick the FIRST activity (by lowest
// unit_index, then lowest ordinal) per quiz_id — there can be
// more than one activity in a programme pointing at the same
// quiz; the hint shows the primary placement. Returns [] on
// error.

type ProgrammeActivityHint = {
  quiz_id: string;
  unit_index: number;
  ordinal: number;
  unit_title: string;
  unit_label: UnitLabel;
};

async function loadActivityHints(
  programmeId: string,
): Promise<Map<string, ProgrammeQuizSourceHint>> {
  const supabase = await createClient();

  // Pull every quiz-activity in this programme. The set is small
  // (a programme has at most a few dozen quiz activities), so
  // building the hint map in JS is cheaper than a PostgREST
  // payload-JSON filter chain. RLS on _activities + _units +
  // _programmes scopes this to the tutor's own programme.
  const { data, error } = await supabase
    .from('nclex_programme_activities')
    .select(
      `activity_id, ordinal, payload, type,
       nclex_programme_units!inner(
         programme_id, unit_index, title,
         nclex_programmes!inner(unit_label)
       )`,
    )
    .in('type', ['MOCK', 'PRACTICE_QUIZ'])
    .eq('nclex_programme_units.programme_id', programmeId);

  if (error || !data) return new Map();

  const hints: ProgrammeActivityHint[] = [];
  for (const row of data as Array<{
    activity_id: string;
    ordinal: number;
    payload: { quiz_id?: string | null } | null;
    type: 'MOCK' | 'PRACTICE_QUIZ';
    nclex_programme_units:
      | {
          programme_id: string;
          unit_index: number;
          title: string;
          nclex_programmes:
            | { unit_label: UnitLabel }
            | Array<{ unit_label: UnitLabel }>;
        }
      | Array<{
          programme_id: string;
          unit_index: number;
          title: string;
          nclex_programmes:
            | { unit_label: UnitLabel }
            | Array<{ unit_label: UnitLabel }>;
        }>;
  }>) {
    const quizId = row.payload?.quiz_id;
    if (!quizId) continue;
    const unitRow = Array.isArray(row.nclex_programme_units)
      ? row.nclex_programme_units[0]
      : row.nclex_programme_units;
    if (!unitRow) continue;
    const programmeRow = Array.isArray(unitRow.nclex_programmes)
      ? unitRow.nclex_programmes[0]
      : unitRow.nclex_programmes;
    hints.push({
      quiz_id: quizId,
      unit_index: unitRow.unit_index,
      ordinal: row.ordinal,
      unit_title: unitRow.title,
      unit_label: programmeRow?.unit_label ?? 'WEEK',
    });
  }

  // Sort by (unit_index ASC, ordinal ASC) so the primary
  // placement per quiz is the first row.
  hints.sort(
    (a, b) =>
      a.unit_index - b.unit_index || a.ordinal - b.ordinal,
  );

  const out = new Map<string, ProgrammeQuizSourceHint>();
  for (const h of hints) {
    if (out.has(h.quiz_id)) continue; // keep the first (primary)
    out.set(h.quiz_id, {
      unit_index: h.unit_index,
      unit_label: h.unit_label,
      unit_title: h.unit_title,
    });
  }
  return out;
}

export async function getProgrammeQuizzes(
  programmeId: string,
): Promise<ProgrammeQuizRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_programme_quizzes')
    .select(
      `added_at, quiz_id,
       nclex_tutor_quizzes!inner(
         quiz_id, title, description, quiz_kind, mode,
         duration_seconds, pass_score, max_attempts, status,
         nclex_tutor_quiz_items(count)
       )`,
    )
    .eq('programme_id', programmeId)
    .order('added_at', { ascending: false });

  if (error || !data) return [];

  const hints = await loadActivityHints(programmeId);

  return data.flatMap((row) => {
    const raw = row as typeof row & {
      nclex_tutor_quizzes:
        | {
            quiz_id: string;
            title: string;
            description: string | null;
            quiz_kind: QuizKind;
            mode: QuizMode;
            duration_seconds: number | null;
            pass_score: number | null;
            max_attempts: number | null;
            status: QuizStatus;
            nclex_tutor_quiz_items: Array<{ count: number }> | null;
          }
        | Array<{
            quiz_id: string;
            title: string;
            description: string | null;
            quiz_kind: QuizKind;
            mode: QuizMode;
            duration_seconds: number | null;
            pass_score: number | null;
            max_attempts: number | null;
            status: QuizStatus;
            nclex_tutor_quiz_items: Array<{ count: number }> | null;
          }>
        | null;
    };
    const q = Array.isArray(raw.nclex_tutor_quizzes)
      ? raw.nclex_tutor_quizzes[0]
      : raw.nclex_tutor_quizzes;
    if (!q) return [];
    return [
      {
        quiz_id: q.quiz_id,
        title: q.title,
        description: q.description,
        quiz_kind: q.quiz_kind,
        mode: q.mode,
        duration_seconds: q.duration_seconds,
        pass_score: q.pass_score,
        max_attempts: q.max_attempts,
        status: q.status,
        item_count: q.nclex_tutor_quiz_items?.[0]?.count ?? 0,
        added_at: raw.added_at,
        source_hint: hints.get(q.quiz_id) ?? null,
      } satisfies ProgrammeQuizRow,
    ];
  });
}

// =========================================================
// getEligiblePickerQuizzes
// =========================================================
// "Add existing" picker — the tutor's own PUBLISHED quizzes that
// are NOT already attached to this programme. Empty set is the
// "all attached" empty-state for the picker UI. Picker is
// hard-scoped to PUBLISHED per §9.4.1: drafts are mid-authoring,
// pulling one in risks accidental student exposure once the
// programme is published.

export async function getEligiblePickerQuizzes(
  programmeId: string,
): Promise<PickerQuizRow[]> {
  const supabase = await createClient();

  // Already-attached set — used to subtract from the eligible
  // list. RLS scopes this to the caller's own programme.
  const { data: attachedData } = await supabase
    .from('nclex_programme_quizzes')
    .select('quiz_id')
    .eq('programme_id', programmeId);
  const attachedIds = new Set(
    (attachedData ?? []).map((r) => r.quiz_id),
  );

  // The tutor's own PUBLISHED quizzes. RLS on nclex_tutor_quizzes
  // already scopes to tutor_id = auth.uid().
  const { data, error } = await supabase
    .from('nclex_tutor_quizzes')
    .select(
      `quiz_id, title, quiz_kind, mode, duration_seconds,
       nclex_tutor_quiz_items(count)`,
    )
    .eq('status', 'PUBLISHED')
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return data.flatMap((row) => {
    if (attachedIds.has(row.quiz_id)) return [];
    const raw = row as typeof row & {
      nclex_tutor_quiz_items: Array<{ count: number }> | null;
    };
    return [
      {
        quiz_id: raw.quiz_id,
        title: raw.title as string,
        quiz_kind: raw.quiz_kind as QuizKind,
        mode: raw.mode as QuizMode,
        duration_seconds: raw.duration_seconds as number | null,
        item_count: raw.nclex_tutor_quiz_items?.[0]?.count ?? 0,
      } satisfies PickerQuizRow,
    ];
  });
}

// =========================================================
// getBlockingActivities
// =========================================================
// The activities in THIS programme that still reference the quiz
// being removed. Drives the §9.3 block-remove rejection — non-
// empty list means "can't remove yet." Returns [] when the
// removal is unblocked.

export async function getBlockingActivities(
  programmeId: string,
  quizId: string,
): Promise<BlockingActivity[]> {
  const supabase = await createClient();

  // Same shape as loadActivityHints but narrower: filter to this
  // quiz, return the activity rows the tutor needs to unlink.
  const { data } = await supabase
    .from('nclex_programme_activities')
    .select(
      `activity_id, title, payload, ordinal,
       nclex_programme_units!inner(
         programme_id, unit_index, title,
         nclex_programmes!inner(unit_label)
       )`,
    )
    .in('type', ['MOCK', 'PRACTICE_QUIZ'])
    .eq('nclex_programme_units.programme_id', programmeId);

  if (!data) return [];

  const out: BlockingActivity[] = [];
  for (const row of data as Array<{
    activity_id: string;
    title: string;
    payload: { quiz_id?: string | null } | null;
    ordinal: number;
    nclex_programme_units:
      | {
          unit_index: number;
          title: string;
          nclex_programmes:
            | { unit_label: UnitLabel }
            | Array<{ unit_label: UnitLabel }>;
        }
      | Array<{
          unit_index: number;
          title: string;
          nclex_programmes:
            | { unit_label: UnitLabel }
            | Array<{ unit_label: UnitLabel }>;
        }>;
  }>) {
    if (row.payload?.quiz_id !== quizId) continue;
    const unitRow = Array.isArray(row.nclex_programme_units)
      ? row.nclex_programme_units[0]
      : row.nclex_programme_units;
    if (!unitRow) continue;
    const programmeRow = Array.isArray(unitRow.nclex_programmes)
      ? unitRow.nclex_programmes[0]
      : unitRow.nclex_programmes;
    out.push({
      activity_id: row.activity_id,
      title: row.title,
      unit_index: unitRow.unit_index,
      unit_label: programmeRow?.unit_label ?? 'WEEK',
      unit_title: unitRow.title,
    });
  }

  // Stable presentation order — by (unit_index ASC, ordinal ASC).
  out.sort(
    (a, b) =>
      a.unit_index - b.unit_index || a.title.localeCompare(b.title),
  );
  return out;
}
