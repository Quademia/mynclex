// mynclex/lib/curriculum/unit-builder.tsx
//
// Interactive body of the unit-detail page (slice 9.3b, mockup
// screen 4). The page shell wraps the unit header + back link
// server-side; this client component owns:
//   • The loose-activity stack (rendered inline as .map()).
//   • The "+ Add activity" trigger → inline 3×2 picker in place.
//   • Modal state — which activity is being edited / created.
//   • Delete confirm (simple yes/no — no type-to-confirm).
//   • Reorder via up/down arrows wired to reorderActivityAction.
//
// Activities are loose-only in 9.3b (no blocks yet). Blocks layer
// on top in 9.3c — they'll add a separate "+ Add block" trigger
// alongside this one, and the block cards interleave with the
// loose rows in the same body ordinal space.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { ActivityPicker } from './activity-picker';
import { ActivityModal } from './activity-modal';
import { UnitFormModal } from './unit-form-modal';
import {
  deleteActivityAction,
  reorderActivityAction,
} from './actions';
import { unitLabel, unitStatusLabel, unitStatusPillClass } from './format';
import type {
  ActivityType,
  ProgrammeActivity,
  ProgrammeUnit,
} from './types';
import type { UnitLabel } from '@/lib/programmes/types';

interface UnitBuilderProps {
  unit: ProgrammeUnit;
  activities: ProgrammeActivity[];
  programmeUnitLabel: UnitLabel;
}

// Picker icons match activity-picker tile copy — keep the row
// glyph in sync.
const TYPE_ICON: Record<ActivityType, string> = {
  TEXT: '📝',
  PDF: '📄',
  EXTERNAL_LINK: '🔗',
  LIVE_SESSION: '🎥',
  MOCK: '🎯',
  PRACTICE_QUIZ: '✏️',
};

const TYPE_LABEL: Record<ActivityType, string> = {
  TEXT: 'Text',
  PDF: 'PDF',
  EXTERNAL_LINK: 'Link',
  LIVE_SESSION: 'Live session',
  MOCK: 'Mock',
  PRACTICE_QUIZ: 'Practice quiz',
};

export function UnitBuilder({
  unit,
  activities,
  programmeUnitLabel,
}: UnitBuilderProps) {
  const router = useRouter();
  const [isReorderPending, startReorderTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Picker visibility — inline in place of the "+ Add activity"
  // button.
  const [pickerOpen, setPickerOpen] = useState(false);

  // Activity modal — either "create" (with a chosen type) or
  // "edit" (with the existing row).
  const [modalState, setModalState] = useState<
    | { kind: 'closed' }
    | { kind: 'create'; type: ActivityType }
    | { kind: 'edit'; activity: ProgrammeActivity }
  >({ kind: 'closed' });

  // Edit-unit modal.
  const [editUnitOpen, setEditUnitOpen] = useState(false);

  // Delete-activity confirm — simple yes/no per the slice planning
  // discussion (low-stakes; not type-to-confirm).
  const [deleteTarget, setDeleteTarget] = useState<ProgrammeActivity | null>(
    null
  );
  const [isDeletePending, startDeleteTransition] = useTransition();

  function handlePick(type: ActivityType) {
    setPickerOpen(false);
    setModalState({ kind: 'create', type });
  }

  function handleRowClick(activity: ProgrammeActivity) {
    setModalState({ kind: 'edit', activity });
  }

  function handleReorder(
    activity: ProgrammeActivity,
    direction: 'up' | 'down'
  ) {
    setError(null);
    startReorderTransition(async () => {
      const result = await reorderActivityAction(
        activity.activity_id,
        direction
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setError(null);
    startDeleteTransition(async () => {
      const result = await deleteActivityAction(deleteTarget.activity_id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDeleteTarget(null);
      router.refresh();
    });
  }

  return (
    <>
      {/* ─── Unit header ────────────────────────────── */}

      <header className="unit-detail-head">
        <div className="unit-detail-head-meta">
          <span className="unit-detail-head-index">
            {unitLabel(unit.unit_index, programmeUnitLabel)}
          </span>
          <span className={`unit-pill ${unitStatusPillClass(unit.is_published)}`}>
            {unitStatusLabel(unit.is_published)}
          </span>
        </div>

        <h1 className="unit-detail-head-title">
          {unit.title?.trim() || (
            <span className="unit-detail-head-title-empty">Untitled</span>
          )}
        </h1>

        {unit.description && (
          <p className="unit-detail-head-desc">{unit.description}</p>
        )}

        <div className="unit-detail-head-actions">
          <button
            type="button"
            className="prog-btn prog-btn-ghost"
            onClick={() => setEditUnitOpen(true)}
          >
            Edit unit
          </button>
        </div>
      </header>

      {/* ─── Activity stack ─────────────────────────── */}

      <section className="unit-detail-body">
        {activities.length === 0 && !pickerOpen && (
          <p className="unit-detail-empty">
            No activities yet. Tap <strong>+ Add activity</strong> below to
            start building.
          </p>
        )}

        {activities.length > 0 && (
          <ul className="activity-list" role="list">
            {activities.map((activity, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === activities.length - 1;
              return (
                <li key={activity.activity_id} className="activity-row">
                  <button
                    type="button"
                    className="activity-row-main"
                    onClick={() => handleRowClick(activity)}
                  >
                    <span className="activity-row-icon" aria-hidden="true">
                      {TYPE_ICON[activity.type]}
                    </span>
                    <span className="activity-row-text">
                      <span className="activity-row-title">{activity.title}</span>
                      <span className="activity-row-meta">
                        {TYPE_LABEL[activity.type]}
                        {!activity.is_published && ' · Draft'}
                      </span>
                    </span>
                  </button>

                  <div
                    className="activity-row-controls"
                    role="group"
                    aria-label="Row controls"
                  >
                    <button
                      type="button"
                      className="activity-row-arrow"
                      aria-label="Move up"
                      onClick={() => handleReorder(activity, 'up')}
                      disabled={isFirst || isReorderPending}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="activity-row-arrow"
                      aria-label="Move down"
                      onClick={() => handleReorder(activity, 'down')}
                      disabled={isLast || isReorderPending}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="activity-row-delete"
                      aria-label="Delete activity"
                      onClick={() => setDeleteTarget(activity)}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* "+ Add activity" trigger / inline picker */}
        {pickerOpen ? (
          <ActivityPicker
            onPick={handlePick}
            onCancel={() => setPickerOpen(false)}
          />
        ) : (
          <button
            type="button"
            className="unit-detail-add-btn"
            onClick={() => setPickerOpen(true)}
          >
            + Add activity
          </button>
        )}
      </section>

      {/* ─── Modals + overlays ─────────────────────── */}

      {modalState.kind === 'create' && (
        <ActivityModal
          mode="create"
          unitId={unit.unit_id}
          type={modalState.type}
          onClose={() => setModalState({ kind: 'closed' })}
        />
      )}

      {modalState.kind === 'edit' && (
        <ActivityModal
          mode="edit"
          activity={modalState.activity}
          onClose={() => setModalState({ kind: 'closed' })}
        />
      )}

      {editUnitOpen && (
        <UnitFormModal
          unitId={unit.unit_id}
          unitIndex={unit.unit_index}
          programmeUnitLabel={programmeUnitLabel}
          initial={{
            title: unit.title ?? '',
            description: unit.description ?? '',
            is_published: unit.is_published,
          }}
          onClose={() => setEditUnitOpen(false)}
        />
      )}

      {deleteTarget && (
        <div
          className="prog-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Delete activity"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeletePending) {
              setDeleteTarget(null);
            }
          }}
        >
          <div className="confirm-dialog">
            <h2 className="confirm-dialog-title">Delete this activity?</h2>
            <p className="confirm-dialog-body">
              <strong>{deleteTarget.title}</strong> will be removed from this
              unit. This can&apos;t be undone.
            </p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="prog-btn prog-btn-ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeletePending}
                autoFocus
              >
                Keep activity
              </button>
              <button
                type="button"
                className="prog-btn prog-btn-danger"
                onClick={handleDeleteConfirm}
                disabled={isDeletePending}
              >
                {isDeletePending ? 'Deleting…' : 'Delete activity'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}
