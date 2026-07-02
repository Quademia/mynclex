// mynclex/lib/authoring/chart-tab-types.ts
//
// Neutral chart-tab contracts shared by the rich tab editors
// (merge-table-editor, narrative-tab-editor). These editors are shared
// foundation — they must NOT reach into any one wrapper. Each wrapper
// (case study, trend) injects its own persistence via the save/delete
// actions and provides its tab identity, which both CaseStudyTabRow and
// TrendTabRow satisfy structurally.

export type Surface = 'admin' | 'tutor';

export type TabActionResult = { ok: true } | { ok: false; error: string };

export type TabSaveAction   = (fd: FormData) => Promise<TabActionResult>;
export type TabDeleteAction = (fd: FormData) => Promise<TabActionResult>;

// The identity fields the editors post back on save. The injected
// save/delete actions add the parent-id field (case_id / trend_id)
// themselves, so the editor stays parent-agnostic.
export interface ChartTabIdentity {
  tab_id:        string;
  tab_key:       string;
  title:         string;
  display_order: number;
  is_custom:     boolean;
  custom_shape:  'free_text' | 'rows_cols' | null;
}
