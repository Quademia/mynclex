// mynclex/lib/practice/runner/types/cloze.test.ts
//
// The CLOZE review feedback list (2026-08-03).
//
// Two things are asserted here, both measured against the real bank
// before they were built:
//
//   1. The blank's SHAPE follows its content. Only 68 of 1,557 published
//      choices (4.4%) carry a rationale, and 455 of 473 blanks (96%)
//      carry none at all — so the common case is bare labels, which used
//      to render as "low high unchanged" separated by a single space.
//      Those are comma-joined ('terms'); a blank that does carry
//      rationales goes one-per-line instead ('prose'), because a comma
//      would run into the rationale's own sentence punctuation.
//
//   2. `isCorrect` marks only the correct option. Every other label used
//      to be red, which painted DISTRACTORS in the product's "you got
//      this wrong" colour — a student who answered correctly saw two or
//      three red options under a header reading CORRECT.

import { describe, it, expect } from 'vitest';
import { clozeFeedbackEntries, isClozeComplete } from './cloze';

const richDoc = (text: string) =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });

/** What a curator leaves behind by opening the field and saving nothing. */
const emptyRichDoc = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});

const choices = [
  { id: 'a', text: 'low' },
  { id: 'b', text: 'high' },
  { id: 'c', text: 'unchanged' },
];

describe('clozeFeedbackEntries — shape follows the content', () => {
  it("is 'terms' when no choice carries a rationale (96% of the bank)", () => {
    expect(clozeFeedbackEntries(choices, 'a', undefined).shape).toBe('terms');
    expect(clozeFeedbackEntries(choices, 'a', {}).shape).toBe('terms');
  });

  it("is 'prose' as soon as ONE choice carries a rationale", () => {
    const fb = { b: richDoc('A high blood pressure is not expected in shock.') };
    expect(clozeFeedbackEntries(choices, 'a', fb).shape).toBe('prose');
  });

  // The trap: a rich doc with no text is truthy, so a bare `if (fbRaw)`
  // would call this blank 'prose' and lay it out one-per-line with
  // nothing on the lines.
  it("treats an EMPTY rich doc as no rationale, not as prose", () => {
    const fb = { a: emptyRichDoc, b: emptyRichDoc, c: emptyRichDoc };
    const { shape, entries } = clozeFeedbackEntries(choices, 'a', fb);
    expect(shape).toBe('terms');
    expect(entries.every((e) => e.hasFb === false)).toBe(true);
  });

  it('is decided per BLANK, so one paragraph never mixes both shapes', () => {
    // Only the middle choice is authored — the blank as a whole is prose,
    // so every option in it lays out the same way.
    const fb = { b: richDoc('Only this one is authored.') };
    const { shape, entries } = clozeFeedbackEntries(choices, 'a', fb);
    expect(shape).toBe('prose');
    expect(entries.map((e) => e.hasFb)).toEqual([false, true, false]);
  });
});

describe('clozeFeedbackEntries — only the correct option is flagged', () => {
  it('marks exactly one entry correct, whatever the student picked', () => {
    const { entries } = clozeFeedbackEntries(choices, 'a', undefined);
    expect(entries.filter((e) => e.isCorrect)).toHaveLength(1);
    expect(entries.find((e) => e.isCorrect)?.choice.text).toBe('low');
    // The other two are NOT flagged — they are distractors, not mistakes,
    // and nothing here should let them be styled as wrong answers.
    expect(entries.filter((e) => !e.isCorrect).map((e) => e.choice.text))
      .toEqual(['high', 'unchanged']);
  });

  it('flags nothing when the correct id is missing from the snapshot', () => {
    const { entries } = clozeFeedbackEntries(choices, undefined, undefined);
    expect(entries.some((e) => e.isCorrect)).toBe(false);
  });

  it('preserves the curator-authored option order', () => {
    const { entries } = clozeFeedbackEntries(choices, 'c', undefined);
    expect(entries.map((e) => e.choice.id)).toEqual(['a', 'b', 'c']);
  });
});

// Pre-existing and previously untested — the submit gate that makes an
// empty blank an unanswered question rather than a deliberate "none".
describe('isClozeComplete', () => {
  const content = { blanks: [{ id: 'b1', choices }, { id: 'b2', choices }] };

  it('requires every blank filled', () => {
    expect(isClozeComplete({ b1: 'a' }, content as never)).toBe(false);
    expect(isClozeComplete({ b1: 'a', b2: 'b' }, content as never)).toBe(true);
  });

  it('treats an empty string as not-picked (the placeholder option)', () => {
    expect(isClozeComplete({ b1: 'a', b2: '' }, content as never)).toBe(false);
  });

  it('is false for a missing answer map', () => {
    expect(isClozeComplete(undefined, content as never)).toBe(false);
  });
});
