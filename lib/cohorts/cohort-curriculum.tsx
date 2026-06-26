// mynclex/lib/cohorts/cohort-curriculum.tsx
//
// Slice 9.3f — Cohort Curriculum tab body. Renders the cohort
// checklist as a control surface (not a student preview):
//   • Every template activity is shown (Draft + Live).
//   • Each row carries the template's Live/Draft pill + a cohort
//     Excluded badge when is_included=false + the activity window
//     — opens / due / closes date inputs (slice 10.7).
//   • Clicking a row opens the template editor modal (reused from
//     the curriculum tab). Content edits flow back to the template
//     and propagate to every cohort.
//   • Blocks always render — even when all child rows are
//     excluded — because the checklist is a CONTROL list. Students
//     filter the view through isVisibleToStudents() in their own
//     surface; tutors see the full shape here.
//
// Save-safety layer (added per the 9.3f planning conversation —
// window-date bulk edits need to survive a tutor moving quickly
// between rows or closing the tab):
//   • Per-row save status pill (idle / saving / saved / failed).
//   • Page-level "Saving N changes…" banner aggregates all rows
//     that are either dirty (typed but not yet committed) or
//     in-flight.
//   • `beforeunload` guard blocks tab close / navigation while
//     ANY row is dirty or saving.
//   • Date input fires save on both onChange (600ms debounce) and
//     onBlur (immediate, cancels the debounce). Catches the
//     calendar-picker change event and the keyboard-Tab case.

'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { ErrorToast } from '@/lib/toast/error-toast';
import { InfoToast } from '@/lib/toast/info-toast';
import { ActivityModal } from '@/lib/curriculum/activity-modal';
import { ActivityPicker } from '@/lib/curriculum/activity-picker';
import { BlockFormModal } from '@/lib/curriculum/block-form-modal';
import { LibraryNoteAttachModal } from '@/lib/curriculum/library-note-attach-modal';
import { ShelfAttachModal } from '@/lib/curriculum/shelf-attach-modal';
import { DeleteActivityConfirm } from '@/lib/overlays/curriculum/delete-activity-confirm';
import { DeleteBlockConfirm } from '@/lib/overlays/curriculum/delete-block-confirm';
import {
  formatUnitTitle,
  unitLabel,
  unitStatusLabel,
  unitStatusPillClass,
  ACTIVITY_TYPE_ICON,
} from '@/lib/curriculum/format';
import {
  CurriculumMonthView,
  type MonthChip,
} from '@/lib/curriculum/month-view';
import { buildCohortMonthWeeks, cohortRangeLabel } from './month-model';
import {
  setActivityIncludedAction,
  setActivityReleaseDateAction,
  setActivityDueDateAction,
  setActivityCloseDateAction,
  includeAllUnconfiguredActivitiesAction,
  createCohortOnlyActivityAction,
  deleteCohortOnlyActivityAction,
  createCohortOnlyBlockAction,
  deleteCohortOnlyBlockAction,
  reorderCohortOnlyActivityAction,
  reorderCohortOnlyBlockAction,
} from './actions';
import type {
  ChecklistActivityState,
  CohortChecklistActivityRow,
  CohortChecklistBodyEntry,
  CohortChecklistTree,
} from './types';
import type {
  ActivityType,
  ProgrammeActivity,
  ProgrammeBlock,
} from '@/lib/curriculum/types';
import type { UnitLabel } from '@/lib/programmes/types';

// The activity types a tutor can add as a cohort-only activity. The 3
// self-contained types (Slice 1) + the 2 quiz types (Slice 3a) go through
// the shared editor; Library Note + Shelf (Slice 3b) route to their own
// attach modals (handled in openAddActivity). Online live session goes
// through the shared editor too — it creates a cohort-only MARKER (title +
// typical duration, no schedule), exactly like a template marker; the tutor
// then sets the per-cohort time/link on the Sessions tab (the "needs
// scheduling →" cue links there). "+ Add session" on the Sessions tab is
// the alternative one-step entry that also schedules.
const COHORT_ONLY_TYPES: ActivityType[] = [
  'TEXT',
  'PDF',
  'EXTERNAL_LINK',
  'ONLINE_LIVE_SESSION',
  'MOCK',
  'PRACTICE_QUIZ',
  'LIBRARY_NOTE',
  'SHELF',
];

// The open Library-Note / Shelf attach modal (Slice 3b). create = attach a
// new cohort-only note/shelf; edit = an existing cohort-only one.
type AttachModalState =
  | {
      kind: 'note' | 'shelf';
      mode: 'create';
      unitId: string;
      blockId: string | null;
    }
  | { kind: 'note' | 'shelf'; mode: 'edit'; activityId: string };

// Reorder control for a cohort-only item (Slice 4). Undefined on template
// rows/blocks — they're reordered on the programme Curriculum tab, not here.
type ReorderCtl = {
  canUp: boolean;
  canDown: boolean;
  pending: boolean;
  onMove: (direction: 'up' | 'down') => void;
};

function ReorderArrows({ canUp, canDown, pending, onMove }: ReorderCtl) {
  return (
    <span
      className="cohort-checklist-reorder"
      role="group"
      aria-label="Reorder within the week"
    >
      <button
        type="button"
        className="cohort-checklist-reorder-btn"
        disabled={!canUp || pending}
        onClick={() => onMove('up')}
        aria-label="Move up"
        title="Move up"
      >
        ▲
      </button>
      <button
        type="button"
        className="cohort-checklist-reorder-btn"
        disabled={!canDown || pending}
        onClick={() => onMove('down')}
        aria-label="Move down"
        title="Move down"
      >
        ▼
      </button>
    </span>
  );
}

const TYPE_LABEL = {
  TEXT: 'Text',
  PDF: 'PDF',
  EXTERNAL_LINK: 'Link',
  ONLINE_LIVE_SESSION: 'Online live session',
  MOCK: 'Mock',
  PRACTICE_QUIZ: 'Practice quiz',
  LIBRARY_NOTE: 'Library note',
  SHELF: 'Shelf',
} as const;

// Per-week activity tallies for the rail + the detail summary line:
// total visible activities, plus how many are still unconfigured
// ("not set") or excluded for this cohort.
function unitCounts(u: CohortChecklistTree['units'][number]) {
  let total = 0;
  let notSet = 0;
  let excluded = 0;
  for (const entry of u.body) {
    const rows = entry.kind === 'block' ? entry.rows : [entry.row];
    for (const r of rows) {
      total += 1;
      if (r.state === 'unconfigured') notSet += 1;
      if (r.state === 'excluded') excluded += 1;
    }
  }
  return { total, notSet, excluded };
}

// Save-status union per row. 'idle' is the default; transient
// 'saving' while an action is in flight; 'saved' flashes briefly
// after success then returns to idle; 'failed' is sticky until the
// next edit attempt.
type RowSaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

interface CohortCurriculumProps {
  tree: CohortChecklistTree;
}

export function CohortCurriculum({ tree }: CohortCurriculumProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState<string | null>(null);
  const [editActivity, setEditActivity] = useState<ProgrammeActivity | null>(
    null
  );
  // Cohort-only "+ Add" flow. pickerUnitId = which unit's activity-type
  // picker is open; addingBlockUnitId = which unit's "+ Add block" title
  // input is open; createConfig = the chosen (unit, type, block) that opens
  // the shared activity editor in create mode (blockId set → the activity
  // is created inside that cohort-only block).
  const [pickerUnitId, setPickerUnitId] = useState<string | null>(null);
  const [addingBlockUnitId, setAddingBlockUnitId] = useState<string | null>(
    null
  );
  const [createConfig, setCreateConfig] = useState<{
    unitId: string;
    type: ActivityType;
    blockId: string | null;
  } | null>(null);
  // Cohort-only block edit / delete (Slice 2).
  const [editBlock, setEditBlock] = useState<ProgrammeBlock | null>(null);
  const [deleteBlockTarget, setDeleteBlockTarget] = useState<{
    block: ProgrammeBlock;
    activityCount: number;
  } | null>(null);
  const [creatingBlock, startCreateBlock] = useTransition();
  const [deletingBlock, startDeleteBlock] = useTransition();
  // Library Note / Shelf attach modal (Slice 3b reference types).
  const [attachModal, setAttachModal] = useState<AttachModalState | null>(null);
  // Reorder of cohort-only items (Slice 4).
  const [reordering, startReorder] = useTransition();

  // Two-pane (2026-06 redesign): which week's detail is shown + the
  // mobile "entered a week" flag for the drill-in. LOCAL state, not a
  // URL param — this component already holds the whole cohort tree, so a
  // URL param would re-fetch it on every week click. Local state is
  // instant and survives the router.refresh() after a save (the tutor
  // stays on the same week).
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  // Curriculum Month view (Slice 1) — an additive schedule lens beside
  // the list/two-pane. LOCAL state (not a URL param) for the same reason
  // as `selectedUnitId`: this component already holds the whole tree, and
  // the Month view needs no new data, so a URL param would only trigger a
  // wasteful re-fetch. 'list' = the existing two-pane (default, untouched).
  const [view, setView] = useState<'list' | 'month'>('list');

  // Jump from a Month-view chip back to the list, scrolled to that
  // activity's week — the tutor "spot on the calendar → fix in the list"
  // path. View-only: the calendar never edits.
  function openInList(chip: MonthChip) {
    setView('list');
    setSelectedUnitId(chip.unitId);
    setEntered(true);
  }

  const cohortId = tree.cohort.cohort_id;

  // Select a week's detail (rail click). On mobile this also "enters"
  // the week (the drill-in); collapse any add-flow left open elsewhere.
  function selectUnit(unitId: string) {
    setSelectedUnitId(unitId);
    setEntered(true);
    setPickerUnitId(null);
    setAddingBlockUnitId(null);
  }

  // Soft-warn keyed off the publish state, shared by every "add a
  // cohort-only item" path (editor types + Note/Shelf attach). If it landed
  // Draft, nudge that students can't see it yet; if Live, confirm.
  function nudgeForAdd(published: boolean) {
    setNudge(
      published
        ? 'Added to this cohort — it’s live for students now.'
        : 'Added — students can’t see it yet. Open it and tick Live when you’re ready.'
    );
  }

  // Move a cohort-only item (loose activity / in-block activity / block)
  // one step within its week. Template items never move.
  function handleReorder(
    kind: 'activity' | 'block',
    id: string,
    direction: 'up' | 'down'
  ) {
    setError(null);
    startReorder(async () => {
      const res =
        kind === 'activity'
          ? await reorderCohortOnlyActivityAction(cohortId, id, direction)
          : await reorderCohortOnlyBlockAction(cohortId, id, direction);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  // Route an "+ Add" pick: Library Note / Shelf open their own attach
  // modals; every other type goes through the shared activity editor.
  function openAddActivity(
    unitId: string,
    blockId: string | null,
    type: ActivityType
  ) {
    if (type === 'LIBRARY_NOTE') {
      setAttachModal({ kind: 'note', mode: 'create', unitId, blockId });
    } else if (type === 'SHELF') {
      setAttachModal({ kind: 'shelf', mode: 'create', unitId, blockId });
    } else {
      setCreateConfig({ unitId, type, blockId });
    }
  }

  // Route a row click: a COHORT-ONLY Library Note / Shelf opens its attach
  // edit modal (those types aren't editable in the shared editor);
  // everything else — incl. template note/shelf rows — opens the shared
  // editor as before.
  function openEditActivity(a: ProgrammeActivity, isCohortOnly: boolean) {
    if (isCohortOnly && a.type === 'LIBRARY_NOTE') {
      setAttachModal({ kind: 'note', mode: 'edit', activityId: a.activity_id });
    } else if (isCohortOnly && a.type === 'SHELF') {
      setAttachModal({ kind: 'shelf', mode: 'edit', activityId: a.activity_id });
    } else {
      setEditActivity(a);
    }
  }

  function handleCreateBlock(unitId: string, title: string) {
    setError(null);
    startCreateBlock(async () => {
      const res = await createCohortOnlyBlockAction(cohortId, unitId, title);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAddingBlockUnitId(null);
      router.refresh();
    });
  }

  function handleDeleteBlock() {
    if (!deleteBlockTarget) return;
    setError(null);
    const blockId = deleteBlockTarget.block.block_id;
    startDeleteBlock(async () => {
      const res = await deleteCohortOnlyBlockAction(cohortId, blockId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDeleteBlockTarget(null);
      router.refresh();
    });
  }

  // Unconfigured count — activities the tutor hasn't decided on yet
  // (no override row). Drives the "N unconfigured → Include all" prompt.
  const unconfiguredCount = tree.units.reduce((sum, u) => {
    for (const entry of u.body) {
      if (entry.kind === 'block') {
        sum += entry.rows.filter((r) => r.state === 'unconfigured').length;
      } else if (entry.row.state === 'unconfigured') {
        sum += 1;
      }
    }
    return sum;
  }, 0);

  const [includingAll, startIncludeAll] = useTransition();
  function handleIncludeAll() {
    setError(null);
    startIncludeAll(async () => {
      const res = await includeAllUnconfiguredActivitiesAction(cohortId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  // Pending tracking — Set of row IDs that are either dirty
  // (typed/clicked but not yet committed) or have a save in flight.
  // The set drives the top banner + the beforeunload guard.
  const [pendingRowIds, setPendingRowIds] = useState<Set<string>>(
    () => new Set()
  );

  const markPending = useCallback((id: string, isPending: boolean) => {
    setPendingRowIds((prev) => {
      const currentlyPending = prev.has(id);
      if (isPending === currentlyPending) return prev;
      const next = new Set(prev);
      if (isPending) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // beforeunload guard — fires the browser's confirmation prompt
  // when the tutor tries to close / navigate away with unsaved
  // edits. Best-effort: doesn't catch in-app navigation (Next.js
  // <Link>); a future polish slice can use App Router's
  // unstable_useNavigationBlock once it lands stable.
  const pendingCount = pendingRowIds.size;
  useEffect(() => {
    if (pendingCount === 0) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [pendingCount]);

  // Dead-end empty state only when the programme has no units at all
  // (effectively never — every programme is backfilled with its
  // length_units units). When units exist but hold no activities, we
  // still render them: the tutor can author the template on the
  // Curriculum tab AND add cohort-only activities to a unit right here.
  if (tree.units.length === 0) {
    return (
      <section className="cohort-checklist-empty">
        <h2 className="cohort-checklist-empty-title">
          No units in this programme yet.
        </h2>
        <p className="cohort-checklist-empty-sub">
          Author your curriculum on the programme&apos;s Curriculum tab.
          Every activity you add appears here automatically — you then
          decide which to include in this cohort and when each opens.
        </p>
      </section>
    );
  }

  // The week whose detail is shown — the selection, falling back to the
  // first week (initial load, or if a selected week somehow disappears).
  const selectedUnit =
    tree.units.find((u) => u.unit.unit_id === selectedUnitId) ?? tree.units[0];
  const selCounts = unitCounts(selectedUnit);
  const selSummary = [
    `${selCounts.total} ${selCounts.total === 1 ? 'activity' : 'activities'}`,
  ];
  if (selCounts.excluded > 0) selSummary.push(`${selCounts.excluded} excluded`);
  if (selCounts.notSet > 0) selSummary.push(`${selCounts.notSet} not set`);

  return (
    <>
      <section className="cohort-checklist">
        <header className="cohort-checklist-head">
          <div className="cohort-checklist-head-text">
            <h2 className="cohort-checklist-title">Cohort curriculum</h2>
            <p className="cohort-checklist-hint">
              Toggle inclusion and set each activity&apos;s window —
              opens, due, closes — for this cohort. Due and close are
              optional. Content edits flow from the programme&apos;s
              Curriculum tab — click any activity to edit it there. You can
              also add <strong>cohort-only</strong> activities and blocks
              (below each week) that live only in this run.
            </p>
          </div>
          <div
            className="cmv-toggle"
            role="tablist"
            aria-label="Curriculum view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === 'list'}
              className={'cmv-toggle-btn' + (view === 'list' ? ' is-on' : '')}
              onClick={() => setView('list')}
            >
              Checklist
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'month'}
              className={'cmv-toggle-btn' + (view === 'month' ? ' is-on' : '')}
              onClick={() => setView('month')}
            >
              Month
            </button>
          </div>
        </header>

        {unconfiguredCount > 0 && (
          <div className="cohort-checklist-new-banner" role="status">
            <div className="cohort-checklist-new-banner-text">
              <strong>
                {unconfiguredCount} unconfigured{' '}
                {unconfiguredCount === 1 ? 'activity' : 'activities'}
              </strong>{' '}
              — not yet decided for this cohort, so students don&apos;t see
              {unconfiguredCount === 1 ? ' it' : ' them'}. Include all, then
              exclude any you don&apos;t want, or set each one individually
              below.
            </div>
            <button
              type="button"
              className="prog-btn prog-btn-primary"
              onClick={handleIncludeAll}
              disabled={includingAll}
            >
              {includingAll ? 'Including…' : 'Include all'}
            </button>
          </div>
        )}

        {pendingCount > 0 && (
          <div
            className="cohort-checklist-pending-banner"
            role="status"
            aria-live="polite"
          >
            <span className="cohort-checklist-pending-spinner" aria-hidden="true">
              ⟳
            </span>
            Saving {pendingCount}{' '}
            {pendingCount === 1 ? 'change' : 'changes'}…
          </div>
        )}

        {view === 'month' ? (
          <CurriculumMonthView
            weeks={buildCohortMonthWeeks(tree)}
            rangeLabel={cohortRangeLabel(tree)}
            audience="tutor"
            onChipClick={openInList}
          />
        ) : (
        <div className={'ccp' + (entered ? ' is-entered' : '')}>
          <aside className="ccp-rail" aria-label="Weeks">
            <div className="ccp-rail-head">
              <span className="ccp-rail-head-title">Weeks</span>
              <span className="ccp-rail-head-count">
                {tree.units.length} {tree.units.length === 1 ? 'week' : 'weeks'}
              </span>
            </div>
            <div className="ccp-rail-list" role="tablist" aria-label="Weeks">
              {tree.units.map((u) => {
                const c = unitCounts(u);
                const isSel = u.unit.unit_id === selectedUnit.unit.unit_id;
                return (
                  <button
                    key={u.unit.unit_id}
                    type="button"
                    role="tab"
                    aria-selected={isSel}
                    className={'ccp-rail-item' + (isSel ? ' is-active' : '')}
                    onClick={() => selectUnit(u.unit.unit_id)}
                  >
                    <span className="ccp-rail-item-top">
                      <span className="ccp-rail-item-label">
                        {unitLabel(u.unit.unit_index, tree.programme.unit_label)}
                      </span>
                      <span
                        className={`unit-pill ${unitStatusPillClass(
                          u.unit.is_published
                        )}`}
                      >
                        {unitStatusLabel(u.unit.is_published)}
                      </span>
                    </span>
                    <span className="ccp-rail-item-title">
                      {formatUnitTitle(u.unit, tree.programme.unit_label)}
                    </span>
                    <span className="ccp-rail-item-meta">
                      <span className="ccp-rail-count">
                        {c.total} {c.total === 1 ? 'activity' : 'activities'}
                      </span>
                      {c.notSet > 0 && (
                        <span className="ccp-rail-badge is-notset">
                          {c.notSet} not set
                        </span>
                      )}
                      {c.excluded > 0 && (
                        <span className="ccp-rail-badge is-excluded">
                          {c.excluded} excluded
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="ccp-detail">
            <button
              type="button"
              className="ccp-back"
              onClick={() => setEntered(false)}
            >
              ← Weeks
            </button>
            <article className="cohort-checklist-unit ccp-detail-unit">
              <header className="cohort-checklist-unit-head">
                <span className="cohort-checklist-unit-index">
                  {unitLabel(
                    selectedUnit.unit.unit_index,
                    tree.programme.unit_label
                  )}
                </span>
                <span
                  className={`unit-pill ${unitStatusPillClass(
                    selectedUnit.unit.is_published
                  )}`}
                >
                  {unitStatusLabel(selectedUnit.unit.is_published)}
                </span>
                <span className="ccp-detail-summary">
                  {selSummary.join(' · ')}
                </span>
              </header>
              <h3 className="cohort-checklist-unit-title">
                {formatUnitTitle(selectedUnit.unit, tree.programme.unit_label)}
              </h3>
              {selectedUnit.unit.description && (
                <p className="cohort-checklist-unit-desc">
                  {selectedUnit.unit.description}
                </p>
              )}

              {selectedUnit.body.length === 0 ? (
                <p className="cohort-checklist-unit-empty">
                  No activities in this unit yet.
                </p>
              ) : (
                <div className="cohort-checklist-body">
                  {selectedUnit.body.map((entry, idx) => {
                    // Only cohort-only items reorder here; template items
                    // move on the Curriculum tab. Position is the entry's
                    // index in the merged body — it can move past template
                    // items (the action computes a between-number).
                    const entryIsCohortOnly =
                      entry.kind === 'loose'
                        ? entry.row.isCohortOnly
                        : entry.isCohortOnly;
                    const reorder: ReorderCtl | undefined = entryIsCohortOnly
                      ? {
                          canUp: idx > 0,
                          canDown: idx < selectedUnit.body.length - 1,
                          pending: reordering,
                          onMove: (direction) =>
                            handleReorder(
                              entry.kind === 'block' ? 'block' : 'activity',
                              entry.kind === 'block'
                                ? entry.block.block_id
                                : entry.row.activity.activity_id,
                              direction
                            ),
                        }
                      : undefined;
                    return (
                      <BodyEntry
                        key={
                          entry.kind === 'block'
                            ? `b-${entry.block.block_id}`
                            : `l-${entry.row.activity.activity_id}`
                        }
                        entry={entry}
                        cohortId={cohortId}
                        onClickActivity={openEditActivity}
                        onError={setError}
                        onMutated={() => router.refresh()}
                        markPending={markPending}
                        onEditBlock={(block) => setEditBlock(block)}
                        onDeleteBlock={(block, count) =>
                          setDeleteBlockTarget({ block, activityCount: count })
                        }
                        onAddActivityToBlock={openAddActivity}
                        reorder={reorder}
                        onReorderActivity={(activityId, direction) =>
                          handleReorder('activity', activityId, direction)
                        }
                        reorderPending={reordering}
                      />
                    );
                  })}
                </div>
              )}

              <div className="cohort-checklist-unit-foot">
                {pickerUnitId === selectedUnit.unit.unit_id ? (
                  <ActivityPicker
                    types={COHORT_ONLY_TYPES}
                    title="Add a cohort-only activity"
                    onPick={(type) => {
                      openAddActivity(selectedUnit.unit.unit_id, null, type);
                      setPickerUnitId(null);
                    }}
                    onCancel={() => setPickerUnitId(null)}
                  />
                ) : addingBlockUnitId === selectedUnit.unit.unit_id ? (
                  <CohortBlockCreate
                    pending={creatingBlock}
                    onCreate={(title) =>
                      handleCreateBlock(selectedUnit.unit.unit_id, title)
                    }
                    onCancel={() => setAddingBlockUnitId(null)}
                  />
                ) : (
                  <div className="cohort-checklist-add-row">
                    <button
                      type="button"
                      className="cohort-checklist-add-btn"
                      onClick={() => {
                        setPickerUnitId(selectedUnit.unit.unit_id);
                        setAddingBlockUnitId(null);
                      }}
                    >
                      + Add cohort-only activity
                    </button>
                    <button
                      type="button"
                      className="cohort-checklist-add-btn"
                      onClick={() => {
                        setAddingBlockUnitId(selectedUnit.unit.unit_id);
                        setPickerUnitId(null);
                      }}
                    >
                      + Add cohort-only block
                    </button>
                  </div>
                )}
              </div>
            </article>
          </div>
        </div>
        )}
      </section>

      {editActivity && (
        <ActivityModal
          mode="edit"
          activity={editActivity}
          onClose={() => setEditActivity(null)}
        />
      )}

      {createConfig && (
        <ActivityModal
          mode="create"
          unitId={createConfig.unitId}
          type={createConfig.type}
          blockId={createConfig.blockId}
          onCreate={async (values) => {
            const res = await createCohortOnlyActivityAction(
              cohortId,
              createConfig.unitId,
              values,
              createConfig.blockId
            );
            // Soft-warn keyed off the editor's Status tick (the modal
            // closes + the tree refreshes; the persistent Draft pill on the
            // new row carries the hidden state from here on).
            if (res.ok) nudgeForAdd(values.is_published);
            return res;
          }}
          onClose={() => setCreateConfig(null)}
        />
      )}

      {editBlock && (
        <BlockFormModal
          blockId={editBlock.block_id}
          initial={{
            title: editBlock.title,
            description: editBlock.description ?? '',
            is_published: editBlock.is_published,
          }}
          onClose={() => setEditBlock(null)}
        />
      )}

      {deleteBlockTarget && (
        <DeleteBlockConfirm
          blockTitle={deleteBlockTarget.block.title}
          activityCount={deleteBlockTarget.activityCount}
          pending={deletingBlock}
          onCancel={() => setDeleteBlockTarget(null)}
          onConfirm={handleDeleteBlock}
        />
      )}

      {attachModal?.kind === 'note' &&
        (attachModal.mode === 'create' ? (
          <LibraryNoteAttachModal
            mode="create"
            unitId={attachModal.unitId}
            blockId={attachModal.blockId}
            cohortId={cohortId}
            onAttached={nudgeForAdd}
            onClose={() => setAttachModal(null)}
          />
        ) : (
          <LibraryNoteAttachModal
            mode="edit"
            activityId={attachModal.activityId}
            onClose={() => setAttachModal(null)}
          />
        ))}

      {attachModal?.kind === 'shelf' &&
        (attachModal.mode === 'create' ? (
          <ShelfAttachModal
            mode="create"
            unitId={attachModal.unitId}
            blockId={attachModal.blockId}
            cohortId={cohortId}
            onAttached={nudgeForAdd}
            onClose={() => setAttachModal(null)}
          />
        ) : (
          <ShelfAttachModal
            mode="edit"
            activityId={attachModal.activityId}
            onClose={() => setAttachModal(null)}
          />
        ))}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
      <InfoToast message={nudge} onDismiss={() => setNudge(null)} />
    </>
  );
}

// ---------- Body entry: block or loose row ----------

type BlockCallbacks = {
  onEditBlock: (block: ProgrammeBlock) => void;
  onDeleteBlock: (block: ProgrammeBlock, activityCount: number) => void;
  onAddActivityToBlock: (
    unitId: string,
    blockId: string,
    type: ActivityType
  ) => void;
};

function BodyEntry({
  entry,
  cohortId,
  onClickActivity,
  onError,
  onMutated,
  markPending,
  onEditBlock,
  onDeleteBlock,
  onAddActivityToBlock,
  reorder,
  onReorderActivity,
  reorderPending,
}: {
  entry: CohortChecklistBodyEntry;
  cohortId: string;
  onClickActivity: (a: ProgrammeActivity, isCohortOnly: boolean) => void;
  onError: (msg: string) => void;
  onMutated: () => void;
  markPending: (id: string, isPending: boolean) => void;
  // Slice 4 — reorder of this entry (undefined for template entries).
  reorder?: ReorderCtl;
  // Reorder of an activity INSIDE a cohort-only block (BlockEntryCard
  // builds per-row controls from this).
  onReorderActivity: (activityId: string, direction: 'up' | 'down') => void;
  reorderPending: boolean;
} & BlockCallbacks) {
  if (entry.kind === 'loose') {
    return (
      <ChecklistRow
        row={entry.row}
        cohortId={cohortId}
        onClickActivity={onClickActivity}
        onError={onError}
        onMutated={onMutated}
        markPending={markPending}
        reorder={reorder}
      />
    );
  }

  return (
    <BlockEntryCard
      entry={entry}
      cohortId={cohortId}
      onClickActivity={onClickActivity}
      onError={onError}
      onMutated={onMutated}
      markPending={markPending}
      onEditBlock={onEditBlock}
      onDeleteBlock={onDeleteBlock}
      onAddActivityToBlock={onAddActivityToBlock}
      reorder={reorder}
      onReorderActivity={onReorderActivity}
      reorderPending={reorderPending}
    />
  );
}

// A block in the cohort checklist. Template blocks render read-only (they
// are authored on the programme Curriculum tab). Cohort-only blocks carry
// the source pill + Edit / Delete + a "+ Add activity to block" picker.
function BlockEntryCard({
  entry,
  cohortId,
  onClickActivity,
  onError,
  onMutated,
  markPending,
  onEditBlock,
  onDeleteBlock,
  onAddActivityToBlock,
  reorder,
  onReorderActivity,
  reorderPending,
}: {
  entry: import('./types').CohortChecklistBlockEntry;
  cohortId: string;
  onClickActivity: (a: ProgrammeActivity, isCohortOnly: boolean) => void;
  onError: (msg: string) => void;
  onMutated: () => void;
  markPending: (id: string, isPending: boolean) => void;
  reorder?: ReorderCtl;
  onReorderActivity: (activityId: string, direction: 'up' | 'down') => void;
  reorderPending: boolean;
} & BlockCallbacks) {
  const { block, rows, isCohortOnly } = entry;
  const [blockPickerOpen, setBlockPickerOpen] = useState(false);

  return (
    <div
      className={
        'cohort-checklist-block' + (isCohortOnly ? ' is-cohort-only' : '')
      }
    >
      <header className="cohort-checklist-block-head">
        <span className="cohort-checklist-block-title">{block.title}</span>
        <span
          className={`unit-pill ${unitStatusPillClass(block.is_published)}`}
        >
          {unitStatusLabel(block.is_published)}
        </span>
        {isCohortOnly && (
          <span className="cohort-checklist-cohort-only-badge">
            Cohort-only
          </span>
        )}
        {isCohortOnly && (
          <span className="cohort-checklist-block-controls">
            {reorder && <ReorderArrows {...reorder} />}
            <button
              type="button"
              className="cohort-checklist-block-btn"
              onClick={() => onEditBlock(block)}
              title="Edit this block"
            >
              Edit
            </button>
            <button
              type="button"
              className="cohort-checklist-block-btn is-danger"
              onClick={() => onDeleteBlock(block, rows.length)}
              title="Delete this block"
            >
              Delete
            </button>
          </span>
        )}
      </header>
      {block.description && (
        <p className="cohort-checklist-block-desc">{block.description}</p>
      )}
      {rows.length === 0 ? (
        <p className="cohort-checklist-block-empty">
          {isCohortOnly
            ? 'No activities in this block yet — add one below.'
            : 'No activities in this block.'}
        </p>
      ) : (
        <div className="cohort-checklist-block-rows">
          {rows.map((r, m) => (
            <ChecklistRow
              key={r.activity.activity_id}
              row={r}
              cohortId={cohortId}
              onClickActivity={onClickActivity}
              onError={onError}
              onMutated={onMutated}
              markPending={markPending}
              reorder={
                isCohortOnly
                  ? {
                      canUp: m > 0,
                      canDown: m < rows.length - 1,
                      pending: reorderPending,
                      onMove: (direction) =>
                        onReorderActivity(r.activity.activity_id, direction),
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}
      {isCohortOnly && (
        <div className="cohort-checklist-block-foot">
          {blockPickerOpen ? (
            <ActivityPicker
              types={COHORT_ONLY_TYPES}
              title="Add an activity to this block"
              onPick={(type) => {
                onAddActivityToBlock(block.unit_id, block.block_id, type);
                setBlockPickerOpen(false);
              }}
              onCancel={() => setBlockPickerOpen(false)}
            />
          ) : (
            <button
              type="button"
              className="cohort-checklist-add-btn"
              onClick={() => setBlockPickerOpen(true)}
            >
              + Add activity to block
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Inline "+ Add cohort-only block" title input — mirrors the template's
// inline block create (just name it; description + Live/Draft come later
// via the block edit modal).
function CohortBlockCreate({
  pending,
  onCreate,
  onCancel,
}: {
  pending: boolean;
  onCreate: (title: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const trimmed = title.trim();
  return (
    <div className="cohort-checklist-block-create">
      <input
        type="text"
        className="cohort-checklist-block-create-input"
        placeholder="Block title — e.g. Pre-tutorial reading"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        disabled={pending}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && trimmed) onCreate(trimmed);
          if (e.key === 'Escape') onCancel();
        }}
      />
      <button
        type="button"
        className="prog-btn prog-btn-primary"
        disabled={pending || trimmed === ''}
        onClick={() => onCreate(trimmed)}
      >
        {pending ? 'Adding…' : 'Add block'}
      </button>
      <button
        type="button"
        className="prog-btn prog-btn-ghost"
        disabled={pending}
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}

// ---------- Single activity row ----------

// Debounce window for onChange-fired saves on the date input.
// 600ms = long enough that intermediate keyboard typing doesn't
// fire-and-undo, short enough that a calendar pick saves promptly.
// onBlur cancels the pending debounce and fires immediately.
const DATE_DEBOUNCE_MS = 600;

// "Saved!" flash duration. Status reverts to 'idle' after this so
// the row goes back to a quiet state.
const SAVED_FLASH_MS = 1500;

type DateField = 'release' | 'due' | 'close';

type DateActionResult = { ok: true } | { ok: false; error: string };

function ChecklistRow({
  row,
  cohortId,
  onClickActivity,
  onError,
  onMutated,
  markPending,
  reorder,
}: {
  row: CohortChecklistActivityRow;
  cohortId: string;
  onClickActivity: (a: ProgrammeActivity, isCohortOnly: boolean) => void;
  onError: (msg: string) => void;
  onMutated: () => void;
  markPending: (id: string, isPending: boolean) => void;
  // Slice 4 — reorder arrows (undefined for template rows).
  reorder?: ReorderCtl;
}) {
  const activityId = row.activity.activity_id;

  // Inclusion decision — a three-state segment (Unconfigured / Included
  // / Excluded). Optimistic state so a click reflects immediately;
  // rolls back on a failed save. Unconfigured is never a *click target*
  // (you decide Include or Exclude); it's just the pre-decision value.
  const [optimisticState, setOptimisticState] =
    useState<ChecklistActivityState>(row.state);
  const [includedPending, startIncludedTransition] = useTransition();

  // Per-row visible save status, set by any of the four controls
  // (three date fields + the toggle). 'failed' is sticky until the
  // next edit; 'saved' flashes for SAVED_FLASH_MS then reverts.
  const [saveStatus, setSaveStatus] = useState<RowSaveStatus>('idle');
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveStatus !== 'saved') return;
    flashRef.current = setTimeout(() => setSaveStatus('idle'), SAVED_FLASH_MS);
    return () => {
      if (flashRef.current) clearTimeout(flashRef.current);
    };
  }, [saveStatus]);

  // Per-field pending tracking. Each <ChecklistDateField> reports
  // its own pending (dirty OR save-in-flight); the toggle's is
  // derived here. The OR across all four feeds markPending.
  const [datePending, setDatePending] = useState({
    release: false,
    due: false,
    close: false,
  });
  const onFieldPending = useCallback(
    (field: DateField, pending: boolean) => {
      setDatePending((prev) =>
        prev[field] === pending ? prev : { ...prev, [field]: pending }
      );
    },
    []
  );

  const stateDirty = optimisticState !== row.state;
  const rowIsPending =
    includedPending ||
    stateDirty ||
    datePending.release ||
    datePending.due ||
    datePending.close;

  useEffect(() => {
    markPending(activityId, rowIsPending);
    // Mark released on unmount too so a navigation doesn't leave a
    // stale entry in the parent's set.
    return () => {
      markPending(activityId, false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowIsPending, activityId]);

  function setDecision(next: 'included' | 'excluded') {
    if (optimisticState === next) return; // no-op if already there
    const prev = optimisticState;
    setOptimisticState(next);
    setSaveStatus('saving');
    startIncludedTransition(async () => {
      const result = await setActivityIncludedAction(
        cohortId,
        activityId,
        next === 'included'
      );
      if (!result.ok) {
        setOptimisticState(prev); // rollback
        setSaveStatus('failed');
        onError(result.error);
        return;
      }
      setSaveStatus('saved');
      onMutated();
    });
  }

  // Cohort-only rows (Slice 1) get a Delete instead of Include/Exclude —
  // the activity exists only in this cohort, so removing it is a genuine
  // delete (the COHORT_ONLY checklist row cascades with it).
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  function handleDelete() {
    startDelete(async () => {
      const result = await deleteCohortOnlyActivityAction(cohortId, activityId);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      setConfirmingDelete(false);
      onMutated();
    });
  }

  const a = row.activity;
  const displayState = optimisticState;

  // Slice 2 integrity cue — an included + published live-session marker
  // with no scheduled planner row for this cohort. Soft "Needs scheduling"
  // link to the Sessions tab (never blocks). The cohort curriculum always
  // renders at /tutor/programme/<pid>/cohorts, so usePathname gives the
  // base for the ?cohort=&tab=sessions link without threading programmeId.
  const pathname = usePathname();
  const needsScheduling =
    a.type === 'ONLINE_LIVE_SESSION' &&
    a.is_published &&
    displayState !== 'excluded' &&
    row.liveSessionScheduled === false;

  return (
    <div
      className={
        'cohort-checklist-row' +
        (displayState === 'excluded' ? ' is-excluded' : '') +
        (displayState === 'unconfigured' ? ' is-unconfigured' : '')
      }
    >
      {reorder && <ReorderArrows {...reorder} />}
      <button
        type="button"
        className="cohort-checklist-row-main"
        onClick={() => onClickActivity(a, row.isCohortOnly)}
        title={
          row.isCohortOnly
            ? 'Edit this cohort-only activity'
            : 'Open template editor'
        }
      >
        <span className="cohort-checklist-row-icon" aria-hidden="true">
          {ACTIVITY_TYPE_ICON[a.type]}
        </span>
        <span className="cohort-checklist-row-text">
          <span className="cohort-checklist-row-title-row">
            <span className="cohort-checklist-row-title">{a.title}</span>
            <span
              className={`unit-pill ${unitStatusPillClass(a.is_published)}`}
            >
              {unitStatusLabel(a.is_published)}
            </span>
            {row.isCohortOnly && (
              <span className="cohort-checklist-cohort-only-badge">
                Cohort-only
              </span>
            )}
            {displayState === 'unconfigured' && (
              <span className="cohort-checklist-unconfigured-badge">
                Not set
              </span>
            )}
            {displayState === 'excluded' && (
              <span className="cohort-checklist-excluded-badge">
                Excluded from cohort
              </span>
            )}
          </span>
          <span className="cohort-checklist-row-meta">
            {TYPE_LABEL[a.type]}
          </span>
        </span>
      </button>

      {needsScheduling && (
        <Link
          className="cohort-checklist-needs-schedule"
          href={`${pathname}?cohort=${cohortId}&tab=sessions`}
          title="This live session has no time set for this cohort"
        >
          ⚠ Needs scheduling →
        </Link>
      )}

      <div className="cohort-checklist-row-controls">
        <div
          className="cohort-checklist-row-window"
          role="group"
          aria-label="Activity window"
        >
          <ChecklistDateField
            field="release"
            label="Opens"
            serverValue={row.release_date}
            isDefault={row.release_is_default}
            nullable={false}
            action={(value) =>
              setActivityReleaseDateAction(cohortId, activityId, value ?? '')
            }
            onStatus={setSaveStatus}
            onError={onError}
            onMutated={onMutated}
            onPendingChange={onFieldPending}
          />
          <ChecklistDateField
            field="due"
            label="Due"
            serverValue={row.due_date}
            nullable
            action={(value) =>
              setActivityDueDateAction(cohortId, activityId, value)
            }
            onStatus={setSaveStatus}
            onError={onError}
            onMutated={onMutated}
            onPendingChange={onFieldPending}
          />
          <ChecklistDateField
            field="close"
            label="Closes"
            serverValue={row.close_date}
            nullable
            action={(value) =>
              setActivityCloseDateAction(cohortId, activityId, value)
            }
            onStatus={setSaveStatus}
            onError={onError}
            onMutated={onMutated}
            onPendingChange={onFieldPending}
          />
        </div>
        {row.isCohortOnly ? (
          <div
            className="cohort-checklist-decision"
            role="group"
            aria-label="Cohort-only activity"
          >
            <button
              type="button"
              className="cohort-checklist-delete-btn"
              disabled={deleting}
              onClick={() => setConfirmingDelete(true)}
              title="Delete this cohort-only activity"
            >
              🗑 Delete
            </button>
          </div>
        ) : (
          <div
            className="cohort-checklist-decision"
            role="group"
            aria-label="Include in this cohort"
          >
            <button
              type="button"
              className={
                'cohort-checklist-decision-btn is-include' +
                (displayState === 'included' ? ' is-active' : '')
              }
              aria-pressed={displayState === 'included'}
              disabled={includedPending}
              onClick={() => setDecision('included')}
              title="Include in this cohort"
            >
              ✓ Include
            </button>
            <button
              type="button"
              className={
                'cohort-checklist-decision-btn is-exclude' +
                (displayState === 'excluded' ? ' is-active' : '')
              }
              aria-pressed={displayState === 'excluded'}
              disabled={includedPending}
              onClick={() => setDecision('excluded')}
              title="Exclude from this cohort"
            >
              ✗ Exclude
            </button>
          </div>
        )}
        <SaveStatusPill status={saveStatus} />
      </div>

      {confirmingDelete && (
        <DeleteActivityConfirm
          activityTitle={a.title}
          pending={deleting}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

// ---------- One date field of the activity window ----------
//
// Self-contained: owns its local value, debounce timer, and a
// transition for its own save. `nullable` false → empty input is
// a validation error (release_date is NOT NULL); nullable true →
// empty means "clear it" (saves null). Reports pending up so the
// row can aggregate; reports save status up so the row's single
// pill reflects the latest outcome.

function ChecklistDateField({
  field,
  label,
  serverValue,
  nullable,
  isDefault = false,
  action,
  onStatus,
  onError,
  onMutated,
  onPendingChange,
}: {
  field: DateField;
  label: string;
  serverValue: string | null;
  nullable: boolean;
  // true when serverValue is a computed default (no stored override) —
  // renders faint so the tutor can tell it apart from a date they set.
  isDefault?: boolean;
  action: (value: string | null) => Promise<DateActionResult>;
  onStatus: (status: RowSaveStatus) => void;
  onError: (msg: string) => void;
  onMutated: () => void;
  onPendingChange: (field: DateField, pending: boolean) => void;
}) {
  const [value, setValue] = useState(serverValue ?? '');
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = value !== (serverValue ?? '');

  useEffect(() => {
    onPendingChange(field, isDirty || isPending);
  }, [field, isDirty, isPending, onPendingChange]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function commit(raw: string) {
    if (raw === '') {
      if (!nullable) {
        setValue(serverValue ?? ''); // rollback
        onStatus('failed');
        onError(`${label} date is required.`);
        return;
      }
      // nullable + empty → clear (save null below)
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      setValue(serverValue ?? ''); // rollback
      onStatus('failed');
      onError(`${label} date must be a valid date.`);
      return;
    }
    onStatus('saving');
    startTransition(async () => {
      const result = await action(raw === '' ? null : raw);
      if (!result.ok) {
        setValue(serverValue ?? ''); // rollback
        onStatus('failed');
        onError(result.error);
        return;
      }
      onStatus('saved');
      onMutated();
    });
  }

  function handleChange(next: string) {
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      commit(next);
    }, DATE_DEBOUNCE_MS);
  }

  function handleBlur() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (value !== (serverValue ?? '')) commit(value);
  }

  return (
    <label className="cohort-checklist-row-date">
      <span className="cohort-checklist-row-date-label">{label}</span>
      <input
        type="date"
        className={
          'cohort-checklist-row-date-input' +
          (isDefault && !isDirty ? ' is-default' : '')
        }
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        disabled={isPending}
      />
    </label>
  );
}

function SaveStatusPill({ status }: { status: RowSaveStatus }) {
  if (status === 'idle') return null;
  if (status === 'saving') {
    return (
      <span
        className="cohort-checklist-save-pill is-saving"
        aria-live="polite"
      >
        Saving…
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span
        className="cohort-checklist-save-pill is-saved"
        aria-live="polite"
      >
        Saved
      </span>
    );
  }
  return (
    <span
      className="cohort-checklist-save-pill is-failed"
      aria-live="polite"
    >
      Failed
    </span>
  );
}

// Keep ESLint happy — UnitLabel import is type-only.
export type { UnitLabel };
