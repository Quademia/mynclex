// mynclex/lib/cohorts/cohort-curriculum.tsx
//
// Slice 9.3f — Cohort Curriculum tab body. Renders the cohort
// checklist as a control surface (not a student preview):
//   • Every template activity is shown (Draft + Live).
//   • Each row carries the template's Live/Draft pill + a cohort
//     Excluded badge when is_included=false + an inline release-
//     date input.
//   • Clicking a row opens the template editor modal (reused from
//     the curriculum tab). Content edits flow back to the template
//     and propagate to every cohort.
//   • Blocks always render — even when all child rows are
//     excluded — because the checklist is a CONTROL list. Students
//     filter the view through isVisibleToStudents() in their own
//     surface; tutors see the full shape here.
//
// Save-safety layer (added per the 9.3f planning conversation —
// release-date bulk edits need to survive a tutor moving quickly
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
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { ActivityModal } from '@/lib/curriculum/activity-modal';
import {
  formatUnitTitle,
  unitLabel,
  unitStatusLabel,
  unitStatusPillClass,
} from '@/lib/curriculum/format';
import {
  setChecklistItemIncludedAction,
  setChecklistItemReleaseDateAction,
} from './actions';
import type {
  CohortChecklistActivityRow,
  CohortChecklistBodyEntry,
  CohortChecklistTree,
} from './types';
import type { ProgrammeActivity } from '@/lib/curriculum/types';
import type { UnitLabel } from '@/lib/programmes/types';

const TYPE_ICON = {
  TEXT: '📝',
  PDF: '📄',
  EXTERNAL_LINK: '🔗',
  ONLINE_LIVE_SESSION: '🎥',
  MOCK: '🎯',
  PRACTICE_QUIZ: '✏️',
} as const;

const TYPE_LABEL = {
  TEXT: 'Text',
  PDF: 'PDF',
  EXTERNAL_LINK: 'Link',
  ONLINE_LIVE_SESSION: 'Online live session',
  MOCK: 'Mock',
  PRACTICE_QUIZ: 'Practice quiz',
} as const;

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
  const [editActivity, setEditActivity] = useState<ProgrammeActivity | null>(
    null
  );

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

  // The tree is empty if the programme has no activities yet
  // (cohort got seeded with zero rows). Render a helpful empty
  // state pointing the tutor back to the curriculum tab.
  const hasAnyActivity = tree.units.some((u) => u.body.length > 0);

  if (!hasAnyActivity) {
    return (
      <section className="cohort-checklist-empty">
        <h2 className="cohort-checklist-empty-title">
          No activities in this programme yet.
        </h2>
        <p className="cohort-checklist-empty-sub">
          Author your curriculum on the programme&apos;s Curriculum
          tab. Activities you add will appear here automatically for
          cohorts you create after that point. (Existing cohorts
          don&apos;t auto-pick-up new template activities.)
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="cohort-checklist">
        <header className="cohort-checklist-head">
          <h2 className="cohort-checklist-title">Cohort curriculum</h2>
          <p className="cohort-checklist-hint">
            Toggle inclusion and set release dates for this cohort.
            Content edits flow from the programme&apos;s Curriculum tab
            — click any activity to edit it there.
          </p>
        </header>

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

        <div className="cohort-checklist-units">
          {tree.units.map((u) => (
            <article key={u.unit.unit_id} className="cohort-checklist-unit">
              <header className="cohort-checklist-unit-head">
                <span className="cohort-checklist-unit-index">
                  {unitLabel(u.unit.unit_index, tree.programme.unit_label)}
                </span>
                <span
                  className={`unit-pill ${unitStatusPillClass(u.unit.is_published)}`}
                >
                  {unitStatusLabel(u.unit.is_published)}
                </span>
              </header>
              <h3 className="cohort-checklist-unit-title">
                {formatUnitTitle(u.unit, tree.programme.unit_label)}
              </h3>
              {u.unit.description && (
                <p className="cohort-checklist-unit-desc">
                  {u.unit.description}
                </p>
              )}

              {u.body.length === 0 ? (
                <p className="cohort-checklist-unit-empty">
                  No activities in this unit.
                </p>
              ) : (
                <div className="cohort-checklist-body">
                  {u.body.map((entry, i) => (
                    <BodyEntry
                      key={
                        entry.kind === 'block'
                          ? `b-${entry.block.block_id}`
                          : `l-${entry.row.checklist_item_id}-${i}`
                      }
                      entry={entry}
                      onClickActivity={(a) => setEditActivity(a)}
                      onError={setError}
                      onMutated={() => router.refresh()}
                      markPending={markPending}
                    />
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {editActivity && (
        <ActivityModal
          mode="edit"
          activity={editActivity}
          onClose={() => setEditActivity(null)}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}

// ---------- Body entry: block or loose row ----------

function BodyEntry({
  entry,
  onClickActivity,
  onError,
  onMutated,
  markPending,
}: {
  entry: CohortChecklistBodyEntry;
  onClickActivity: (a: ProgrammeActivity) => void;
  onError: (msg: string) => void;
  onMutated: () => void;
  markPending: (id: string, isPending: boolean) => void;
}) {
  if (entry.kind === 'loose') {
    return (
      <ChecklistRow
        row={entry.row}
        onClickActivity={onClickActivity}
        onError={onError}
        onMutated={onMutated}
        markPending={markPending}
      />
    );
  }

  return (
    <div className="cohort-checklist-block">
      <header className="cohort-checklist-block-head">
        <span className="cohort-checklist-block-title">
          {entry.block.title}
        </span>
        <span
          className={`unit-pill ${unitStatusPillClass(entry.block.is_published)}`}
        >
          {unitStatusLabel(entry.block.is_published)}
        </span>
      </header>
      {entry.block.description && (
        <p className="cohort-checklist-block-desc">
          {entry.block.description}
        </p>
      )}
      {entry.rows.length === 0 ? (
        <p className="cohort-checklist-block-empty">
          No activities in this block.
        </p>
      ) : (
        <div className="cohort-checklist-block-rows">
          {entry.rows.map((r) => (
            <ChecklistRow
              key={r.checklist_item_id}
              row={r}
              onClickActivity={onClickActivity}
              onError={onError}
              onMutated={onMutated}
              markPending={markPending}
            />
          ))}
        </div>
      )}
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

function ChecklistRow({
  row,
  onClickActivity,
  onError,
  onMutated,
  markPending,
}: {
  row: CohortChecklistActivityRow;
  onClickActivity: (a: ProgrammeActivity) => void;
  onError: (msg: string) => void;
  onMutated: () => void;
  markPending: (id: string, isPending: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();

  // Local optimistic state for snappy toggles + date edits; the
  // server is the source of truth and gets re-loaded by router
  // .refresh() on success.
  const [included, setIncluded] = useState(row.is_included);
  const [releaseDate, setReleaseDate] = useState(row.release_date);

  // Per-row visible save status. 'failed' is sticky until the next
  // edit attempt; 'saved' flashes for SAVED_FLASH_MS then reverts
  // to 'idle'.
  const [saveStatus, setSaveStatus] = useState<RowSaveStatus>('idle');

  // Debounce timer for date onChange. Cleared by onBlur (fire now)
  // or by component unmount.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup pending timers on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (flashRef.current) clearTimeout(flashRef.current);
    };
  }, []);

  // Aggregate "is this row contributing to the page-level pending
  // count?". A row is pending if any of:
  //   • A save action is in flight (isPending true).
  //   • The local date differs from the row's server value (dirty
  //     — typed but not yet committed; debounce pending).
  //   • The local included flag differs from the server value.
  // 'saved' status doesn't count — it's a visual flash, the DB is
  // already up to date.
  const isDirtyDate = releaseDate !== row.release_date;
  const isDirtyIncluded = included !== row.is_included;
  const rowIsPending = isPending || isDirtyDate || isDirtyIncluded;

  useEffect(() => {
    markPending(row.checklist_item_id, rowIsPending);
    // Mark released on unmount too so a navigation doesn't leave a
    // stale entry in the parent's set.
    return () => {
      markPending(row.checklist_item_id, false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowIsPending, row.checklist_item_id]);

  function flashSaved() {
    setSaveStatus('saved');
    if (flashRef.current) clearTimeout(flashRef.current);
    flashRef.current = setTimeout(() => {
      setSaveStatus('idle');
    }, SAVED_FLASH_MS);
  }

  function saveIncluded(next: boolean) {
    setSaveStatus('saving');
    startTransition(async () => {
      const result = await setChecklistItemIncludedAction(
        row.checklist_item_id,
        next
      );
      if (!result.ok) {
        setIncluded(!next); // rollback optimistic state
        setSaveStatus('failed');
        onError(result.error);
        return;
      }
      flashSaved();
      onMutated();
    });
  }

  function handleToggleIncluded(next: boolean) {
    setIncluded(next);
    saveIncluded(next);
  }

  function saveDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setReleaseDate(row.release_date); // rollback to last server value
      setSaveStatus('failed');
      onError('Release date must be a valid date.');
      return;
    }
    setSaveStatus('saving');
    startTransition(async () => {
      const result = await setChecklistItemReleaseDateAction(
        row.checklist_item_id,
        value
      );
      if (!result.ok) {
        setReleaseDate(row.release_date); // rollback
        setSaveStatus('failed');
        onError(result.error);
        return;
      }
      flashSaved();
      onMutated();
    });
  }

  function handleDateChange(next: string) {
    setReleaseDate(next);
    // Debounce — calendar pickers fire onChange with the final
    // value once. Keyboard typing might fire many; the debounce
    // collapses to the last value.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      saveDate(next);
    }, DATE_DEBOUNCE_MS);
  }

  function handleDateBlur() {
    // If a debounce is pending, fire immediately instead.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      if (releaseDate !== row.release_date) saveDate(releaseDate);
      return;
    }
    // No pending debounce — only fire if the value actually
    // differs from the server (covers focus-without-edit).
    if (releaseDate !== row.release_date) saveDate(releaseDate);
  }

  const a = row.activity;

  return (
    <div
      className={
        included
          ? 'cohort-checklist-row'
          : 'cohort-checklist-row is-excluded'
      }
    >
      <button
        type="button"
        className="cohort-checklist-row-main"
        onClick={() => onClickActivity(a)}
        title="Open template editor"
      >
        <span className="cohort-checklist-row-icon" aria-hidden="true">
          {TYPE_ICON[a.type]}
        </span>
        <span className="cohort-checklist-row-text">
          <span className="cohort-checklist-row-title-row">
            <span className="cohort-checklist-row-title">{a.title}</span>
            <span
              className={`unit-pill ${unitStatusPillClass(a.is_published)}`}
            >
              {unitStatusLabel(a.is_published)}
            </span>
            {!included && (
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

      <div className="cohort-checklist-row-controls">
        <label className="cohort-checklist-row-date">
          <span className="cohort-checklist-row-date-label">Release</span>
          <input
            type="date"
            className="cohort-checklist-row-date-input"
            value={releaseDate}
            onChange={(e) => handleDateChange(e.target.value)}
            onBlur={handleDateBlur}
            disabled={isPending}
          />
        </label>
        <label className="cohort-checklist-row-toggle">
          <input
            type="checkbox"
            checked={included}
            onChange={(e) => handleToggleIncluded(e.target.checked)}
            disabled={isPending}
          />
          <span>Included</span>
        </label>
        <SaveStatusPill status={saveStatus} />
      </div>
    </div>
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
