// mynclex/lib/practice/cases/derive.ts
//
// Pure helpers for the student Case Study bank. No I/O, no React — all of
// this is unit-tested in derive.test.ts.
//
// ── Why a snippet extractor exists at all ────────────────────────────
// nclex_case_studies.scenario_summary holds TWO formats in the same
// column: Tiptap JSON for cases authored since the rich-content relook
// (2026-07-04) and plain text for the older ones. On dev today that is
// 71 rich / 22 plain of 93 published. Anything rendering a preview has to
// handle both, so the extractor walks a Tiptap doc for text nodes and
// falls back to treating the value as prose.

import {
  QUESTIONS_PER_CASE,
  type CaseAttemptEntry,
  type CaseAttemptOrigin,
  type CaseBankRow,
  type CaseFilterId,
  type CaseGroup,
  type CaseBankMode,
} from './types';

/** How much scenario text a collapsed-then-expanded row shows. */
const SNIPPET_CHARS = 260;

interface TiptapNodeish {
  type?: unknown;
  text?: unknown;
  content?: unknown;
}

/**
 * Depth-first walk collecting `text` from Tiptap text nodes. Block-level
 * nodes contribute a space so words don't weld across paragraphs
 * ("...admission.A 24-year-old...").
 */
function collectTiptapText(node: unknown, out: string[]): void {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const child of node) collectTiptapText(child, out);
    return;
  }

  const n = node as TiptapNodeish;

  if (n.type === 'text' && typeof n.text === 'string') {
    out.push(n.text);
    return;
  }

  if (n.content !== undefined) {
    collectTiptapText(n.content, out);
    // A block boundary reads as whitespace.
    out.push(' ');
  }
}

/** Collapse runs of whitespace (including the separators we injected). */
function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Plain-text snippet from a `scenario_summary` value of either format.
 * Returns null for anything that yields no usable prose — the caller
 * renders nothing rather than an empty bubble.
 *
 * Truncation lands on a word boundary and appends an ellipsis; a scenario
 * shorter than the budget comes back whole with no ellipsis.
 */
export function caseSummarySnippet(
  raw: unknown,
  maxChars: number = SNIPPET_CHARS,
): string | null {
  if (raw === null || raw === undefined) return null;

  let text = '';

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // A Tiptap doc arrives as a JSON *string* from the RPC. Anything that
    // doesn't parse into a doc-shaped object is treated as prose — which
    // is also the right answer for text that merely happens to start
    // with a brace.
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        const acc: string[] = [];
        collectTiptapText(parsed, acc);
        text = squash(acc.join(''));
      } catch {
        text = squash(trimmed);
      }
    } else {
      text = squash(trimmed);
    }
  } else if (typeof raw === 'object') {
    // Already-parsed JSONB (supabase-js hands back objects for jsonb).
    const acc: string[] = [];
    collectTiptapText(raw, acc);
    text = squash(acc.join(''));
  } else {
    return null;
  }

  if (!text) return null;
  if (text.length <= maxChars) return text;

  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  // Guard against a single very long token producing an empty head.
  const head = lastSpace > maxChars * 0.5 ? cut.slice(0, lastSpace) : cut;
  return `${head.replace(/[.,;:\s]+$/, '')}…`;
}

/**
 * The row's meta line: "Medical-Surgical · Endocrine".
 *
 * Both values are the DOMINANT subject and body system across the case's
 * six children, picked in SQL (see the migration's `axes` CTE for why the
 * dominant one rather than all of them — listing every distinct value
 * described the questions instead of the case and ran longer than the
 * title).
 *
 * Deliberately NOT the raw `tags` column, which holds curator/ops
 * vocabulary (`synthetic`, `CATPREP`, `Maryland`) — and one value,
 * `readiness`, would have told the student exactly which cases are pack
 * members.
 *
 * Deliberately carries NO question count (every case is six, so it is the
 * same string on every row) and NO difficulty word (the average case
 * spans ~1.9 logits between its easiest and hardest question, so one
 * label per case would misrepresent it).
 */
export function caseAxesLabel(
  subject: string | null | undefined,
  body: string | null | undefined,
): string {
  return [subject, body]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v !== '')
    .join(' · ');
}

/** Colour band for a score pill. Mirrors the prototype's thresholds. */
export function scoreTone(pct: number): 'good' | 'mid' | 'poor' {
  if (pct >= 80) return 'good';
  if (pct >= 60) return 'mid';
  return 'poor';
}

// ── Attempt history ───────────────────────────────────────────────────

/**
 * Where a history entry links to.
 *
 * ⭐ This is what keeps the page honest. Sending every entry to
 * /session/[id] is what made "Review" open a 100-question CAT at its
 * LAST question, 90 questions from the case you clicked (measured on a
 * real dev row). A readiness sitting and a CAT sitting already have
 * proper homes — their report and their result page — so they go there
 * instead of into the runner.
 *
 * Only a sitting that is actually about this case (a case-bank run) or
 * small enough to read (an ordinary practice run) opens the runner.
 */
export function attemptHref(entry: CaseAttemptEntry): string {
  switch (entry.origin) {
    case 'READINESS':
      return `/student/bank/packs/report/${entry.attemptId}`;
    case 'CAT':
      return `/student/bank/cat/result/${entry.attemptId}`;
    case 'CASE_BANK':
    case 'PRACTICE':
    case 'PROGRAMME':
      return `/session/${entry.attemptId}`;
  }
}

/** What that destination is, so the link doesn't promise the wrong thing. */
export function attemptLinkLabel(origin: CaseAttemptOrigin): string {
  switch (origin) {
    case 'CASE_BANK': return 'Review';
    case 'READINESS': return 'Pack report';
    case 'CAT':       return 'CAT result';
    case 'PRACTICE':  return 'Review';
    case 'PROGRAMME': return 'Review';
  }
}

/** Where this sitting came from, in the student's words. */
export function originLabel(origin: CaseAttemptOrigin): string {
  switch (origin) {
    case 'CASE_BANK': return 'Case study';
    case 'READINESS': return 'Readiness pack';
    case 'CAT':       return 'CAT exam';
    case 'PRACTICE':  return 'Practice';
    case 'PROGRAMME': return 'Assigned quiz';
  }
}

/**
 * The score to print for one sitting.
 *
 * A percentage alone conflates "did badly" with "never answered" — both
 * render 0%. A real dev row has a readiness sitting with 0 of 6 answered
 * sitting next to one with 5 of 6; showing both as a red percentage
 * would have told the student two different things in the same words.
 */
export function attemptScoreLabel(entry: CaseAttemptEntry): string {
  if (entry.answered === 0) return 'Not answered';
  return `${entry.pct}%`;
}

/**
 * "6 of 6" — how much of the case that sitting actually covered. Null
 * when it covered all of it and there is nothing to caveat.
 */
export function attemptCoverageLabel(entry: CaseAttemptEntry): string | null {
  if (entry.answered === 0) return null;             // the score label says it
  if (entry.answered === entry.served) return null;  // nothing to explain
  return `${entry.answered} of ${entry.served} answered`;
}

/**
 * The sitting the collapsed row summarises: the most recent one from
 * THIS page. Null for a case only ever met in an exam — which is
 * precisely why such a case shows no score and no Review button, and
 * waits in "Ready to sit" with its result inside the expanded history.
 */
export function headlineAttempt(row: CaseBankRow): CaseAttemptEntry | null {
  return row.history.find((e) => e.origin === 'CASE_BANK') ?? null;
}

/** "12 Jul 2026", or null when there's no timestamp to show. */
export function formatAttemptDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Questions in a run of N cases. */
export function runQuestionCount(selectedCount: number): number {
  return selectedCount * QUESTIONS_PER_CASE;
}

/**
 * Search + attempted-filter, then bucket into the three groups.
 *
 * ⭐ "Attempted" means SAT HERE, not "met somewhere" (Sam, 2026-07-29).
 * A case met inside a CAT or a readiness pack waits in "Ready to sit"
 * with its result kept in `history`. Two reasons: it makes the Review
 * button safe by construction — the only sittings it can point at are
 * this page's own 1- or 2-case runs — and it is the truer claim, since
 * meeting six questions buried in a timed 100-question exam, with no
 * rationales at the time, is not the same as having studied the case.
 *
 * Locked rows are exempt from the Attempted/Not-attempted filter — they
 * aren't takeable, so filtering them by attempt state is meaningless and
 * it would make the "Not available" count jump around for no reason. They
 * still respond to the search box.
 */
export function groupCases(
  rows: readonly CaseBankRow[],
  query: string,
  filter: CaseFilterId,
): CaseGroup[] {
  const q = query.trim().toLowerCase();

  const matches = (r: CaseBankRow): boolean => {
    if (!q) return true;
    // Locked rows are searchable by title + axes only; they have no
    // snippet to search (and must not gain one).
    return `${r.title} ${r.axes}`.toLowerCase().includes(q);
  };

  const passesFilter = (r: CaseBankRow): boolean => {
    if (r.locked) return true;
    if (filter === 'new') return !r.satHere;
    if (filter === 'done') return r.satHere;
    return true;
  };

  const visible = rows.filter((r) => matches(r) && passesFilter(r));

  const buckets: CaseGroup[] = [
    { key: 'ready',       title: 'Ready to sit',      rows: visible.filter((r) => !r.locked && !r.satHere) },
    { key: 'attempted',   title: 'Already attempted', rows: visible.filter((r) => !r.locked && r.satHere) },
    { key: 'unavailable', title: 'Not available',     rows: visible.filter((r) => r.locked) },
  ];

  return buckets.filter((b) => b.rows.length > 0);
}

/** One-line note under the mode picker. */
export const MODE_NOTE: Record<CaseBankMode, string> = {
  UNTIMED_LEARNING: 'Rationale appears right after each answer.',
  UNTIMED_TEST: 'No clock. Rationales arrive when you finish.',
  TIMED_FREE_NAV: 'Engagement clock — pauses if you step away.',
};

/**
 * The rail's helper line. Says what the student can do next without
 * implying a second case is required — one case is a legitimate run.
 */
export function runHint(selectedCount: number, reattempts: number): string {
  // `reattempts` counts cases sat HERE before — not cases merely met in an
  // exam, which are offered as fresh material and shouldn't be described
  // as a reattempt.
  if (selectedCount === 0) {
    return 'Pick a case to begin. Each one is six questions; you can add a second.';
  }
  if (reattempts > 0) {
    return `Includes ${reattempts} you've sat before — your earlier result stays in History.`;
  }
  if (selectedCount === 1) {
    return 'Ready to start. You can add one more case if you want a longer run.';
  }
  return 'Both cases added. Your run is ready.';
}
