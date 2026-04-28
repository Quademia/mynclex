// mynclex/lib/authoring/atoms/classification-fields.tsx
//
// The 8 classification fields shared by every editor type. The
// category → subcategory cascade is controlled FROM THE PARENT so
// the parent can detect when the required category is unset (used
// to drive the red-dot incompleteness indicator on the Classification
// tab — see lib/authoring/atoms/editor-tabs.tsx).
//
// Other fields stay uncontrolled (form-data on submit) — they're
// optional, so the parent doesn't need to track them.

'use client';

import {
  CLIENT_NEEDS_CATEGORIES,
  CLIENT_NEEDS_SUBCATEGORIES,
  NURSING_SUBJECTS,
  BODY_SYSTEMS,
  DIFFICULTY_LEVELS,
  BLOOM_LEVELS,
  type ClientNeedsCategory,
} from '@/lib/authoring/classifications';

interface ClassificationFieldsProps {
  /** Controlled — picks the subcategory option list and exposes the
   *  empty-state to the parent for required-field indicators. */
  category: string;
  onCategoryChange: (next: string) => void;
  defaults: {
    client_needs_subcategory: string;
    nursing_subject: string;
    body_system: string;
    topic: string;
    subtopic: string;
    difficulty: string;
    bloom_level: string;
    tags: string;
  };
}

export function ClassificationFields({
  category,
  onCategoryChange,
  defaults,
}: ClassificationFieldsProps) {
  const subcatOptions =
    category && (CLIENT_NEEDS_CATEGORIES as readonly string[]).includes(category)
      ? CLIENT_NEEDS_SUBCATEGORIES[category as ClientNeedsCategory]
      : [];

  return (
    <>
      <div className="auth-grid-2">
        <div className="auth-fg">
          <label htmlFor="cnc" className="auth-label">Client Needs category *</label>
          <select
            id="cnc"
            name="client_needs_category"
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            required
            className="auth-input"
          >
            <option value="">— Select —</option>
            {CLIENT_NEEDS_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="auth-fg">
          <label htmlFor="cns" className="auth-label">Subcategory</label>
          <select
            id="cns"
            name="client_needs_subcategory"
            defaultValue={defaults.client_needs_subcategory}
            className="auth-input"
            disabled={subcatOptions.length === 0}
          >
            <option value="">— Select —</option>
            {subcatOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="auth-grid-3">
        <div className="auth-fg">
          <label htmlFor="ns" className="auth-label">Nursing subject</label>
          <select id="ns" name="nursing_subject" defaultValue={defaults.nursing_subject} className="auth-input">
            <option value="">— Select —</option>
            {NURSING_SUBJECTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="auth-fg">
          <label htmlFor="bs" className="auth-label">Body system</label>
          <select id="bs" name="body_system" defaultValue={defaults.body_system} className="auth-input">
            <option value="">— Select —</option>
            {BODY_SYSTEMS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="auth-fg">
          <label htmlFor="diff" className="auth-label">Difficulty</label>
          <select id="diff" name="difficulty" defaultValue={defaults.difficulty} className="auth-input">
            <option value="">— Select —</option>
            {DIFFICULTY_LEVELS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="auth-grid-2">
        <div className="auth-fg">
          <label htmlFor="topic" className="auth-label">Topic</label>
          <input id="topic" name="topic" type="text" defaultValue={defaults.topic} placeholder="e.g. Fall prevention" className="auth-input" />
        </div>
        <div className="auth-fg">
          <label htmlFor="subtopic" className="auth-label">Subtopic</label>
          <input id="subtopic" name="subtopic" type="text" defaultValue={defaults.subtopic} placeholder="e.g. Restraint alternatives" className="auth-input" />
        </div>
      </div>

      <div className="auth-grid-2">
        <div className="auth-fg">
          <label htmlFor="bloom" className="auth-label">Bloom&apos;s level</label>
          <select id="bloom" name="bloom_level" defaultValue={defaults.bloom_level} className="auth-input">
            <option value="">— Select —</option>
            {BLOOM_LEVELS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="auth-fg">
          <label htmlFor="tags" className="auth-label">Tags</label>
          <input id="tags" name="tags" type="text" defaultValue={defaults.tags} placeholder="comma, separated, tags" className="auth-input" />
        </div>
      </div>
    </>
  );
}
