// mynclex/lib/curriculum/shelf-attach-modal.tsx
//
// Slice 11.12 — the Shelf attach / edit modal. Reuses the shared
// ViewerModalShell frame and the .lib-attach* styles from the Library
// Note modal. Two modes:
//   - create: browse the tutor's shelves, pick one; its live member
//     notes preview below with the "N of M won't be visible here"
//     warning; optional caption -> attach as a draft activity.
//   - edit: the linked shelf + the live member-notes list with per-note
//     Hide/Unhide (skip-list) and "Make visible here" (for a note whose
//     own visibility excludes this programme) + caption + Live/Draft
//     toggle; Detach removes the activity (cascading the attachment).
//
// The two "won't show to students" reasons are surfaced distinctly per
// the slice-11.12 "Option A" decision: "Hidden here / Unhide" (the tutor
// trimmed it, reversible here) vs "Not visible to this programme / Make
// visible here" (the note's own visibility, fixed by widening the note).

'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ViewerModalShell } from './viewer-modal-shell';
import { deleteActivityAction } from './actions';
import {
  listAttachableShelvesAction,
  previewShelfForUnitAction,
  attachShelfAction,
  getShelfActivityAction,
  updateShelfActivityAction,
  setShelfNoteHiddenAction,
  makeNoteVisibleHereAction,
  type AttachableShelf,
  type ShelfPreview,
  type ShelfActivityDetail,
  type ShelfMemberNote,
} from './shelf-activity-actions';

type Props =
  | {
      mode: 'create';
      unitId: string;
      blockId: string | null;
      onClose: () => void;
    }
  | {
      mode: 'edit';
      activityId: string;
      onClose: () => void;
    };

export function ShelfAttachModal(props: Props) {
  if (props.mode === 'create') return <CreateModal {...props} />;
  return <EditModal {...props} />;
}

// Count how many member notes won't reach students for visibility reasons
// (used for the attach-time + edit-time warning line).
function countNotVisible(notes: ShelfMemberNote[]): number {
  return notes.filter((n) => !n.visible_to_programme).length;
}

// -- Create: pick a shelf + caption ------------------------------------
function CreateModal({
  unitId,
  blockId,
  onClose,
}: {
  unitId: string;
  blockId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [shelves, setShelves] = useState<AttachableShelf[] | null>(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<ShelfPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [caption, setCaption] = useState('');
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    listAttachableShelvesAction().then((rows) => {
      if (live) setShelves(rows);
    });
    return () => {
      live = false;
    };
  }, []);

  // Load the picked shelf's member preview (members + visibility).
  // `selected` only ever goes null -> id (a row click) or id -> id
  // (re-pick), never back to null. The loading flag is flipped on in
  // the click handler (selectShelf) — not here — so the effect body
  // contains no synchronous setState.
  useEffect(() => {
    if (!selected) return;
    let live = true;
    previewShelfForUnitAction(unitId, selected).then((res) => {
      if (!live) return;
      setPreviewLoading(false);
      setPreview(res.ok ? res.preview : null);
      if (!res.ok) setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [selected, unitId]);

  function selectShelf(shelfId: string) {
    if (shelfId === selected) return;
    setPreviewLoading(true);
    setSelected(shelfId);
  }

  const filtered = useMemo(() => {
    if (!shelves) return [];
    const ql = q.trim().toLowerCase();
    if (!ql) return shelves;
    return shelves.filter(
      (s) =>
        s.title.toLowerCase().includes(ql) ||
        (s.description ?? '').toLowerCase().includes(ql),
    );
  }, [shelves, q]);

  function submit() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await attachShelfAction(
        unitId,
        blockId,
        selected,
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

  const notVisible = preview ? countNotVisible(preview.notes) : 0;

  return (
    <ViewerModalShell title="Attach a shelf" onClose={onClose} size="wide">
      <div className="lib-attach">
        <input
          type="search"
          className="prog-input"
          placeholder="Search your shelves…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search shelves"
        />

        <div className="lib-attach-list" role="listbox" aria-label="Your shelves">
          {shelves === null ? (
            <p className="lib-attach-empty">Loading your shelves…</p>
          ) : filtered.length === 0 ? (
            <p className="lib-attach-empty">
              {shelves.length === 0
                ? 'No shelves yet. Create a shelf in your library first.'
                : 'No shelves match your search.'}
            </p>
          ) : (
            filtered.map((s) => (
              <button
                key={s.shelf_id}
                type="button"
                role="option"
                aria-selected={selected === s.shelf_id}
                className={
                  'lib-attach-row' +
                  (selected === s.shelf_id ? ' is-selected' : '')
                }
                onClick={() => selectShelf(s.shelf_id)}
              >
                <span
                  className="lib-attach-row-dot"
                  style={{ background: s.color }}
                  aria-hidden="true"
                />
                <span className="lib-attach-row-main">
                  <span className="lib-attach-row-title">{s.title}</span>
                  <span className="lib-attach-row-meta">
                    {s.note_count} note{s.note_count === 1 ? '' : 's'}
                    {s.description ? ` · ${s.description}` : ''}
                  </span>
                </span>
                {selected === s.shelf_id && (
                  <span className="lib-attach-row-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Member preview + visibility warning for the picked shelf. */}
        {selected && (
          <div className="lib-shelf-preview">
            {previewLoading ? (
              <p className="lib-attach-empty">Loading shelf notes…</p>
            ) : preview && preview.notes.length > 0 ? (
              <>
                {notVisible > 0 && (
                  <p className="lib-shelf-warn">
                    ⚠ {notVisible} of {preview.notes.length} note
                    {preview.notes.length === 1 ? '' : 's'} won&rsquo;t be
                    visible to this programme&rsquo;s students (their visibility
                    excludes it). You can attach anyway and fix it from the
                    activity later.
                  </p>
                )}
                <ul className="lib-shelf-members">
                  {preview.notes.map((n) => (
                    <li key={n.note_id} className="lib-shelf-member">
                      <span className="lib-shelf-member-title">{n.title}</span>
                      {!n.is_published && (
                        <span className="lib-shelf-tag is-draft">Draft</span>
                      )}
                      {!n.visible_to_programme && (
                        <span className="lib-shelf-tag is-blocked">
                          Not visible here
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : preview ? (
              <p className="lib-attach-empty">
                This shelf has no notes yet. Add notes to it in your library.
              </p>
            ) : null}
          </div>
        )}

        <label className="lib-attach-caption">
          <span className="lib-attach-caption-label">
            Caption <span className="lib-attach-optional">(optional)</span>
          </span>
          <input
            type="text"
            className="prog-input"
            placeholder="e.g. Work through these before the session"
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
            {pending ? 'Attaching…' : 'Attach shelf'}
          </button>
        </div>
      </div>
    </ViewerModalShell>
  );
}

// -- Edit: caption + publish + per-note hide/visibility + detach -------
function EditModal({
  activityId,
  onClose,
}: {
  activityId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<ShelfActivityDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Per-note action in flight (note_id) so we can disable just that row.
  const [rowPending, setRowPending] = useState<string | null>(null);

  // Re-fetch just the member list after a per-note action (hide /
  // unhide / make-visible) so the row states update in place. Doesn't
  // touch the caption / publish form fields the tutor may be editing.
  function reloadNotes() {
    getShelfActivityAction(activityId).then((res) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDetail(res.detail);
    });
  }

  useEffect(() => {
    let live = true;
    getShelfActivityAction(activityId).then((res) => {
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
      const res = await updateShelfActivityAction(activityId, caption, published);
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

  function toggleHidden(noteId: string, hidden: boolean) {
    setError(null);
    setRowPending(noteId);
    startTransition(async () => {
      const res = await setShelfNoteHiddenAction(activityId, noteId, hidden);
      setRowPending(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      reloadNotes();
      router.refresh();
    });
  }

  function makeVisible(noteId: string) {
    setError(null);
    setRowPending(noteId);
    startTransition(async () => {
      const res = await makeNoteVisibleHereAction(activityId, noteId);
      setRowPending(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      reloadNotes();
      router.refresh();
    });
  }

  const notVisible = detail ? countNotVisible(detail.notes) : 0;

  return (
    <ViewerModalShell title="Shelf" onClose={onClose} size="wide">
      <div className="lib-attach">
        {loadError ? (
          <p className="lib-attach-error">{loadError}</p>
        ) : detail === null ? (
          <p className="lib-attach-empty">Loading…</p>
        ) : (
          <>
            <div className="lib-attach-linked">
              <span
                className="lib-attach-row-dot"
                style={{ background: detail.shelf_color }}
                aria-hidden="true"
              />
              <span className="lib-attach-row-main">
                <span className="lib-attach-row-title">{detail.shelf_title}</span>
                <Link
                  href={`/tutor/library?shelf=${detail.shelf_id}`}
                  className="lib-attach-open"
                  target="_blank"
                >
                  Open in library ↗
                </Link>
              </span>
            </div>

            {notVisible > 0 && (
              <p className="lib-shelf-warn">
                ⚠ {notVisible} of {detail.notes.length} note
                {detail.notes.length === 1 ? '' : 's'} won&rsquo;t be visible to
                this programme&rsquo;s students. Use &ldquo;Make visible
                here&rdquo; to fix one.
              </p>
            )}

            <div className="lib-shelf-members-edit">
              <p className="lib-shelf-members-head">
                Notes in this shelf
                <span className="lib-attach-optional">
                  {' '}
                  · live — adding to the shelf later updates this unit
                </span>
              </p>
              {detail.notes.length === 0 ? (
                <p className="lib-attach-empty">This shelf has no notes yet.</p>
              ) : (
                <ul className="lib-shelf-members">
                  {detail.notes.map((n) => {
                    const busy = rowPending === n.note_id || pending;
                    const blocked =
                      !n.visible_to_programme &&
                      n.visibility_mode === 'PROGRAMME_SCOPED';
                    return (
                      <li
                        key={n.note_id}
                        className={
                          'lib-shelf-member' + (n.skipped ? ' is-skipped' : '')
                        }
                      >
                        <span className="lib-shelf-member-main">
                          <span className="lib-shelf-member-title">
                            {n.title}
                          </span>
                          <span className="lib-shelf-member-tags">
                            {!n.is_published && (
                              <span className="lib-shelf-tag is-draft">
                                Draft
                              </span>
                            )}
                            {n.skipped && (
                              <span className="lib-shelf-tag is-hidden">
                                Hidden here
                              </span>
                            )}
                            {blocked && (
                              <span className="lib-shelf-tag is-blocked">
                                Not visible to this programme
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="lib-shelf-member-actions">
                          {blocked && (
                            <button
                              type="button"
                              className="lib-shelf-link-btn"
                              onClick={() => makeVisible(n.note_id)}
                              disabled={busy}
                            >
                              Make visible here
                            </button>
                          )}
                          {n.skipped ? (
                            <button
                              type="button"
                              className="lib-shelf-link-btn"
                              onClick={() => toggleHidden(n.note_id, false)}
                              disabled={busy}
                            >
                              Unhide
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="lib-shelf-link-btn is-muted"
                              onClick={() => toggleHidden(n.note_id, true)}
                              disabled={busy}
                            >
                              Hide here
                            </button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <label className="lib-attach-caption">
              <span className="lib-attach-caption-label">
                Caption <span className="lib-attach-optional">(optional)</span>
              </span>
              <input
                type="text"
                className="prog-input"
                placeholder="e.g. Work through these before the session"
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
