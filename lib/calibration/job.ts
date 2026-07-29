// mynclex/lib/calibration/job.ts
//
// The weekly recalibration run: read every answer, measure every question,
// write back what the rules allow. Run by .github/workflows/recalibrate.yml,
// outside the app and outside the database.
//
// Canonical decision record: docs/product-plan/bank-consumption-cat.html §5.3,
// §17. The maths is in ./fit, the rules in ./rules; this file is I/O and
// nothing else, so that the two parts worth being sure about stay testable
// without a database.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fitDifficulties, type CalibrationResponse } from './fit';
import { planCalibration, type CalibrationCandidate } from './rules';

/** §5.3.2 — the switch on /admin/config, read before anything else. */
export const CONFIG_KEY = 'cat_recalibration_enabled';

/**
 * Case children count half toward a student's ability (§7.4). Their own
 * difficulty is unaffected by this — see the note on CalibrationResponse.
 */
const CASE_CHILD_WEIGHT = 0.5;

/** PostgREST caps a read at 1,000 rows and says nothing about it. */
const PAGE = 1000;

export type JobTrigger = 'CRON' | 'MANUAL';

export type CalibrationRunSummary = {
  runId: string;
  trigger: JobTrigger;
  /** True when the switch was off and nothing was read or written. */
  haltedBySwitch: boolean;
  responsesRead: number;
  studentsSeen: number;
  itemsAnswered: number;
  itemsOverThreshold: number;
  itemsWritten: number;
  skippedBelowThreshold: number;
  skippedUnchanged: number;
  iterations: number;
  converged: boolean;
};

type JoinedItem = {
  item_id: string | null;
  marks_snapshot: number | null;
  parent_case_id: string | null;
};

/**
 * One answer as it comes back from the join.
 *
 * The embedded item is typed as EITHER an object or a one-element array on
 * purpose. This is a many-to-one embed, so PostgREST returns an object — but
 * without generated database types the client cannot infer the cardinality
 * and types it as an array. Accepting both costs one line and removes a
 * failure that would be invisible: read the wrong shape and every response is
 * quietly discarded, leaving a job that runs green, reports zero answers, and
 * looks exactly like a young bank with nothing to measure.
 */
type ResponseRow = {
  student_id: string | null;
  score_awarded: number | null;
  nclex_attempt_items: JoinedItem | JoinedItem[] | null;
};

/**
 * Turn one stored answer into a response the fit can use, or null if it
 * cannot be trusted.
 *
 * The fraction is `score_awarded / marks` — §4.5's Option 2, the same figure
 * the live engine consumes. Pure and exported so the awkward cases have tests
 * rather than assurances.
 */
export function toCalibrationResponse(row: ResponseRow): CalibrationResponse | null {
  const embedded = row.nclex_attempt_items;
  const item = Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
  if (!item?.item_id || !row.student_id) return null;

  const marks = item.marks_snapshot;
  const score = row.score_awarded;
  // A zero or missing mark total makes the fraction meaningless rather than
  // zero — dropping the answer is honest, scoring it 0 would be a fabricated
  // failure that drags the item's difficulty up.
  if (marks === null || marks <= 0 || score === null) return null;

  // Clamped because a scoring bug that awards more than the maximum would
  // otherwise feed the model a probability above 1, which it cannot
  // represent and which would quietly distort every estimate the item
  // touches.
  const fraction = Math.min(Math.max(score / marks, 0), 1);

  return {
    studentId: row.student_id,
    itemId: item.item_id,
    score: fraction,
    weight: item.parent_case_id ? CASE_CHILD_WEIGHT : 1,
  };
}

/** Read every row of a query, past PostgREST's silent 1,000-row cap. */
async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

/**
 * Run one recalibration.
 *
 * Takes the client rather than building one, so the caller decides which
 * database is being written to — and so this is callable from the manual
 * trigger (§5.3.2) when that slice lands, without a second implementation.
 */
export async function runCalibration(
  supabase: SupabaseClient,
  options: { runId: string; trigger: JobTrigger; triggeredBy?: string | null } = {
    runId: 'unknown',
    trigger: 'CRON',
  },
): Promise<CalibrationRunSummary> {
  const { runId, trigger, triggeredBy = null } = options;

  const empty: CalibrationRunSummary = {
    runId,
    trigger,
    haltedBySwitch: false,
    responsesRead: 0,
    studentsSeen: 0,
    itemsAnswered: 0,
    itemsOverThreshold: 0,
    itemsWritten: 0,
    skippedBelowThreshold: 0,
    skippedUnchanged: 0,
    iterations: 0,
    converged: true,
  };

  // ── the switch ─────────────────────────────────────────────────────
  // Only the literal 'false' stops it, matching the nightly enrolment sweep:
  // a missing row runs, so a config table that has lost a row fails towards
  // doing the work rather than towards silence.
  const { data: cfg, error: cfgError } = await supabase
    .from('nclex_config')
    .select('value')
    .eq('key', CONFIG_KEY)
    .maybeSingle();
  if (cfgError) throw new Error(`Could not read ${CONFIG_KEY}: ${cfgError.message}`);
  if ((cfg as { value: string } | null)?.value === 'false') {
    return { ...empty, haltedBySwitch: true };
  }

  // ── every answer, from every source ────────────────────────────────
  // §5.3.5 — practice and readiness responses count as well as CAT ones.
  // The pools are disjoint but the students overlap, and it is those common
  // students who put both onto one scale.
  const rows = await readAll<ResponseRow>((from, to) =>
    supabase
      .from('nclex_attempt_answers')
      .select(
        'student_id, score_awarded, nclex_attempt_items!inner(item_id, marks_snapshot, parent_case_id)',
      )
      .in('submission_status', ['SUBMITTED', 'AUTO_SUBMITTED'])
      .eq('nclex_attempt_items.item_source', 'BANK')
      .order('attempt_item_id')
      .range(from, to),
  );

  const responses = rows
    .map(toCalibrationResponse)
    .filter((r): r is CalibrationResponse => r !== null);

  if (responses.length === 0) return empty;

  // ── what the bank currently believes ───────────────────────────────
  const bankRows = await readAll<{
    item_id: string;
    difficulty_irt: number | null;
    difficulty_source: string | null;
  }>((from, to) =>
    supabase
      .from('nclex_bank_items')
      .select('item_id, difficulty_irt, difficulty_source')
      .order('item_id')
      .range(from, to),
  );

  const seeds = new Map<string, number>();
  const sources = new Map<string, string>();
  const previous = new Map<string, number | null>();
  for (const b of bankRows) {
    if (b.difficulty_irt !== null) seeds.set(b.item_id, Number(b.difficulty_irt));
    previous.set(b.item_id, b.difficulty_irt === null ? null : Number(b.difficulty_irt));
    sources.set(b.item_id, b.difficulty_source ?? 'CURATOR_LABEL');
  }

  // ── measure ────────────────────────────────────────────────────────
  const fit = fitDifficulties(responses, seeds);

  const candidates: CalibrationCandidate[] = fit.measuredItemIds.map((itemId) => ({
    itemId,
    previousValue: previous.get(itemId) ?? null,
    previousSource: sources.get(itemId) ?? 'CURATOR_LABEL',
    rawEmpirical: fit.difficulties.get(itemId)!,
    responseCount: fit.responseCounts.get(itemId) ?? 0,
  }));

  const plan = planCalibration(candidates);

  const summary: CalibrationRunSummary = {
    ...empty,
    responsesRead: responses.length,
    studentsSeen: fit.abilities.size,
    itemsAnswered: fit.responseCounts.size,
    itemsOverThreshold: fit.measuredItemIds.length,
    itemsWritten: 0,
    skippedBelowThreshold: plan.skipped.filter((s) => s.reason === 'BELOW_THRESHOLD').length,
    skippedUnchanged: plan.skipped.filter((s) => s.reason === 'UNCHANGED').length,
    iterations: fit.iterations,
    converged: fit.converged,
  };

  if (plan.writes.length === 0) return summary;

  // ── apply, all or nothing ──────────────────────────────────────────
  const { data: applied, error: applyError } = await supabase.rpc('nclex_apply_calibration', {
    p_run_id: runId,
    p_trigger: trigger,
    p_triggered_by: triggeredBy,
    p_rows: plan.writes.map((w) => ({
      item_id: w.itemId,
      new_value: w.newValue,
      raw_empirical_value: w.rawEmpirical,
      previous_value: w.previousValue,
      previous_source: w.previousSource,
      response_count: w.responseCount,
    })),
  });
  if (applyError) throw new Error(`Could not apply the run: ${applyError.message}`);

  return { ...summary, itemsWritten: Number(applied ?? 0) };
}

/**
 * The workflow's entry point.
 *
 * Uses the service-role key deliberately: this rewrites difficulty across the
 * whole bank, which no user-facing role may do. The key never leaves the
 * Action — it is not bundled into the app (CLAUDE.md rule 5).
 */
export async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  const trigger: JobTrigger = process.env.CALIBRATION_TRIGGER === 'MANUAL' ? 'MANUAL' : 'CRON';
  const runId = process.env.CALIBRATION_RUN_ID || `run_${new Date().toISOString()}`;

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const summary = await runCalibration(supabase, { runId, trigger });

  // The whole run log. A run that changed nothing writes no history rows, so
  // this output is the only record that it happened at all (§17.3).
  console.log(JSON.stringify(summary, null, 2));

  if (summary.haltedBySwitch) {
    console.log(`Halted: ${CONFIG_KEY} is false. Nothing was read or written.`);
  } else if (!summary.converged) {
    // Not fatal — the blend means a half-settled estimate moves the stored
    // value only partway anyway, and next week continues from here.
    console.warn('⚠ The fit hit its iteration cap before settling.');
  }
}

// Run only when the workflow asks for it. An explicit flag rather than an
// is-this-the-main-module check, so importing this file — a test, or the
// manual trigger when that slice lands — can never start a run by accident.
if (process.env.CALIBRATION_RUN === '1') {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
