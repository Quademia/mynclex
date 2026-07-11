// mynclex/lib/payments/readiness-breakdowns.ts
//
// The multi-axis remediation map for the readiness report (§11.5, "Where to
// focus", Slice ②). Pure functions over the report's per-question rows —
// no DB, deterministic, unit-testable.
//
// Bucket metric = fully-correct count / bucket size, shown as "X of Y". A
// count fraction (never a bare %) is honest on thin slices by construction
// (100 questions across 14 body systems leaves some at n=2–3), and the bar
// encodes the same ratio. Partial credit + the answer-level detail live in
// the hero/points readings, not here — this map answers "where am I weak".
//
// Client Needs is a 3-level drill: L1 category → L2 subcategory (scored) →
// L3 a checklist of the TOPICS of the questions you got wrong (a list, not a
// score — topics are free-text and ~1 question each, so a % would be noise).
// The two 1:1 categories (Health Promotion, Psychosocial) have no L2 level,
// so their topic checklist hangs off the category directly.

import type { ReportItem } from './readiness-report';
import {
  CLIENT_NEEDS_CATEGORIES,
  CLIENT_NEEDS_SUBCATEGORIES,
  CJMM_STEPS,
  DIFFICULTY_LEVELS,
  type ClientNeedsCategory,
} from '@/lib/bank/classifications';

export type AxisKey = 'needs' | 'systems' | 'difficulty' | 'cjmm';

export interface BucketRow {
  name: string;
  /** Questions in the bucket (denominator). */
  n: number;
  /** Fully-correct questions. */
  correct: number;
  /** correct / n, 0..1. */
  frac: number;
}
export interface CnSubNode extends BucketRow {
  /** Topics of the not-fully-correct questions — the L3 focus checklist. */
  wrongTopics: string[];
}
export interface CnCatNode extends BucketRow {
  /** True for the 1:1 categories (HPM, PSI) — no L2 level, topics hang here. */
  oneToOne: boolean;
  subs: CnSubNode[];
  wrongTopics: string[];
}

const TOPIC_CAP = 8;

function wrongTopicsOf(items: ReportItem[]): string[] {
  const seen = new Set<string>();
  for (const it of items) {
    if (it.isCorrect) continue;
    const t = it.topic ?? it.subtopic;
    if (t) seen.add(t);
  }
  return [...seen].slice(0, TOPIC_CAP);
}

function bucket(name: string, items: ReportItem[]): BucketRow {
  const n = items.length;
  const correct = items.filter((i) => i.isCorrect).length;
  return { name, n, correct, frac: n ? correct / n : 0 };
}

function groupBy(
  items: ReportItem[],
  key: (i: ReportItem) => string | null,
): Map<string, ReportItem[]> {
  const m = new Map<string, ReportItem[]>();
  for (const it of items) {
    const k = key(it) ?? 'Unclassified';
    let arr = m.get(k);
    if (!arr) {
      arr = [];
      m.set(k, arr);
    }
    arr.push(it);
  }
  return m;
}

/** Canonical order first, then any off-canonical keys in first-seen order. */
function ordered(keys: string[], canonical: readonly string[]): string[] {
  const remaining = new Set(keys);
  const out: string[] = [];
  for (const c of canonical) {
    if (remaining.has(c)) {
      out.push(c);
      remaining.delete(c);
    }
  }
  for (const k of keys) {
    if (remaining.has(k)) {
      out.push(k);
      remaining.delete(k);
    }
  }
  return out;
}

/** Generic single-level axis rows (body system / difficulty / CJMM). */
export function axisRows(items: ReportItem[], axis: 'systems' | 'difficulty' | 'cjmm'): BucketRow[] {
  const sel =
    axis === 'systems'
      ? (i: ReportItem) => i.bodySystem
      : axis === 'difficulty'
        ? (i: ReportItem) => i.difficulty
        : (i: ReportItem) => i.cjmmStep;
  const groups = groupBy(items.filter((i) => sel(i) != null), sel);
  const rows = [...groups.entries()].map(([name, its]) => bucket(name, its));

  if (axis === 'difficulty') {
    return ordered(
      rows.map((r) => r.name),
      DIFFICULTY_LEVELS,
    ).map((name) => rows.find((r) => r.name === name)!);
  }
  if (axis === 'cjmm') {
    return ordered(
      rows.map((r) => r.name),
      CJMM_STEPS,
    ).map((name) => rows.find((r) => r.name === name)!);
  }
  // body system — weakest first (the remediation ordering)
  return rows.sort((a, b) => a.frac - b.frac || b.n - a.n);
}

/** The Client Needs 3-level tree. */
export function clientNeedsTree(items: ReportItem[]): CnCatNode[] {
  const byCat = groupBy(items.filter((i) => i.category != null), (i) => i.category);
  const catOrder = ordered([...byCat.keys()], CLIENT_NEEDS_CATEGORIES);
  return catOrder.map((cat) => {
    const catItems = byCat.get(cat)!;
    const bySub = groupBy(catItems, (i) => i.subcategory);
    const subKeys = [...bySub.keys()];
    const oneToOne = subKeys.length === 1 && subKeys[0] === cat;
    const canonSubs = CLIENT_NEEDS_SUBCATEGORIES[cat as ClientNeedsCategory] ?? [];
    const subs: CnSubNode[] = oneToOne
      ? []
      : ordered(subKeys, canonSubs).map((sub) => ({
          ...bucket(sub, bySub.get(sub)!),
          wrongTopics: wrongTopicsOf(bySub.get(sub)!),
        }));
    return {
      ...bucket(cat, catItems),
      oneToOne,
      subs,
      wrongTopics: oneToOne ? wrongTopicsOf(catItems) : [],
    };
  });
}

/** Weakest L2 subcategory (min frac, tie-break larger n) for the summary line. */
export function weakestSubcategory(items: ReportItem[]): string | null {
  const groups = groupBy(items.filter((i) => i.subcategory != null), (i) => i.subcategory);
  let best: { name: string; frac: number; n: number } | null = null;
  for (const [name, its] of groups) {
    const b = bucket(name, its);
    if (!best || b.frac < best.frac || (b.frac === best.frac && b.n > best.n)) {
      best = { name, frac: b.frac, n: b.n };
    }
  }
  return best?.name ?? null;
}
