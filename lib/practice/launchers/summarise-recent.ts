// mynclex/lib/bank/entry-helpers/summarise-recent.ts
//
// Builds the Recent Quizzes chip label from a saved filters_json +
// requested_count. Goal: short, scannable, identifies the
// configuration without overwhelming.
//
// Per planning §17:
//   "Label format: intent prefix + filter summary, not date. The
//    configuration is what the student is choosing between."
//
// We pick the most distinctive axes and join with `·`:
//   • Subject(s)        — primary signal of what the quiz is about
//   • Difficulty        — secondary
//   • Pool — Unseen / Marked / etc. — tertiary
//   • Count             — always last
//
// CNC, Subcategory, Body System, Tags, Topics, Subtopics, Question
// Type are deliberately omitted from the chip label — they make the
// summary too long. Student can hover or click to see the full config.

import type { FilterPayload } from '@/lib/practice/builder/types';
import { POOLS } from '@/lib/practice/builder/filter-config';

const POOL_LABEL: Record<string, string> = Object.fromEntries(
  POOLS.map((p) => [p.id, p.label])
);

export function summariseRecent(
  filters: FilterPayload,
  requestedCount: number
): string {
  const parts: string[] = [];

  // Subjects — up to 2 listed verbatim, otherwise "N subjects"
  const subjects = filters.nursing_subject ?? [];
  if (subjects.length === 1) {
    parts.push(subjects[0]);
  } else if (subjects.length === 2) {
    parts.push(`${subjects[0]} + ${subjects[1]}`);
  } else if (subjects.length > 2) {
    parts.push(`${subjects.length} subjects`);
  }

  // Difficulty — list verbatim
  const diff = filters.difficulty ?? [];
  if (diff.length === 1) {
    parts.push(diff[0]);
  } else if (diff.length === 2) {
    parts.push(`${diff[0]} + ${diff[1]}`);
  }

  // Pool — derive a short label from pool_history + pool_marked
  const poolLabel = poolLabelFor(filters);
  if (poolLabel) parts.push(poolLabel);

  // Always show count
  parts.push(`${requestedCount} Q`);

  return parts.join(' · ');
}

/**
 * Reduce pool_history + pool_marked back to a single short label for
 * the chip. Inverse-light of buildFilterPayload's pool encoding.
 */
function poolLabelFor(f: FilterPayload): string | null {
  const h = f.pool_history ?? [];
  const m = f.pool_marked === true;

  // No constraint at all — corresponds to the All chip having been on
  if (h.length === 0 && !m) return null; // → "All" implied; chip already says nothing

  // Single chip — name it directly
  if (m && h.length === 0) return POOL_LABEL.MARKED;
  if (!m && h.length === 1) return POOL_LABEL[h[0]] ?? h[0];

  // Marked + something
  if (m && h.length > 0) {
    if (h.length === 1) return `${POOL_LABEL[h[0]]} + Marked`;
    return 'Marked + filters';
  }

  // Multiple history values, no marked — combined
  if (h.length === 2) return `${POOL_LABEL[h[0]]} + ${POOL_LABEL[h[1]]}`;
  return `${h.length} pools`;
}
