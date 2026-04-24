// mynclex/lib/bank/case-study/validation.ts
//
// Slice 1.11c — client-side validation for the Case Study editor.
//
// This module is pure: no React, no DOM, no fetch. It takes a
// CaseEditorState snapshot (built by editor.tsx at Validate-time)
// and returns a list of ValidationIssue rows. The editor renders
// those rows in a dismissible panel next to the Save button.
//
// What this does NOT do
//   - Enforce anything. The server-side RPC (see
//     mynclex_case_save_rpc_slice_1_11b.sql) owns enforcement.
//     This is early feedback for the curator, not a replacement.
//   - Auto-run. Validation only fires when the curator clicks
//     the Validate button. Save never calls this.
//
// Rule array
//   Every rule is a single arrow function added to `RULES` below.
//   Keeping them in a flat array (not a switch / not per-rule
//   files) makes the rule set grep-friendly and easy to scan when
//   adding a rule later. Each rule reads state and pushes 0-N
//   issues into the `issues` array.
//
// Two "populated" definitions
//   - Tight: `isSlotPopulated(draft)` = stem has non-whitespace
//     text. Mirrors what the server uses to decide which slots
//     to persist. Used by the publish-count rules.
//   - Loose: `slotHasIntent(draft, cjmm)` = draft exists AND
//     (stem is set OR cjmm_step is set). Used by slot-level
//     error rules so "curator clicked Q3, picked CJMM, forgot
//     stem" surfaces `slot.stem.missing` instead of being
//     silently dropped.

import type { CjmmStep } from '../classifications';
import { isSlotPopulated } from '@/app/(app)/admin/bank/slot-parser';
import type { BankFormInitial } from '../form-shape';
import type { CaseStudyEntry } from './types';

// ─────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  id:       string;
  severity: Severity;
  message:  string;
  target?:  { kind: 'tab' | 'slot'; id: string };
}

// State snapshot the validator operates on. editor.tsx assembles
// this at click-time from: case-header form DOM (title, summary,
// is_published), tabsSorted + drafts (tabs), slotDrafts + slotCjmm
// (slots). The shape is local to the validator; the editor owns
// the assembly. Changing this shape means updating both call site
// and rules.
export interface CaseEditorTabSnapshot {
  tab_id:  string;
  title:   string;
  entries: CaseStudyEntry[];
}

export interface CaseEditorSlotSnapshot {
  position:  number;                  // 1-6
  draft:     BankFormInitial | null;
  cjmm_step: CjmmStep | null;
}

export interface CaseEditorState {
  title:            string;
  scenario_summary: string;
  is_published:     boolean;
  tabs:             CaseEditorTabSnapshot[];
  slots:            CaseEditorSlotSnapshot[];  // length 6, position 1..6
}

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

// Loose "has intent" check — see module header comment. A slot
// counts as intended iff the curator has set stem text OR picked a
// CJMM step. Empty-and-untouched slots are ignored by the slot-level
// error rules.
function slotHasIntent(
  draft: BankFormInitial | null,
  cjmm:  CjmmStep | null,
): boolean {
  if (draft === null) return false;
  if (draft.stem.trim() !== '') return true;
  if (cjmm !== null) return true;
  return false;
}

function slotTargetId(position: number): string {
  return `slot-${position}`;
}

// Display helper. Untitled tabs still need to appear in messages;
// empty-string titles get a visible placeholder.
function tabLabel(t: CaseEditorTabSnapshot): string {
  return t.title.trim() || '(untitled tab)';
}

// ─────────────────────────────────────────────────────────────
// Rule array
// ─────────────────────────────────────────────────────────────
//
// Order matters for the panel's display order: case-level rules
// first, then tab-level, then slot-level. Within each bucket, rules
// are listed in the order the handoff specified so a future reader
// can diff this file against the plan doc.
//
// A rule is a function that receives the state and the current
// `issues` array, and pushes 0-N issues directly. Returning nothing
// keeps call-site iteration simple.

type Rule = (state: CaseEditorState, issues: ValidationIssue[]) => void;

export const RULES: readonly Rule[] = [
  // ── Case-level ────────────────────────────────────────────
  (s, out) => {
    if (!s.title.trim()) {
      out.push({
        id:       'case.title.missing',
        severity: 'error',
        message:  'Case title is empty.',
      });
    }
  },

  (s, out) => {
    if (!s.scenario_summary.trim()) {
      out.push({
        id:       'case.summary.missing',
        severity: 'error',
        message:  'Scenario summary is empty.',
      });
    }
  },

  (s, out) => {
    if (s.tabs.length === 0) {
      out.push({
        id:       'case.tabs.zero',
        severity: 'error',
        message:  'Case has no tabs. Add at least one tab to the chart.',
      });
    }
  },

  // Publish-count gate. Uses isSlotPopulated (stem-based) to mirror
  // the server's definition of "populated" — what the RPC actually
  // enforces. Draft-case underfill gets a softer warning via the
  // warnings bucket below (and is suppressed when is_published).
  (s, out) => {
    if (!s.is_published) return;
    const populated = s.slots.filter(
      (slot) => slot.draft !== null && isSlotPopulated(slot.draft),
    ).length;
    if (populated < 6) {
      out.push({
        id:       'case.slots.underfilled_on_publish',
        severity: 'error',
        message:
          `Publishing requires all 6 slots populated — only ${populated} so far.`,
      });
    }
  },

  // Draft-case underfill. Paired with the publish rule above;
  // suppressed when is_published = TRUE so the curator isn't shown
  // both a warning and an error about the same thing.
  (s, out) => {
    if (s.is_published) return;
    const populated = s.slots.filter(
      (slot) => slot.draft !== null && isSlotPopulated(slot.draft),
    ).length;
    if (populated < 6) {
      out.push({
        id:       'case.slots.underfilled_on_draft',
        severity: 'warning',
        message:  `Draft has ${populated}/6 slots populated.`,
      });
    }
  },

  // ── Tab-level warnings ────────────────────────────────────
  (s, out) => {
    for (const t of s.tabs) {
      if (t.entries.length === 0) {
        out.push({
          id:       'tab.no_entries',
          severity: 'warning',
          message:  `Tab "${tabLabel(t)}" has no entries.`,
          target:   { kind: 'tab', id: t.tab_id },
        });
      }
    }
  },

  (s, out) => {
    for (const t of s.tabs) {
      if (t.entries.length === 0) continue;   // handled above
      const hasQ1 = t.entries.some(
        (e) => Number(e.visible_from) === 1,
      );
      if (!hasQ1) {
        out.push({
          id:       'tab.no_q1_entry',
          severity: 'warning',
          message:
            `Tab "${tabLabel(t)}" has no entry with visible-from = 1 — ` +
            `students will see an empty tab at Q1.`,
          target:   { kind: 'tab', id: t.tab_id },
        });
      }
    }
  },

  // ── Slot-level errors ─────────────────────────────────────
  // Loose "has intent" check — see module header + slotHasIntent
  // comment. Skips truly empty slots.
  (s, out) => {
    for (const slot of s.slots) {
      if (!slotHasIntent(slot.draft, slot.cjmm_step)) continue;
      if (!slot.draft!.stem.trim()) {
        out.push({
          id:       'slot.stem.missing',
          severity: 'error',
          message:  `Q${slot.position} has no stem.`,
          target:   { kind: 'slot', id: slotTargetId(slot.position) },
        });
      }
    }
  },

  (s, out) => {
    for (const slot of s.slots) {
      if (!slotHasIntent(slot.draft, slot.cjmm_step)) continue;
      // question_type is non-nullable per BankFormInitial. Checking
      // falsy here catches bad casts and any future loosening of
      // the type — defensive only.
      if (!slot.draft!.question_type) {
        out.push({
          id:       'slot.type.missing',
          severity: 'error',
          message:  `Q${slot.position} has no question type.`,
          target:   { kind: 'slot', id: slotTargetId(slot.position) },
        });
      }
    }
  },

  (s, out) => {
    for (const slot of s.slots) {
      if (!slotHasIntent(slot.draft, slot.cjmm_step)) continue;
      if (slot.cjmm_step === null) {
        out.push({
          id:       'slot.cjmm.missing',
          severity: 'error',
          message:  `Q${slot.position} has no CJMM step.`,
          target:   { kind: 'slot', id: slotTargetId(slot.position) },
        });
      }
    }
  },
];

// ─────────────────────────────────────────────────────────────
// Public runner
// ─────────────────────────────────────────────────────────────

export function validateCase(state: CaseEditorState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const rule of RULES) rule(state, issues);
  return issues;
}

// Panel-header variant. The editor renders one of three summary
// styles based on counts + publish state. Co-located here so the
// logic matches the plan doc's "Panel header logic" block.
export type PanelSummaryKind = 'ready' | 'blocked' | 'draft';

export interface PanelSummary {
  kind:    PanelSummaryKind;
  text:    string;
  errors:  number;
  warns:   number;
}

export function summarise(
  issues:       ValidationIssue[],
  isPublished:  boolean,
): PanelSummary {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warns  = issues.filter((i) => i.severity === 'warning').length;

  if (isPublished && errors === 0) {
    return { kind: 'ready', text: 'Ready to publish', errors, warns };
  }
  if (isPublished) {
    const errWord  = errors === 1 ? 'error'   : 'errors';
    const warnWord = warns  === 1 ? 'warning' : 'warnings';
    return {
      kind:   'blocked',
      text:   `${errors} ${errWord}, ${warns} ${warnWord} — not ready`,
      errors,
      warns,
    };
  }
  const errWord  = errors === 1 ? 'error'   : 'errors';
  const warnWord = warns  === 1 ? 'warning' : 'warnings';
  return {
    kind:   'draft',
    text:   `Draft — ${errors} ${errWord}, ${warns} ${warnWord}`,
    errors,
    warns,
  };
}
