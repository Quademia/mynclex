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
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { ActivityModal } from '@/lib/curriculum/activity-modal';
import {
  formatUnitTitle,
  unitLabel,
  unitStatusLabel,
  unitStatusPillClass,
  ACTIVITY_TYPE_ICON,
} from '@/lib/curriculum/format';
import {
  setActivityIncludedAction,
  setActivityReleaseDateAction,
  setActivityDueDateAction,
  setActivityCloseDateAction,
  includeAllUnconfiguredActivitiesAction,
} from './actions';
import type {
  ChecklistActivityState,
  CohortChecklistActivityRow,
  CohortChecklistBodyEntry,
  CohortChecklistTree,
} from './types';
import type { ProgrammeActivity } from '@/lib/curriculum/types';
import type { UnitLabel } from '@/lib/programmes/types';

const TYPE_LABEL = {
  TEXT: 'Text',
  PDF: 'PDF',
  EXTERNAL_LINK: 'Link',
  ONLINE_LIVE_SESSION: 'Online live session',
  MOCK: 'Mock',
  PRACTICE_QUIZ: 'Practice quiz',
  LIBRARY_NOTE: 'Library note',
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

  const cohortId = tree.cohort.cohort_id;

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

  // The tree is empty if the programme has no activities yet
  // (cohort got seeded with zero rows). Render a helpful empty
  // state pointing the tutor back to the curriculum tab.
  const hasAnyActivity = tree.units.some((u) => u.body.length > 0);

  // Dead-end empty state only when the programme genuinely has no
  // activities at all.
  if (!hasAnyActivity && unconfiguredCount === 0) {
    return (
      <section className="cohort-checklist-empty">
        <h2 className="cohort-checklist-empty-title">
          No activities in this programme yet.
        </h2>
        <p className="cohort-checklist-empty-sub">
          Author your curriculum on the programme&apos;s Curriculum tab.
          Every activity you add appears here automatically — you then
          decide which to include in this cohort and when each opens.
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
            Toggle inclusion and set each activity&apos;s window —
            opens, due, closes — for this cohort. Due and close are
            optional. Content edits flow from the programme&apos;s
            Curriculum tab — click any activity to edit it there.
          </p>
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
                  {u.body.map((entry) => (
                    <BodyEntry
                      key={
                        entry.kind === 'block'
                          ? `b-${entry.block.block_id}`
                          : `l-${entry.row.activity.activity_id}`
                      }
                      entry={entry}
                      cohortId={cohortId}
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
  cohortId,
  onClickActivity,
  onError,
  onMutated,
  markPending,
}: {
  entry: CohortChecklistBodyEntry;
  cohortId: string;
  onClickActivity: (a: ProgrammeActivity) => void;
  onError: (msg: string) => void;
  onMutated: () => void;
  markPending: (id: string, isPending: boolean) => void;
}) {
  if (entry.kind === 'loose') {
    return (
      <ChecklistRow
        row={entry.row}
        cohortId={cohortId}
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
              key={r.activity.activity_id}
              row={r}
              cohortId={cohortId}
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

type DateField = 'release' | 'due' | 'close';

type DateActionResult = { ok: true } | { ok: false; error: string };

function ChecklistRow({
  row,
  cohortId,
  onClickActivity,
  onError,
  onMutated,
  markPending,
}: {
  row: CohortChecklistActivityRow;
  cohortId: string;
  onClickActivity: (a: ProgrammeActivity) => void;
  onError: (msg: string) => void;
  onMutated: () => void;
  markPending: (id: string, isPending: boolean) => void;
}) {
  const activityId = row.activity.activity_id;

  // Inclusion checkbox — checked = included. Unchecked spans two
  // states: "unconfigured" (no row yet) and "excluded" (explicit row).
  // The row's badge disambiguates; the publish gate is what actually
  // keeps students out, so leaving something unconfigured is safe.
  const [included, setIncluded] = useState(row.state === 'included');
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

  const includedDirty = included !== (row.state === 'included');
  const rowIsPending =
    includedPending ||
    includedDirty ||
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

  function saveIncluded(next: boolean) {
    setSaveStatus('saving');
    startIncludedTransition(async () => {
      const result = await setActivityIncludedAction(
        cohortId,
        activityId,
        next
      );
      if (!result.ok) {
        setIncluded(!next); // rollback optimistic state
        setSaveStatus('failed');
        onError(result.error);
        return;
      }
      setSaveStatus('saved');
      onMutated();
    });
  }

  function handleToggleIncluded(next: boolean) {
    setIncluded(next);
    saveIncluded(next);
  }

  const a = row.activity;
  // Display state: optimistic include wins; otherwise reflect the
  // stored state (unconfigured vs excluded).
  const displayState: ChecklistActivityState = includedDirty
    ? included
      ? 'included'
      : 'excluded'
    : row.state;

  return (
    <div
      className={
        'cohort-checklist-row' +
        (displayState === 'excluded' ? ' is-excluded' : '') +
        (displayState === 'unconfigured' ? ' is-unconfigured' : '')
      }
    >
      <button
        type="button"
        className="cohort-checklist-row-main"
        onClick={() => onClickActivity(a)}
        title="Open template editor"
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
        <label className="cohort-checklist-row-toggle">
          <input
            type="checkbox"
            checked={included}
            onChange={(e) => handleToggleIncluded(e.target.checked)}
            disabled={includedPending}
          />
          <span>Included</span>
        </label>
        <SaveStatusPill status={saveStatus} />
      </div>
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
