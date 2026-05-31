// mynclex/lib/library/view-builder.tsx
//
// Custom-view filter builder main pane (slice 11.16c). Mounted at
// `?view=new` (create) or `?view=<uuid>&edit=1` (edit). A filter bar
// over three dimensions (status / pillars / tags) with a live-filtered
// note list beneath — filtering happens in the browser over the full
// row set passed in, so toggling a chip is instant (no round trip).
//
// c-1 shipped filter + preview. c-2 adds the name input + Save (create
// → createViewAction → land on the new view; edit → updateViewAction →
// back to the view).

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { NoteLensRow } from './note-lens-row';
import { PillarPicker } from './pillar-picker';
import { TagMultiPicker } from './tag-multi-picker';
import { pillarShortName } from './format';
import { createViewAction, updateViewAction } from './view-actions';
import {
  applyViewFilters,
  isEmptyFilters,
  EMPTY_VIEW_FILTERS,
  type LibrarySavedView,
  type LibraryViewFilters,
  type LibraryViewStatus,
} from './view-filters';
import type {
  LibraryNoteLensRow,
  LibraryTagCount,
  NclexPillar,
} from './types';

interface ViewBuilderProps {
  allRows: LibraryNoteLensRow[];
  tagCounts: LibraryTagCount[];
  /** Non-null = edit an existing view; null/undefined = create. */
  initial?: LibrarySavedView | null;
}

const STATUS_OPTIONS: { key: LibraryViewStatus; label: string }[] = [
  { key: 'any', label: 'Any' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Drafts' },
];

export function ViewBuilder({ allRows, tagCounts, initial }: ViewBuilderProps) {
  const router = useRouter();
  const isEdit = initial != null;

  const [filters, setFilters] = useState<LibraryViewFilters>(
    initial?.filters ?? EMPTY_VIEW_FILTERS,
  );
  const [name, setName] = useState(initial?.name ?? '');
  const [pillarsOpen, setPillarsOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matched = useMemo(
    () => applyViewFilters(allRows, filters),
    [allRows, filters],
  );

  const empty = isEmptyFilters(filters);
  const canSave = name.trim().length > 0 && !empty && !pending;

  function setStatus(status: LibraryViewStatus) {
    setFilters((f) => ({ ...f, status }));
  }
  function setPillars(pillars: NclexPillar[]) {
    setFilters((f) => ({ ...f, pillars }));
  }
  function setTags(tags: string[]) {
    setFilters((f) => ({ ...f, tags }));
  }
  function removePillar(p: NclexPillar) {
    setFilters((f) => ({ ...f, pillars: f.pillars.filter((x) => x !== p) }));
  }
  function removeTag(t: string) {
    setFilters((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }));
  }
  function clearAll() {
    setFilters(EMPTY_VIEW_FILTERS);
  }

  async function save() {
    if (!canSave) return;
    setPending(true);
    setError(null);
    if (isEdit && initial) {
      const result = await updateViewAction(initial.view_id, name, filters);
      if (!result.ok) {
        setPending(false);
        setError(result.error);
        return;
      }
      router.push(`/tutor/library?view=${initial.view_id}`);
    } else {
      const result = await createViewAction(name, filters);
      if (!result.ok) {
        setPending(false);
        setError(result.error);
        return;
      }
      router.push(`/tutor/library?view=${result.viewId}`);
    }
  }

  return (
    <div className="lib-notes-view lib-view-builder">
      <header className="lib-pane-head">
        <div>
          <div className="lib-pane-crumb">
            <Link href="/tutor/library" className="lib-pane-crumb-link">
              Library
            </Link>
            <span className="sep">/</span>
            <span className="b">Views</span>
            <span className="sep">/</span>
            <span className="b">{isEdit ? 'Edit view' : 'New view'}</span>
          </div>
          <h1 className="lib-pane-title">{isEdit ? 'Edit view' : 'New view'}</h1>
          <p className="lib-pane-sub">
            Combine filters to carve out a slice of your library, name it,
            and it lives in the Views sidebar for one-click recall.
          </p>
        </div>
      </header>

      {/* Name + Save row */}
      <div className="lib-vb-save">
        <input
          type="text"
          className="lib-vb-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this view (e.g. “Cohort 5 drafts”)"
          maxLength={60}
          aria-label="View name"
        />
        <button
          type="button"
          className="lib-btn lib-btn-primary"
          onClick={save}
          disabled={!canSave}
          title={
            empty
              ? 'Add at least one filter to save a view'
              : name.trim().length === 0
                ? 'Give the view a name'
                : undefined
          }
        >
          {pending
            ? 'Saving…'
            : isEdit
              ? 'Save changes'
              : 'Save as view'}
        </button>
        {isEdit && initial && (
          <Link
            href={`/tutor/library?view=${initial.view_id}`}
            className="lib-btn"
          >
            Cancel
          </Link>
        )}
      </div>

      <div className="lib-vb-bar" role="group" aria-label="View filters">
        {/* Status segmented control */}
        <div className="lib-vb-group">
          <span className="lib-vb-group-label">Status</span>
          <div className="lib-vb-seg" role="group" aria-label="Status">
            {STATUS_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                className={`lib-vb-seg-btn${
                  filters.status === o.key ? ' is-on' : ''
                }`}
                aria-pressed={filters.status === o.key}
                onClick={() => setStatus(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pillars multiselect */}
        <div className="lib-vb-group">
          <div className="lib-vb-pop-anchor">
            <button
              type="button"
              className={`lib-vb-chip-btn${
                filters.pillars.length > 0 ? ' is-on' : ''
              }`}
              aria-expanded={pillarsOpen}
              onClick={() => {
                setTagsOpen(false);
                setPillarsOpen((v) => !v);
              }}
            >
              <span className="lib-vb-chip-ic" aria-hidden="true">
                ◆
              </span>
              Pillars
              {filters.pillars.length > 0 && (
                <span className="lib-vb-chip-cnt">
                  {filters.pillars.length}
                </span>
              )}
              <span className="lib-vb-chip-chev" aria-hidden="true">
                ▾
              </span>
            </button>
            {pillarsOpen && (
              <PillarPicker
                value={filters.pillars}
                onChange={setPillars}
                onClose={() => setPillarsOpen(false)}
                className="lib-vb-pop"
              />
            )}
          </div>
        </div>

        {/* Tags multiselect */}
        <div className="lib-vb-group">
          <div className="lib-vb-pop-anchor">
            <button
              type="button"
              className={`lib-vb-chip-btn${
                filters.tags.length > 0 ? ' is-on' : ''
              }`}
              aria-expanded={tagsOpen}
              onClick={() => {
                setPillarsOpen(false);
                setTagsOpen((v) => !v);
              }}
            >
              <span className="lib-vb-chip-ic" aria-hidden="true">
                #
              </span>
              Tags
              {filters.tags.length > 0 && (
                <span className="lib-vb-chip-cnt">{filters.tags.length}</span>
              )}
              <span className="lib-vb-chip-chev" aria-hidden="true">
                ▾
              </span>
            </button>
            {tagsOpen && (
              <TagMultiPicker
                tags={tagCounts}
                value={filters.tags}
                onChange={setTags}
                onClose={() => setTagsOpen(false)}
                className="lib-vb-pop"
              />
            )}
          </div>
        </div>

        {!empty && (
          <button
            type="button"
            className="lib-vb-clear"
            onClick={clearAll}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Active selection chips */}
      {(filters.pillars.length > 0 || filters.tags.length > 0) && (
        <div className="lib-vb-active" aria-label="Active filters">
          {filters.pillars.map((p) => (
            <button
              key={`p-${p}`}
              type="button"
              className="lib-vb-active-chip lib-vb-active-pillar"
              onClick={() => removePillar(p)}
              title={`Remove ${p}`}
            >
              <span aria-hidden="true">◆</span>
              {pillarShortName(p)}
              <span className="lib-vb-active-x" aria-hidden="true">
                ×
              </span>
            </button>
          ))}
          {filters.tags.map((t) => (
            <button
              key={`t-${t}`}
              type="button"
              className="lib-vb-active-chip lib-vb-active-tag"
              onClick={() => removeTag(t)}
              title={`Remove #${t}`}
            >
              <span className="lens-tag-hash" aria-hidden="true">
                #
              </span>
              {t}
              <span className="lib-vb-active-x" aria-hidden="true">
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="lib-vb-count">
        {empty ? (
          <>Showing all {matched.length} notes — add a filter to narrow.</>
        ) : (
          <>
            {matched.length} {matched.length === 1 ? 'note' : 'notes'} match.
          </>
        )}
      </p>

      {matched.length === 0 ? (
        <div className="lib-empty lib-empty-inline">
          <div className="lib-empty-glyph" aria-hidden="true">
            🔍
          </div>
          <p className="lib-empty-sub">
            No notes match this combination. Loosen a filter to widen the
            net.
          </p>
        </div>
      ) : (
        <ul className="lib-notes-list">
          {matched.map((n) => (
            <li key={n.note_id}>
              <NoteLensRow note={n} />
            </li>
          ))}
        </ul>
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </div>
  );
}
