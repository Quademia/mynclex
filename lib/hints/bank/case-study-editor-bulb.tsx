// mynclex/lib/hints/bank/case-study-editor-bulb.tsx
//
// Bulb explaining the toolbar of the case-study EDITOR view (the
// inner pane that opens when you focus a question slot).
// Distinct from CaseStudyWrapperBulb, which explains the outer
// wrapper view.

import { Bulb } from '@/lib/hints/shared/bulb';

export function CaseStudyEditorBulb() {
  return (
    <Bulb title="What do these buttons do?">
      <ul className="auth-help-bulb-list">
        <li><strong>← Wrapper view</strong> — Return to the wrapper view (case title, scenario, visibility flags, slot rail). If this question has unsaved edits you&apos;ll be prompted to keep editing, discard, or save and close.</li>
        <li><strong>Q1–Q6 slot pips</strong> — Switch to another question slot, or click an empty pip to add a new question at that position. If the active editor is dirty you&apos;ll be prompted before switching.</li>
        <li><strong>Save question</strong> — Save this question&apos;s body. Independent of Save case study (which only saves wrapper metadata) — each question saves itself.</li>
      </ul>
    </Bulb>
  );
}
