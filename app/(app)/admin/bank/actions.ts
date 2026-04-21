// mynclex/app/(app)/admin/bank/actions.ts
//
// Server Actions for the Question Bank authoring UI (Slice 1.2).
//
// Three actions: create, update, delete. Each runs on the Cloudflare
// Worker, never the browser. Each performs its OWN auth + permission
// re-check — the page's gate is a UX nicety, the Server Action is the
// real security boundary.
//
// Family A only (MCQ, TF, SATA, SELECT_N). Other types come in later
// slices and will get their own validation branches here (or sibling
// files if this grows too large).

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  CLIENT_NEEDS_CATEGORIES,
  DIFFICULTY_LEVELS,
  ITEM_ID_PREFIX,
  type QuestionType,
} from '@/lib/bank/classifications';
import type {
  BankItemContent,
  BankItemCorrect,
} from '@/lib/bank/types';
import { parseByType } from '@/lib/bank/parsers';

const VALID_TYPES = new Set<QuestionType>(['MCQ', 'TF', 'SATA', 'SELECT_N', 'MATRIX', 'BOWTIE']);
const VALID_CATEGORIES = new Set<string>(CLIENT_NEEDS_CATEGORIES);
const VALID_DIFFICULTIES = new Set<string>(DIFFICULTY_LEVELS);

// Result type — the form reads this to render errors inline.
export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────
// Auth + permission gate. Used at the top of every action.
// Returns the user id on success; throws (via redirect) on failure.
// ─────────────────────────────────────────────────────────────

async function requireBankCurator() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [rolesRes, permsRes] = await Promise.all([
    supabase.from('nclex_user_roles').select('role').eq('user_id', user.id),
    supabase
      .from('nclex_admin_permissions')
      .select('permission')
      .eq('user_id', user.id),
  ]);

  const roles = (rolesRes.data ?? []).map((r) => r.role as string);
  const perms = (permsRes.data ?? []).map((p) => p.permission as string);

  const canCurate =
    roles.includes('SUPER_ADMIN') || perms.includes('BANK_CURATE');

  if (!canCurate) {
    redirect('/admin');
  }

  return { supabase, user };
}

// ─────────────────────────────────────────────────────────────
// Parse the form payload into a normalized shape.
// Validates required fields. Builds content + correct JSONB for the
// chosen question type. Returns { ok:false, error } on bad input.
// ─────────────────────────────────────────────────────────────

interface ParsedItem {
  question_type: QuestionType;
  stem: string;
  rationale: string | null;
  rationale_img: string | null;
  content: BankItemContent;
  correct: BankItemCorrect;
  client_needs_category: string;
  client_needs_subcategory: string | null;
  nursing_subject: string | null;
  body_system: string | null;
  topic: string | null;
  subtopic: string | null;
  difficulty: string | null;
  bloom_level: string | null;
  tags: string[];
  is_published: boolean;
  is_free_sample: boolean;
  is_builder_visible: boolean;
  marks: number;
  shuffle_options: boolean;
  question_ref: string | null;
  batch_id: string | null;
}

function parseFormData(formData: FormData): ParsedItem | { error: string } {
  const question_type = String(formData.get('question_type') ?? '') as QuestionType;
  if (!VALID_TYPES.has(question_type)) {
    return { error: 'Invalid question type.' };
  }

  const stem = String(formData.get('stem') ?? '').trim();
  if (!stem) {
    return { error: 'Stem is required.' };
  }

  // Required: NCLEX category (per scope decision).
  const client_needs_category = String(formData.get('client_needs_category') ?? '').trim();
  if (!VALID_CATEGORIES.has(client_needs_category)) {
    return { error: 'Client Needs category is required.' };
  }

  // Per-type validation + content/correct construction lives in the
  // lib/bank/parsers/ dispatcher. It handles option-building, MIN/MAX
  // bounds, correct-id membership, and the type-specific rules.
  const optionIds = formData.getAll('option_id').map(String);
  const optionTexts = formData.getAll('option_text').map(String);
  const optionFeedbacks = formData.getAll('option_feedback').map(String);
  const correctIds = formData.getAll('correct_id').map((v) => String(v).trim()).filter(Boolean);
  const selectCountRaw = parseInt(String(formData.get('select_count') ?? ''), 10);

  // Matrix-specific FormData extraction (only populated when type is MATRIX)
  const matrixRowLabel = String(formData.get('matrix_row_label') ?? '');
  const matrixRowIds = formData.getAll('matrix_row_id').map(String);
  const matrixRowTexts = formData.getAll('matrix_row_text').map(String);
  const matrixRowFeedbacks = formData.getAll('matrix_row_feedback').map(String);
  const matrixColIds = formData.getAll('matrix_col_id').map(String);
  const matrixColTexts = formData.getAll('matrix_col_text').map(String);

  // Build correctByRow map: each row's correct column arrives as
  // a field named `matrix_correct_<rowId>` with the chosen columnId.
  const matrixCorrectByRow: Record<string, string> = {};
  for (const rowId of matrixRowIds) {
    const val = formData.get(`matrix_correct_${rowId}`);
    if (val) matrixCorrectByRow[rowId] = String(val);
  }

  // Bow-tie-specific FormData extraction (only populated when type is BOWTIE)
  // Each wing's tokens arrive as parallel arrays. Correct picks arrive
  // via wing-specific field names.
  const bowtieLeftLabel   = String(formData.get('bowtie_left_label') ?? '');
  const bowtieCentreLabel = String(formData.get('bowtie_centre_label') ?? '');
  const bowtieRightLabel  = String(formData.get('bowtie_right_label') ?? '');

  const bowtieLeftTokenIds       = formData.getAll('bowtie_left_token_id').map(String);
  const bowtieLeftTokenTexts     = formData.getAll('bowtie_left_token_text').map(String);
  const bowtieLeftTokenFeedbacks = formData.getAll('bowtie_left_token_feedback').map(String);
  const bowtieLeftCorrectIds     = formData.getAll('bowtie_left_correct').map(String);

  const bowtieCentreTokenIds       = formData.getAll('bowtie_centre_token_id').map(String);
  const bowtieCentreTokenTexts     = formData.getAll('bowtie_centre_token_text').map(String);
  const bowtieCentreTokenFeedbacks = formData.getAll('bowtie_centre_token_feedback').map(String);
  // Centre uses a radio (single value, one key)
  const bowtieCentreCorrectRaw = String(formData.get('bowtie_centre_correct') ?? '');
  const bowtieCentreCorrectIds = bowtieCentreCorrectRaw ? [bowtieCentreCorrectRaw] : [];

  const bowtieRightTokenIds       = formData.getAll('bowtie_right_token_id').map(String);
  const bowtieRightTokenTexts     = formData.getAll('bowtie_right_token_text').map(String);
  const bowtieRightTokenFeedbacks = formData.getAll('bowtie_right_token_feedback').map(String);
  const bowtieRightCorrectIds     = formData.getAll('bowtie_right_correct').map(String);

  const parsed = parseByType(question_type, {
    optionIds,
    optionTexts,
    optionFeedbacks,
    correctIds,
    selectCount: selectCountRaw,
    matrix: {
      row_label: matrixRowLabel,
      rowIds: matrixRowIds,
      rowTexts: matrixRowTexts,
      rowFeedbacks: matrixRowFeedbacks,
      colIds: matrixColIds,
      colTexts: matrixColTexts,
      correctByRow: matrixCorrectByRow,
    },
    bowtie: {
      left: {
        label: bowtieLeftLabel,
        tokenIds: bowtieLeftTokenIds,
        tokenTexts: bowtieLeftTokenTexts,
        tokenFeedbacks: bowtieLeftTokenFeedbacks,
        correctIds: bowtieLeftCorrectIds,
      },
      centre: {
        label: bowtieCentreLabel,
        tokenIds: bowtieCentreTokenIds,
        tokenTexts: bowtieCentreTokenTexts,
        tokenFeedbacks: bowtieCentreTokenFeedbacks,
        correctIds: bowtieCentreCorrectIds,
      },
      right: {
        label: bowtieRightLabel,
        tokenIds: bowtieRightTokenIds,
        tokenTexts: bowtieRightTokenTexts,
        tokenFeedbacks: bowtieRightTokenFeedbacks,
        correctIds: bowtieRightCorrectIds,
      },
    },
  });

  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const content: BankItemContent = parsed.content;
  const correct: BankItemCorrect = parsed.correct;

  // Optional fields.
  const subcategory = String(formData.get('client_needs_subcategory') ?? '').trim();
  const difficultyRaw = String(formData.get('difficulty') ?? '').trim();
  const difficulty = difficultyRaw && VALID_DIFFICULTIES.has(difficultyRaw) ? difficultyRaw : null;

  const tagsRaw = String(formData.get('tags') ?? '');
  const tags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const marksRaw = parseFloat(String(formData.get('marks') ?? '1'));
  const marks = Number.isFinite(marksRaw) && marksRaw > 0 ? marksRaw : 1;

  return {
    question_type,
    stem,
    rationale: (String(formData.get('rationale') ?? '').trim() || null),
    rationale_img: (String(formData.get('rationale_img') ?? '').trim() || null),
    content,
    correct,
    client_needs_category,
    client_needs_subcategory: subcategory || null,
    nursing_subject: (String(formData.get('nursing_subject') ?? '').trim() || null),
    body_system: (String(formData.get('body_system') ?? '').trim() || null),
    topic: (String(formData.get('topic') ?? '').trim() || null),
    subtopic: (String(formData.get('subtopic') ?? '').trim() || null),
    difficulty,
    bloom_level: (String(formData.get('bloom_level') ?? '').trim() || null),
    tags,
    is_published: formData.get('is_published') === 'on',
    is_free_sample: formData.get('is_free_sample') === 'on',
    is_builder_visible: formData.get('is_builder_visible') !== 'off', // default true
    marks,
    shuffle_options: formData.get('shuffle_options') !== 'off',       // default true
    question_ref: (String(formData.get('question_ref') ?? '').trim() || null),
    batch_id: (String(formData.get('batch_id') ?? '').trim() || null),
  };
}

// ─────────────────────────────────────────────────────────────
// Compute the next sequential item_id for a given question_type.
// e.g. MCQ → SELECT MAX(item_id) WHERE prefix → parse suffix → +1.
// Lexical sort works because the suffix is fixed-width zero-padded.
// ─────────────────────────────────────────────────────────────

async function nextItemId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  type: QuestionType,
): Promise<string> {
  const prefix = ITEM_ID_PREFIX[type];
  const { data, error } = await supabase
    .from('nclex_bank_items')
    .select('item_id')
    .like('item_id', `${prefix}%`)
    .order('item_id', { ascending: false })
    .limit(1);

  if (error) throw error;

  let next = 1;
  if (data && data.length > 0) {
    const last = data[0].item_id as string;
    const suffix = last.slice(prefix.length);
    const n = parseInt(suffix, 10);
    if (Number.isFinite(n)) next = n + 1;
  }

  return `${prefix}${String(next).padStart(5, '0')}`;
}

// ─────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────

export async function createBankItemAction(formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireBankCurator();

  const parsed = parseFormData(formData);
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }

  const item_id = await nextItemId(supabase, parsed.question_type);

  const { error } = await supabase.from('nclex_bank_items').insert({
    item_id,
    ...parsed,
  });

  if (error) {
    return { ok: false, error: `Insert failed: ${error.message}` };
  }

  revalidatePath('/admin/bank');
  redirect(`/admin/bank?edit=${item_id}&saved=1`);
}

// ─────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────

export async function updateBankItemAction(formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireBankCurator();

  const item_id = String(formData.get('item_id') ?? '').trim();
  if (!item_id) {
    return { ok: false, error: 'Missing item_id.' };
  }

  const parsed = parseFormData(formData);
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }

  // question_type is locked on edit — type changes would invalidate the
  // existing JSONB shape and the item_id prefix. Force-overwrite from
  // the existing row for safety.
  const { data: existing, error: fetchErr } = await supabase
    .from('nclex_bank_items')
    .select('question_type')
    .eq('item_id', item_id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { ok: false, error: 'Question not found.' };
  }

  if (existing.question_type !== parsed.question_type) {
    return { ok: false, error: 'Question type cannot be changed after creation.' };
  }

  const { error } = await supabase
    .from('nclex_bank_items')
    .update({
      ...parsed,
      updated_at: new Date().toISOString(),
    })
    .eq('item_id', item_id);

  if (error) {
    return { ok: false, error: `Update failed: ${error.message}` };
  }

  revalidatePath('/admin/bank');
  redirect(`/admin/bank?edit=${item_id}&saved=1`);
}

// ─────────────────────────────────────────────────────────────
// DELETE — hard delete. No FK references in v1 (case-study and
// readiness-pack join tables aren't populated yet); revisit if/when
// they are.
// ─────────────────────────────────────────────────────────────

export async function deleteBankItemAction(formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireBankCurator();

  const item_id = String(formData.get('item_id') ?? '').trim();
  if (!item_id) {
    return { ok: false, error: 'Missing item_id.' };
  }

  const { error } = await supabase
    .from('nclex_bank_items')
    .delete()
    .eq('item_id', item_id);

  if (error) {
    return { ok: false, error: `Delete failed: ${error.message}` };
  }

  revalidatePath('/admin/bank');
  redirect('/admin/bank?deleted=1');
}
