// mynclex/app/(app)/admin/bank/initial-to-parsed.ts
//
// initialToParsedItem — server-side helper that converts a
// BankFormInitial draft (the shape the case editor holds per slot in
// React state) into a normalized payload ready to feed the
// nclex_save_case_with_children RPC.
//
// Why this exists. parseFormData in ./actions.ts is the canonical
// FormData → row path for the standalone bank editor. The case
// editor saves six slots at once — not via one big FormData, but via
// JSON drafts stashed in React state (one BankFormInitial per slot,
// see case-study/editor.tsx). Converting each draft back to FormData
// just to re-parse would be pointless round-tripping. Instead this
// helper calls parseByType directly with BankFormInitial's arrays,
// matching the exact validation parseFormData performs — just without
// the FormData layer.
//
// ─────────────────────────────────────────────────────────────
// INVARIANT — three-way drift trap
// ─────────────────────────────────────────────────────────────
// Adding a new per-type field (or reshaping an existing one) changes
// the contract at ALL of these, which must stay in lockstep:
//
//   1. parseFormData         (./actions.ts)
//        FormData → ParsedItem for the standalone-bank write path.
//   2. parseSlotFormData     (./slot-parser.ts)
//        FormData → BankFormInitial for slot-switch snapshots.
//   3. initialToParsedItem   (this file)
//        BankFormInitial → ParsedSlotInitial for case-child writes
//        via the nclex_save_case_with_children RPC.
//
// All three share parseByType (lib/bank/parsers/index.ts) for
// content+correct shaping, so per-type JSONB stays consistent. What
// this file still duplicates from parseFormData is the classification
// + housekeeping field list. Keep them in sync.

import type { BankFormInitial } from '@/lib/bank/form-shape';
import type {
  BankItemContent,
  BankItemCorrect,
} from '@/lib/bank/types';
import {
  CLIENT_NEEDS_CATEGORIES,
  DIFFICULTY_LEVELS,
  type QuestionType,
} from '@/lib/bank/classifications';
import { parseByType } from '@/lib/bank/parsers';

const VALID_TYPES = new Set<QuestionType>([
  'MCQ', 'TF', 'SATA', 'SELECT_N', 'MATRIX', 'BOWTIE', 'CLOZE', 'HIGHLIGHT', 'DRAG_DROP',
]);
const VALID_CATEGORIES   = new Set<string>(CLIENT_NEEDS_CATEGORIES);
const VALID_DIFFICULTIES = new Set<string>(DIFFICULTY_LEVELS);

// Wire shape passed to the RPC per slot (under `initial`). Mirrors
// the jsonb comment block at the top of the RPC migration.
export interface ParsedSlotInitial {
  item_id:                  string | null;
  question_type:            QuestionType;
  instruction:              string | null;
  stem:                     string;
  rationale:                string | null;
  rationale_img:            string | null;
  content:                  BankItemContent;
  correct:                  BankItemCorrect;
  client_needs_category:    string;
  client_needs_subcategory: string | null;
  nursing_subject:          string | null;
  body_system:              string | null;
  topic:                    string | null;
  subtopic:                 string | null;
  difficulty:               string | null;
  bloom_level:              string | null;
  tags:                     string[];
  is_free_sample:           boolean;
  marks:                    number;
  shuffle_options:          boolean;
  question_ref:             string | null;
  batch_id:                 string | null;
}

export type InitialToParsedResult =
  | { ok: true; item: ParsedSlotInitial }
  | { ok: false; error: string };

export function initialToParsedItem(
  initial: BankFormInitial,
): InitialToParsedResult {
  if (!VALID_TYPES.has(initial.question_type)) {
    return { ok: false, error: 'Invalid question type.' };
  }

  const stem = initial.stem.trim();
  if (!stem) {
    return { ok: false, error: 'Stem is required.' };
  }

  const client_needs_category = initial.client_needs_category.trim();
  if (!VALID_CATEGORIES.has(client_needs_category)) {
    return { ok: false, error: 'Client Needs category is required.' };
  }

  // Deconstruct BankFormInitial arrays into the parallel arrays
  // parseByType expects. Matches the extraction parseFormData does
  // from FormData one-for-one — same names, same semantics.
  const optionIds       = initial.options.map((o) => o.id);
  const optionTexts     = initial.options.map((o) => o.text);
  const optionFeedbacks = initial.options.map((o) => o.feedback);
  const correctIds      = initial.correct_ids;

  const matrixRowIds       = initial.matrix_rows.map((r) => r.id);
  const matrixRowTexts     = initial.matrix_rows.map((r) => r.text);
  const matrixRowFeedbacks = initial.matrix_rows.map((r) => r.feedback);
  const matrixColIds       = initial.matrix_columns.map((c) => c.id);
  const matrixColTexts     = initial.matrix_columns.map((c) => c.text);

  // Bow-tie correct-ids per wing are a set of ids where token.correct === true.
  const btLeftCorrectIds   = initial.bowtie_left_tokens.filter((t) => t.correct).map((t) => t.id);
  const btCentreCorrectIds = initial.bowtie_centre_tokens.filter((t) => t.correct).map((t) => t.id);
  const btRightCorrectIds  = initial.bowtie_right_tokens.filter((t) => t.correct).map((t) => t.id);

  // Cloze blanks are already in the parser's expected shape, modulo
  // filtering orphans (in_stem=false). parseCloze drops orphans
  // internally; we also drop up front to match parseFormData's
  // handling.
  const clozeBlanks = initial.cloze_blanks
    .filter((b) => b.in_stem)
    .map((b) => ({
      id: b.id,
      choices: b.choices,
      correct_id: b.correct_id,
    }));

  const parsed = parseByType(initial.question_type, {
    optionIds,
    optionTexts,
    optionFeedbacks,
    correctIds,
    selectCount: initial.select_count,
    matrix: {
      row_label:    initial.matrix_row_label,
      rowIds:       matrixRowIds,
      rowTexts:     matrixRowTexts,
      rowFeedbacks: matrixRowFeedbacks,
      colIds:       matrixColIds,
      colTexts:     matrixColTexts,
      correctByRow: initial.matrix_correct,
    },
    bowtie: {
      left: {
        label:          initial.bowtie_left_label,
        tokenIds:       initial.bowtie_left_tokens.map((t) => t.id),
        tokenTexts:     initial.bowtie_left_tokens.map((t) => t.text),
        tokenFeedbacks: initial.bowtie_left_tokens.map((t) => t.feedback),
        correctIds:     btLeftCorrectIds,
      },
      centre: {
        label:          initial.bowtie_centre_label,
        tokenIds:       initial.bowtie_centre_tokens.map((t) => t.id),
        tokenTexts:     initial.bowtie_centre_tokens.map((t) => t.text),
        tokenFeedbacks: initial.bowtie_centre_tokens.map((t) => t.feedback),
        correctIds:     btCentreCorrectIds,
      },
      right: {
        label:          initial.bowtie_right_label,
        tokenIds:       initial.bowtie_right_tokens.map((t) => t.id),
        tokenTexts:     initial.bowtie_right_tokens.map((t) => t.text),
        tokenFeedbacks: initial.bowtie_right_tokens.map((t) => t.feedback),
        correctIds:     btRightCorrectIds,
      },
    },
    cloze: { stem, blanks: clozeBlanks },
    highlight: { stem, chunks: initial.highlight_chunks },
    dragDrop: {
      stem,
      subtype: initial.dd_subtype,
      slots:   initial.dd_slots,
      tokens:  initial.dd_tokens,
    },
  });

  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const finalStem = parsed.stem ?? stem;

  const subcategory = initial.client_needs_subcategory.trim();
  const difficultyRaw = initial.difficulty.trim();
  const difficulty =
    difficultyRaw && VALID_DIFFICULTIES.has(difficultyRaw) ? difficultyRaw : null;

  const tagsArr = initial.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const marks =
    Number.isFinite(initial.marks) && initial.marks > 0 ? initial.marks : 1;

  return {
    ok: true,
    item: {
      item_id:                  initial.item_id,
      question_type:            initial.question_type,
      instruction:              initial.instruction.trim() || null,
      stem:                     finalStem,
      rationale:                initial.rationale.trim() || null,
      rationale_img:            initial.rationale_img.trim() || null,
      content:                  parsed.content,
      correct:                  parsed.correct,
      client_needs_category,
      client_needs_subcategory: subcategory || null,
      nursing_subject:          initial.nursing_subject.trim() || null,
      body_system:              initial.body_system.trim() || null,
      topic:                    initial.topic.trim() || null,
      subtopic:                 initial.subtopic.trim() || null,
      difficulty,
      bloom_level:              initial.bloom_level.trim() || null,
      tags:                     tagsArr,
      is_free_sample:           initial.is_free_sample,
      marks,
      shuffle_options:          initial.shuffle_options,
      question_ref:             initial.question_ref.trim() || null,
      batch_id:                 initial.batch_id.trim() || null,
    },
  };
}
