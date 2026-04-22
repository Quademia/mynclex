// mynclex/lib/bank/case-study/editor.tsx
//
// Top-level Case Study editor component — mounted from both
// /admin/bank/cases/[case_id] and /tutor/bank/cases/[case_id]. Takes
// `surface` + `initial` (case row + its tabs already joined).
//
// Layout on desktop (≥ 900px):
//
//   ┌──────────── sticky topbar ────────────┐
//   │ ← back   case_id   ● Unsaved   buttons │
//   ├─────────── split-frame (grid) ────────┤
//   │ split-left          │D│ split-right   │
//   │  • accordions (form)│I│  • q-nav      │
//   │  • chart section    │V│  • placeholder│
//   │     ─ tab rail      │ │               │
//   │     ─ active editor │ │               │
//   └─────────────────────┴─┴───────────────┘
//
// Below 900px the split collapses to a single column (chart above,
// right-pane placeholder below). The divider is a draggable splitter
// that persists its last position in localStorage.
//
// Case-header changes flow through ONE outer form (id=cs-case-form)
// posting to updateCaseAction. Tab changes are independent: each tab
// editor has its own inner form that posts to upsertTabAction /
// deleteTabAction. Reorder clicks post to reorderTabsAction. This
// matches the handoff's decoupling decision — tab saves shouldn't be
// gated on case-header dirty state.

'use client';

import Link from 'next/link';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  BLOOM_LEVELS,
  BODY_SYSTEMS,
  CLIENT_NEEDS_CATEGORIES,
  CLIENT_NEEDS_SUBCATEGORIES,
  DIFFICULTY_LEVELS,
  NURSING_SUBJECTS,
  type ClientNeedsCategory,
} from '@/lib/bank/classifications';
import {
  deleteCaseAction,
  updateCaseAction,
} from './actions';
import { getTabType } from './tab-types';
import type {
  CaseStudyEditorInitial,
  CaseStudyEntry,
  CaseStudyTabColumn,
  CaseStudyTabRow,
  Surface,
} from './types';
import { NarrativeTabEditor } from './narrative-tab';
import { StructuredTabEditor } from './structured-tab';
import { TabRail } from './tab-rail';

const SPLIT_STORAGE_KEY = 'mynclex:cs-split:left-pct';
const SPLIT_MIN = 20;
const SPLIT_MAX = 80;
const SPLIT_DEFAULT = 50;

interface Props {
  surface: Surface;
  initial: CaseStudyEditorInitial;
}

// Per-tab draft bundle. Keeps unsaved edits alive when the curator
// clicks between tabs (switching wouldn't otherwise preserve state —
// only one tab editor is mounted at a time).
interface TabDraft {
  title:       string;
  entries:     CaseStudyEntry[];
  columns_def: CaseStudyTabColumn[];
}

function tabToDraft(t: CaseStudyTabRow): TabDraft {
  return {
    title:       t.title,
    entries:     t.entries,
    columns_def: t.columns_def,
  };
}

function isTabDirty(t: CaseStudyTabRow, d: TabDraft): boolean {
  if (t.title !== d.title) return true;
  if (JSON.stringify(t.entries)     !== JSON.stringify(d.entries))     return true;
  if (JSON.stringify(t.columns_def) !== JSON.stringify(d.columns_def)) return true;
  return false;
}

export function CaseStudyEditor({ surface, initial }: Props) {
  const caseRow = initial.caseRow;
  const tabsSorted = useMemo(
    () => [...initial.tabs].sort((a, b) => a.display_order - b.display_order),
    [initial.tabs],
  );

  const baseUrl = surface === 'tutor' ? '/tutor/bank/cases' : '/admin/bank/cases';

  // ── Tab draft state ─────────────────────────────────────────────
  // Drafts are derived: `draftOverrides` holds in-flight edits keyed
  // by tab_id; any tab without an override falls back to the server's
  // row. Keeping the overrides across prop refresh means unsaved edits
  // in another tab survive while a different tab is being saved.
  // Orphan overrides (for deleted tabs) are ignored by the editor —
  // they're harmless and get garbage-collected when the page unmounts.
  const [draftOverrides, setDraftOverrides] = useState<Record<string, TabDraft>>({});

  const drafts = useMemo<Record<string, TabDraft>>(() => {
    const out: Record<string, TabDraft> = {};
    for (const t of tabsSorted) {
      out[t.tab_id] = draftOverrides[t.tab_id] ?? tabToDraft(t);
    }
    return out;
  }, [tabsSorted, draftOverrides]);

  function updateDraft(tab_id: string, next: TabDraft) {
    setDraftOverrides((prev) => ({ ...prev, [tab_id]: next }));
  }

  // Active tab — defaults to the first tab in display order.
  const [activeTabId, setActiveTabId] = useState<string | null>(
    tabsSorted[0]?.tab_id ?? null,
  );

  // Adjust active tab during render if it no longer matches a real
  // row (deleted tab, or a fresh case that just got its first tab).
  // React handles setState-during-render by restarting the render with
  // the new value; no effect needed.
  if (activeTabId && !tabsSorted.some((t) => t.tab_id === activeTabId)) {
    setActiveTabId(tabsSorted[0]?.tab_id ?? null);
  } else if (!activeTabId && tabsSorted.length > 0) {
    setActiveTabId(tabsSorted[0].tab_id);
  }

  const activeTab = tabsSorted.find((t) => t.tab_id === activeTabId) ?? null;
  const activeDraft = activeTab ? drafts[activeTab.tab_id] : null;

  // ── Header form dirty tracking ──────────────────────────────────
  const [headerDirty, setHeaderDirty] = useState(false);
  const [headerErr, setHeaderErr] = useState<string | null>(null);
  const [casePending, startCaseTransition] = useTransition();

  function onSaveCase(fd: FormData) {
    startCaseTransition(async () => {
      const res = await updateCaseAction(fd);
      // Action either redirected (res === undefined) or returned an
      // error result. Success path: clear dirty + any stale error.
      if (res && !res.ok) {
        setHeaderErr(res.error);
      } else {
        setHeaderDirty(false);
        setHeaderErr(null);
      }
    });
  }

  function onDeleteCase(fd: FormData) {
    const tabCount = tabsSorted.length;
    const msg = tabCount > 0
      ? `Delete case "${caseRow.title}"? ${tabCount} ` +
        `${tabCount === 1 ? 'tab' : 'tabs'} will be deleted with it.`
      : `Delete case "${caseRow.title}"?`;
    if (!window.confirm(msg)) return;
    startCaseTransition(async () => {
      const res = await deleteCaseAction(fd);
      if (res && !res.ok) setHeaderErr(res.error);
    });
  }

  // ── Beforeunload guard ─────────────────────────────────────────
  const dirtyTabIds = useMemo(() => {
    const set = new Set<string>();
    for (const t of tabsSorted) {
      const d = drafts[t.tab_id];
      if (d && isTabDirty(t, d)) set.add(t.tab_id);
    }
    return set;
  }, [tabsSorted, drafts]);

  const anyDirty = headerDirty || dirtyTabIds.size > 0;

  useEffect(() => {
    if (!anyDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [anyDirty]);

  // ── Split-pane divider state ───────────────────────────────────
  const [leftPct, setLeftPct] = useState<number>(SPLIT_DEFAULT);
  const splitRef = useRef<HTMLDivElement | null>(null);

  // Restore saved split position on mount. Intentional sync of external
  // storage into React state — the only way to access localStorage
  // post-hydration without risking an SSR mismatch.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SPLIT_STORAGE_KEY);
      if (stored) {
        const n = parseFloat(stored);
        if (Number.isFinite(n) && n >= SPLIT_MIN && n <= SPLIT_MAX) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setLeftPct(n);
        }
      }
    } catch { /* localStorage can throw in privacy mode — ignore */ }
  }, []);

  // Drag handlers are created per-drag so they can share closure state
  // (startX, startPct, lastPct) without refs, and so removeEventListener
  // reliably matches the same function references.
  function onDividerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const rect = splitRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = e.clientX;
    const startPct = leftPct;
    const width = rect.width;
    let lastPct = startPct;

    const onMove = (ev: PointerEvent) => {
      const pct = startPct + ((ev.clientX - startX) / width) * 100;
      lastPct = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct));
      setLeftPct(lastPct);
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup',   onUp);
      try {
        localStorage.setItem(SPLIT_STORAGE_KEY, String(lastPct));
      } catch { /* ignore */ }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup',   onUp);
  }

  // ── Classification cascade state ───────────────────────────────
  // Subcategory options depend on the selected category. Uncontrolled
  // inputs with defaultValue don't work for the cascade — controlled
  // category state drives the subcategory option list.
  //
  // When the server pushes a new category (e.g. after a save reloads
  // initial), detect the change during render and resync local state.
  // Avoids the setState-in-effect pattern.
  const serverCategory = caseRow.client_needs_category ?? '';
  const [category, setCategory] = useState<string>(serverCategory);
  const [lastServerCategory, setLastServerCategory] = useState<string>(serverCategory);
  if (serverCategory !== lastServerCategory) {
    setLastServerCategory(serverCategory);
    setCategory(serverCategory);
  }

  const subcategoryOptions =
    category && (CLIENT_NEEDS_CATEGORIES as readonly string[]).includes(category)
      ? CLIENT_NEEDS_SUBCATEGORIES[category as ClientNeedsCategory]
      : [];

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="cs-editor-frame">
      <div className="cs-topbar">
        <div className="cs-topbar-left">
          <Link href={baseUrl} className="cs-topbar-back">← All case studies</Link>
          <span className="cs-topbar-id">{caseRow.case_id}</span>
          {anyDirty && (
            <span className="cs-topbar-dirty" aria-live="polite">● Unsaved changes</span>
          )}
          {caseRow.is_published && !anyDirty && (
            <span className="cs-topbar-published">Published</span>
          )}
        </div>
        <div className="cs-topbar-right">
          <form action={onDeleteCase} style={{ display: 'inline' }}>
            <input type="hidden" name="surface" value={surface} />
            <input type="hidden" name="case_id" value={caseRow.case_id} />
            <button type="submit" className="cs-btn danger" disabled={casePending}>
              Delete
            </button>
          </form>
          <Link href={baseUrl} className="cs-btn">Cancel</Link>
          <button
            type="submit"
            form="cs-case-form"
            className="cs-btn primary"
            disabled={casePending}
          >
            {casePending ? 'Saving…' : 'Save case'}
          </button>
        </div>
      </div>

      {headerErr && (
        <div className="cs-error cs-topbar-error">{headerErr}</div>
      )}

      <div
        ref={splitRef}
        className="cs-split"
        style={{ ['--cs-split-left' as string]: `${leftPct}%` }}
      >
        <div className="cs-split-left">
          <form
            id="cs-case-form"
            action={onSaveCase}
            onChange={() => setHeaderDirty(true)}
          >
            <input type="hidden" name="surface" value={surface} />
            <input type="hidden" name="case_id" value={caseRow.case_id} />

            {/* Content accordion (open by default) */}
            <details className="cs-accordion" open>
              <summary className="cs-acc-head">
                <span>
                  <span className="cs-acc-title">Content</span>
                  <span className="cs-acc-meta"> · case title + scenario summary</span>
                </span>
              </summary>
              <div className="cs-acc-body">
                <div className="cs-form-grid single">
                  <div className="cs-field">
                    <label htmlFor="cs-field-title">Case title</label>
                    <input
                      id="cs-field-title"
                      type="text"
                      name="title"
                      defaultValue={caseRow.title}
                      required
                    />
                    <div className="cs-field-hint">Curator-facing only. Not shown to students.</div>
                  </div>
                  <div className="cs-field">
                    <label htmlFor="cs-field-summary">Scenario summary</label>
                    <textarea
                      id="cs-field-summary"
                      name="scenario_summary"
                      defaultValue={caseRow.scenario_summary ?? ''}
                      rows={3}
                    />
                    <div className="cs-field-hint">
                      Shown above the chart when the student opens the case. Keep to 2–4 sentences.
                    </div>
                  </div>
                </div>
              </div>
            </details>

            {/* Classification accordion */}
            <details className="cs-accordion">
              <summary className="cs-acc-head">
                <span>
                  <span className="cs-acc-title">Classification</span>
                  <span className="cs-acc-meta"> · client needs · subject · system · topic · difficulty · tags</span>
                </span>
              </summary>
              <div className="cs-acc-body">
                <div className="cs-form-grid">
                  <div className="cs-field">
                    <label htmlFor="cs-field-cnc">Client Needs category</label>
                    <select
                      id="cs-field-cnc"
                      name="client_needs_category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="">— Select —</option>
                      {CLIENT_NEEDS_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cs-field">
                    <label htmlFor="cs-field-cns">Subcategory</label>
                    <select
                      id="cs-field-cns"
                      name="client_needs_subcategory"
                      defaultValue={caseRow.client_needs_subcategory ?? ''}
                      disabled={!subcategoryOptions.length}
                    >
                      <option value="">— Select —</option>
                      {subcategoryOptions.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cs-field">
                    <label htmlFor="cs-field-subj">Nursing subject</label>
                    <select
                      id="cs-field-subj"
                      name="nursing_subject"
                      defaultValue={caseRow.nursing_subject ?? ''}
                    >
                      <option value="">— Select —</option>
                      {NURSING_SUBJECTS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cs-field">
                    <label htmlFor="cs-field-sys">Body system</label>
                    <select
                      id="cs-field-sys"
                      name="body_system"
                      defaultValue={caseRow.body_system ?? ''}
                    >
                      <option value="">— Select —</option>
                      {BODY_SYSTEMS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cs-field">
                    <label htmlFor="cs-field-topic">Topic</label>
                    <input
                      id="cs-field-topic"
                      type="text"
                      name="topic"
                      defaultValue={caseRow.topic ?? ''}
                    />
                  </div>
                  <div className="cs-field">
                    <label htmlFor="cs-field-subtopic">Subtopic</label>
                    <input
                      id="cs-field-subtopic"
                      type="text"
                      name="subtopic"
                      defaultValue={caseRow.subtopic ?? ''}
                    />
                  </div>
                  <div className="cs-field">
                    <label htmlFor="cs-field-diff">Difficulty</label>
                    <select
                      id="cs-field-diff"
                      name="difficulty"
                      defaultValue={caseRow.difficulty ?? ''}
                    >
                      <option value="">— Select —</option>
                      {DIFFICULTY_LEVELS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cs-field">
                    <label htmlFor="cs-field-tags">Tags (comma separated)</label>
                    <input
                      id="cs-field-tags"
                      type="text"
                      name="tags"
                      defaultValue={caseRow.tags.join(', ')}
                    />
                  </div>
                </div>
                {/* Bloom kept unused here — schema-docs note case studies
                    skip bloom_level on purpose. Kept imported so lint
                    doesn't warn if future work wants the list handy. */}
                <span style={{ display: 'none' }}>{BLOOM_LEVELS.join(',')}</span>
              </div>
            </details>

            {/* Housekeeping accordion */}
            <details className="cs-accordion">
              <summary className="cs-acc-head">
                <span>
                  <span className="cs-acc-title">Housekeeping</span>
                  <span className="cs-acc-meta"> · free sample · builder visible · published · timestamps</span>
                </span>
              </summary>
              <div className="cs-acc-body">
                <div className="cs-flag-row">
                  <label>
                    <input
                      type="checkbox"
                      name="is_free_sample"
                      defaultChecked={caseRow.is_free_sample}
                    />
                    Free sample
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="is_builder_visible"
                      defaultChecked={caseRow.is_builder_visible}
                    />
                    Visible in quiz builder
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="is_published"
                      defaultChecked={caseRow.is_published}
                    />
                    Published
                  </label>
                </div>
                <div className="cs-field-hint" style={{ marginTop: 10 }}>
                  Created {new Date(caseRow.created_at).toLocaleString()} · Updated{' '}
                  {new Date(caseRow.updated_at).toLocaleString()}
                </div>
              </div>
            </details>
          </form>

          {/* Chart section — tabs + active-tab editor. Intentionally
              OUTSIDE the case-header form; tab edits have their own
              per-tab forms that post to upsertTabAction. */}
          <section className="cs-chart-section">
            <div className="cs-chart-section-head">
              <div>
                <div className="cs-chart-title">Patient chart</div>
                <div className="cs-chart-sub">
                  {tabsSorted.length === 0
                    ? 'No tabs yet — add one to start building the chart.'
                    : <>
                        {tabsSorted.length} {tabsSorted.length === 1 ? 'tab' : 'tabs'} authored.
                        Each entry&apos;s <strong>visible-from</strong> value controls when students see it —
                        entries appear on question N only if visible-from ≤ N.
                      </>}
                </div>
              </div>
              {/* 1.11a stub — button present but non-functional; 1.11c wires it. */}
              <button type="button" className="cs-btn" disabled title="Preview lands in Slice 1.11c">
                Preview as student · position 1
              </button>
            </div>

            <div className="cs-chart-layout">
              <TabRail
                surface={surface}
                case_id={caseRow.case_id}
                tabs={tabsSorted}
                activeTabId={activeTabId}
                onSelect={setActiveTabId}
                dirtyIds={dirtyTabIds}
              />
              {activeTab && activeDraft
                ? <ActiveTabEditor
                    surface={surface}
                    case_id={caseRow.case_id}
                    tab={activeTab}
                    draft={activeDraft}
                    onDraftChange={(next) => updateDraft(activeTab.tab_id, next)}
                  />
                : <div className="cs-entries-pane">
                    <div className="cs-entries-empty">
                      <h4>This chart has no tabs yet</h4>
                      <p>Start with Nurses&apos; Notes or Vital Signs. Each tab can have its own entries and each entry controls when students see it.</p>
                    </div>
                  </div>}
            </div>
          </section>
        </div>

        <div
          className="cs-split-divider"
          onPointerDown={onDividerDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chart and question panes"
          title="Drag to resize"
        />

        <div className="cs-split-right">
          <QuestionNavigatorPlaceholder />
          <div className="cs-q-body">
            <div className="cs-q-placeholder">
              <span className="cs-q-placeholder-tag">Slice 1.11b — placeholder</span>
              <h4>The active question&apos;s editor lives here</h4>
              <p>
                Each Q1–Q6 pill selects which question is active. The selected
                question mounts the existing per-type editor (MCQ / SATA /
                Matrix / Bow-tie / Cloze / Highlight / Drag-drop / TF / Select N)
                in nested mode inside this pane.
              </p>
              <p style={{ marginTop: 10 }}>
                Above the editor: CJMM step dropdown + question-type picker.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ActiveTabEditor — picks between NarrativeTabEditor and
// StructuredTabEditor based on the tab's shape. Custom tabs use
// tab_key to decide: custom_narrative → narrative; custom_grid →
// structured (with column builder).
// ─────────────────────────────────────────────────────────────

interface ActiveTabProps {
  surface:        Surface;
  case_id:        string;
  tab:            CaseStudyTabRow;
  draft:          TabDraft;
  onDraftChange:  (next: TabDraft) => void;
}

function ActiveTabEditor({ surface, case_id, tab, draft, onDraftChange }: ActiveTabProps) {
  const builtIn = getTabType(tab.tab_key);

  // Custom_narrative tabs: narrative editor, no registry.
  // Custom_grid tabs:      structured editor, columns come from the
  //                        tab row's columns_def (draft copy).
  const isNarrative =
    (builtIn && builtIn.shape === 'narrative') ||
    tab.tab_key === 'custom_narrative';

  const isStructured =
    (builtIn && builtIn.shape === 'structured') ||
    tab.tab_key === 'custom_grid';

  if (isNarrative) {
    return (
      <NarrativeTabEditor
        surface={surface}
        case_id={case_id}
        tab={tab}
        builtIn={builtIn}
        draftTitle={draft.title}
        draftEntries={draft.entries}
        onDraftChange={(p) => onDraftChange({
          title:       p.title,
          entries:     p.entries,
          columns_def: draft.columns_def,
        })}
      />
    );
  }

  if (isStructured) {
    return (
      <StructuredTabEditor
        surface={surface}
        case_id={case_id}
        tab={tab}
        builtIn={builtIn}
        draftTitle={draft.title}
        draftEntries={draft.entries}
        draftColumns={draft.columns_def}
        onDraftChange={(p) => onDraftChange({
          title:       p.title,
          entries:     p.entries,
          columns_def: p.columns_def,
        })}
      />
    );
  }

  // Fallback — unknown tab_key. Shouldn't happen (server validates)
  // but render a clear message rather than crashing.
  return (
    <div className="cs-entries-pane">
      <div className="cs-entries-empty">
        <h4>Unknown tab type</h4>
        <p>This tab uses tab_key <code>{tab.tab_key}</code> which the editor doesn&apos;t recognise. Delete the tab and add a new one.</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// QuestionNavigatorPlaceholder — visual stub for Slice 1.11b.
// Renders the Q1-Q6 pill strip with all pills in the empty state so
// curators see the shape of what's coming next. All non-interactive.
// ─────────────────────────────────────────────────────────────

function QuestionNavigatorPlaceholder() {
  return (
    <div className="cs-q-nav" aria-label="Question navigator (Slice 1.11b placeholder)">
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <div key={n} className="cs-q-nav-pill empty">
          <span className="cs-q-num">Q{n} +</span>
        </div>
      ))}
    </div>
  );
}
