'use client';

// mynclex/lib/library/note-editor.tsx
//
// Tutor library note editor. Slice 11.2b shipped this with a plain
// textarea body + explicit Save button. Slice 11.5a swaps both:
//
//   • Body is the Tiptap rich block editor (<NoteBodyEditor>) —
//     text-only blocks for now; visual / nursing-domain blocks land
//     in 11.6+.
//   • The Save button is gone — autosave on a 3-second debounce
//     after the last edit. The toolbar badge reflects state.
//   • The two-tabs `version_id` save guard is wired through
//     `updateNoteAction`: every save carries the version_id the
//     editor loaded with; if another tab has saved in between, the
//     action returns `conflict: true` and the editor surfaces a
//     reload-prompt toast.
//
// Layout (same three zones as 11.2b):
//
//   ┌────────────────────────────────────────────────────────┐
//   │ Sticky toolbar: [breadcrumb]  …  [save badge] [Draft]…  │
//   ├──────────────────────────────────┬─────────────────────┤
//   │ Title (large serif)              │ Right rail          │
//   │ Subtitle (italic)                │  • Status           │
//   │ Description (small one-line)     │  • On shelves       │
//   │ FOLDER · PILLARS · TAGS          │  • Outline          │
//   │ ──── inline meta row ────         │  • Embedded qs      │
//   │ ┌────── Tiptap inline toolbar ──┐ │  • Used in          │
//   │ │  Block ▾  B I U S </>  • 1. " │ │  • Guards           │
//   │ ├────────────────────────────────┤ │                    │
//   │ │  Body — grows with content     │ │                    │
//   │ │  (no internal scroll;          │ │                    │
//   │ │   .product-content scrolls)    │ │                    │
//   │ └────────────────────────────────┘ │                    │
//   └──────────────────────────────────┴─────────────────────┘
//
// Note: the outer breadcrumb bar (top of the page) and the Tiptap
// toolbar (between meta row and body) are two different toolbars.
// Both are sticky in the .product-content scroll context — see
// styles/library.css for the placements.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { unpublishNoteAction, updateNoteAction } from './actions';
import {
  LIB_BLOCK_UPLOAD_EVENT,
  type LibBlockUploadDetail,
} from './block-upload-event';
import { NoteBodyEditor } from './note-body-editor';
import { PillarPicker } from './pillar-picker';
import { FolderPicker } from './folder-picker';
import { TagInput } from './tag-input';
import { PublishDialog, type PublishedState } from './publish-dialog';
import { formatRelative, pillarShortName } from './format';
import {
  bodyToTiptap,
  countMissingAltImages,
  deriveOutlineFromDoc,
  tiptapToBody,
  type TiptapDoc,
} from './body-tiptap';
import type {
  LibraryFolderWithCount,
  LibraryNoteForEdit,
  LibraryProgrammeOption,
  LibraryVisibilityMode,
  NclexPillar,
} from './types';

interface NoteEditorProps {
  note: LibraryNoteForEdit;
  folders: LibraryFolderWithCount[];
  programmes: LibraryProgrammeOption[];
}

const TITLE_MIN = 2;
const TITLE_MAX = 120;
const SUBTITLE_MAX = 200;
const DESC_MAX = 280;

// Debounce window for autosave. Planning doc § Autosave: "every 3
// seconds of inactivity (debounced)."
const AUTOSAVE_DEBOUNCE_MS = 3000;

/**
 * Walk the persisted body looking for `embedded_questions` blocks
 * and total up their `item_ids[]` lengths. Always returns 0/0 in
 * 11.5a (the picker that writes this block type lands with 11.15).
 * Reads the persisted body (`note.body`), not the live editor doc —
 * the live doc only carries the block types StarterKit knows about,
 * so a future 11.15 note opened here would temporarily lose the
 * embed count from the rail until 11.15 also lands.
 */
function countEmbeds(body: unknown): { blocks: number; questions: number } {
  if (!Array.isArray(body)) return { blocks: 0, questions: 0 };
  let blocks = 0;
  let questions = 0;
  for (const raw of body) {
    if (!raw || typeof raw !== 'object') continue;
    const b = raw as { type?: string; item_ids?: unknown };
    if (b.type !== 'embedded_questions') continue;
    blocks += 1;
    if (Array.isArray(b.item_ids)) {
      questions += b.item_ids.length;
    }
  }
  return { blocks, questions };
}

// =====================================================================
// The editor
// =====================================================================

export function NoteEditor({ note, folders, programmes }: NoteEditorProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  // ─────────────────────────────────────────────────────────
  // Publish / visibility state (slice 11.10)
  // ─────────────────────────────────────────────────────────
  const [isPublished, setIsPublished] = useState(note.is_published);
  const [visibilityMode, setVisibilityMode] = useState<LibraryVisibilityMode>(
    note.visibility_mode,
  );
  const [visibilityProgrammeIds, setVisibilityProgrammeIds] = useState<string[]>(
    note.visibility_programme_ids,
  );
  const [showPublish, setShowPublish] = useState(false);
  const [unpublishPending, startUnpublish] = useTransition();

  // Map scoped programme IDs → titles for the Status-rail display.
  const programmeTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of programmes) m.set(p.programme_id, p.title);
    return m;
  }, [programmes]);

  const scopedProgrammeTitles = useMemo(
    () =>
      visibilityProgrammeIds.map(
        (id) => programmeTitleById.get(id) ?? 'Unknown programme',
      ),
    [visibilityProgrammeIds, programmeTitleById],
  );

  // The Publish button's gate: scan the LIVE doc for images missing
  // alt text. If any, block + scroll to the first offender's alt field
  // instead of opening the dialog. (The server action re-checks the
  // saved body as a backstop.)
  function handlePublishClick() {
    const missing = countMissingAltImages(currentDocRef.current);
    if (missing > 0) {
      setError(
        missing === 1
          ? '1 image is missing alt text — describe it, then publish.'
          : `${missing} images are missing alt text — describe them, then publish.`,
      );
      scrollToFirstMissingAlt();
      return;
    }
    setShowPublish(true);
  }

  function scrollToFirstMissingAlt() {
    if (typeof document === 'undefined') return;
    const main = document.querySelector('.lib-editor-main');
    if (!main) return;
    const figures = main.querySelectorAll('figure[data-lib-image]');
    for (const fig of Array.from(figures)) {
      const altInput = fig.querySelector<HTMLInputElement>('.lib-image-alt');
      if (altInput && altInput.value.trim().length === 0) {
        fig.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Focus after the scroll settles so the caret lands cleanly.
        window.setTimeout(() => altInput.focus(), 250);
        return;
      }
    }
  }

  function handlePublished(state: PublishedState) {
    setIsPublished(state.is_published);
    setVisibilityMode(state.visibility_mode);
    setVisibilityProgrammeIds(state.programme_ids);
  }

  function handleUnpublish() {
    if (unpublishPending) return;
    setError(null);
    startUnpublish(async () => {
      const result = await unpublishNoteAction(note.note_id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsPublished(false);
    });
  }

  // Form state — non-body fields are plain useState because they
  // re-render the parent cheaply. Body is special — see below.
  const [title, setTitle] = useState(note.title);
  const [subtitle, setSubtitle] = useState(note.subtitle ?? '');
  const [description, setDescription] = useState(note.description ?? '');
  const [pillars, setPillars] = useState<NclexPillar[]>(note.pillars);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [folderId, setFolderId] = useState<string | null>(note.folder_id);

  // Body state lives in a ref to avoid re-rendering the parent on
  // every keystroke. `bodyEditVersion` increments on each edit and
  // is what the autosave effect watches.
  const initialDocRef = useRef<TiptapDoc>(bodyToTiptap(note.body));
  const currentDocRef = useRef<TiptapDoc>(initialDocRef.current);
  const [bodyEditVersion, setBodyEditVersion] = useState(0);

  // Outline ticker — re-derive on each body edit. Cheap walk; no
  // memoisation needed beyond the version dependency.
  const [outline, setOutline] = useState(() =>
    deriveOutlineFromDoc(initialDocRef.current),
  );

  function handleBodyUpdate(doc: TiptapDoc) {
    currentDocRef.current = doc;
    setBodyEditVersion((v) => v + 1);
    setOutline(deriveOutlineFromDoc(doc));
  }

  // Save state. `saveState` is the user-visible badge; `inFlightRef`
  // is the internal "a save is currently running" flag so we don't
  // queue two saves at once. `savedState` is the baseline that
  // dirty-tracking compares against; it's seeded from `note` at
  // mount and updated to the latest committed values after every
  // successful save (so post-save the editor flips back to
  // "saved" instead of being treated as still-dirty).
  type SavedBaseline = {
    title: string;
    subtitle: string | null;
    description: string | null;
    folder_id: string | null;
    pillars: NclexPillar[];
    tags: string[];
    bodyVersion: number;
  };
  const [savedState, setSavedState] = useState<SavedBaseline>({
    title: note.title,
    subtitle: note.subtitle,
    description: note.description,
    folder_id: note.folder_id,
    pillars: note.pillars,
    tags: note.tags,
    bodyVersion: 0,
  });
  const [saveState, setSaveState] = useState<
    'saved' | 'saving' | 'dirty' | 'conflict'
  >('saved');
  const inFlightRef = useRef(false);
  const [lastSavedAt, setLastSavedAt] = useState<string>(note.updated_at);
  const [expectedVersionId, setExpectedVersionId] = useState<string>(
    note.version_id,
  );
  const [saveTick, setSaveTick] = useState(0);
  // Bumped each time a save finishes. The autosave effect depends on
  // it so that an edit which arrived *while a save was in flight*
  // (and was therefore skipped by the `inFlightRef` guard) gets
  // re-evaluated — and rescheduled — the moment the in-flight save
  // completes. Without this, an edit landing mid-save is silently
  // dropped (the image upload that finishes during the empty-block
  // autosave was the symptom: its assetId was never persisted).
  const [resaveNonce, setResaveNonce] = useState(0);

  // Number of media uploads currently in flight (across all image
  // and PDF blocks). While > 0 the autosave gate holds off — an
  // upload isn't inactivity, and saving mid-upload would persist a
  // not-yet-filled block. The ref mirrors the state so `runAutosave`
  // can read the live value without being re-created. When it drops back to 0
  // the autosave effect re-runs (it's in the dep array) and, if the
  // doc is dirty, schedules the deferred save.
  const [uploadsInFlight, setUploadsInFlight] = useState(0);
  const uploadsInFlightRef = useRef(0);
  useEffect(() => {
    function onUploadState(e: Event) {
      const detail = (e as CustomEvent<LibBlockUploadDetail>).detail;
      setUploadsInFlight((n) => {
        const next = Math.max(0, n + (detail.uploading ? 1 : -1));
        uploadsInFlightRef.current = next;
        return next;
      });
    }
    window.addEventListener(LIB_BLOCK_UPLOAD_EVENT, onUploadState as EventListener);
    return () =>
      window.removeEventListener(
        LIB_BLOCK_UPLOAD_EVENT,
        onUploadState as EventListener,
      );
  }, []);

  // Popover open state — sibling popovers should never both be open.
  const [folderOpen, setFolderOpen] = useState(false);
  const [pillarOpen, setPillarOpen] = useState(false);

  // Discard / leave-with-unsaved-changes guard.
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);

  // Rail collapse — Notion-style two-state. localStorage persists
  // the preference across sessions. Defaults expanded so a new
  // tutor sees the full Status / On shelves / Outline rail.
  const [railCollapsed, setRailCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem('mynclex.library.editor.rail-collapsed') === '1') {
        setRailCollapsed(true);
      }
    } catch {
      /* localStorage blocked — fine */
    }
  }, []);
  function toggleRail() {
    setRailCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(
          'mynclex.library.editor.rail-collapsed',
          next ? '1' : '0',
        );
      } catch {
        /* localStorage blocked */
      }
      return next;
    });
  }

  // Refresh "saved Xs ago" copy every 30s.
  useEffect(() => {
    const id = window.setInterval(() => setSaveTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // ─────────────────────────────────────────────────────────
  // Dirty detection
  // ─────────────────────────────────────────────────────────

  const isDirty = useMemo(() => {
    if (title !== savedState.title) return true;
    if ((subtitle || null) !== savedState.subtitle) return true;
    if ((description || null) !== savedState.description) return true;
    if (folderId !== savedState.folder_id) return true;
    if (!arraysEqual(pillars, savedState.pillars)) return true;
    if (!arraysEqual(tags, savedState.tags)) return true;
    if (bodyEditVersion > savedState.bodyVersion) return true;
    return false;
  }, [
    title,
    subtitle,
    description,
    folderId,
    pillars,
    tags,
    bodyEditVersion,
    savedState,
  ]);

  // Server-side validation gates: title 2..120 + subtitle ≤ 200 +
  // description ≤ 280 + ≥1 pillar. We don't autosave if validation
  // fails — surface inline errors instead.
  const trimmedTitle = title.trim();
  const isTitleValid =
    trimmedTitle.length >= TITLE_MIN && trimmedTitle.length <= TITLE_MAX;
  const isSubtitleValid = subtitle.length <= SUBTITLE_MAX;
  const isDescValid = description.length <= DESC_MAX;
  const hasPillar = pillars.length >= 1;
  const canSave = isDirty && isTitleValid && isSubtitleValid && isDescValid && hasPillar;

  // ─────────────────────────────────────────────────────────
  // Debounced autosave
  // ─────────────────────────────────────────────────────────
  //
  // Every dirty trigger (any form field change OR a body edit) bumps
  // a dep in this effect; the previous timer is cleared and a fresh
  // 3-second timer starts. When the timer fires we run the save —
  // unless a save is already in flight, in which case we requeue
  // after the in-flight one finishes (the next effect cycle picks
  // it up because `inFlightRef` resets to false and `saveTick`
  // re-runs deps).
  //
  // Conflict handling: if the action returns `conflict: true`, we
  // stop autosaving and ask the tutor to reload. Last-write-wins
  // with a guard is the v1 policy — no merge UI.

  // Refs for the latest field values, read by runAutosave so the
  // closure always sees the values at save-time rather than at
  // effect-schedule time.
  const fieldsRef = useRef({
    title: trimmedTitle,
    subtitle,
    description,
    folderId,
    pillars,
    tags,
  });
  useEffect(() => {
    fieldsRef.current = {
      title: trimmedTitle,
      subtitle,
      description,
      folderId,
      pillars,
      tags,
    };
  }, [trimmedTitle, subtitle, description, folderId, pillars, tags]);

  useEffect(() => {
    // Don't schedule a save if: nothing's dirty, validation fails,
    // a conflict toast is up, or a save is already in flight.
    // `saveState` deliberately isn't in the dep array — using
    // `inFlightRef` for in-flight gating avoids the re-render loop
    // that would otherwise restart the debounce timer.
    if (!canSave) return;
    if (saveStateRef.current === 'conflict') return;
    if (inFlightRef.current) return;
    // An image upload is in flight — don't schedule (and, via the
    // cleanup of the previous run, cancel any pending timer). The save
    // reschedules when the upload settles and bumps `uploadsInFlight`.
    if (uploadsInFlightRef.current > 0) return;

    if (saveStateRef.current !== 'dirty') setSaveState('dirty');

    const timer = window.setTimeout(() => {
      void runAutosave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title,
    subtitle,
    description,
    folderId,
    pillars,
    tags,
    bodyEditVersion,
    canSave,
    resaveNonce,
    uploadsInFlight,
  ]);

  // Mirror saveState into a ref so the autosave effect can read it
  // without including it in deps (and triggering the timer-reset
  // loop). The effect re-evaluates whenever any edit fires.
  const saveStateRef = useRef(saveState);
  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  async function runAutosave() {
    if (inFlightRef.current) return;
    // Defer if a timer fired just as an upload began — the effect
    // reschedules once the upload settles.
    if (uploadsInFlightRef.current > 0) return;
    inFlightRef.current = true;
    setSaveState('saving');
    setError(null);

    const f = fieldsRef.current;
    const bodyVersionAtSave = bodyEditVersion;

    const result = await updateNoteAction(note.note_id, {
      title: f.title,
      subtitle: f.subtitle.trim() || null,
      description: f.description.trim() || null,
      body: tiptapToBody(currentDocRef.current),
      pillars: f.pillars,
      tags: f.tags,
      folder_id: f.folderId,
      expected_version_id: expectedVersionId,
    });

    inFlightRef.current = false;
    // Re-poke the autosave effect now the in-flight save is done, in
    // case an edit arrived while it was running (the effect would have
    // bailed on the inFlightRef guard without scheduling). If nothing
    // is dirty this is a harmless no-op; on conflict the effect's own
    // guard suppresses the reschedule.
    setResaveNonce((n) => n + 1);

    if (!result.ok) {
      if (result.conflict) {
        setSaveState('conflict');
        setError(result.error);
        return;
      }
      setSaveState('dirty');
      setError(result.error);
      return;
    }

    // Commit the new baseline so isDirty re-evaluates to false. If
    // the user typed more during the save, the new bodyEditVersion
    // is higher than bodyVersionAtSave — isDirty stays true and the
    // effect schedules another autosave.
    setSavedState({
      title: f.title,
      subtitle: f.subtitle.trim() || null,
      description: f.description.trim() || null,
      folder_id: f.folderId,
      pillars: f.pillars,
      tags: f.tags,
      bodyVersion: bodyVersionAtSave,
    });
    setExpectedVersionId(result.version_id);
    setLastSavedAt(result.updated_at);
    setSaveState('saved');
  }

  // Browser warning when the tutor tries to leave with unsaved
  // changes. The in-app DiscardConfirm catches breadcrumb leaves;
  // this catches close-tab / reload.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty || saveState === 'saving') {
        e.preventDefault();
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty, saveState]);

  /**
   * Single navigation guard used by every leave-the-editor
   * affordance — breadcrumb crumbs + any future exit path. If the
   * editor is dirty or a save is in flight, surface the
   * DiscardConfirm; otherwise navigate straight.
   */
  function attemptLeave(href: string) {
    if (isDirty || saveState === 'saving') {
      setPendingNavHref(href);
      setShowDiscard(true);
    } else {
      router.push(href);
    }
  }

  const selectedFolder = useMemo(
    () => (folderId ? folders.find((f) => f.folder_id === folderId) ?? null : null),
    [folderId, folders],
  );

  const embedCounts = useMemo(() => countEmbeds(note.body), [note.body]);
  const usedInCount = note.used_in_count;

  const saveBadge =
    saveState === 'saving'
      ? { state: 'saving' as const, label: 'Saving…' }
      : saveState === 'dirty'
        ? { state: 'dirty' as const, label: 'Unsaved changes' }
        : saveState === 'conflict'
          ? { state: 'dirty' as const, label: 'Reload — newer version exists' }
          : { state: 'saved' as const, label: `Saved · ${formatRelative(lastSavedAt)}` };
  // saveTick keeps the relative copy fresh.
  void saveTick;

  return (
    <div className="lib-editor-shell">
      {/* Sticky outer toolbar — breadcrumb + save badge + status */}
      <div className="lib-editor-bar">
        <div className="lib-editor-bar-left">
          <nav className="lib-editor-crumb" aria-label="Library breadcrumb">
            <button
              type="button"
              className="lib-crumb-link"
              onClick={() => attemptLeave('/tutor/library')}
            >
              Library
            </button>
            {selectedFolder && (
              <>
                <span className="lib-crumb-sep" aria-hidden="true">/</span>
                <button
                  type="button"
                  className="lib-crumb-link"
                  onClick={() =>
                    attemptLeave(`/tutor/library?folder=${selectedFolder.folder_id}`)
                  }
                  title={selectedFolder.description ?? undefined}
                >
                  {selectedFolder.name}
                </button>
              </>
            )}
            <span className="lib-crumb-sep" aria-hidden="true">/</span>
            <span
              className="lib-crumb-cur"
              aria-current="page"
              title={note.title}
            >
              {note.title || 'Untitled note'}
            </span>
          </nav>
        </div>
        <div className="lib-editor-bar-right">
          <span className={`lib-savebadge is-${saveBadge.state}`}>
            <span className="blip" aria-hidden="true" />
            {saveBadge.label}
          </span>
          <span
            className={`lib-state-pill is-${isPublished ? 'pub' : 'draft'}`}
          >
            {isPublished ? 'Published' : 'Draft'}
          </span>
          {isPublished ? (
            <>
              <button
                type="button"
                className="lib-btn lib-btn-ghost"
                onClick={() => setShowPublish(true)}
                title="Change who can read this note"
              >
                Visibility
              </button>
              <button
                type="button"
                className="lib-btn lib-btn-ghost"
                onClick={handleUnpublish}
                disabled={unpublishPending}
                title="Hide this note from students — back to a private draft"
              >
                {unpublishPending ? 'Unpublishing…' : 'Unpublish'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="lib-btn lib-btn-accent"
              onClick={handlePublishClick}
              title="Make this note visible to students"
            >
              Publish
            </button>
          )}
        </div>
      </div>

      <div
        className={
          railCollapsed ? 'lib-editor-grid is-rail-collapsed' : 'lib-editor-grid'
        }
      >
        {/* Main editor pane */}
        <div className="lib-editor-main" style={{ position: 'relative' }}>
          {railCollapsed && (
            <button
              type="button"
              className="lib-rail-toggle lib-rail-restore"
              onClick={toggleRail}
              title="Show right rail"
              aria-label="Show right rail"
            >
              «
            </button>
          )}
          {/* Title / Subtitle / Description — same edit-cue hover
              affordance as 11.2b (hover-revealed ✎). */}
          <div className="lib-editor-editable">
            <input
              type="text"
              className="lib-editor-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled note"
              aria-label="Note title"
            />
            <span className="lib-editor-pencil" aria-hidden="true">
              ✎
            </span>
          </div>
          {!isTitleValid && trimmedTitle.length > 0 && (
            <span className="lib-field-error">
              {trimmedTitle.length < TITLE_MIN
                ? `Title must be at least ${TITLE_MIN} characters.`
                : `Title must be ${TITLE_MAX} characters or fewer.`}
            </span>
          )}
          <div className="lib-editor-editable">
            <input
              type="text"
              className="lib-editor-subtitle"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Subtitle (optional)"
              aria-label="Subtitle"
            />
            <span className="lib-editor-pencil" aria-hidden="true">
              ✎
            </span>
          </div>
          {!isSubtitleValid && (
            <span className="lib-field-error">
              Subtitle must be {SUBTITLE_MAX} characters or fewer.
            </span>
          )}
          <div className="lib-editor-editable">
            <input
              type="text"
              className="lib-editor-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Card description — shown when this note appears in lists (optional)"
              aria-label="Description"
              maxLength={DESC_MAX + 20}
            />
            <span className="lib-editor-pencil" aria-hidden="true">
              ✎
            </span>
          </div>
          {!isDescValid && (
            <span className="lib-field-error">
              Description must be {DESC_MAX} characters or fewer
              ({description.length} now).
            </span>
          )}

          {/* Inline meta row — folder + pillars + tags */}
          <div className="lib-editor-meta">
            <div className="lib-meta-block">
              <span className="lib-meta-label">Folder</span>
              <div className="lib-anchor">
                <button
                  type="button"
                  className="lib-anchor-trigger"
                  onClick={() => {
                    setPillarOpen(false);
                    setFolderOpen((v) => !v);
                  }}
                >
                  <span className="lib-anchor-ic" aria-hidden="true">
                    {selectedFolder ? '📁' : '⌖'}
                  </span>
                  <span>{selectedFolder ? selectedFolder.name : 'Root'}</span>
                  <span className="lib-anchor-chev" aria-hidden="true">▾</span>
                </button>
                {folderOpen && (
                  <FolderPicker
                    folders={folders}
                    value={folderId}
                    onChange={setFolderId}
                    onClose={() => setFolderOpen(false)}
                  />
                )}
              </div>
            </div>

            <div className="lib-meta-block">
              <span className="lib-meta-label">
                Pillars <span className="prog-required">*</span>
              </span>
              <div className="lib-anchor">
                <div className="lib-meta-chips">
                  {pillars.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="lib-meta-chip is-on"
                      title={`${p} — click to remove`}
                      onClick={() =>
                        setPillars((cur) => cur.filter((x) => x !== p))
                      }
                    >
                      <span>{pillarShortName(p)}</span>
                      <span className="lib-meta-chip-x" aria-hidden="true">×</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="lib-meta-chip-add"
                    onClick={() => {
                      setFolderOpen(false);
                      setPillarOpen((v) => !v);
                    }}
                  >
                    + {pillars.length === 0 ? 'Add pillar' : 'Add'}
                  </button>
                </div>
                {pillarOpen && (
                  <PillarPicker
                    value={pillars}
                    onChange={setPillars}
                    onClose={() => setPillarOpen(false)}
                  />
                )}
              </div>
            </div>

            <div className="lib-meta-block lib-meta-block-tags">
              <span className="lib-meta-label">Tags</span>
              <TagInput value={tags} onChange={setTags} />
            </div>
          </div>

          {/* Tiptap body editor — toolbar above + ProseMirror element. */}
          <NoteBodyEditor
            initialDoc={initialDocRef.current}
            onUpdate={handleBodyUpdate}
          />
        </div>

        {/* Right rail — sticky to viewport. The collapse toggle in
            the Status section's head hides the rail entirely; a
            restore button (rendered above) brings it back. */}
        <aside className="lib-editor-rail" aria-label="Note properties">
          <section className="lib-rail-section">
            <div className="lib-rail-section-head">
              <div className="lib-rail-title">Status</div>
              <button
                type="button"
                className="lib-rail-toggle"
                onClick={toggleRail}
                title="Hide right rail"
                aria-label="Hide right rail"
              >
                »
              </button>
            </div>
            <div className="lib-rail-row">
              <span className="lbl">State</span>
              <span
                className={`lib-state-pill is-${
                  isPublished ? 'pub' : 'draft'
                }`}
              >
                {isPublished ? 'Published' : 'Draft'}
              </span>
            </div>
            <div className="lib-rail-row">
              <span className="lbl">Visibility</span>
              {isPublished ? (
                visibilityMode === 'TUTOR_WIDE' ? (
                  <span>Tutor-wide</span>
                ) : (
                  <span>
                    Programme-scoped ({scopedProgrammeTitles.length})
                  </span>
                )
              ) : (
                <span className="lib-rail-muted">Draft — only you</span>
              )}
            </div>
            {isPublished &&
              visibilityMode === 'PROGRAMME_SCOPED' &&
              scopedProgrammeTitles.length > 0 && (
                <ul className="lib-rail-scoped-progs">
                  {scopedProgrammeTitles.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              )}
            <div className="lib-rail-row">
              <span className="lbl">Last save</span>
              <span>{formatRelative(lastSavedAt)}</span>
            </div>
          </section>

          <section className="lib-rail-section">
            <div className="lib-rail-title">On shelves</div>
            {note.shelf_memberships.length > 0 ? (
              <ul className="lib-rail-shelves">
                {note.shelf_memberships.map((s) => (
                  <li key={s.shelf_id}>
                    <a
                      href={`/tutor/library?shelf=${s.shelf_id}`}
                      className="lib-rail-shelf-link"
                      title={`Open the ${s.title} shelf`}
                    >
                      <span
                        className="lib-shelf-pip"
                        style={{ background: s.color }}
                        aria-hidden="true"
                      />
                      <span className="lib-rail-shelf-title">{s.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="lib-rail-muted">
                Not on any shelf yet. Add this note to a shelf from
                the All Shelves carousel or any shelf&apos;s detail
                page.
              </p>
            )}
          </section>

          <section className="lib-rail-section">
            <div className="lib-rail-title">Outline</div>
            {outline.length > 0 ? (
              <ul className="lib-rail-outline">
                {outline.map((row, i) => (
                  <li key={i} className={row.level === 3 ? 'is-h3' : 'is-h2'}>
                    {row.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="lib-rail-muted">
                Add H2 / H3 headings in the body for an outline to
                appear here.
              </p>
            )}
          </section>

          <section className="lib-rail-section">
            <div className="lib-rail-title">Embedded questions</div>
            <div className="lib-rail-row">
              <span className="lbl">Total</span>
              <span>
                {embedCounts.questions === 0
                  ? '0'
                  : `${embedCounts.questions} question${embedCounts.questions === 1 ? '' : 's'}`}
              </span>
            </div>
            {embedCounts.blocks > 0 && (
              <div className="lib-rail-row">
                <span className="lbl">Blocks</span>
                <span>
                  {embedCounts.blocks} {embedCounts.blocks === 1 ? 'block' : 'blocks'}
                </span>
              </div>
            )}
            <p className="lib-rail-muted">
              {embedCounts.questions === 0
                ? 'No embedded questions yet. The picker that adds them ships with slice 11.15. Cap: 20 per note (50 hard).'
                : 'Cap: 20 per note (50 hard). Picks come from your own tutor bank only.'}
            </p>
          </section>

          <section className="lib-rail-section">
            <div className="lib-rail-title">Used in</div>
            <div className="lib-rail-row">
              <span className="lbl">Units</span>
              <span>
                {usedInCount === 0
                  ? '0'
                  : `${usedInCount} unit${usedInCount === 1 ? '' : 's'}`}
              </span>
            </div>
            <p className="lib-rail-muted">
              {usedInCount === 0
                ? "Not attached to any programme unit yet. Notes become unit activities in slice 11.11."
                : 'Live count — updates as you attach or detach this note in programme curricula.'}
            </p>
          </section>

          <section className="lib-rail-section">
            <div className="lib-rail-title">Guards</div>
            <ul className="lib-rail-guards">
              <li>Autosave 3s after the last edit — no Save button.</li>
              <li>Title and ≥1 pillar required.</li>
              <li>
                Two-tab save guard active. If another tab saves first,
                this one stops autosaving and asks you to reload.
              </li>
              <li>Alt-text preflight runs on Publish.</li>
            </ul>
          </section>
        </aside>
      </div>

      {showPublish && (
        <PublishDialog
          noteId={note.note_id}
          noteTitle={title}
          isPublished={isPublished}
          programmes={programmes}
          initialMode={visibilityMode}
          initialProgrammeIds={visibilityProgrammeIds}
          onClose={() => setShowPublish(false)}
          onPublished={handlePublished}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />

      {showDiscard && (
        <DiscardConfirm
          onKeepEditing={() => {
            setShowDiscard(false);
            setPendingNavHref(null);
          }}
          onDiscard={() => {
            const target = pendingNavHref ?? '/tutor/library';
            setShowDiscard(false);
            setPendingNavHref(null);
            router.push(target);
          }}
        />
      )}
    </div>
  );
}


// =====================================================================
// Pure helpers
// =====================================================================

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

