// mynclex/lib/authoring/primitives/classification-fields.tsx
//
// Shared classification primitive — the 9 axes every question editor
// composes (and that case-study/trend editors will compose with their
// own variations).
//
// Controlled component: takes value + onChange, owns no state of its
// own. Selectable lists come from lib/bank/classifications.ts so the
// new system stays consistent with the still-shipping bank UI.

'use client';

import {
  CLIENT_NEEDS_CATEGORIES,
  CLIENT_NEEDS_SUBCATEGORIES,
  NURSING_SUBJECTS,
  BODY_SYSTEMS,
  DIFFICULTY_LEVELS,
  BLOOM_LEVELS,
  type ClientNeedsCategory,
} from '@/lib/bank/classifications';
import type { ClassificationValue } from '../types';

export function ClassificationFields({
  value,
  onChange,
}: {
  value: ClassificationValue;
  onChange: (next: ClassificationValue) => void;
}) {
  function update<K extends keyof ClassificationValue>(
    key: K,
    val: ClassificationValue[K],
  ) {
    onChange({ ...value, [key]: val });
  }

  // Switching category resets subcategory — the cascading list changes.
  function updateCategory(cat: string) {
    onChange({
      ...value,
      clientNeedsCategory: cat,
      clientNeedsSubcategory: '',
    });
  }

  const subcatOptions =
    value.clientNeedsCategory &&
    (CLIENT_NEEDS_CATEGORIES as readonly string[]).includes(value.clientNeedsCategory)
      ? CLIENT_NEEDS_SUBCATEGORIES[value.clientNeedsCategory as ClientNeedsCategory]
      : [];

  return (
    <div className="aut-primitive">
      <div className="aut-primitive-label">ClassificationFields · shared primitive</div>
      <div className="aut-primitive-note">
        Same 9 axes used by all 9 question editors. Imported, not reimplemented.
      </div>

      <div className="aut-grid-2">
        <div>
          <label className="aut-class-label">
            Client Needs category<span className="aut-req">*</span>
          </label>
          <select
            className="aut-select"
            value={value.clientNeedsCategory}
            onChange={(e) => updateCategory(e.target.value)}
          >
            <option value="">— Select —</option>
            {CLIENT_NEEDS_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="aut-class-label">Subcategory</label>
          <select
            className="aut-select"
            value={value.clientNeedsSubcategory}
            onChange={(e) => update('clientNeedsSubcategory', e.target.value)}
            disabled={subcatOptions.length === 0}
          >
            <option value="">— Select —</option>
            {subcatOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="aut-grid-3">
        <div>
          <label className="aut-class-label">Nursing subject</label>
          <select
            className="aut-select"
            value={value.nursingSubject}
            onChange={(e) => update('nursingSubject', e.target.value)}
          >
            <option value="">— Select —</option>
            {NURSING_SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="aut-class-label">Body system</label>
          <select
            className="aut-select"
            value={value.bodySystem}
            onChange={(e) => update('bodySystem', e.target.value)}
          >
            <option value="">— Select —</option>
            {BODY_SYSTEMS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="aut-class-label">Difficulty</label>
          <select
            className="aut-select"
            value={value.difficulty}
            onChange={(e) => update('difficulty', e.target.value)}
          >
            <option value="">— Select —</option>
            {DIFFICULTY_LEVELS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="aut-grid-2">
        <div>
          <label className="aut-class-label">Topic</label>
          <input
            type="text"
            className="aut-input"
            value={value.topic}
            onChange={(e) => update('topic', e.target.value)}
            placeholder="e.g. Fall prevention"
          />
        </div>
        <div>
          <label className="aut-class-label">Subtopic</label>
          <input
            type="text"
            className="aut-input"
            value={value.subtopic}
            onChange={(e) => update('subtopic', e.target.value)}
            placeholder="e.g. Restraint alternatives"
          />
        </div>
      </div>

      <div className="aut-grid-2">
        <div>
          <label className="aut-class-label">Bloom&apos;s level</label>
          <select
            className="aut-select"
            value={value.bloomLevel}
            onChange={(e) => update('bloomLevel', e.target.value)}
          >
            <option value="">— Select —</option>
            {BLOOM_LEVELS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="aut-class-label">
            Tags <span className="aut-optional">— comma-separated</span>
          </label>
          <input
            type="text"
            className="aut-input"
            value={value.tags}
            onChange={(e) => update('tags', e.target.value)}
            placeholder="comma, separated, tags"
          />
        </div>
      </div>
    </div>
  );
}
