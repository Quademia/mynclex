// mynclex/lib/hints/bank/trend-wrapper-bulb.tsx
//
// Bulb explaining the toolbar of the trend wrapper page (Dataset
// view + per-question views).

import { Bulb } from '@/lib/hints/shared/bulb';

export function TrendWrapperBulb() {
  return (
    <Bulb title="What do these buttons do?">
      <ul className="auth-help-bulb-list">
        <li><strong>Cancel changes</strong> — Discard unsaved title / scenario / kind / visibility edits in the Dataset view. Returns those fields to the last saved values. Visible when on the Dataset pill.</li>
        <li><strong>Save trend</strong> — Save the dataset row: title, scenario, kind, and the three visibility flags. The stimulus itself is built from the chart tabs (Charts sub-tab), which save on their own. Visible when on the Dataset pill.</li>
        <li><strong>Save question</strong> — Save the active question. Each attached question keeps its own publishing flags (genuinely owned per question, unlike CS). Visible when on a question pill.</li>
        <li><strong>Detach</strong> — Remove the active question from the dataset. The question survives in the bank as a standalone item; the dataset just loses its link. Visible only on existing question pills.</li>
        <li><strong>Validate</strong> — Run a manual validation pass over the dataset (title, scenario, attached questions). Errors first, warnings second. Manual only — never auto-runs. Click again to dismiss.</li>
        <li><strong>Delete</strong> — Permanently delete this trend dataset. The dialog auto-detects the right path (simple, detach-and-delete, or delete-everything) based on attached questions, with a type-to-confirm gate.</li>
      </ul>
    </Bulb>
  );
}
