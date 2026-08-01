import { describe, it, expect } from 'vitest';
import { COACH_STEPS, COACH_SECTIONS, COACH_RECAP, COACH_RECAP_PHONE } from './steps';

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

// ── Slice 8: the phone walkthrough ──────────────────────────────────────
//
// Five topbar controls are `display: none` at ≤899px and live in the ⋯
// menu or a sheet instead. A step pointing at one of them was pointing at
// a 0×0 box. These tests pin the rule that fixes it: if a step's target is
// hidden by the phone layout, the step must say which sheet re-exposes it.
describe('every step whose control moves on a phone opens its sheet', () => {
  // The targets the phone topbar drops, and where each one actually is.
  // Measured on the rendered page at 390px, not inferred from the CSS.
  const RELOCATED: Record<string, 'menu' | 'grid' | 'chart'> = {
    bookmark:    'menu',
    calc:        'menu',
    grid:        'grid',
    gridfilters: 'grid',
    legend:      'grid',
    casepanel:   'chart',
    casetabs:    'chart',
    trendpanel:  'chart',
  };

  for (const [target, sheet] of Object.entries(RELOCATED)) {
    it(`"${target}" steps open the ${sheet} sheet`, () => {
      const steps = COACH_STEPS.filter((s) => s.target === target);
      expect(steps.length, `no step targets ${target}`).toBeGreaterThan(0);
      for (const s of steps) {
        expect(s.phoneSheet, `"${s.title}" points at ${target}, which a phone hides`).toBe(sheet);
      }
    });
  }

  // The converse, and the one that would rot silently: a step that names a
  // sheet it does not need leaves that sheet sitting over the control it
  // IS pointing at.
  it('no step opens a sheet it has no target in', () => {
    for (const s of COACH_STEPS) {
      if (!s.phoneSheet) continue;
      expect(s.target, `"${s.title}" opens the ${s.phoneSheet} sheet but points at nothing`).toBeDefined();
      expect(RELOCATED[s.target!], `"${s.title}" opens the ${s.phoneSheet} sheet for a target the phone still shows`).toBe(s.phoneSheet);
    }
  });

  // The controls that survive on the phone topbar. If one of these ever
  // gains a phoneSheet, the coach would open a sheet OVER the control it
  // is spotlighting.
  it('leaves the controls the phone topbar keeps alone', () => {
    for (const target of ['exit', 'title', 'tutpill', 'counter', 'clock', 'flag', 'footer', 'answerarea']) {
      for (const s of COACH_STEPS.filter((x) => x.target === target)) {
        expect(s.phoneSheet, `"${s.title}" points at ${target}, which is visible on a phone`).toBeUndefined();
      }
    }
  });
});

describe('the phone copy does not describe controls a phone lacks', () => {
  // The desktop step says "use the button to hide the clock" — that button
  // is not on a phone topbar. This is the class of sentence that makes a
  // public walkthrough wrong rather than merely dated.
  it('rewrites the clock step, which names a button the phone drops', () => {
    const clock = COACH_STEPS.find((s) => s.target === 'clock')!;
    expect(clock.phoneBody, 'the clock step needs phone copy').toBeTruthy();
    expect(clock.phoneBody!.toLowerCase()).toContain('⋯');
  });

  it('rewrites the case step, which says the chart sits BESIDE the question', () => {
    const c = COACH_STEPS.find((s) => s.title === 'Case studies')!;
    expect(c.body.toLowerCase()).toContain('beside');
    // On a phone there is no second column, so "beside" is false.
    expect(c.phoneBody, 'the case step needs phone copy').toBeTruthy();
    expect(c.phoneBody!.toLowerCase()).not.toContain('beside');
  });

  it('the phone recap does not recite the nine-control desktop topbar', () => {
    const desktop = COACH_RECAP.find((r) => r.k === 'Topbar')!.v;
    const phone   = COACH_RECAP_PHONE.find((r) => r.k === 'Topbar')!.v;
    expect(phone).not.toBe(desktop);
    // The phone bar shows five: exit, position, clock, flag, ⋯. It has no
    // bookmark, calculator or grid BUTTON — those words may only appear
    // while saying where they went.
    expect(phone).toContain('⋯');
    expect(desktop).toContain('grid toggle');
    expect(phone).not.toContain('grid toggle');
  });

  it('the two recaps stay the same shape, so neither can drift a row', () => {
    expect(COACH_RECAP_PHONE.map((r) => r.k)).toEqual(COACH_RECAP.map((r) => r.k));
    expect(COACH_RECAP_PHONE).toHaveLength(COACH_RECAP.length);
  });

  it('every phoneBody is a real rewrite, not a copy of the desktop one', () => {
    for (const s of COACH_STEPS) {
      if (!s.phoneBody) continue;
      expect(s.phoneBody, `"${s.title}" phoneBody duplicates body`).not.toBe(s.body);
      expect(s.phoneBody.length, `"${s.title}" phoneBody looks truncated`).toBeGreaterThan(40);
    }
  });
});
