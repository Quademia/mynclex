// mynclex/lib/bank/bank-filters.tsx
//
// Filter bar shown above the bank list (server-rendered topbar zone).
// Renders a GET form that submits back to the current surface (admin
// or tutor) with the chosen params; the server page re-queries with
// those params applied. No client state — inputs pre-fill from props
// and the browser does the navigation.
//
// Reuses the .bank-filter-* class names from styles/dashboards.css.

'use client';

import Link from 'next/link';
import {
  QUESTION_TYPES,
  CLIENT_NEEDS_CATEGORIES,
  DIFFICULTY_LEVELS,
} from '@/lib/bank/classifications';

export interface BankFilterValues {
  type:       string;
  category:   string;
  difficulty: string;
  status:     string;
  // '' | 'standalone' | 'case' | 'trend'. '' = All; absent from URL.
  membership: string;
  q:          string;
}

export function BankFilters({
  values,
  baseUrl,
}: {
  values:  BankFilterValues;
  baseUrl: string;
}) {
  return (
    <form method="GET" action={baseUrl} className="bank-filters">
      <div className="bank-filter-row">
        <div className="bank-filter-group">
          <label htmlFor="ftype" className="bank-filter-label">Type</label>
          <select
            id="ftype"
            name="type"
            defaultValue={values.type}
            className="bank-filter-input"
          >
            <option value="">All</option>
            {QUESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.value}</option>
            ))}
          </select>
        </div>

        <div className="bank-filter-group">
          <label htmlFor="fcat" className="bank-filter-label">Category</label>
          <select
            id="fcat"
            name="category"
            defaultValue={values.category}
            className="bank-filter-input"
          >
            <option value="">All</option>
            {CLIENT_NEEDS_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="bank-filter-group">
          <label htmlFor="fdiff" className="bank-filter-label">Difficulty</label>
          <select
            id="fdiff"
            name="difficulty"
            defaultValue={values.difficulty}
            className="bank-filter-input"
          >
            <option value="">All</option>
            {DIFFICULTY_LEVELS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="bank-filter-group">
          <label htmlFor="fstatus" className="bank-filter-label">Status</label>
          <select
            id="fstatus"
            name="status"
            defaultValue={values.status}
            className="bank-filter-input"
          >
            <option value="">All</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </div>

        <div className="bank-filter-group">
          <label htmlFor="fmembership" className="bank-filter-label">Membership</label>
          <select
            id="fmembership"
            name="membership"
            defaultValue={values.membership}
            className="bank-filter-input"
          >
            <option value="">All</option>
            <option value="standalone">Standalone</option>
            <option value="case">Case-linked</option>
            <option value="trend">Trend-linked</option>
          </select>
        </div>

        <div className="bank-filter-group bank-filter-group--wide">
          <label htmlFor="fq" className="bank-filter-label">Search</label>
          <input
            id="fq"
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
