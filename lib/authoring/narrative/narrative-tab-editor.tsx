'use client';

// mynclex/lib/authoring/narrative/narrative-tab-editor.tsx
//
// Rich-content relook — Slice 4. The v2 custom NARRATIVE tab editor (the
// rich rebuild of the free-text / Nurses'-Notes-style tab). A list of entry
// cards; each card = free-text label CHIPS (generalising the old single Time
// field) + a rich body. One sticky toolbar at the top drives whichever entry
// body is focused (roving rich field). No grid/merge — just stacked cards.

import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { deleteTabAction, upsertTabAction } from '../../bank/wrappers/case-study/actions';
import type { CaseStudyTabRow, Surface } from '../../bank/wrappers/case-study/types';
import { RichField } from '../rich-field';
import { RichRender } from '../rich-render';
import { isEmptyRichDoc, type RichDoc } from '../rich-doc';
import { InlineTools, InlineToolsDisabled } from '../inline-tools';
import {
  type NarrativeTabData,
  addEntry,
  removeEntry,
  setEntryBody,
  setEntryVisibleFrom,
  setEntryChips,
  dedupeNarrativeIds,
  NVF_MAX,
} from './narrative-model';

interface Props {
  surface:         Surface;
  case_id:         string;
  tab:             CaseStudyTabRow;
  draftTitle:      string;
  draftNarrative:  NarrativeTabData;
  onDraftChange:   (next: { title: string; tab: NarrativeTabData }) => void;
  previewPosition: number | null;
}

export function NarrativeTabEditorV2({
  surface, case_id, tab,
  draftTitle, draftNarrative, onDraftChange,
  previewPosition,
}: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Heal duplicate entry ids on open (no-op when clean).
  useEffect(() => {
    const fixed = dedupeNarrativeIds(draftNarrative);
    if (fixed !== draftNarrative) onDraftChange({ title: draftTitle, tab: fixed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = draftNarrative.entries;

  function clearErr() { if (err) setErr(null); }
  function pushTab(next: NarrativeTabData) {
    clearErr();
    onDraftChange({ title: draftTitle, tab: next });
  }

  // chips
  function updateChip(idx: number, ci: number, val: string) {
    const next = entries[idx].chips.slice();
    next[ci] = val;
    pushTab(setEntryChips(draftNarrative, idx, next));
  }
  function addChip(idx: number) {
    pushTab(setEntryChips(draftNarrative, idx, [...entries[idx].chips, '']));
  }
  function removeChip(idx: number, ci: number) {
    const next = entries[idx].chips.slice();
    next.splice(ci, 1);
    pushTab(setEntryChips(draftNarrative, idx, next));
  }

  function onBody(idx: number, body: RichDoc) {
    pushTab(setEntryBody(draftNarrative, idx, body));
  }
  function onVF(idx: number, v: number) {
    pushTab(setEntryVisibleFrom(draftNarrative, idx, v));
  }
  function onAddEntry() {
    pushTab(addEntry(draftNarrative));
  }
  function onRemoveEntry(idx: number) {
    if (!isEmptyRichDoc(entries[idx].body) || entries[idx].chips.some((c) => c.trim())) {
      if (!window.confirm('Remove this entry? Its content will be lost.')) return;
    }
    if (activeIdx === idx) { setActiveIdx(null); setActiveEditor(null); }
    pushTab(removeEntry(draftNarrative, idx));
  }

  function onSave(fd: FormData) {
    setErr(null); setPending(true);
    upsertTabAction(fd).then((r) => { if (!r.ok) setErr(r.error); }).finally(() => setPending(false));
  }
  function onDelete(fd: FormData) {
    if (!window.confirm(`Delete the "${draftTitle || 'Untitled'}" tab? Everything in it will be lost.`)) return;
    setErr(null); setPending(true);
    deleteTabAction(fd).then((r) => { if (!r.ok) setErr(r.error); }).finally(() => setPending(false));
  }

  return (
    <div className="cs-entries-pane mt-pane">
      {/* head */}
      <div className="cs-entries-head">
        <div className="cs-entries-title-group">
          <div className="cs-entries-title">
            <span className="mt-kind-tag">Free text</span>
            <input
              className="cs-rename-input"
              type="text"
              value={draftTitle}
              onChange={(e) => { clearErr(); onDraftChange({ title: e.target.value, tab: draftNarrative }); }}
              placeholder="Tab title"
              aria-label="Tab title"
            />
          </div>
          <div className="cs-entries-desc">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </div>
        </div>
        <div className="cs-entries-actions">
          <form action={onDelete}>
            <input type="hidden" name="surface" value={surface} />
            <input type="hidden" name="case_id" value={case_id} />
            <input type="hidden" name="tab_id"  value={tab.tab_id} />
            <button type="submit" className="cs-btn danger" disabled={pending}>Delete tab</button>
          </form>
          <form action={onSave}>
            <input type="hidden" name="surface"       value={surface} />
            <input type="hidden" name="case_id"       value={case_id} />
            <input type="hidden" name="tab_id"        value={tab.tab_id} />
            <input type="hidden" name="tab_key"       value="custom_narrative" />
            <input type="hidden" name="is_custom"     value="true" />
            <input type="hidden" name="custom_shape"  value="free_text" />
            <input type="hidden" name="display_order" value={String(tab.display_order)} />
            <input type="hidden" name="title"         value={draftTitle} />
            <input type="hidden" name="entries"       value={JSON.stringify(draftNarrative)} />
            <input type="hidden" name="columns_def"   value="[]" />
            <button type="submit" className="cs-btn primary" disabled={pending}>
              {pending ? 'Saving…' : 'Save tab'}
            </button>
          </form>
        </div>
      </div>

      {err && <div className="cs-error">{err}</div>}

      {/* sticky toolbar — drives the focused entry body */}
      <div className="mt-toolbar mt-toolbar-sticky">
        <span className="mt-tb-group-label">Format</span>
        {activeEditor
          ? <InlineTools editor={activeEditor} buttonClassName="mt-tb-btn mt-tb-rich" />
          : <InlineToolsDisabled buttonClassName="mt-tb-btn mt-tb-rich" hint="Click into an entry to format its text" />}
      </div>

      {/* entry cards */}
      {entries.map((entry, idx) => {
        const hidden = previewPosition !== null && entry.visibleFrom > previewPosition;
        const isActive = activeIdx === idx;
        return (
          <div key={entry.id} className={`nt-card${hidden ? ' is-hidden' : ''}`}>
            <div className="nt-card-head">
              <div className="nt-chips">
                {entry.chips.map((chip, ci) => (
                  <span key={ci} className="nt-chip">
                    <input
                      value={chip}
                      onChange={(e) => updateChip(idx, ci, e.target.value)}
                      placeholder="label"
                      aria-label={`Label ${ci + 1}`}
                    />
                    <button type="button" className="nt-chip-del" onClick={() => removeChip(idx, ci)} aria-label="Remove label" title="Remove label">×</button>
                  </span>
                ))}
                <button type="button" className="nt-chip-add" onClick={() => addChip(idx)}>+ label</button>
              </div>
              <div className="nt-card-head-right">
                <select
                  className={`mt-gutter-vf${entry.visibleFrom > 1 ? ' is-later' : ''}`}
                  value={entry.visibleFrom}
                  onChange={(e) => onVF(idx, Number(e.target.value))}
                  title="Which question this entry first appears at"
                >
                  {Array.from({ length: NVF_MAX }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>Q{n}</option>
                  ))}
                </select>
                <button type="button" className="nt-entry-del" onClick={() => onRemoveEntry(idx)} aria-label="Remove entry" title="Remove entry">×</button>
              </div>
            </div>

            {isActive ? (
              <div className="nt-body-edit">
                <RichField
                  key={entry.id}
                  value={entry.body}
                  hideToolbar
                  onEditor={setActiveEditor}
                  onChange={(doc) => onBody(idx, doc)}
                  placeholder="Write the note…"
                  ariaLabel={`Entry ${idx + 1} body`}
                />
              </div>
            ) : (
              <div
                className="nt-body-static"
                role="textbox"
                tabIndex={0}
                onClick={() => setActiveIdx(idx)}
                onFocus={() => setActiveIdx(idx)}
              >
                {isEmptyRichDoc(entry.body)
                  ? <span className="nt-body-ph">Write the note…</span>
                  : <RichRender doc={entry.body} />}
              </div>
            )}
          </div>
        );
      })}

      <div className="nt-add-row">
        <button type="button" className="mt-add-table-btn" onClick={onAddEntry}>+ Add entry</button>
      </div>
    </div>
  );
}
