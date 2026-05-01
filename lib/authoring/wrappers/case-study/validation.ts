// mynclex/lib/authoring/wrappers/case-study/validation.ts
//
// Slice 12c-4a — client-side validation for the v2 case-study wrapper.
// Pure: no React, no DOM, no fetch. Takes a CaseEditorState snapshot
// (assembled by wrapper-page.tsx at Validate-time) and returns a list
// of ValidationIssue rows. The wrapper page renders those in a
// dismissible floating panel.
//
// Server-side enforcement still lives in the publish-gate path — this
// module is early feedback for the curator, not a security check.
//
// Rules are all in a flat array so adding a rule is a single push.

import type { CjmmStep } from '../../classifications';
import type { ChartEntry } from './types';

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  id:       string;
  severity: Severity;
  message:  string;
  target?:  { kind: 'tab' | 'slot'; id: string };
}

// State snapshot the validator operates on. The wrapper page
// assembles this at click-time. v2-simplified vs the legacy validator:
// no BankFormInitial dependency — slots carry just the loaded
// summary fields (item_id presence, question_type, stem, cjmm).
// Enough for the rules below.
export interface SlotSnapshot {
  position:      number;            // 1-6
  has_item:      boolean;           // join row + bank item exist
  question_type: string | null;
  stem:          string;            // empty when has_item is false
  cjmm_step:     CjmmStep | null;
}

export interface TabSnapshot {
  tab_id:  string;
  title:   string;
  entries: ChartEntry[];
}

export interface CaseEditorState {
  title:            string;
  scenario_summary: string;
  is_published:     boolean;
  tabs:             TabSnapshot[];
  slots:            SlotSnapshot[];   // length 6
}

function tabLabel(t: TabSnapshot): string {
  return t.title.trim() || '(untitled tab)';
}

function slotTargetId(position: number): string {
  return `slot-${position}`;
}

type Rule = (state: CaseEditorState, out: ValidationIssue[]) => void;

const RULES: readonly Rule[] = [
  // ── Case-level errors ─────────────────────────────────────
  (s, out) => {
    if (!s.title.trim()) {
      out.push({ id: 'case.title.missing', severity: 'error', message: 'Case title is empty.' });
    }
  },
  (s, out) => {
    if (!s.scenario_summary.trim()) {
      out.push({ id: 'case.summary.missing', severity: 'error', message: 'Scenario summary is empty.' });
    }
  },
  (s, out) => {
    if (s.tabs.length === 0) {
      out.push({ id: 'case.tabs.zero', severity: 'error', message: 'Case has no chart tabs. Add at least one to the chart.' });
    }
  },

  // ── Publish-gate underfill ────────────────────────────────
  // Server enforces this too; client check gives faster feedback.
  (s, out) => {
    if (!s.is_published) return;
    const populated = s.slots.filter((slot) => slot.has_item).length;
    if (populated < 6) {
      out.push({
        id: 'case.slots.underfilled_on_publish',
        severity: 'error',
        message: `Publishing requires all 6 slots populated — only ${populated} so far.`,
      });
    }
  },
  (s, out) => {
    if (s.is_published) return;
    const populated = s.slots.filter((slot) => slot.has_item).length;
    if (populated < 6) {
      out.push({
        id: 'case.slots.underfilled_on_draft',
        severity: 'warning',
        message: `Draft has ${populated}/6 slots populated.`,
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
      if (t.entries.length === 0) continue;   // covered above
      const hasQ1 = t.entries.some((e) => Number(e.visible_from) === 1);
      if (!hasQ1) {
        out.push({
          id:       'tab.no_q1_entry',
          severity: 'warning',
          message:
            `Tab "${tabLabel(t)}" has no entry visible from Q1 — students will see an empty tab at Q1.`,
          target:   { kind: 'tab', id: t.tab_id },
        });
      }
    }
  },

  // ── Slot-level errors ─────────────────────────────────────
  // Only check slots with an attached question. CJMM-missing on
  // a populated slot is an error (publish gate also re-checks).
  (s, out) => {
    for (const slot of s.slots) {
      if (!slot.has_item) continue;
      if (!slot.stem.trim()) {
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
      if (!slot.has_item) continue;
      if (!slot.question_type) {
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
      if (!slot.has_item) continue;
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

export function validateCase(state: CaseEditorState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const rule of RULES) rule(state, issues);
  return issues;
}

export type PanelSummaryKind = 'ready' | 'blocked' | 'draft';

export interface PanelSummary {
  kind:   PanelSummaryKind;
  text:   string;
  errors: number;
  warns:  number;
}

export function summarise(issues: ValidationIssue[], isPublished: boolean): PanelSummary {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warns  = issues.filter((i) => i.severity === 'warning').length;

  if (isPublished && errors === 0) {
    return { kind: 'ready', text: 'Ready to publish', errors, warns };
  }
  if (isPublished) {
    const errWord  = errors === 1 ? 'error'   : 'errors';
    const warnWord = warns  === 1 ? 'warning' : 'warnings';
    return { kind: 'blocked', text: `${errors} ${errWord}, ${warns} ${warnWord} — not ready`, errors, warns };
  }
  const errWord  = errors === 1 ? 'error'   : 'errors';
  const warnWord = warns  === 1 ? 'warning' : 'warnings';
  return { kind: 'draft', text: `Draft — ${errors} ${errWord}, ${warns} ${warnWord}`, errors, warns };
}
