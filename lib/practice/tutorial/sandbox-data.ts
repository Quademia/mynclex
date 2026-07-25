// mynclex/lib/practice/tutorial/sandbox-data.ts
//
// Builds the runner data bundle for the tutorial sandbox from the in-code
// dummy questions. This is the sandbox's answer to what page.tsx does for
// a real attempt — EXCEPT nothing is loaded from or written to the
// database. There is no attempt row; the bundle is assembled in memory
// and handed straight to <Runner>.
//
// The seal is preserved exactly as page.tsx preserves it: `items` carry
// the SEALED columns only (no key, no rationale), and the answer keys are
// split into a separate `sandboxKeys` map the client-side scorer reads on
// Submit. So the runner's live-render path is byte-for-byte the real one;
// only the source of the key differs (memory here vs a server RPC there).
//
// `marks_snapshot` is DERIVED with computeMarksFromKey so it always equals
// the item's max partial-credit score — the invariant that keeps Submit in
// range (see reference: bank marks = computeMarksFromKey).

import { computeMarksFromKey } from '@/lib/scoring';
import type {
  AttemptHeader,
  SealedItem,
  PerItemUnseal,
  CaseSnapshot,
  TrendSnapshot,
  LiveData,
} from '@/lib/practice/runner';
import {
  TUTORIAL_QUESTIONS,
  TUTORIAL_CASE,
  TUTORIAL_CASE_QUESTIONS,
  TUTORIAL_TREND,
  TUTORIAL_TREND_QUESTIONS,
} from './questions';

// Synthetic identifiers — never touch the database, so they only need to
// be internally stable for the length of one sandbox session.
const SANDBOX_ATTEMPT_ID = 'tutorial-sandbox';

// Where the topbar ← Exit and the Finish CTA send the student. The Help
// hub is the tutorial's natural home (Slice 3 wires the doorways there).
const SANDBOX_EXIT_HREF = '/help';

/**
 * Assemble a live-shaped, no-writes runner bundle for the sandbox.
 * Called from the /tutorial route (a server component) on each request.
 */
export function buildSandboxData(): LiveData {
  const nowIso = new Date().toISOString();

  const items: SealedItem[] = [];
  const sandboxKeys: Record<string, PerItemUnseal> = {};

  // Order: the 11 stand-alone types, then the case's 6 children (a
  // contiguous block, as the runner expects), then the trend item.
  const allQuestions = [
    ...TUTORIAL_QUESTIONS,
    ...TUTORIAL_CASE_QUESTIONS,
    ...TUTORIAL_TREND_QUESTIONS,
  ];

  allQuestions.forEach((q, i) => {
    const marks = computeMarksFromKey(q.question_type, q.correct);

    items.push({
      attempt_item_id:         q.key,
      position:                i + 1,
      question_type:           q.question_type,
      stem_snapshot:           q.stem,
      instruction_snapshot:    q.instruction,
      marks_snapshot:          marks,
      classification_snapshot: q.classification as unknown as Record<string, unknown>,
      content_snapshot_json:   q.content as unknown as Record<string, unknown>,
      parent_case_id:          q.parent_case_id ?? null,
      case_position:           q.case_position ?? null,
      cjmm_step:               q.cjmm_step ?? null,
      trend_id:                q.trend_id ?? null,
      shuffle_seed:            null,   // no runtime shuffle in the tutorial
      option_order_json:       {},
    });

    sandboxKeys[q.key] = {
      correct:      q.correct,
      rationale:    q.rationale,
      rationaleImg: null,
      marksMax:     marks,
    };
  });

  const attempt: AttemptHeader = {
    attempt_id:               SANDBOX_ATTEMPT_ID,
    student_id:               SANDBOX_ATTEMPT_ID,
    source:                   'CUSTOM_BUILT',
    intent:                   'STUDY',
    // Untimed Learning: fresh answering + per-Q submit-and-reveal, no clock.
    // This is the interaction the tutorial teaches; the sandbox flag strips
    // the writes that mode would otherwise make.
    mode:                     'UNTIMED_LEARNING',
    status:                   'IN_PROGRESS',
    duration_seconds:         null,   // untimed — stopwatch only, no countdown
    engaged_seconds_used:     null,
    filters_json:             {},
    requested_question_count: items.length,
    actual_question_count:    items.length,
    actual_unit_count:        items.length,
    final_score:              null,
    pass_score:               null,
    created_at:               nowIso,
    // started_at set (not null) so <Runner> skips the Start preflight and
    // lands straight in the shell. The stopwatch counts up from here.
    started_at:               nowIso,
    ended_at:                 null,
    last_activity_at:         nowIso,
  };

  const cases: CaseSnapshot[] = [
    {
      case_id:                   TUTORIAL_CASE.case_id,
      title_snapshot:            TUTORIAL_CASE.title,
      scenario_summary_snapshot: TUTORIAL_CASE.scenario,
      tabs_snapshot_json:        TUTORIAL_CASE.tabs,
    },
  ];

  const trends: TrendSnapshot[] = [
    {
      trend_id:           TUTORIAL_TREND.trend_id,
      title_snapshot:     TUTORIAL_TREND.title,
      scenario_snapshot:  TUTORIAL_TREND.scenario,
      tabs_snapshot_json: TUTORIAL_TREND.tabs,
    },
  ];

  return {
    mode:         'live',
    attempt,
    items,
    cases,
    trends,
    answers:      [],
    seededUnseal: {},
    exitHref:     SANDBOX_EXIT_HREF,
    sandbox:      true,
    sandboxKeys,
  };
}
