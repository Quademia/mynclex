// mynclex/lib/library/note-editor.tsx
//
// Tutor library note editor (slice 11.2b). Routed under
// /tutor/library/note/[note_id]. Three-zone layout:
//
//   ┌──────────────────────────────────────────────────────┐
//   │  Sticky toolbar: [← Back]  ……  [Saved] [Draft] [Publish]
//   ├──────────────────────────────────────────────────────┤
//   │  ┌────────────────────────────────┬───────────────┐  │
//   │  │ Title (large serif)            │ Right rail    │  │
//   │  │ Subtitle (italic)              │  • Status     │  │
//   │  │ Description (small one-line)   │  • Outline    │  │
//   │  │ ──────                          │  • Guards    │  │
//   │  │ FOLDER [chip ▾]                 │              │  │
//   │  │ PILLARS [chips] [+ Add]         │              │  │
//   │  │ TAGS [chips] [+ tag input]      │              │  │
//   │  │ ──────                          │              │  │
//   │  │                                │              │  │
//   │  │ [ Body textarea ]              │              │  │
//   │  │                                │              │  │
//   │  └────────────────────────────────┴───────────────┘  │
//   └──────────────────────────────────────────────────────┘
//
// Save model for 11.2b: save-on-explicit-Save (the toolbar Save
// button), no debounced autosave yet. The "Saved · just now" /
// "Unsaved changes" badge reflects the dirty flag.
//
// Body is rendered + edited as a textarea. The schema stores the
// body as a JSONB array of blocks; we flatten to plain text for
// the textarea via bodyToText() and round-trip back via textToBody()
// in a way that matches what slice 11.5's block editor will produce.

'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { updateNoteAction } from './actions';
import { PillarPicker } from './pillar-picker';
import { FolderPicker } from './folder-picker';
import { TagInput } from './tag-input';
import { pillarShortName } from './format';
import type {
  LibraryFolderWithCount,
  LibraryNoteForEdit,
  NclexPillar,
} from './types';

interface NoteEditorProps {
  note: LibraryNoteForEdit;
  folders: LibraryFolderWithCount[];
}

const TITLE_MIN = 2;
const TITLE_MAX = 120;
const SUBTITLE_MAX = 200;
const DESC_MAX = 280;

// =====================================================================
// Body ⇄ textarea helpers
// =====================================================================
//
// The schema stores `body` as a JSONB array of typed blocks. For
// 11.2b we only ship one block shape — a single paragraph — but the
// helpers are tolerant of multi-block bodies so future 11.5-edited
// notes don't lose data if they're opened here.

function bodyToText(body: unknown): string {
  if (!Array.isArray(body) || body.length === 0) return '';
  const out: string[] = [];
  for (const block of body) {
    if (!block || typeof block !== 'object') continue;
    const b = block as {
      type?: string;
      content?: Array<{ text?: string }>;
      text?: string;
    };
    if (b.type === 'paragraph' || b.type === 'quote' || b.type === 'callout') {
      if (Array.isArray(b.content)) {
        out.push(b.content.map((c) => c.text ?? '').join(''));
      }
    } else if (b.type === 'heading' || b.type === 'h3') {
      if (b.text) out.push(b.text);
    }
  }
  return out.join('\n\n');
}

function textToBody(text: string): unknown {
  return [
    {
      id: `b_${Math.random().toString(36).slice(2, 10)}`,
      type: 'paragraph',
      content: [{ text }],
    },
  ];
}

/**
 * Walks the body looking for `embedded_questions` blocks and totals
 * up their `item_ids[]` lengths. Returns {blocks: 0, questions: 0}
 * for any 11.2b note (textarea path never writes this block type).
 * Lights up automatically when slice 11.15's embed-picker ships and
 * starts producing these blocks.
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

export function NoteEditor({ note, folders }: NoteEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  // Form state — every field is local until Save fires.
  const [title, setTitle] = useState(note.title);
  const [subtitle, setSubtitle] = useState(note.subtitle ?? '');
  const [description, setDescription] = useState(note.description ?? '');
  const [bodyText, setBodyText] = useState(() => bodyToText(note.body));
  const [pillars, setPillars] = useState<NclexPillar[]>(note.pillars);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [folderId, setFolderId] = useState<string | null>(note.folder_id);

  // Popover open state — sibling popovers should never both be open.
  const [folderOpen, setFolderOpen] = useState(false);
  const [pillarOpen, setPillarOpen] = useState(false);

  // Where to navigate to once a DiscardConfirm is resolved. Set by
  // crumb clicks (and used by the back-equivalent paths).
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);

  // Save state — "saved" / "saving" / "dirty".
  // `lastSavedAt` is the server-acknowledged save timestamp shown in
  // the rail and the toolbar badge.
  const [lastSavedAt, setLastSavedAt] = useState<string>(note.updated_at);
  const [saveTick, setSaveTick] = useState(0);  // forces re-render of "X ago" copy

  // Re-render the "saved Xs ago" copy every 30s so it stays honest
  // without polling.
  useEffect(() => {
    const id = window.setInterval(() => setSaveTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Dirty = any field diverges from what we last persisted.
  const isDirty = useMemo(() => {
    if (title !== note.title) return true;
    if ((subtitle || null) !== note.subtitle) return true;
    if ((description || null) !== note.description) return true;
    if (folderId !== note.folder_id) return true;
    if (!arraysEqual(pillars, note.pillars)) return true;
    if (!arraysEqual(tags, note.tags)) return true;
    if (bodyText !== bodyToText(note.body)) return true;
    return false;
  }, [title, subtitle, description, folderId, pillars, tags, bodyText, note]);

  // Validation gates the Save button.
  const trimmedTitle = title.trim();
  const isTitleValid =
    trimmedTitle.length >= TITLE_MIN && trimmedTitle.length <= TITLE_MAX;
  const isSubtitleValid = subtitle.length <= SUBTITLE_MAX;
  const isDescValid = description.length <= DESC_MAX;
  const hasPillar = pillars.length >= 1;
  const canSave =
    isDirty && isTitleValid && isSubtitleValid && isDescValid && hasPillar && !isPending;

  // Browser warning when the tutor tries to leave with unsaved changes.
  // The discard modal handles in-app navigation; this catches the
  // close-tab / reload case.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault();
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  function handleSave() {
    if (!canSave) return;
    setError(null);
    startTransition(async () => {
      const result = await updateNoteAction(note.note_id, {
        title: trimmedTitle,
        subtitle: subtitle.trim() || null,
        description: description.trim() || null,
        body: textToBody(bodyText),
        pillars,
        tags,
        folder_id: folderId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLastSavedAt(new Date().toISOString());
      // The server action already revalidates /tutor/library and
      // /tutor/library/note/<id>; we don't need to navigate.
    });
  }

  /**
   * Single navigation guard used by every leave-the-editor affordance
   * — the breadcrumb crumbs (`Library`, folder name) and any future
   * exit path. Honours the unsaved-changes rule: dirty + leave →
   * DiscardConfirm; clean → straight nav.
   */
  function attemptLeave(href: string) {
    if (isPending) return;
    if (isDirty) {
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

  // Auto-built outline from body text — split on blank lines + first
  // line of each chunk that looks like a heading (#, ##, or all-caps).
  // For 11.2b this is best-effort; 11.5's rich editor will populate
  // a real outline from heading blocks.
  const outline = useMemo(() => deriveOutline(bodyText), [bodyText]);

  // Live counts for the right rail.
  //
  // Embedded-question count walks the PERSISTED body (`note.body`),
  // not the current textarea state — the textarea-to-body round-trip
  // flattens non-paragraph blocks, so reading the live state would
  // always show 0 even for a future 11.15 note that genuinely has
  // embed blocks. Reading the persisted body shows the real number
  // the rail-card should display until the rich editor (slice 11.5)
  // lets us round-trip every block type safely.
  //
  // "Used in" is the server-fetched rollup — frozen at load time
  // since attachments are created from the programme curriculum
  // side, not from this editor.
  const embedCounts = useMemo(() => countEmbeds(note.body), [note.body]);
  const usedInCount = note.used_in_count;

  const saveBadge = isPending
    ? { state: 'saving', label: 'Saving…' }
    : isDirty
      ? { state: 'dirty', label: 'Unsaved changes' }
      : { state: 'saved', label: `Saved · ${formatRelative(lastSavedAt)}` };
  // saveTick is intentionally unused below — it just causes this
  // useMemo's neighbours to re-render so formatRelative is fresh.
  void saveTick;

  return (
    <div className="lib-editor-shell">
      {/* Sticky top toolbar */}
      <div className="lib-editor-bar">
        <div className="lib-editor-bar-left">
          <nav className="lib-editor-crumb" aria-label="Library breadcrumb">
            <button
              type="button"
              className="lib-crumb-link"
              onClick={() => attemptLeave('/tutor/library')}
              disabled={isPending}
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
                  disabled={isPending}
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
          <span className="lib-state-pill is-draft">Draft</span>
          <button
            type="button"
            className="lib-btn lib-btn-accent"
            disabled
            title="Publish flow ships in slice 11.10"
          >
            Publish
          </button>
          <button
            type="button"
            className="lib-btn lib-btn-primary"
            onClick={handleSave}
            disabled={!canSave}
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="lib-editor-grid">
        {/* Main editor pane */}
        <div className="lib-editor-main">
          <input
            type="text"
            className="lib-editor-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled note"
            aria-label="Note title"
          />
          {!isTitleValid && trimmedTitle.length > 0 && (
            <span className="lib-field-error">
              {trimmedTitle.length < TITLE_MIN
                ? `Title must be at least ${TITLE_MIN} characters.`
                : `Title must be ${TITLE_MAX} characters or fewer.`}
            </span>
          )}
          <input
            type="text"
            className="lib-editor-subtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Subtitle (optional)"
            aria-label="Subtitle"
          />
          {!isSubtitleValid && (
            <span className="lib-field-error">
              Subtitle must be {SUBTITLE_MAX} characters or fewer.
            </span>
          )}
          <input
            type="text"
            className="lib-editor-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Card description — shown when this note appears in lists (optional)"
            aria-label="Description"
            maxLength={DESC_MAX + 20}
          />
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

          {/* Body textarea — single-paragraph until 11.5's block editor. */}
          <textarea
            className="lib-editor-body"
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            placeholder="Start writing…
The rich block editor with headings, lists, callouts, drug cards and embedded questions lands in slice 11.5. For now this is a plain textarea — your text is preserved when the rich editor arrives."
            aria-label="Note body"
          />
        </div>

        {/* Right rail */}
        <aside className="lib-editor-rail" aria-label="Note properties">
          <section className="lib-rail-section">
            <div className="lib-rail-title">Status</div>
            <div className="lib-rail-row">
              <span className="lbl">State</span>
              <span className="lib-state-pill is-draft">Draft</span>
            </div>
            <div className="lib-rail-row">
              <span className="lbl">Visibility</span>
              <span className="lib-rail-muted">Set on Publish (11.10)</span>
            </div>
            <div className="lib-rail-row">
              <span className="lbl">Last save</span>
              <span>{formatRelative(lastSavedAt)}</span>
            </div>
          </section>

          <section className="lib-rail-section">
            <div className="lib-rail-title">Outline</div>
            {outline.length > 0 ? (
              <ul className="lib-rail-outline">
                {outline.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="lib-rail-muted">
                Auto-built from headings — lands properly with the
                rich block editor (slice 11.5).
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
              <li>Save on explicit Save (debounced autosave with 11.5).</li>
              <li>Title and ≥1 pillar required.</li>
              <li>Two-tab save guard lands with the block editor (11.5).</li>
              <li>Alt-text preflight runs on Publish (11.10).</li>
            </ul>
          </section>
        </aside>
      </div>

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

/**
 * Best-effort outline derivation for the right rail. Treats lines
 * that look like markdown headings (#, ##) or all-caps short lines
 * as outline entries. Real outline lands with 11.5's rich editor.
 */
function deriveOutline(text: string): string[] {
  if (!text.trim()) return [];
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('## ')) out.push(line.slice(3));
    else if (line.startsWith('# ')) out.push(line.slice(2));
    else if (
      line.length <= 60 &&
      line === line.toUpperCase() &&
      /[A-Z]/.test(line)
    ) {
      out.push(line);
    }
  }
  return out.slice(0, 12);
}

/**
 * Relative-time formatter — "just now", "12s ago", "3m ago",
 * "yesterday", or absolute date for >24h.
 */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const now = Date.now();
  const diffMs = now - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
