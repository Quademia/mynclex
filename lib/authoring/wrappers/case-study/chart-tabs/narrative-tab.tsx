// mynclex/lib/authoring/wrappers/case-study/chart-tabs/narrative-tab.tsx
//
// Stacked-cards editor for narrative chart tabs — the shape shared by:
//   - Built-in narrative tabs:  nurses_notes, orders, history, diagnostics.
//   - Custom free-text tabs:    tab_key = 'custom_narrative'.
//
// Each entry is one card: time input (unless the tab type sets
// omit_time), zero or more extra fields (selects or text inputs per
// the registry), a body textarea, and a visible-from segmented control.
//
// Title rename + save-tab + delete-tab live in the entries-head. The
// Save button posts the tab's current draft state to upsertTabAction
// via FormData. Delete posts to deleteTabAction with a window.confirm
// gate when the tab has entries.
//
// Slice 12c-2: vendored from lib/bank/case-study/narrative-tab.tsx
// unchanged except local import paths.

'use client';

import { useState, useTransition } from 'react';
import { VisibleFromSegmented } from './vf-segmented';
import { deleteTabAction, upsertTabAction } from '../actions';
import type { BuiltInTabType } from './tab-types';
import type { CaseStudyEntry, CaseStudyTabRow, Surface } from '../types';
import { VF_DEFAULT } from '../types';

interface Props {
  surface:     Surface;
  case_id:     string;
  tab:         CaseStudyTabRow;
  // null for custom_narrative (no extra fields, no omit_time).
  builtIn:     BuiltInTabType | null;
  // Initial draft state, so switching tabs preserves unsaved edits.
  draftTitle:   string;
  draftEntries: CaseStudyEntry[];
  // Updates the parent's draft map on every keystroke.
  onDraftChange: (next: { title: string; entries: CaseStudyEntry[] }) => void;
  // Slice 1.11c — preview-as-position. null = Off; 1-6 = render
  // entries with visible_from > N as greyed-out with a "hidden until
  // Qx" label. Filtering only, never removal, so the curator keeps
  // seeing what they authored.
  previewPosition: number | null;
}

// Produce a fresh entry for this tab shape. Narrative cards always
// have visible_from + body; time and extras depend on the registry.
function emptyEntry(builtIn: BuiltInTabType | null): CaseStudyEntry {
  const entry: CaseStudyEntry = { visible_from: VF_DEFAULT, body: '' };
  if (!builtIn?.omit_time) {
    entry.time = '';
  }
  for (const f of builtIn?.extra_fields ?? []) {
    entry[f.id] = f.kind === 'select' ? (f.options?.[0] ?? '') : '';
  }
  return entry;
}

export function NarrativeTabEditor({
  surface, case_id, tab, builtIn,
  draftTitle, draftEntries, onDraftChange,
  previewPosition,
}: Props) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const omitTime = builtIn?.omit_time ?? false;
  const extraFields = builtIn?.extra_fields ?? [];

  // All mutators funnel through here so a stale error message from a
  // prior failed save gets cleared the moment the user starts editing.
  function applyDraft(next: { title: string; entries: CaseStudyEntry[] }) {
    if (err) setErr(null);
    onDraftChange(next);
  }

  function mutateTitle(next: string) {
    applyDraft({ title: next, entries: draftEntries });
  }

  function mutateEntries(next: CaseStudyEntry[]) {
    applyDraft({ title: draftTitle, entries: next });
  }

  function updateEntry(idx: number, patch: Partial<CaseStudyEntry>) {
    const next = draftEntries.slice();
    next[idx] = { ...next[idx], ...patch };
    mutateEntries(next);
  }

  function addEntry() {
    mutateEntries([...draftEntries, emptyEntry(builtIn)]);
  }

  function removeEntry(idx: number) {
    const next = draftEntries.slice();
    next.splice(idx, 1);
    mutateEntries(next);
  }

  function onSave(fd: FormData) {
    startTransition(async () => {
      const res = await upsertTabAction(fd);
      if (!res.ok) setErr(res.error);
    });
  }

  function onDelete(fd: FormData) {
    if (draftEntries.length > 0) {
      const ok = window.confirm(
        `Delete the "${draftTitle}" tab? It has ${draftEntries.length} ` +
        `${draftEntries.length === 1 ? 'entry' : 'entries'} that will be lost.`
      );
      if (!ok) return;
    }
    startTransition(async () => {
      const res = await deleteTabAction(fd);
      if (!res.ok) setErr(res.error);
    });
  }

  const addLabel = builtIn
    ? {
        nurses_notes: '+ Add note',
        orders:       '+ Add order',
        history:      '+ Add H&P entry',
        diagnostics:  '+ Add diagnostic',
      }[builtIn.tab_key] ?? '+ Add entry'
    : '+ Add entry';

  return (
    <div className="cs-entries-pane">
      <div className="cs-entries-head">
        <div className="cs-entries-title-group">
          <div className="cs-entries-title">
            <input
              className="cs-rename-input"
              type="text"
              value={draftTitle}
              onChange={(e) => mutateTitle(e.target.value)}
              placeholder="Tab title"
              aria-label="Tab title"
            />
          </div>
          <div className="cs-entries-desc">
            {builtIn
              ? <>Built-in tab <code>{tab.tab_key}</code> · narrative entries · {draftEntries.length} {draftEntries.length === 1 ? 'entry' : 'entries'}</>
              : <>Custom tab · free-text · {draftEntries.length} {draftEntries.length === 1 ? 'entry' : 'entries'}</>}
          </div>
        </div>
        <div className="cs-entries-actions">
          {/* Delete tab */}
          <form action={onDelete}>
            <input type="hidden" name="surface" value={surface} />
            <input type="hidden" name="case_id" value={case_id} />
            <input type="hidden" name="tab_id"  value={tab.tab_id} />
            <button type="submit" className="cs-btn danger" disabled={pending}>
              Delete tab
            </button>
          </form>
          {/* Save tab */}
          <form action={onSave}>
            <input type="hidden" name="surface"       value={surface} />
            <input type="hidden" name="case_id"       value={case_id} />
            <input type="hidden" name="tab_id"        value={tab.tab_id} />
            <input type="hidden" name="tab_key"       value={tab.tab_key} />
            <input type="hidden" name="is_custom"     value={tab.is_custom ? 'true' : 'false'} />
            {tab.custom_shape && (
              <input type="hidden" name="custom_shape" value={tab.custom_shape} />
            )}
            <input type="hidden" name="display_order" value={String(tab.display_order)} />
            <input type="hidden" name="title"         value={draftTitle} />
            <input type="hidden" name="entries"       value={JSON.stringify(draftEntries)} />
            <input type="hidden" name="columns_def"   value="[]" />
            <button type="submit" className="cs-btn primary" disabled={pending}>
              {pending ? 'Saving…' : 'Save tab'}
            </button>
          </form>
        </div>
      </div>

      {err && <div className="cs-error">{err}</div>}

      {draftEntries.length === 0 ? (
        <div className="cs-entries-empty">
          <h4>No entries yet</h4>
          <p>Add the first entry to start populating this tab.</p>
        </div>
      ) : (
        draftEntries.map((entry, idx) => {
          const vf = Number(entry.visible_from) || VF_DEFAULT;
          const entryHidden =
            previewPosition !== null && vf > previewPosition;
          return (
          <div
            key={idx}
            className={
              entryHidden ? 'cs-entry-card cs-entry--hidden' : 'cs-entry-card'
            }
          >
            <div className="cs-entry-card-head">
              <div className="cs-entry-card-head-left">
                {!omitTime && (
                  <>
                    <span className="cs-time-label">Time</span>
                    <input
                      className="cs-time-input"
                      type="text"
                      value={String(entry.time ?? '')}
                      placeholder="e.g. 0800"
                      onChange={(e) => updateEntry(idx, { time: e.target.value })}
                      aria-label="Time"
                    />
                  </>
                )}
                {extraFields.map((f) => (
                  f.kind === 'select' ? (
                    <label key={f.id} className="cs-extra-field">
                      <span className="cs-extra-field-label">{f.label}</span>
                      <select
                        className="cs-card-select"
                        value={String(entry[f.id] ?? (f.options?.[0] ?? ''))}
                        onChange={(e) => updateEntry(idx, { [f.id]: e.target.value })}
                      >
                        {f.options?.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label key={f.id} className="cs-extra-field">
                      <span className="cs-extra-field-label">{f.label}</span>
                      <input
                        className="cs-extra-field-input"
                        type="text"
                        value={String(entry[f.id] ?? '')}
                        placeholder={f.label}
                        onChange={(e) => updateEntry(idx, { [f.id]: e.target.value })}
                      />
                    </label>
                  )
                ))}
              </div>
              <div className="cs-entry-card-head-right">
                {entryHidden && (
                  <span className="cs-entry-hidden-label">
                    hidden until Q{vf}
                  </span>
                )}
                <VisibleFromSegmented
                  value={vf}
                  onChange={(v) => updateEntry(idx, { visible_from: v })}
                />
                <button
                  type="button"
                  className="cs-entry-del-btn"
                  onClick={() => removeEntry(idx)}
                  aria-label="Remove entry"
                  title="Remove entry"
                >
                  ×
                </button>
              </div>
            </div>
            <textarea
              className="cs-entry-body"
              value={String(entry.body ?? '')}
              placeholder="Body"
              onChange={(e) => updateEntry(idx, { body: e.target.value })}
              aria-label="Entry body"
            />
          </div>
          );
        })
      )}

      <div className="cs-entry-add-row">
        <button type="button" className="cs-add-entry-btn" onClick={addEntry}>
          {addLabel}
        </button>
      </div>
    </div>
  );
}
