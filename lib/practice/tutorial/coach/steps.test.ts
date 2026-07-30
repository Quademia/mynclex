import { describe, it, expect } from 'vitest';
import { COACH_STEPS, COACH_SECTIONS, COACH_RECAP } from './steps';

// COACH_SECTIONS holds RAW INDICES into COACH_STEPS. Inserting a step
// misaligns every section below it, and nothing catches that: the types are
// fine, the array still has entries, and the jump menu simply lands one
// topic off. It happened — the two flag/bookmark steps went in at index 6
// and shifted Calculator down through Modes & finish by two.
//
// So the sections are pinned to the step TITLES they should open on. Insert
// a step without renumbering and this fails by name.
describe('COACH_SECTIONS point at the steps they claim to', () => {
  const expected: Array<[string, string]> = [
    ['Welcome',                    'This is the exam tutorial'],
    ['The exam screen',            'Leaving the exam'],
    ['Flag & bookmark',            'Flag for review'],
    ['Calculator',                 'The calculator'],
    ['Question grid',              'The question grid'],
    ['The footer',                 'The footer'],
    ['Multiple choice',            'Multiple choice'],
    ['True / false',               'True / false'],
    ['Highlight',                  'Highlight'],
    // The menu label and the step title deliberately differ here.
    ['Cloze',                      'Cloze (drop-down)'],
    ['Bow-tie',                    'Bow-tie'],
    ['Case studies',               'Case studies'],
    ['Trend items',                'Trend items'],
    ['Modes & finish',             'One last thing: modes'],
  ];

  for (const [label, title] of expected) {
    it(`"${label}" opens on "${title}"`, () => {
      const section = COACH_SECTIONS.find((s) => s.label === label);
      expect(section, `no section labelled ${label}`).toBeDefined();
      expect(COACH_STEPS[section!.start]?.title).toBe(title);
    });
  }

  it('every section index is inside the array', () => {
    for (const s of COACH_SECTIONS) {
      expect(s.start, s.label).toBeGreaterThanOrEqual(0);
      expect(s.start, s.label).toBeLessThan(COACH_STEPS.length);
    }
  });

  it('sections run in order — the jump menu is a table of contents', () => {
    const tops = COACH_SECTIONS.filter((s) => !s.sub).map((s) => s.start);
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
  });
});

// The whole point of the arc: flag and bookmark are two features, so the
// tutorial teaches them as two. A single merged step would re-create the
// confusion the split removed.
describe('the walkthrough teaches flag and bookmark separately', () => {
  it('has a step anchored to each control', () => {
    expect(COACH_STEPS.some((s) => s.target === 'flag')).toBe(true);
    expect(COACH_STEPS.some((s) => s.target === 'bookmark')).toBe(true);
  });

  it('makes the student actually press flag, and does not gate bookmark', () => {
    const flag = COACH_STEPS.find((s) => s.target === 'flag')!;
    const bookmark = COACH_STEPS.find((s) => s.target === 'bookmark')!;
    // Pressing it is worth more than a paragraph, since the two controls
    // look alike and sit together.
    expect(flag.gate).toBe('flag');
    expect(flag.gateMsg).toBeTruthy();
    // Bookmark is ungated on purpose: a bookmark PERSISTS, so forcing one
    // in a walkthrough would leave real state behind in a sandbox that
    // promises it records nothing.
    expect(bookmark.gate).toBeUndefined();
  });

  it('states the difference in lifetime, which is the whole distinction', () => {
    const flag = COACH_STEPS.find((s) => s.target === 'flag')!;
    const bookmark = COACH_STEPS.find((s) => s.target === 'bookmark')!;
    expect(flag.body.toLowerCase()).toContain('this sitting');
    expect(bookmark.body.toLowerCase()).toContain('study list');
  });

  it('the recap names both, and no longer says "mark"', () => {
    const recap = COACH_RECAP.map((r) => `${r.k} ${r.v}`).join(' ').toLowerCase();
    expect(recap).toContain('flag');
    expect(recap).toContain('bookmark');
    expect(recap).not.toContain('mark for review');
    expect(recap).not.toContain('filter by marked');
  });
});
