// mynclex/lib/practice/cases/derive.test.ts
import { describe, it, expect } from 'vitest';
import {
  caseSummarySnippet,
  caseAxesLabel,
  scoreTone,
  formatAttemptDate,
  runQuestionCount,
  groupCases,
  runHint,
} from './derive';
import type { CaseBankRow } from './types';

// A verbatim-shaped excerpt of NCLEX_CS_00024's real scenario_summary on
// dev: prose split across sibling text nodes by bold/italic marks, mid
// sentence. This is the shape that punishes a naive "join with space"
// walk — it would produce "A 68-year-old male with moderate-stage
// Parkinson's disease , post-discharge...".
const REAL_TIPTAP = JSON.stringify({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'A ' },
        { type: 'text', marks: [{ type: 'bold' }], text: '68-year-old' },
        { type: 'text', text: ' male with moderate-stage' },
        { type: 'text', marks: [{ type: 'italic' }], text: " Parkinson's disease" },
        { type: 'text', text: ', post-discharge home visit 3 days after a fall.' },
      ],
    },
  ],
});

function row(over: Partial<CaseBankRow> = {}): CaseBankRow {
  return {
    caseId: 'NCLEX_CS_00001',
    title: 'Diabetic Ketoacidosis',
    locked: false,
    seen: false,
    axes: 'Medical-Surgical · Endocrine',
    snippet: 'A 24-year-old male…',
    last: null,
    ...over,
  };
}

describe('caseSummarySnippet — the two stored formats', () => {
  it('reads a real Tiptap doc without welding words at mark boundaries', () => {
    expect(caseSummarySnippet(REAL_TIPTAP)).toBe(
      "A 68-year-old male with moderate-stage Parkinson's disease, post-discharge home visit 3 days after a fall.",
    );
  });

  it('reads an already-parsed object the same way (jsonb from supabase-js)', () => {
    const parsed: unknown = JSON.parse(REAL_TIPTAP);
    expect(caseSummarySnippet(parsed)).toBe(caseSummarySnippet(REAL_TIPTAP));
  });

  it('reads plain text — the 22-of-93 older format', () => {
    expect(caseSummarySnippet('A 65-year-old male client with chills.')).toBe(
      'A 65-year-old male client with chills.',
    );
  });

  it('separates paragraphs with a space rather than running them together', () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First on admission.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second at 0800.' }] },
      ],
    });
    expect(caseSummarySnippet(doc)).toBe('First on admission. Second at 0800.');
  });

  it('collapses newlines and runs of whitespace in plain text', () => {
    expect(caseSummarySnippet('A client\n\n  presents   with pain.')).toBe(
      'A client presents with pain.',
    );
  });

  it('returns null for nothing to show', () => {
    expect(caseSummarySnippet(null)).toBeNull();
    expect(caseSummarySnippet(undefined)).toBeNull();
    expect(caseSummarySnippet('')).toBeNull();
    expect(caseSummarySnippet('   ')).toBeNull();
    expect(caseSummarySnippet(42)).toBeNull();
    // An empty Tiptap doc yields no text nodes.
    expect(caseSummarySnippet('{"type":"doc","content":[]}')).toBeNull();
  });

  it('treats unparseable brace-leading text as prose instead of losing it', () => {
    expect(caseSummarySnippet('{not json after all')).toBe('{not json after all');
  });

  it('truncates on a word boundary and marks the cut', () => {
    const long = `${'word '.repeat(200)}end`;
    const out = caseSummarySnippet(long, 40)!;
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(41);
    // Never a half-word before the ellipsis.
    expect(out).not.toMatch(/wor…$/);
  });

  it('leaves a short scenario whole, with no ellipsis', () => {
    const out = caseSummarySnippet('Short one.', 260)!;
    expect(out).toBe('Short one.');
  });

  it('still truncates a single unbroken token', () => {
    const out = caseSummarySnippet('x'.repeat(100), 20)!;
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBe(21);
  });
});

describe('caseAxesLabel', () => {
  it('joins the dominant subject and body system', () => {
    expect(caseAxesLabel('Medical-Surgical', 'Endocrine')).toBe(
      'Medical-Surgical · Endocrine',
    );
  });

  it('drops nulls and blanks rather than printing a stray separator', () => {
    expect(caseAxesLabel('Maternity', null)).toBe('Maternity');
    expect(caseAxesLabel(null, undefined)).toBe('');
    expect(caseAxesLabel('  ', '')).toBe('');
  });

  it('omits the middot when only the body system is classified', () => {
    // "Case to test picture Upload" on dev has neither; some rows have one.
    expect(caseAxesLabel(null, 'Respiratory')).toBe('Respiratory');
  });
});

describe('scoreTone', () => {
  it('bands at 80 and 60', () => {
    expect(scoreTone(100)).toBe('good');
    expect(scoreTone(80)).toBe('good');
    expect(scoreTone(79)).toBe('mid');
    expect(scoreTone(60)).toBe('mid');
    expect(scoreTone(59)).toBe('poor');
    expect(scoreTone(0)).toBe('poor');
  });
});

describe('formatAttemptDate', () => {
  it('formats an ISO timestamp', () => {
    expect(formatAttemptDate('2026-07-12T10:30:00Z')).toBe('12 Jul 2026');
  });

  it('returns null for missing or unusable input', () => {
    expect(formatAttemptDate(null)).toBeNull();
    expect(formatAttemptDate(undefined)).toBeNull();
    expect(formatAttemptDate('not a date')).toBeNull();
  });
});

describe('runQuestionCount', () => {
  it('is six per case — one case is a legitimate run', () => {
    expect(runQuestionCount(0)).toBe(0);
    expect(runQuestionCount(1)).toBe(6);
    expect(runQuestionCount(2)).toBe(12);
  });
});

describe('groupCases', () => {
  const rows: CaseBankRow[] = [
    row({ caseId: 'A', title: 'Sepsis', seen: false }),
    row({ caseId: 'B', title: 'Ketoacidosis', seen: true, last: { attemptId: 'x', pct: 83, endedAt: null } }),
    row({ caseId: 'C', title: 'Stroke alert', locked: true, snippet: null }),
  ];

  it('buckets into ready / attempted / unavailable, locked last', () => {
    const groups = groupCases(rows, '', 'all');
    expect(groups.map((g) => g.key)).toEqual(['ready', 'attempted', 'unavailable']);
    expect(groups[0].rows.map((r) => r.caseId)).toEqual(['A']);
    expect(groups[1].rows.map((r) => r.caseId)).toEqual(['B']);
    expect(groups[2].rows.map((r) => r.caseId)).toEqual(['C']);
  });

  it('drops empty groups entirely', () => {
    const groups = groupCases([rows[0]], '', 'all');
    expect(groups.map((g) => g.key)).toEqual(['ready']);
  });

  it('searches title and axes, case-insensitively', () => {
    expect(groupCases(rows, 'sep', 'all')[0].rows[0].caseId).toBe('A');
    expect(groupCases(rows, 'ENDOCRINE', 'all').flatMap((g) => g.rows).length).toBe(3);
    expect(groupCases(rows, 'nothing here', 'all')).toEqual([]);
  });

  it('exempts locked rows from the attempted filter but not from search', () => {
    // 'new' would otherwise reclassify locked rows by attempt state,
    // making the "Not available" count move for no reason.
    const asNew = groupCases(rows, '', 'new');
    expect(asNew.find((g) => g.key === 'unavailable')?.rows.length).toBe(1);
    expect(asNew.find((g) => g.key === 'attempted')).toBeUndefined();

    const asDone = groupCases(rows, '', 'done');
    expect(asDone.find((g) => g.key === 'unavailable')?.rows.length).toBe(1);
    expect(asDone.find((g) => g.key === 'ready')).toBeUndefined();

    expect(groupCases(rows, 'stroke', 'new')[0].rows[0].caseId).toBe('C');
  });

  it('treats a seen case with no finished attempt as attempted', () => {
    // Met in a sitting still in progress: there is nothing to Review, but
    // it is not "Ready to sit" either.
    const inProgress = [row({ caseId: 'D', seen: true, last: null })];
    const groups = groupCases(inProgress, '', 'all');
    expect(groups[0].key).toBe('attempted');
  });
});

describe('runHint', () => {
  it('never implies a second case is required', () => {
    expect(runHint(0, 0)).toMatch(/Pick a case/);
    expect(runHint(1, 0)).toMatch(/if you want/);
    expect(runHint(2, 0)).toMatch(/ready/i);
  });

  it('calls out reattempts, and that history is kept', () => {
    expect(runHint(2, 1)).toMatch(/1 you've sat before/);
    expect(runHint(2, 1)).toMatch(/History/);
  });
});
