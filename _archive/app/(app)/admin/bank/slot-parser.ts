// mynclex/app/(app)/admin/bank/slot-parser.ts
//
// parseSlotFormData — reads prefixed FormData entries (e.g. 'q1_stem',
// 'q2_option_id') from the case editor's active slot form and returns
// a BankFormInitial draft shaped to seed QuestionAuthoringPanel on the
// next mount. Used client-side by case-study/editor.tsx to preserve
// in-flight slot edits across slot-switch unmount / remount and on
// save.
//
// ─────────────────────────────────────────────────────────────
// INVARIANT — three-way drift trap
// ─────────────────────────────────────────────────────────────
// Adding a new per-type field (or reshaping an existing one) changes
// the contract at ALL of these, which must stay in lockstep:
//
//   1. parseFormData         (./actions.ts)
//        FormData → ParsedItem for the standalone-bank write path.
//   2. parseSlotFormData     (this file)
//        FormData → BankFormInitial for slot-switch snapshots.
//   3. initialToParsedItem   (./initial-to-parsed.ts)
//        BankFormInitial → ParsedSlotInitial for case-child writes
//        via the nclex_save_case_with_children RPC.
//
// Typical omission bug: you add a field to parseFormData only. The
// standalone editor keeps working. The panel still renders the field.
// But every slot switch silently drops it (parseSlotFormData didn't
// read it into the cached draft), and the case save can't persist it
// (initialToParsedItem didn't forward it into the RPC payload). The
// curator loses the field the moment they click Q2.
//
// All three files live in this folder so the drift trap is visible
// during review. If you edit any one, open the other two.

import { emptyInitial, type BankFormInitial } from '@/lib/bank/form-shape';
import type { QuestionType } from '@/lib/bank/classifications';
import { makePrefixer } from '@/lib/bank/field-prefix';

export function parseSlotFormData(
  formData: FormData,
  prefix: string,
  fallback: BankFormInitial,
): BankFormInitial {
  const fn = makePrefixer(prefix);
  const q  = (name: string, fb = ''): string =>
    String(formData.get(fn(name)) ?? fb);
  const qa = (name: string): string[] =>
    formData.getAll(fn(name)).map(String);
  const qFlag = (name: string): boolean =>
    formData.get(fn(name)) === 'on';
  // Some checkboxes have `value="on"` but use "not submitted" to mean
  // false; others carry a default-true semantic (parseFormData's
  // `!== 'off'`). Match the server contract exactly per field below.

  // Question type drives which per-type branch parses inputs. If the
  // panel hasn't mounted yet (no q_question_type in FormData), fall
  // back to the draft's current type.
  const question_type = (q('question_type') || fallback.question_type) as QuestionType;

  // Start with a fresh empty initial + the common fields, then branch
  // into the active type's specific parsing. Non-active-type arrays
  // (options for a MATRIX draft, matrix_rows for a CLOZE draft, etc.)
  // are emptyInitial's defaults — same as what the panel would mount
  // if the user re-opened this slot with this question_type.
  const base = emptyInitial();
  const out: BankFormInitial = {
    ...base,

    item_id: fallback.item_id, // not in FormData; preserved from fallback

    question_type,
    stem:          q('stem',          base.stem),
    instruction:   q('instruction',   base.instruction),
    rationale:     q('rationale',     base.rationale),
    rationale_img: q('rationale_img', base.rationale_img),

    client_needs_category:    q('client_needs_category',    base.client_needs_category),
    client_needs_subcategory: q('client_needs_subcategory', base.client_needs_subcategory),
    nursing_subject:          q('nursing_subject',          base.nursing_subject),
    body_system:              q('body_system',              base.body_system),
    topic:                    q('topic',                    base.topic),
    subtopic:                 q('subtopic',                 base.subtopic),
    difficulty:               q('difficulty',               base.difficulty),
    bloom_level:              q('bloom_level',              base.bloom_level),
    tags:                     q('tags',                     base.tags),

    marks:        parseMarks(q('marks'), base.marks),
    question_ref: q('question_ref', base.question_ref),
    batch_id:     q('batch_id',     base.batch_id),

    // Checkbox semantics matching parseFormData in actions.ts:
    //   is_published / is_free_sample — explicit opt-in ('on' = true)
    //   is_builder_visible / shuffle_options — opt-out ('off' = false)
    // In case-child mode the panel doesn't render is_published /
    // is_builder_visible; those fields aren't in FormData, so
    // qFlag returns false which would wrongly clobber the draft.
    // Preserve fallback for those two when FormData has no entry.
    is_published:       hasEntry(formData, fn('is_published'))
                          ? qFlag('is_published')
                          : fallback.is_published,
    is_free_sample:     qFlag('is_free_sample'),
    is_builder_visible: hasEntry(formData, fn('is_builder_visible'))
                          ? formData.get(fn('is_builder_visible')) !== 'off'
                          : fallback.is_builder_visible,
    shuffle_options:    hasEntry(formData, fn('shuffle_options'))
                          ? formData.get(fn('shuffle_options')) !== 'off'
                          : fallback.shuffle_options,
  };

  switch (question_type) {
    case 'MCQ': {
      const ids = qa('option_id');
      const texts = qa('option_text');
      const feedbacks = qa('option_feedback');
      out.options = ids.map((id, i) => ({
        id,
        text: texts[i] ?? '',
        feedback: feedbacks[i] ?? '',
      }));
      const correctId = q('correct_id');
      out.correct_ids = correctId ? [correctId] : [];
      break;
    }
    case 'TF': {
      const ids = qa('option_id');
      const texts = qa('option_text');
      const feedbacks = qa('option_feedback');
      out.options = ids.map((id, i) => ({
        id,
        text: texts[i] ?? '',
        feedback: feedbacks[i] ?? '',
      }));
      const correctId = q('correct_id');
      out.correct_ids = correctId ? [correctId] : [];
      break;
    }
    case 'SATA': {
      const ids = qa('option_id');
      const texts = qa('option_text');
      const feedbacks = qa('option_feedback');
      out.options = ids.map((id, i) => ({
        id,
        text: texts[i] ?? '',
        feedback: feedbacks[i] ?? '',
      }));
      out.correct_ids = qa('correct_id');
      break;
    }
    case 'SELECT_N': {
      const ids = qa('option_id');
      const texts = qa('option_text');
      const feedbacks = qa('option_feedback');
      out.options = ids.map((id, i) => ({
        id,
        text: texts[i] ?? '',
        feedback: feedbacks[i] ?? '',
      }));
      out.correct_ids = qa('correct_id');
      const rawCount = parseInt(q('select_count'), 10);
      out.select_count = Number.isFinite(rawCount) && rawCount > 0 ? rawCount : base.select_count;
      break;
    }
    case 'MATRIX': {
      out.matrix_row_label = q('matrix_row_label');
      const rowIds = qa('matrix_row_id');
      const rowTexts = qa('matrix_row_text');
      const rowFeedbacks = qa('matrix_row_feedback');
      out.matrix_rows = rowIds.map((id, i) => ({
        id,
        text: rowTexts[i] ?? '',
        feedback: rowFeedbacks[i] ?? '',
      }));
      const colIds = qa('matrix_col_id');
      const colTexts = qa('matrix_col_text');
      out.matrix_columns = colIds.map((id, i) => ({
        id,
        text: colTexts[i] ?? '',
      }));
      const correct: Record<string, string> = {};
      for (const rId of rowIds) {
        const val = formData.get(fn(`matrix_correct_${rId}`));
        if (val) correct[rId] = String(val);
      }
      out.matrix_correct = correct;
      break;
    }
    case 'BOWTIE': {
      out.bowtie_left_label   = q('bowtie_left_label',   base.bowtie_left_label);
      out.bowtie_centre_label = q('bowtie_centre_label', base.bowtie_centre_label);
      out.bowtie_right_label  = q('bowtie_right_label',  base.bowtie_right_label);

      const leftCorrectSet = new Set(qa('bowtie_left_correct'));
      const leftIds = qa('bowtie_left_token_id');
      const leftTexts = qa('bowtie_left_token_text');
      const leftFbs = qa('bowtie_left_token_feedback');
      out.bowtie_left_tokens = leftIds.map((id, i) => ({
        id,
        text: leftTexts[i] ?? '',
        feedback: leftFbs[i] ?? '',
        correct: leftCorrectSet.has(id),
      }));

      const centreCorrectId = q('bowtie_centre_correct');
      const centreIds = qa('bowtie_centre_token_id');
      const centreTexts = qa('bowtie_centre_token_text');
      const centreFbs = qa('bowtie_centre_token_feedback');
      out.bowtie_centre_tokens = centreIds.map((id, i) => ({
        id,
        text: centreTexts[i] ?? '',
        feedback: centreFbs[i] ?? '',
        correct: id === centreCorrectId,
      }));

      const rightCorrectSet = new Set(qa('bowtie_right_correct'));
      const rightIds = qa('bowtie_right_token_id');
      const rightTexts = qa('bowtie_right_token_text');
      const rightFbs = qa('bowtie_right_token_feedback');
      out.bowtie_right_tokens = rightIds.map((id, i) => ({
        id,
        text: rightTexts[i] ?? '',
        feedback: rightFbs[i] ?? '',
        correct: rightCorrectSet.has(id),
      }));
      break;
    }
    case 'CLOZE': {
      const blankIds = qa('cloze_blank_id');
      const inStems  = qa('cloze_blank_in_stem');
      out.cloze_blanks = blankIds.map((bid, i) => {
        const cIds = qa(`cloze_choice_id_${bid}`);
        const cTxts = qa(`cloze_choice_text_${bid}`);
        const cFbs = qa(`cloze_choice_feedback_${bid}`);
        const correctId = q(`cloze_correct_${bid}`);
        return {
          id: bid,
          choices: cIds.map((cid, j) => ({
            id: cid,
            text: cTxts[j] ?? '',
            feedback: cFbs[j] ?? '',
          })),
          correct_id: correctId,
          in_stem: inStems[i] === 'true',
        };
      });
      break;
    }
    case 'HIGHLIGHT': {
      const chunkIds = qa('hl_chunk_id');
      const chunkTexts = qa('hl_chunk_text');
      const chunkDecisions = qa('hl_chunk_decision');
      const chunkFeedbacks = qa('hl_chunk_feedback');
      const chunkInPassage = qa('hl_chunk_in_passage');
      out.highlight_chunks = chunkIds.map((id, i) => {
        const rawDecision = chunkDecisions[i];
        const decision: 'correct' | 'wrong' | 'undecided' =
          rawDecision === 'correct' ? 'correct'
          : rawDecision === 'wrong' ? 'wrong'
          : 'undecided';
        return {
          id,
          text: chunkTexts[i] ?? '',
          decision,
          feedback: chunkFeedbacks[i] ?? '',
          in_passage: chunkInPassage[i] === 'true',
        };
      });
      break;
    }
    case 'DRAG_DROP': {
      const subtypeRaw = q('dd_subtype') || base.dd_subtype;
      out.dd_subtype = subtypeRaw === 'SENTENCE' ? 'SENTENCE' : 'ORDERED';

      const slotIds = qa('dd_slot_id');
      const slotTargets = qa('dd_slot_target_text');
      const slotAssigned = qa('dd_slot_assigned_token_id');
      const slotFeedbacks = qa('dd_slot_feedback');
      out.dd_slots = slotIds.map((id, i) => ({
        id,
        target_text: slotTargets[i] ?? '',
        assigned_token_id: slotAssigned[i] ?? '',
        feedback: slotFeedbacks[i] ?? '',
      }));

      const tokenIds = qa('dd_token_id');
      const tokenTexts = qa('dd_token_text');
      out.dd_tokens = tokenIds.map((id, i) => ({
        id,
        text: tokenTexts[i] ?? '',
      }));
      break;
    }
  }

  return out;
}

// FormData.has() exists but we need to match the prefixed name. Tiny
// helper so intent stays readable at the call site.
function hasEntry(formData: FormData, name: string): boolean {
  return formData.has(name);
}

function parseMarks(raw: string, fallback: number): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ─────────────────────────────────────────────────────────────
// isSlotPopulated — does this draft represent authoring intent?
// ─────────────────────────────────────────────────────────────
// The Case Study editor lazy-seeds `emptyInitial()` into slotDrafts[N]
// the moment a curator clicks an empty pill. That's a UI concession
// (the panel needs a non-null `initial` prop to mount) but without
// this helper the save path can't tell "clicked to look at Q4" from
// "authored Q4 with blank defaults" — both show up as a non-null
// BankFormInitial with empty content.
//
// Current rule: a slot is populated iff its stem has non-whitespace
// text. Stem is the first required field in every question type's
// validator chain, and it's the first thing a curator types, so
// stem-trimmed-non-empty is a clean proxy for "the curator intended
// this to save."
//
// ─── Drift trap ──────────────────────────────────────────────
// If "populated" ever needs to mean more — e.g. "has a stem image
// even without stem text", or "Bow-tie with wing labels filled but
// no centre text counts as work-in-progress" — update only this
// helper. The two call sites live in:
//   * mynclex/lib/bank/case-study/editor.tsx       (client filter
//     on onSaveCase; coerces un-populated drafts to null in the
//     payload so they hit the server's "empty slot" branch).
//   * mynclex/lib/bank/case-study/actions.ts       (server
//     defence-in-depth inside updateCaseAction's slotsPayload
//     map, sitting next to the s.initial === null short-circuit).
// Both import from this file so there's one source of truth.
// ─────────────────────────────────────────────────────────────

export function isSlotPopulated(initial: BankFormInitial): boolean {
  return initial.stem.trim() !== '';
}
