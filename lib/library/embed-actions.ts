// mynclex/lib/library/embed-actions.ts
//
// Server reads for the embedded-questions block (slice 11.15a).
// Called from client components (the pick-from-bank modal + the block
// NodeView) the same way image/pdf blocks call their signed-URL
// actions. RLS on `nclex_tutor_questions` scopes every read to the
// signed-in tutor's own questions, so the picker can never surface
// another tutor's bank.
//
// The embed block stores only `item_ids` in the note JSON; these reads
// resolve them to display data on demand — no question content is
// persisted in the note body.

'use server';

import { createClient } from '@/lib/supabase/server';
import { richTextToPlainLabel } from '@/lib/authoring/bank-image-doc';
import {
  EMBED_BLOCK_HARD_CAP,
  EMBED_DEFAULT_MAX_BLOCKS,
  EMBED_QUESTION_TYPES,
  type EmbedPickerFilters,
  type EmbedQuestionRow,
} from './types';

export interface EmbedCaps {
  /** Max questions per embedded-questions block. */
  maxPerBlock: number;
  /** Max embedded-questions blocks per note. */
  maxBlocks: number;
}

// Admin-input guard rails — must match the config-defs entries. Kept
// here too so a stored value (or a missing row) can never produce an
// out-of-range limit at the consuming end.
const PER_BLOCK_MIN = 1;
const PER_BLOCK_MAX = 30;
const BLOCKS_MIN = 1;
const BLOCKS_MAX = 10;

function clampInt(raw: string | undefined, def: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/**
 * The live embedded-questions caps from `nclex_config` (admin-tunable
 * — see slice 11.15e). Falls back to the default constants when a row
 * is missing/malformed, and clamps to the guard rails. `nclex_config`
 * is public-SELECT, so the tutor's normal client can read it.
 */
export async function getEmbedCaps(): Promise<EmbedCaps> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('nclex_config')
    .select('key, value')
    .in('key', ['embed_max_questions_per_block', 'embed_max_blocks_per_note']);

  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  return {
    maxPerBlock: clampInt(
      map.get('embed_max_questions_per_block'),
      EMBED_BLOCK_HARD_CAP,
      PER_BLOCK_MIN,
      PER_BLOCK_MAX,
    ),
    maxBlocks: clampInt(
      map.get('embed_max_blocks_per_note'),
      EMBED_DEFAULT_MAX_BLOCKS,
      BLOCKS_MIN,
      BLOCKS_MAX,
    ),
  };
}

const EMBED_TYPE_SET = new Set<string>(EMBED_QUESTION_TYPES);

const SELECT_COLS =
  'item_id, question_type, stem, difficulty, client_needs_subcategory, created_at, parent_note_id';

type RawRow = {
  item_id: string;
  question_type: string;
  stem: string;
  difficulty: string | null;
  client_needs_subcategory: string | null;
  created_at: string;
  parent_note_id: string | null;
};

function mapRow(r: RawRow): EmbedQuestionRow {
  return {
    item_id: r.item_id,
    question_type: r.question_type,
    stem: richTextToPlainLabel(r.stem),
    difficulty: r.difficulty ?? null,
    pillar: r.client_needs_subcategory ?? null,
    created_at: r.created_at,
    is_note_created: r.parent_note_id != null,
  };
}

/**
 * The tutor's own PUBLISHED, STANDALONE, embeddable questions for the
 * pick-from-bank modal. "Embeddable" = one of the 4 classic
 * single-question types (EMBED_QUESTION_TYPES); the 5 NGN types are
 * excluded (routed to quizzes — partial-credit grading the embed model
 * doesn't cover). "Standalone" excludes case-study / trend children
 * (they need their wrapper's snapshot machinery). Note-authored
 * questions (parent_note_id set) DO appear — they're reusable bank
 * questions like any other.
 *
 * Newest-first so a question the tutor just created for this note sits
 * at the top. Capped at 200 — the filter bar narrows from there.
 * Mirrors `lib/tutor-quiz/queries.ts` getPickerQuestions, but filtered
 * to the embeddable type set and ordered by recency.
 */
export async function getEmbeddableBankQuestions(
  filters: EmbedPickerFilters,
): Promise<EmbedQuestionRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from('nclex_tutor_questions')
    .select(SELECT_COLS)
    .eq('is_published', true)
    .is('parent_case_id', null)
    .is('trend_id', null)
    .order('created_at', { ascending: false })
    .limit(200);

  // A specific embeddable type, else the whole classic-4 allowlist.
  if (filters.type && EMBED_TYPE_SET.has(filters.type)) {
    query = query.eq('question_type', filters.type);
  } else {
    query = query.in('question_type', [...EMBED_QUESTION_TYPES]);
  }
  if (filters.pillar) {
    query = query.eq('client_needs_subcategory', filters.pillar);
  }
  if (filters.difficulty) {
    query = query.eq('difficulty', filters.difficulty);
  }
  if (filters.q && filters.q.trim()) {
    query = query.ilike('stem', `%${filters.q.trim()}%`);
  }

  const { data } = await query;
  return ((data ?? []) as RawRow[]).map(mapRow);
}

/**
 * Resolve a block's `item_ids` to reference-card data, preserving the
 * block's order. Any id that no longer resolves (e.g. an out-of-band
 * deletion — embed refs are ON DELETE RESTRICT so this is rare) is
 * dropped. RLS scopes to the tutor's own questions.
 */
export async function getEmbedRefCards(
  itemIds: string[],
): Promise<EmbedQuestionRow[]> {
  if (!Array.isArray(itemIds) || itemIds.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from('nclex_tutor_questions')
    .select(SELECT_COLS)
    .in('item_id', itemIds);

  const byId = new Map(
    ((data ?? []) as RawRow[]).map((r) => [r.item_id, mapRow(r)]),
  );
  return itemIds
    .map((id) => byId.get(id))
    .filter((x): x is EmbedQuestionRow => x != null);
}
