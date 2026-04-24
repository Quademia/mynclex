// mynclex/lib/bank/trend/metadata-accordions.tsx
//
// Two accordions on the left pane of the Trend editor:
//   - Trend setup (open by default): title, scenario, kind picker.
//   - Trend publishing:              is_published + timestamps.
//
// Both use the same <details> + .tr-acc-* visual convention as the
// case-study editor's .cs-acc-*. Inputs are uncontrolled except
// `kind`, which has a select + conditional custom-kind text field —
// the select picks between the 5 presets and "Custom"; the custom
// input appears only when the select is on "Custom". A single hidden
// <input name="kind"> reflects whichever value is current so the
// outer form serialises one `kind` value on submit.

'use client';

import { useState } from 'react';
import { KIND_PRESETS, kindDefaultLabel, isKindPreset } from './kind-templates';
import type { TrendDatasetRow } from './types';

interface Props {
  datasetRow: TrendDatasetRow;
}

// Controlled-kind state: a select whose value is one of the presets
// or 'custom'. When 'custom', a text input beside it holds the
// user-provided freeform value. Initial value is derived from the
// DB row: a preset match → preset value; anything else → 'custom'
// with the row's string as the custom text.
export function MetadataAccordions({ datasetRow }: Props) {
  const initialIsPreset = isKindPreset(datasetRow.kind);

  const [selectVal, setSelectVal] = useState<string>(
    initialIsPreset ? datasetRow.kind : 'custom',
  );
  const [customKind, setCustomKind] = useState<string>(
    initialIsPreset ? '' : datasetRow.kind,
  );

  // Value that ends up on the DB row. Mirrors into a hidden input so
  // the outer form posts it on submit.
  const effectiveKind =
    selectVal === 'custom' ? customKind.trim() || 'custom' : selectVal;

  return (
    <>
      {/* Trend setup — open by default */}
      <details className="tr-accordion" open>
        <summary className="tr-acc-head">
          <span>
            <span className="tr-acc-title">Trend setup</span>
            <span className="tr-acc-meta"> · title · scenario · kind</span>
          </span>
        </summary>
        <div className="tr-acc-body">
          <div className="tr-field">
            <label htmlFor="tr-field-title">Title</label>
            <input
              id="tr-field-title"
              type="text"
              name="title"
              defaultValue={datasetRow.title}
              required
            />
            <div className="tr-field-hint">
              Curator-facing. Shown in the list and in the bank editor&apos;s
              &quot;Attach trend&quot; dropdown (Slice 1.12b).
            </div>
          </div>

          <div className="tr-field">
            <label htmlFor="tr-field-scenario">Scenario</label>
            <textarea
              id="tr-field-scenario"
              name="scenario"
              rows={3}
              defaultValue={datasetRow.scenario ?? ''}
              placeholder="Short clinical setup shown above the trend panel — e.g. &quot;58F, post-op day 1, vitals monitored hourly.&quot;"
            />
            <div className="tr-field-hint">2–4 sentences is the sweet spot.</div>
          </div>

          <div className="tr-field">
            <label htmlFor="tr-field-kind">Kind</label>
            <div className="tr-kind-picker">
              <select
                id="tr-field-kind"
                value={selectVal}
                onChange={(e) => setSelectVal(e.target.value)}
              >
                {KIND_PRESETS.map((k) => (
                  <option key={k} value={k}>{kindDefaultLabel(k)}</option>
                ))}
                <option value="custom">Custom…</option>
              </select>
              {selectVal === 'custom' && (
                <input
                  type="text"
                  value={customKind}
                  onChange={(e) => setCustomKind(e.target.value)}
                  placeholder="Custom kind (freeform)"
                  aria-label="Custom kind value"
                />
              )}
              <input type="hidden" name="kind" value={effectiveKind} />
            </div>
            <div className="tr-field-hint">
              Kind is freeform text on the DB. The 5 presets seed starting
              rows on first save; picking &quot;Custom&quot; leaves the table empty.
            </div>
          </div>
        </div>
      </details>

      {/* Trend publishing */}
      <details className="tr-accordion">
        <summary className="tr-acc-head">
          <span>
            <span className="tr-acc-title">Trend publishing</span>
            <span className="tr-acc-meta"> · published · timestamps</span>
          </span>
        </summary>
        <div className="tr-acc-body">
          <div className="tr-flag-row">
            <label>
              <input
                type="checkbox"
                name="is_published"
                defaultChecked={datasetRow.is_published}
              />
              Published (visible to students once attached to a question)
            </label>
          </div>
          <div className="tr-field-hint" style={{ marginTop: 10 }}>
            Created {new Date(datasetRow.created_at).toLocaleString()} ·
            Updated {new Date(datasetRow.updated_at).toLocaleString()}
          </div>
        </div>
      </details>
    </>
  );
}
