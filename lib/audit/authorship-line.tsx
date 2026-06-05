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

import { useEffect, useState } from 'react';
import { HistoryButton } from './history-drawer';
import { loadAuthorshipFactsAction } from './timeline-actions';
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

  const { createdByName, createdAt, lastEditedByName, lastEditedAt, hasEdits } = authorship;

  // Facepile: one avatar = same author throughout; a SECOND overlapping
  // avatar appears only when a DIFFERENT person last edited it (handed
  // off). Names move into hover tooltips + the history drawer, keeping the
  // cell compact. Colours + initials derive from the captured name.
  const creator = createdByName ?? 'Unknown';
  const handedOff = hasEdits && !!lastEditedByName && lastEditedByName !== createdByName;

  return (
    <div className="audit-cell">
      <span className="audit-facepile">
        <span
          className="audit-avatar"
          style={{ background: avatarColor(creator) }}
          title={`Created by ${creator}${createdAt ? ` · ${fmtAuditDate(createdAt)}` : ''}`}
        >
          {initials(creator)}
        </span>
        {handedOff && (
          <span
            className="audit-avatar"
            style={{ background: avatarColor(lastEditedByName) }}
            title={`Last edited by ${lastEditedByName}${lastEditedAt ? ` · ${fmtAuditDate(lastEditedAt)}` : ''}`}
          >
            {initials(lastEditedByName)}
          </span>
        )}
      </span>
      <HistoryButton realm={realm} entityType={entityType} entityId={entityId} title={title} />
    </div>
  );
}

// ── Facepile helpers ───────────────────────────────────────────────
// Deterministic avatar colour + initials from a captured name, so the
// same person always reads as the same coloured circle across the lists.
const AVATAR_COLORS = [
  '#1e3a5f', '#2d7d72', '#4338ca', '#b45309',
  '#be123c', '#0e7490', '#7c3aed', '#15803d',
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string): string {
  const parts = name.replace(/^Dr\.?\s*/i, '').split(/\s+/).filter(Boolean);
  const i = parts.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return i || '?';
}
function fmtAuditDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
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

interface EditorAuthorshipProps {
  realm:      AuditRealm;
  entityType: string;
  /** The question's id. Falsy in create mode — nothing to show yet. */
  itemId:     string | null;
  /** Drawer header label — the question stem (may be blank/null). */
  title:      string | null;
}

/**
 * Editor-topbar readout for the question editors. Unlike the lists /
 * wrapper topbars (server-rendered, facts passed as props), the editors
 * mount client-side with no server round-trip and also render embedded
 * inside the wrappers — so this fetches its OWN facts on open. That makes
 * it host-agnostic: identical in the standalone pop-up and the embedded
 * child-question editor. The clock still opens the shared drawer (which
 * floats above the modal). New questions show nothing until first save.
 */
export function EditorAuthorship({ realm, entityType, itemId, title }: EditorAuthorshipProps) {
  const [facts, setFacts]   = useState<Authorship | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!itemId) return;
    let active = true;
    loadAuthorshipFactsAction(realm, entityType, itemId)
      .then((f) => { if (active) { setFacts(f); setLoaded(true); } })
      .catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [realm, entityType, itemId]);

  // New question — authorship begins on first save.
  if (!itemId) return null;

  return (
    <div className="audit-editor-line">
      {!loaded ? (
        <span className="audit-inline audit-inline--empty">Loading history…</span>
      ) : (
        <AuthorshipInline
          authorship={facts ?? undefined}
          realm={realm}
          entityType={entityType}
          entityId={itemId}
          title={title?.trim() || itemId}
        />
      )}
    </div>
  );
}
