// mynclex/lib/tutor-quiz/quiz-picker-filters.tsx
//
// Filter bar above the quiz editor's question picker. A GET form
// that submits back to the editor URL with the chosen params; the
// server page re-queries getPickerQuestions() with them applied.
// No client state — inputs pre-fill from props.
//
// Reuses the .bank-filter-* class names (same as lib/bank/
// bank-filters.tsx). Deliberately a 4-field subset: the picker is
// hard-scoped to published + standalone questions, so the bank
// filter bar's Status and Membership selects would be misleading
// here — they're omitted rather than shown as forced dropdowns.

'use client';

import Link from 'next/link';
import {
  QUESTION_TYPES,
  CLIENT_NEEDS_CATEGORIES,
  DIFFICULTY_LEVELS,
} from '@/lib/bank/classifications';
import type { QuizPickerFilters } from './types';

export function QuizPickerFilterBar({
  values,
  baseUrl,
}: {
  values: QuizPickerFilters;
  baseUrl: string;
}) {
  return (
    <form method="GET" action={baseUrl} className="bank-filters">
      <div className="bank-filter-row">
        <div className="bank-filter-group">
          <label htmlFor="qp-type" className="bank-filter-label">
            Type
          </label>
          <select
            id="qp-type"
            name="type"
            defaultValue={values.type}
            className="bank-filter-input"
          >
            <option value="">All</option>
            {QUESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.value}
              </option>
            ))}
          </select>
        </div>

        <div className="bank-filter-group">
          <label htmlFor="qp-cat" className="bank-filter-label">
            Category
          </label>
          <select
            id="qp-cat"
            name="category"
            defaultValue={values.category}
            className="bank-filter-input"
          >
            <option value="">All</option>
            {CLIENT_NEEDS_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="bank-filter-group">
          <label htmlFor="qp-diff" className="bank-filter-label">
            Difficulty
          </label>
          <select
            id="qp-diff"
            name="difficulty"
            defaultValue={values.difficulty}
            className="bank-filter-input"
          >
            <option value="">All</option>
            {DIFFICULTY_LEVELS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="bank-filter-group bank-filter-group--wide">
          <label htmlFor="qp-q" className="bank-filter-label">
            Search
          </label>
          <input
            id="qp-q"
            name="q"
            type="text"
            defaultValue={values.q}
            placeholder="Search stem…"
            className="bank-filter-input"
          />
        </div>
      </div>

      <div className="bank-filter-actions">
        <button type="submit" className="bank-btn bank-btn-primary">
          Apply
        </button>
        <Link href={baseUrl} className="bank-btn bank-btn-ghost">
          Reset
        </Link>
      </div>
    </form>
  );
}
