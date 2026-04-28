// mynclex/lib/authoring/primitives/housekeeping-fields.tsx
//
// Shared housekeeping primitive — metadata fields every question
// editor composes. Published status is NOT a checkbox here; it's
// flipped via the modal-frame's Publish topbar action and reflected
// as the status pill (rebuild-plan principle: save / publish are
// separate actions, not the same checkbox).

'use client';

import type { HousekeepingValue, SystemMeta } from '../types';

export function HousekeepingFields({
  value,
  onChange,
  meta,
}: {
  value: HousekeepingValue;
  onChange: (next: HousekeepingValue) => void;
  meta: SystemMeta;
}) {
  function update<K extends keyof HousekeepingValue>(
    key: K,
    val: HousekeepingValue[K],
  ) {
    onChange({ ...value, [key]: val });
  }

  return (
    <div className="aut-primitive">
      <div className="aut-primitive-label">HousekeepingFields · shared primitive</div>
      <div className="aut-primitive-note">
        Same metadata fields used by all 9 question editors. Published status is set via
        the topbar Publish button, not here.
      </div>

      <div className="aut-grid-3">
        <div>
          <label className="aut-class-label">Marks</label>
          <input
            type="number"
            className="aut-input"
            min={0.5}
            step={0.5}
            value={value.marks}
            onChange={(e) => update('marks', Number(e.target.value))}
          />
        </div>
        <div>
          <label className="aut-class-label">Question ref</label>
          <input
            type="text"
            className="aut-input"
            value={value.questionRef}
            onChange={(e) => update('questionRef', e.target.value)}
            placeholder="e.g. CARDIO-Q12"
          />
        </div>
        <div>
          <label className="aut-class-label">Batch ID</label>
          <input
            type="text"
            className="aut-input"
            value={value.batchId}
            onChange={(e) => update('batchId', e.target.value)}
            placeholder="e.g. BATCH_2026_05"
          />
        </div>
      </div>

      <div className="aut-checks">
        <label className="aut-check">
          <input
            type="checkbox"
            checked={value.isFreeSample}
            onChange={(e) => update('isFreeSample', e.target.checked)}
          />
          <span>
            Free sample{' '}
            <span className="aut-check-hint">— available to non-paying users</span>
          </span>
        </label>
        <label className="aut-check">
          <input
            type="checkbox"
            checked={value.isBuilderVisible}
            onChange={(e) => update('isBuilderVisible', e.target.checked)}
          />
          <span>
            Visible in student quiz builder{' '}
            <span className="aut-check-hint">— students can pick this question</span>
          </span>
        </label>
        <label className="aut-check">
          <input
            type="checkbox"
            checked={value.shuffleOptions}
            onChange={(e) => update('shuffleOptions', e.target.checked)}
          />
          <span>
            Shuffle options when shown to students{' '}
            <span className="aut-check-hint">— randomise option order at session start</span>
          </span>
        </label>
      </div>

      <div className="aut-grid-2">
        <div>
          <label className="aut-class-label">Created at</label>
          <div className="aut-readonly">{formatTimestamp(meta.createdAt)}</div>
        </div>
        <div>
          <label className="aut-class-label">Last updated at</label>
          <div className="aut-readonly">{formatTimestamp(meta.updatedAt)}</div>
        </div>
      </div>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}
