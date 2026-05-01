// mynclex/lib/authoring/parsers/highlight.ts
//
// Highlight parser. Takes the passage (with [[chunk]] markers) and the curator's
// per-chunk decisions from FormData, and produces a normalised
// (stem, content, correct) trio.
//
// Jobs:
//   1. Extract [[bracketed]] spans from the passage, non-greedy. Inner
//      single brackets are permitted inside a span ([[low Hgb [<10]]])
//      — the non-greedy .+? stops at the first ]].
//   2. Drop orphan chunk cards (present in FormData but not in passage).
//   3. Assign fresh positional IDs h1, h2, … in passage order.
//   4. Validate bounds + every chunk has a decision + at least one
//      correct + at least one wrong.
//
// The stem itself is NOT rewritten — brackets carry their own text, so
// there are no numeric markers that could collide. Unlike Cloze, the
// returned `stem` is byte-identical to the input (we still return it
// under the `stem` field for dispatcher-shape consistency).
//
// Duplicate text handling: if the passage has two identical bracketed
// spans (e.g. [[118]] twice for HR at two timestamps), both get the
// same decision + feedback, keyed by text. Acceptable v1 trade-off —
// per-position independence is flagged out-of-scope.

import {
  HIGHLIGHT_MIN_CHUNKS,
  HIGHLIGHT_MAX_CHUNKS,
  HIGHLIGHT_MIN_CORRECT,
  HIGHLIGHT_MIN_WRONG,
} from '@/lib/authoring/classifications';
import type {
  HighlightContent,
  HighlightCorrect,
} from '@/lib/authoring/types';

export interface HighlightChunkInput {
  id: string;
  text: string;
  decision: 'correct' | 'wrong' | 'undecided';
  feedback: string;
  in_passage: boolean;
}

export interface HighlightParseInput {
  stem: string;
  chunks: HighlightChunkInput[];
}

export type HighlightParseResult =
  | { ok: true; stem: string; content: HighlightContent; correct: HighlightCorrect }
  | { ok: false; error: string };

// Non-greedy: [[foo]]bar[[baz]] → two matches, not one long match.
// Do NOT change to /\[\[(.+)\]\]/g — a greedy pattern would span
// across subsequent pairs and break Highlight entirely.
const BRACKET_RE = /\[\[(.+?)\]\]/g;

export function parseHighlight(input: HighlightParseInput): HighlightParseResult {
  const { stem, chunks: formChunks } = input;

  // Phase 1 — extract spans in passage order, assign positional IDs.
  interface Match { inner: string; id: string }
  const matches: Match[] = [];
  let n = 1;
  for (const mm of stem.matchAll(BRACKET_RE)) {
    matches.push({ inner: mm[1], id: `h${n}` });
    n++;
  }

  if (matches.length < HIGHLIGHT_MIN_CHUNKS) {
    return {
      ok: false,
      error: `Passage must contain at least ${HIGHLIGHT_MIN_CHUNKS} [[chunks]]. Found ${matches.length}.`,
    };
  }
  if (matches.length > HIGHLIGHT_MAX_CHUNKS) {
    return {
      ok: false,
      error: `Passage can contain at most ${HIGHLIGHT_MAX_CHUNKS} chunks. Found ${matches.length}.`,
    };
  }

  // Phase 2 — build text-keyed decision + feedback maps from the
  // active (in_passage) form chunks. First-seen-text wins on duplicate
  // chunk texts, which keeps dupes consistent for v1.
  const decisionByText = new Map<string, 'correct' | 'wrong' | 'undecided'>();
  const feedbackByText = new Map<string, string>();
  for (const c of formChunks) {
    if (!c.in_passage) continue;
    if (!decisionByText.has(c.text)) {
      decisionByText.set(c.text, c.decision);
      feedbackByText.set(c.text, c.feedback);
    }
  }

  // Phase 3 — every passage span must map to a decided card.
  const undecided: string[] = [];
  for (const match of matches) {
    const d = decisionByText.get(match.inner);
    if (!d || d === 'undecided') {
      undecided.push(match.inner);
    }
  }
  if (undecided.length > 0) {
    const listed = undecided.map((t) => `[[${t}]]`).join(', ');
    return {
      ok: false,
      error: `Every chunk must be marked Correct or Wrong. Undecided: ${listed}`,
    };
  }

  // Phase 4 — bounds on correct / wrong counts.
  let correctCount = 0;
  let wrongCount   = 0;
  for (const match of matches) {
    const d = decisionByText.get(match.inner);
    if (d === 'correct') correctCount++;
    else if (d === 'wrong') wrongCount++;
  }
  if (correctCount < HIGHLIGHT_MIN_CORRECT) {
    return { ok: false, error: `At least ${HIGHLIGHT_MIN_CORRECT} chunk must be marked Correct.` };
  }
  if (wrongCount < HIGHLIGHT_MIN_WRONG) {
    return { ok: false, error: `At least ${HIGHLIGHT_MIN_WRONG} chunk must be marked Wrong (to serve as a distractor).` };
  }

  // Phase 5 — build final shapes using the new positional IDs.
  const contentChunks = matches.map((m) => ({ id: m.id, text: m.inner }));
  const correctIds: string[] = [];
  const feedback: Record<string, string> = {};
  for (const match of matches) {
    const d  = decisionByText.get(match.inner);
    const fb = (feedbackByText.get(match.inner) ?? '').trim();
    if (d === 'correct') correctIds.push(match.id);
    if (fb !== '') feedback[match.id] = fb;
  }

  return {
    ok: true,
    stem,   // byte-identical — brackets carry their own text, no renumber needed
    content: { chunks: contentChunks },
    correct: { correct_ids: correctIds, feedback },
  };
}
