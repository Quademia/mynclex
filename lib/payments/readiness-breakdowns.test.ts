import { describe, it, expect } from 'vitest';
import type { ReportItem } from '@/lib/payments/readiness-report';
import {
  axisRows,
  clientNeedsTree,
  weakestSubcategory,
  nextMoves,
} from '@/lib/payments/readiness-breakdowns';

function mk(o: Partial<ReportItem>): ReportItem {
  return {
    position: 1,
    questionType: 'MCQ',
    category: null,
    subcategory: null,
    bodySystem: null,
    difficulty: null,
    cjmmStep: null,
    topic: null,
    subtopic: null,
    isCorrect: false,
    scoreAwarded: 0,
    marks: 1,
    answered: true,
    changed: false,
    changeDir: null,
    timeSpentSec: null,
    rushed: false,
    ...o,
  };
}

describe('clientNeedsTree', () => {
  const items = [
    mk({ category: 'Safe and Effective Care Environment', subcategory: 'Management of Care', isCorrect: true }),
    mk({ category: 'Safe and Effective Care Environment', subcategory: 'Safety and Infection Control', topic: 'Hand hygiene' }),
    mk({ category: 'Health Promotion and Maintenance', subcategory: 'Health Promotion and Maintenance', topic: 'Immunization' }),
    mk({ category: 'Physiological Integrity', subcategory: 'Pharmacological and Parenteral Therapies', isCorrect: true }),
  ];
  const tree = clientNeedsTree(items);

  it('orders L1 categories canonically, skipping absent ones', () => {
    expect(tree.map((c) => c.name)).toEqual([
      'Safe and Effective Care Environment',
      'Health Promotion and Maintenance',
      'Physiological Integrity',
    ]);
  });

  it('scores each category as fully-correct / total', () => {
    expect(tree[0]).toMatchObject({ n: 2, correct: 1 });
  });

  it('splits a multi-subcategory L1 into L2 subs with wrong-topic checklists', () => {
    const sece = tree[0];
    expect(sece.oneToOne).toBe(false);
    expect(sece.subs.map((s) => s.name)).toEqual([
      'Management of Care',
      'Safety and Infection Control',
    ]);
    expect(sece.subs[1].wrongTopics).toContain('Hand hygiene');
  });

  it('marks a 1:1 category (HPM) oneToOne with topics hanging off the category', () => {
    const hpm = tree[1];
    expect(hpm.oneToOne).toBe(true);
    expect(hpm.subs).toEqual([]);
    expect(hpm.wrongTopics).toContain('Immunization');
  });
});

describe('axisRows', () => {
  it('difficulty renders in Easy/Medium/Hard order', () => {
    const items = [
      mk({ difficulty: 'Hard', isCorrect: true }),
      mk({ difficulty: 'Easy' }),
      mk({ difficulty: 'Medium', isCorrect: true }),
    ];
    expect(axisRows(items, 'difficulty').map((r) => r.name)).toEqual(['Easy', 'Medium', 'Hard']);
  });

  it('body system is weakest-first', () => {
    const items = [
      mk({ bodySystem: 'Cardiovascular', isCorrect: true }),
      mk({ bodySystem: 'Renal' }),
    ];
    expect(axisRows(items, 'systems').map((r) => r.name)).toEqual(['Renal', 'Cardiovascular']);
  });

  it('CJMM includes only case items and uses the canonical step order', () => {
    const items = [
      mk({ cjmmStep: 'Take action', isCorrect: true }),
      mk({ cjmmStep: 'Recognise cues' }),
      mk({ bodySystem: 'Cardiovascular' }), // no cjmm → excluded
    ];
    expect(axisRows(items, 'cjmm').map((r) => r.name)).toEqual(['Recognise cues', 'Take action']);
  });
});

describe('weakestSubcategory', () => {
  it('returns the lowest fully-correct fraction', () => {
    const items = [
      mk({ subcategory: 'Strong', isCorrect: true }),
      mk({ subcategory: 'Weak' }),
      mk({ subcategory: 'Weak' }),
    ];
    expect(weakestSubcategory(items)).toBe('Weak');
  });

  it('returns null when nothing is subcategorised', () => {
    expect(weakestSubcategory([mk({})])).toBeNull();
  });
});

describe('nextMoves', () => {
  const items = [
    mk({ subcategory: 'Weak' }),
    mk({ subcategory: 'Weak' }),
    mk({ subcategory: 'Weak' }),
    mk({ subcategory: 'Strong', isCorrect: true }),
    mk({ subcategory: 'Strong', isCorrect: true }),
    // partial, one point away from full (3 of 4)
    mk({ subcategory: 'Weak', scoreAwarded: 3, marks: 4 }),
  ];
  const nm = nextMoves(items);

  it('surfaces weak subcategories as moves, not strong ones', () => {
    expect(nm.moves.map((m) => m.name)).toContain('Weak');
    expect(nm.moves.map((m) => m.name)).not.toContain('Strong');
  });

  it('surfaces strong subcategories as strengths', () => {
    expect(nm.strengths.map((s) => s.name)).toContain('Strong');
  });

  it('counts partially-correct and one-away questions', () => {
    expect(nm.partial).toBe(1);
    expect(nm.oneAway).toBe(1);
  });

  it('ignores singletons (n < 2) as moves', () => {
    expect(nextMoves([mk({ subcategory: 'Solo' })]).moves).toEqual([]);
  });
});
