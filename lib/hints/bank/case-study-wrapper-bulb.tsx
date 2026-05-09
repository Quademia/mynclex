// mynclex/lib/hints/bank/case-study-wrapper-bulb.tsx
//
// Bulb explaining the toolbar of the case-study WRAPPER view (the
// outer pane: title / scenario / visibility / CJMM, slot rail).
// Distinct from CaseStudyEditorBulb, which explains the editor view
// (the per-question editor mounted from a slot).

import { Bulb } from '@/lib/hints/shared/bulb';

export function CaseStudyWrapperBulb() {
  return (
    <Bulb title="What do these buttons do?">
      <ul className="auth-help-bulb-list">
        <li><strong>Cancel changes</strong> — Discard unsaved edits to title / scenario / visibility / CJMM in this pane. Returns those fields to the last saved values. Does not touch chart tabs or question editors.</li>
        <li><strong>Delete</strong> — Permanently delete this case study. The dialog auto-detects the right path (simple, detach-and-delete, or delete-everything) based on attached questions, with a type-to-confirm gate.</li>
        <li><strong>Validate</strong> — Run a manual validation pass over the case (chart tabs, slots, CJMM, etc.). Errors appear first, warnings second. Manual only; it never auto-runs.</li>
        <li><strong>Save case study</strong> — Save the wrapper metadata: title, scenario, visibility flags, per-slot CJMM. Chart tabs save independently from the Chart tab; questions save from inside the editor.</li>
      </ul>
    </Bulb>
  );
}
