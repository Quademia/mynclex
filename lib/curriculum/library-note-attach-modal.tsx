// mynclex/lib/curriculum/library-note-attach-modal.tsx
//
// Slice 11.11a — the Library-Note attach / edit modal. Reuses the shared
// ViewerModalShell frame. Two modes:
//   • create — browse the tutor's PUBLISHED notes (search + folder
//     meta), pick one, optional caption → attach as a draft activity.
//   • edit   — the linked note (with an "open in library" link) + caption
//     + Live/Draft toggle; Detach removes the activity (cascading the
//     attachment).
//
// The note picker reuses the bank/quiz-picker spirit (filter + select)
// but kept self-contained and small — a single-select list, not the
// full multi-select quiz picker.

'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ViewerModalShell } from './viewer-modal-shell';
import { deleteActivityAction } from './actions';
import {
  listAttachableNotesAction,
  attachLibraryNoteAction,
  getLibraryNoteActivityAction,
  updateLibraryNoteActivityAction,
  type AttachableNote,
  type LibraryNoteActivityDetail,
} from './library-note-actions';

type Props =
  | {
      mode: 'create';
      unitId: string;
      blockId: string | null;
      // Cohort-only attach (Slice 3b) — when set, the note attaches as a
      // cohort-only activity in this cohort. null/undefined = template.
      cohortId?: string | null;
      // Slice 5 — called after a successful attach with the published
      // state, so the cohort surface can show the same draft/live nudge as
      // the editor-types create path.
      onAttached?: (published: boolean) => void;
      onClose: () => void;
    }
  | {
      mode: 'edit';
      activityId: string;
      onClose: () => void;
    };

export function LibraryNoteAttachModal(props: Props) {
  if (props.mode === 'create') return <CreateModal {...props} />;
  return <EditModal {...props} />;
}

// ── Create — pick a note + caption ────────────────────────────────────
function CreateModal({
  unitId,
  blockId,
  cohortId = null,
  onAttached,
  onClose,
}: {
  unitId: string;
  blockId: string | null;
  cohortId?: string | null;
  onAttached?: (published: boolean) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState<AttachableNote[] | null>(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    listAttachableNotesAction().then((rows) => {
      if (live) setNotes(rows);
    });
    return () => {
      live = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!notes) return [];
    const ql = q.trim().toLowerCase();
    if (!ql) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(ql) ||
        (n.subtitle ?? '').toLowerCase().includes(ql) ||
        (n.folder_name ?? '').toLowerCase().includes(ql),
    );
  }, [notes, q]);

  function submit() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await attachLibraryNoteAction(
        unitId,
        blockId,
        selected,
        caption,
        published,
        cohortId,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onAttached?.(published);
      onClose();
      router.refresh();
    });
  }

  return (
    <ViewerModalShell title="Attach a library note" onClose={onClose} size="wide">
      <div className="lib-attach">
        <input
          type="search"
          className="prog-input"
          placeholder="Search your published notes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search notes"
        />

        <div className="lib-attach-list" role="listbox" aria-label="Your published notes">
          {notes === null ? (
            <p className="lib-attach-empty">Loading your notes…</p>
          ) : filtered.length === 0 ? (
            <p className="lib-attach-empty">
              {notes.length === 0
                ? 'No published notes yet. Publish a note in your library first.'
                : 'No notes match your search.'}
            </p>
          ) : (
            filtered.map((n) => (
              <button
                key={n.note_id}
                type="button"
                role="option"
                aria-selected={selected === n.note_id}
                className={
                  'lib-attach-row' +
                  (selected === n.note_id ? ' is-selected' : '')
                }
                onClick={() => setSelected(n.note_id)}
              >
                <span className="lib-attach-row-ic" aria-hidden="true">
                  📔
                </span>
                <span className="lib-attach-row-main">
                  <span className="lib-attach-row-title">{n.title}</span>
                  {(n.folder_name || n.subtitle) && (
                    <span className="lib-attach-row-meta">
                      {n.folder_name && <>📁 {n.folder_name}</>}
                      {n.folder_name && n.subtitle && ' · '}
                      {n.subtitle}
                    </span>
                  )}
                </span>
                {selected === n.note_id && (
                  <span className="lib-attach-row-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        <label className="lib-attach-caption">
          <span className="lib-attach-caption-label">
            Caption <span className="lib-attach-optional">(optional)</span>
          </span>
          <input
            type="text"
            className="prog-input"
            placeholder="e.g. Read before Wednesday's session"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={140}
          />
        </label>

        <label className="lib-attach-publish">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          <span>
            Live — students can see this activity
            <span className="lib-attach-publish-sub">
              Leave off to attach it as a draft while you prepare the unit.
            </span>
          </span>
        </label>

        {error && <p className="lib-attach-error">{error}</p>}

        <div className="lib-attach-actions">
          <button
            type="button"
            className="prog-btn prog-btn-ghost"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="prog-btn prog-btn-primary"
            onClick={submit}
            disabled={pending || !selected}
          >
            {pending ? 'Attaching…' : 'Attach note'}
          </button>
        </div>
      </div>
    </ViewerModalShell>
  );
}

// ── Edit — caption + publish + detach ─────────────────────────────────
function EditModal({
  activityId,
  onClose,
}: {
  activityId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<LibraryNoteActivityDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    getLibraryNoteActivityAction(activityId).then((res) => {
      if (!live) return;
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      setDetail(res.detail);
      setCaption(res.detail.caption ?? '');
      setPublished(res.detail.is_published);
    });
    return () => {
      live = false;
    };
  }, [activityId]);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateLibraryNoteActivityAction(
        activityId,
        caption,
        published,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function detach() {
    setError(null);
    startTransition(async () => {
      const res = await deleteActivityAction(activityId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <ViewerModalShell title="Library note" onClose={onClose}>
      <div className="lib-attach">
        {loadError ? (
          <p className="lib-attach-error">{loadError}</p>
        ) : detail === null ? (
          <p className="lib-attach-empty">Loading…</p>
        ) : (
          <>
            <div className="lib-attach-linked">
              <span className="lib-attach-row-ic" aria-hidden="true">
                📔
              </span>
              <span className="lib-attach-row-main">
                <span className="lib-attach-row-title">{detail.note_title}</span>
                <Link
                  href={`/tutor/library/note/${detail.note_id}`}
                  className="lib-attach-open"
                  target="_blank"
                >
                  Open in library ↗
                </Link>
              </span>
            </div>

            <label className="lib-attach-caption">
              <span className="lib-attach-caption-label">
                Caption <span className="lib-attach-optional">(optional)</span>
              </span>
              <input
                type="text"
                className="prog-input"
                placeholder="e.g. Read before Wednesday's session"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={140}
              />
            </label>

            <label className="lib-attach-publish">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
              />
              <span>
                Live — students can see this activity
                <span className="lib-attach-publish-sub">
                  Leave off to keep it a draft while you prepare the unit.
                </span>
              </span>
            </label>

            {error && <p className="lib-attach-error">{error}</p>}

            <div className="lib-attach-actions lib-attach-actions-split">
              <button
                type="button"
                className="prog-btn prog-btn-danger"
                onClick={detach}
                disabled={pending}
              >
                Detach
              </button>
              <div className="lib-attach-actions-right">
                <button
                  type="button"
                  className="prog-btn prog-btn-ghost"
                  onClick={onClose}
                  disabled={pending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="prog-btn prog-btn-primary"
                  onClick={save}
                  disabled={pending}
                >
                  {pending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </ViewerModalShell>
  );
}
