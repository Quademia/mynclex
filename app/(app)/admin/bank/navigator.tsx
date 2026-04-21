// mynclex/app/(app)/admin/bank/navigator.tsx
//
// Compact left-pane list shown in focus mode. Each row is a <Link>
// that swaps focus to a different item while preserving any active
// filters in the URL. The currently-focused row is marked with
// aria-current="true" + the .bank-nav-item--active class.
//
// Stateless — receives already-filtered rows and the active id from
// the server page.

'use client';

import Link from 'next/link';

export interface BankNavRow {
  item_id: string;
  question_type: string;
  difficulty: string | null;
  stem: string;
}

export function BankNavigator({
  rows,
  activeId,
  preservedFilterQuery,
}: {
  rows: BankNavRow[];
  activeId: string | null;
  preservedFilterQuery: string;
}) {
  const backHref = preservedFilterQuery
    ? `/admin/bank?${preservedFilterQuery}`
    : '/admin/bank';

  return (
    <aside className="bank-focus-nav">
      <div className="bank-focus-nav-header">
        <Link href={backHref} className="bank-back-link">
          ← Back to list
        </Link>
        <span className="bank-focus-nav-count">
          {rows.length} question{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="bank-focus-nav-list">
        {rows.length === 0 ? (
          <div className="bank-focus-nav-empty">
            No questions match the current filters.
          </div>
        ) : (
          rows.map((r) => {
            const isActive = r.item_id === activeId;
            const editHref = preservedFilterQuery
              ? `/admin/bank?edit=${r.item_id}&${preservedFilterQuery}`
              : `/admin/bank?edit=${r.item_id}`;
            return (
              <Link
                key={r.item_id}
                href={editHref}
                aria-current={isActive ? 'true' : undefined}
                className={
                  isActive
                    ? 'bank-nav-item bank-nav-item--active'
                    : 'bank-nav-item'
                }
              >
                <div className="bank-nav-item-id">{r.item_id}</div>
                <div className="bank-nav-item-badges">
                  <span className="bank-badge bank-badge-type">
                    {r.question_type}
                  </span>
                  {r.difficulty && (
                    <span className="bank-nav-item-diff">{r.difficulty}</span>
                  )}
                </div>
                <div className="bank-nav-item-stem">{r.stem}</div>
              </Link>
            );
          })
        )}
      </div>
    </aside>
  );
}
