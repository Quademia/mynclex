// mynclex/lib/bank/trend/validation.ts
//
// Slice 1.12c — client-side validation for the Trend editor.
//
// Pure module: no React, no DOM, no fetch. The editor assembles a
// TrendEditorState snapshot at Validate-click time and this module
// returns a list of ValidationIssue rows to render. Mirrors the Case
// Study 1.11c validation.ts structurally — two severities, flat rule
// array, same `summarise()` helper — with Trend-specific rules.
//
// What this does NOT do
//   - Enforce anything. The save RPC (nclex_save_trend_with_children)
//     owns publish-gate enforcement; this panel is early feedback.
//   - Auto-run. Validate fires only on button click.
//
// slot.content.invalid rule
//   The handoff names parseByType as the validator for per-question
//   content shape. Calling parseByType directly would duplicate the
//   parametric-object construction from initialToParsedItem. Cheaper
//   and drift-proof: reuse initialToParsedItem — the same helper the
//   save action uses. Its error messages are already user-facing.

import {
  initialToParsedItem,
} from '@/app/(app)/admin/bank/initial-to-parsed';
import type { BankFormInitial } from '../form-shape';
import type { TrendRow } from './types';

// ─────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  id:       string;
  severity: Severity;
  message:  string;
  // target identifies which surface the issue lives on.
  //   - kind: 'trend'  → dataset-level (header / table / counts)
  //   - kind: 'slot'   → a specific attached question; id is the
  //                      zero-based child index as a string, so the
  //                      editor can scroll/focus the right pill.
  target?:  { kind: 'trend' | 'slot'; id?: string };
}

// Per-child snapshot. Excludes pending-delete drafts (the editor
// filters them out before assembling this state, so the rules don't
// need to).
export interface TrendEditorChildSnapshot {
  item_id:  string | null;    // null = unsaved new draft
  initial:  BankFormInitial;
}

export interface TrendEditorState {
  title:        string;
  scenario:     string;
  is_published: boolean;
  timepoints:   string[];
  rows:         TrendRow[];
  children:     TrendEditorChildSnapshot[];
}

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

function slotTargetId(idx: number): string {
  return String(idx);
}

// A child has "intent" when the curator has typed a stem OR picked a
// question type that isn't the default MCQ. Used to distinguish
// authored drafts from empty just-clicked-Add slots. Mirrors the
// Case Study slotHasIntent predicate.
function childHasIntent(c: TrendEditorChildSnapshot): boolean {
  if (c.initial.stem.trim() !== '') return true;
  // question_type is non-nullable in BankFormInitial and defaults to
  // 'MCQ'. A non-default type + empty stem still counts as intent —
  // the curator changed the picker deliberately.
  return Boolean(c.initial.question_type) && c.initial.question_type !== 'MCQ';
}

// ─────────────────────────────────────────────────────────────
// Rule array
// ─────────────────────────────────────────────────────────────
//
// Order matters for display order: trend-level rules first, then
// slot-level, errors before warnings within each bucket.

type Rule = (state: TrendEditorState, issues: ValidationIssue[]) => void;

export const TREND_VALIDATION_RULES: readonly Rule[] = [
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

  // Integrity check: every row's values[] must line up with
  // timepoints[]. Rare but possible if editor state drifts.
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
    if (s.children.length === 0) {
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
    for (let i = 0; i < s.children.length; i++) {
      const c = s.children[i];
      if (!c) continue;
      // question_type present but stem empty → stem.missing.
      if (c.initial.question_type && c.initial.stem.trim() === '') {
        // Suppress on zero-intent slots (default MCQ + empty stem =
        // just-clicked-Add; not worth flagging as a stem error).
        if (!childHasIntent(c)) continue;
        out.push({
          id:       'slot.stem.missing',
          severity: 'error',
          message:  `Q${i + 1} has no stem.`,
          target:   { kind: 'slot', id: slotTargetId(i) },
        });
      }
    }
  },

  (s, out) => {
    for (let i = 0; i < s.children.length; i++) {
      const c = s.children[i];
      if (!c) continue;
      // Stem populated but question_type empty → type.missing.
      // BankFormInitial's question_type defaults to 'MCQ' so this
      // only fires if something bypassed the default (stale data,
      // bad cast). Kept defensively per the handoff rule list.
      if (c.initial.stem.trim() !== '' && !c.initial.question_type) {
        out.push({
          id:       'slot.type.missing',
          severity: 'error',
          message:  `Q${i + 1} has no question type.`,
          target:   { kind: 'slot', id: slotTargetId(i) },
        });
      }
    }
  },

  // Per-type content-shape check via initialToParsedItem (the same
  // helper the save RPC caller uses). Only fires when both type and
  // stem are populated — content-shape errors on empty drafts aren't
  // actionable yet.
  (s, out) => {
    for (let i = 0; i < s.children.length; i++) {
      const c = s.children[i];
      if (!c) continue;
      if (!c.initial.question_type) continue;
      if (c.initial.stem.trim() === '') continue;
      const parsed = initialToParsedItem(c.initial);
      if (!parsed.ok) {
        out.push({
          id:       'slot.content.invalid',
          severity: 'error',
          message:  `Q${i + 1}: ${parsed.error}`,
          target:   { kind: 'slot', id: slotTargetId(i) },
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
    if (s.children.length === 0) {
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

  // Type-diversity nudge: 3+ children sharing the same host type.
  // Fires once per duplicated type, naming the type.
  (s, out) => {
    if (s.children.length < 3) return;
    const counts = new Map<string, number>();
    for (const c of s.children) {
      const t = c.initial.question_type;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    for (const [type, count] of counts) {
      if (count >= 3 && count === s.children.length) {
        // All children share one type — surface the nudge once.
        out.push({
          id:       'trend.question.type_diversity',
          severity: 'warning',
          message:
            `All ${count} attached questions are ${type}. Mixing types ` +
            `(e.g. Matrix + Cloze + SATA) against the same trend is ` +
            `usually richer for students.`,
          target:   { kind: 'trend' },
        });
      }
    }
  },

  (s, out) => {
    // No flags set anywhere in the dataset. Trends without any
    // "red-flag" cells are unusual — curator may have forgotten to
    // mark them.
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
];

// ─────────────────────────────────────────────────────────────
// Public runner
// ─────────────────────────────────────────────────────────────

export function validateTrend(state: TrendEditorState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const rule of TREND_VALIDATION_RULES) rule(state, issues);
  return issues;
}

// Panel-header summary variant. Same three-way shape as the Case
// Study summariser so the two panels read identically.
export type PanelSummaryKind = 'ready' | 'blocked' | 'draft';

export interface PanelSummary {
  kind:    PanelSummaryKind;
  text:    string;
  errors:  number;
  warns:   number;
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
