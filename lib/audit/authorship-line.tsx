// mynclex/lib/audit/authorship-line.tsx
//
// The "Authors" cell: stacked "Created by X / Last edited by Y" facts
// plus the History clock that opens the full timeline drawer. Used in
// the bank wrapper LIST pages now; the same component drops into editor
// headers + wrapper topbars in the next slice.
//
// Facts arrive pre-resolved (loadAuthorship, batched server-side); this
// component only renders them + hosts the lazy-loading HistoryButton.

'use client';

import { HistoryButton } from './history-drawer';
import type { AuditRealm, Authorship } from './authorship';

interface AuthorshipCellProps {
  authorship: Authorship | undefined;
  realm:      AuditRealm;
  entityType: string;
  entityId:   string;
  /** Drawer header label — typically the row's title. */
  title:      string;
}

export function AuthorshipCell({ authorship, realm, entityType, entityId, title }: AuthorshipCellProps) {
  // Nothing tracked yet (predates Step 1, never edited since): a plain
  // dash, no clock — there's no history to open.
  if (!authorship || !authorship.hasAny) {
    return <span className="audit-cell-empty">—</span>;
  }

  const { createdByName, lastEditedByName, hasEdits } = authorship;

  return (
    <div className="audit-cell">
      <div className="audit-cell-lines">
        <span className="audit-cell-line">
          <span className="audit-cell-label">Created</span>
          <span className="audit-cell-name">{createdByName ?? '—'}</span>
        </span>
        {hasEdits && (
          <span className="audit-cell-line audit-cell-line--muted">
            <span className="audit-cell-label">Last edit</span>
            <span className="audit-cell-name">{lastEditedByName ?? '—'}</span>
          </span>
        )}
      </div>
      <HistoryButton realm={realm} entityType={entityType} entityId={entityId} title={title} />
    </div>
  );
}

/**
 * Single-line variant for editor topbars (and, next slice, the question
 * editor body). Same facts + clock as AuthorshipCell, laid out
 * horizontally instead of stacked.
 */
export function AuthorshipInline({ authorship, realm, entityType, entityId, title }: AuthorshipCellProps) {
  if (!authorship || !authorship.hasAny) {
    return <span className="audit-inline audit-inline--empty">No change history yet</span>;
  }

  const { createdByName, lastEditedByName, hasEdits } = authorship;

  return (
    <span className="audit-inline">
      <span className="audit-inline-fact">
        <span className="audit-cell-label">Created</span>
        <span className="audit-inline-name">{createdByName ?? '—'}</span>
      </span>
      {hasEdits && (
        <span className="audit-inline-fact">
          <span className="audit-inline-sep" aria-hidden="true">·</span>
          <span className="audit-cell-label">Last edit</span>
          <span className="audit-inline-name">{lastEditedByName ?? '—'}</span>
        </span>
      )}
      <HistoryButton realm={realm} entityType={entityType} entityId={entityId} title={title} />
    </span>
  );
}
