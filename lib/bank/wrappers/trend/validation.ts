// mynclex/lib/bank/wrappers/trend/validation.ts
//
// Client-side validation for the trend wrapper. Manual-only; fires
// on Validate-button click.
//
// Pure module: no React, no DOM, no fetch. The wrapper page assembles
// a TrendValidationState snapshot at click time and this module
// returns a list of ValidationIssue rows to render.
//
// Snapshot reads SlotRow shapes (post-load) — the wrapper rebuilds
// the snapshot from the loaded slots, not from mid-edit form state.
// Per-question content-shape checks happen at save time (the
// save-question action runs the same parser); the panel surfaces
// wrapper-level shape issues that those per-save errors don't see.

import type { SlotRow, TrendRow } from './types';

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  id:       string;
  severity: Severity;
  message:  string;
  // target identifies which surface the issue lives on:
  //   - kind: 'trend' → dataset-level (header / table / counts)
  //   - kind: 'slot'  → a specific attached question; id is the
  //                     1-based position as a string.
  target?:  { kind: 'trend' | 'slot'; id?: string };
}

// Snapshot the wrapper assembles before calling validateTrend().
export interface TrendValidationState {
  title:        string;
  scenario:     string;
  is_published: boolean;
  timepoints:   string[];
  rows:         TrendRow[];
  slots:        SlotRow[];
}

// ─────────────────────────────────────────────────────────────
// Rule array — order matters for display order. Trend-level rules
// first, then slot-level; errors before warnings within each bucket.
// ─────────────────────────────────────────────────────────────

type Rule = (state: TrendValidationState, issues: ValidationIssue[]) => void;

const RULES: readonly Rule[] = [
  // ── Trend-level errors ────────────────────────────────────

  (s, out) => {
    if (!s.title.trim()) {
      out.push({
        id:       'trend.title.missing',
        severity: 'error',
        message:  'Dataset title is empty.',
        target:   { kind: 'trend' },
      });
    }
  },

  (s, out) => {
    if (s.rows.length === 0) {
      out.push({
        id:       'trend.rows.zero',
        severity: 'error',
        message:  'Dataset has no rows. Add at least one metric row.',
        target:   { kind: 'trend' },
      });
    }
  },

  (s, out) => {
    if (s.timepoints.length === 0) {
      out.push({
        id:       'trend.timepoints.zero',
        severity: 'error',
        message:  'Dataset has no timepoints. Add at least one column.',
        target:   { kind: 'trend' },
      });
    }
  },

  // Integrity: every row's values[] must align with timepoints[].
  // Rare but possible if editor state drifts.
  (s, out) => {
    for (let i = 0; i < s.rows.length; i++) {
      const row = s.rows[i];
      if (!row) continue;
      if (row.values.length !== s.timepoints.length) {
        const label = row.metric.trim() || `row ${i + 1}`;
        out.push({
          id:       'trend.row_values_mismatch',
          severity: 'error',
          message:
            `Row "${label}" has ${row.values.length} value(s) but the ` +
            `dataset has ${s.timepoints.length} timepoint(s). Cell counts ` +
            `must match.`,
          target:   { kind: 'trend' },
        });
      }
    }
  },

  // Publish gate: need at least one attached question.
  (s, out) => {
    if (!s.is_published) return;
    if (s.slots.length === 0) {
      out.push({
        id:       'trend.question.zero_on_publish',
        severity: 'error',
        message:
          'Publishing requires at least one attached question. ' +
          'Add a question or un-tick Published.',
        target:   { kind: 'trend' },
      });
    }
  },

  // ── Slot-level errors ─────────────────────────────────────

  (s, out) => {
    for (const slot of s.slots) {
      if (!slot.stem.trim()) {
        out.push({
          id:       'slot.stem.missing',
          severity: 'error',
          message:  `Q${slot.position} has no stem.`,
          target:   { kind: 'slot', id: String(slot.position) },
        });
      }
    }
  },

  // ── Trend-level warnings ──────────────────────────────────

  (s, out) => {
    if (!s.scenario.trim()) {
      out.push({
        id:       'trend.scenario.missing',
        severity: 'warning',
        message:
          'Scenario is empty. A short clinical setup helps students ' +
          'frame what the trend is measuring.',
        target:   { kind: 'trend' },
      });
    }
  },

  (s, out) => {
    if (s.is_published) return;
    if (s.slots.length === 0) {
      out.push({
        id:       'trend.question.zero_on_draft',
        severity: 'warning',
        message:
          'Draft dataset has no attached questions yet. Add at least ' +
          'one question before publishing.',
        target:   { kind: 'trend' },
      });
    }
  },

  // Published dataset whose questions are ALL still drafts → it reads
  // "published" but reaches no students (a trend question is delivered
  // only when both the question and its dataset are published). A mix of
  // published + draft questions is fine (incremental publishing), so this
  // fires only when none are live. Warning, not error — it doesn't block.
  (s, out) => {
    if (!s.is_published) return;
    if (s.slots.length === 0) return;   // the zero-on-publish error covers this
    const anyPublished = s.slots.some((slot) => slot.is_published);
    if (!anyPublished) {
      const n = s.slots.length;
      out.push({
        id:       'trend.questions.none_published',
        severity: 'warning',
        message:
          `This dataset is published but none of its ${n} question` +
          `${n === 1 ? '' : 's'} are — students won't see anything from it ` +
          `yet. Publish a question to make it live.`,
        target:   { kind: 'trend' },
      });
    }
  },

  // No flags set anywhere — unusual for a trend dataset (curator
  // typically marks "red flag" cells for the questions to test).
  (s, out) => {
    if (s.rows.length === 0) return;
    const anyFlag = s.rows.some((r) => r.flags.some((f) => f !== null));
    if (!anyFlag) {
      out.push({
        id:       'trend.flags.none',
        severity: 'warning',
        message:
          'No cells are flagged (abnormal / borderline). Most trend ' +
          'datasets flag at least one cell so the curator can see ' +
          "which values they're testing.",
        target:   { kind: 'trend' },
      });
    }
  },

  // Type-diversity nudge: 3+ slots all sharing one host type.
  (s, out) => {
    if (s.slots.length < 3) return;
    const counts = new Map<string, number>();
    for (const slot of s.slots) {
      counts.set(slot.question_type, (counts.get(slot.question_type) ?? 0) + 1);
    }
    for (const [type, count] of counts) {
      if (count >= 3 && count === s.slots.length) {
        out.push({
          id:       'trend.question.type_diversity',
          severity: 'warning',
          message:
            `All ${count} attached questions are ${type}. Mixing types ` +
            `(e.g. Matrix + Cloze + SATA) against the same trend is ` +
            `usually richer for students.`,
          target:   { kind: 'trend' },
        });
        break;  // surface the nudge only once
      }
    }
  },
];

export function validateTrend(state: TrendValidationState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const rule of RULES) rule(state, issues);
  return issues;
}

// ─────────────────────────────────────────────────────────────
// Panel-header summary. Same three-way shape as CS's summarise()
// so the two panels read identically.
// ─────────────────────────────────────────────────────────────

export type PanelSummaryKind = 'ready' | 'blocked' | 'draft';

export interface PanelSummary {
  kind:   PanelSummaryKind;
  text:   string;
  errors: number;
  warns:  number;
}

export function summarise(
  issues:      ValidationIssue[],
  isPublished: boolean,
): PanelSummary {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warns  = issues.filter((i) => i.severity === 'warning').length;

  const errWord  = errors === 1 ? 'error'   : 'errors';
  const warnWord = warns  === 1 ? 'warning' : 'warnings';

  if (isPublished && errors === 0) {
    return { kind: 'ready', text: 'Ready to publish', errors, warns };
  }
  if (isPublished) {
    return {
      kind:   'blocked',
      text:   `${errors} ${errWord}, ${warns} ${warnWord} — not ready`,
      errors,
      warns,
    };
  }
  return {
    kind:   'draft',
    text:   `Draft — ${errors} ${errWord}, ${warns} ${warnWord}`,
    errors,
    warns,
  };
}
