// mynclex/lib/curriculum/unit-builder.tsx
//
// Interactive body of the unit-detail page. Renders the merged
// unit-body sequence — interleaved <BlockCard> (with its own
// activity stack) and loose <ActivityRow> entries — plus the
// two bottom triggers ("+ Add activity" / "+ Add block") and
// every modal/overlay the surface needs.
//
// State map:
//   • pickerScope      — which entry point opened the type
//                        picker (unit body vs. specific block)
//   • addBlockOpen     — inline rename form for new blocks
//   • modalState       — activity create/edit modal
//   • editBlockTarget  — block-edit modal
//   • editUnitOpen     — unit-edit modal (carried over from 9.3b)
//   • deleteActivity   — simple or last-in-block delete confirm
//   • deleteBlock      — block delete confirm (with cascade count)
//   • moveActivityTo   — move-into-block picker dialog
//
// Slice 9.3c — blocks layer on the loose-activity foundation
// from 9.3b. The bottom triggers are the only place new entries
// originate; reorder + move-in/out happen via row controls.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { ActivityPicker } from './activity-picker';
import { ActivityModal } from './activity-modal';
import { LibraryNoteAttachModal } from './library-note-attach-modal';
import { ShelfAttachModal } from './shelf-attach-modal';
import { ActivityRow } from './activity-row';
import { BlockCard } from './block-card';
import { BlockFormModal } from './block-form-modal';
import { UnitFormModal } from './unit-form-modal';
import { DeleteActivityConfirm } from '@/lib/overlays/curriculum/delete-activity-confirm';
import { DeleteBlockConfirm } from '@/lib/overlays/curriculum/delete-block-confirm';
import { LastInBlockPrompt } from '@/lib/overlays/curriculum/last-in-block-prompt';
import { MoveIntoBlockMenu } from '@/lib/overlays/curriculum/move-into-block-menu';
import {
  createBlockAction,
  deleteActivityAction,
  deleteBlockAction,
  deleteLastBlockActivityAction,
  editUnitAction,
  moveActivityIntoBlockAction,
  moveActivityOutOfBlockAction,
  reorderActivityAction,
  reorderBlockAction,
} from './actions';
import { composeUnitBody } from './unit-body';
import { CurIcon } from './cur-icon';
import { unitLabel, unitStatusLabel, unitStatusPillClass } from './format';
import type {
  ActivityType,
  ProgrammeActivity,
  ProgrammeBlock,
  ProgrammeUnit,
} from './types';
import type { UnitLabel } from '@/lib/programmes/types';

interface UnitBuilderProps {
  unit: ProgrammeUnit;
  blocks: ProgrammeBlock[];
  activities: ProgrammeActivity[];
  programmeUnitLabel: UnitLabel;
}

type PickerScope =
  | null
  | { kind: 'unit' }
  | { kind: 'block'; blockId: string };

type ActivityModalState =
  | { kind: 'closed' }
  | { kind: 'create'; type: ActivityType; blockId: string | null }
  | { kind: 'edit'; activity: ProgrammeActivity };

type DeleteActivityState =
  | null
  | { kind: 'simple'; activity: ProgrammeActivity }
  | { kind: 'last-in-block'; activity: ProgrammeActivity; blockTitle: string };

export function UnitBuilder({
  unit,
  blocks,
  activities,
  programmeUnitLabel,
}: UnitBuilderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Picker (in-place 3×2 type grid). Null = button visible.
  const [pickerScope, setPickerScope] = useState<PickerScope>(null);

  // Inline "+ Add block" rename form.
  const [addBlockOpen, setAddBlockOpen] = useState(false);
  const [addBlockTitle, setAddBlockTitle] = useState('');

  // Activity create/edit modal.
  const [modalState, setModalState] = useState<ActivityModalState>({
    kind: 'closed',
  });

  // Library-Note attach / edit modal (slice 11.11a) — a separate flow
  // from the standard ActivityModal: create = pick a note; edit =
  // caption / publish / detach.
  const [libraryNoteModal, setLibraryNoteModal] = useState<
    | null
    | { mode: 'create'; blockId: string | null }
    | { mode: 'edit'; activityId: string }
  >(null);

  // Slice 11.12 — Shelf attach / edit modal. Same shape as the Library
  // Note modal (its own flow, not the standard ActivityModal): create =
  // pick a shelf; edit = member-notes hide/visibility + caption / publish
  // / detach.
  const [shelfModal, setShelfModal] = useState<
    | null
    | { mode: 'create'; blockId: string | null }
    | { mode: 'edit'; activityId: string }
  >(null);

  // Block edit / delete state.
  const [editBlockTarget, setEditBlockTarget] = useState<ProgrammeBlock | null>(
    null
  );
  const [deleteBlockTarget, setDeleteBlockTarget] = useState<{
    block: ProgrammeBlock;
    activityCount: number;
  } | null>(null);

  // Unit edit (carried from 9.3b).
  const [editUnitOpen, setEditUnitOpen] = useState(false);

  // Delete-activity confirm — simple or last-in-block flavour.
  const [deleteActivity, setDeleteActivity] = useState<DeleteActivityState>(
    null
  );

  // Move-into-block picker.
  const [moveActivityTo, setMoveActivityTo] =
    useState<ProgrammeActivity | null>(null);

  // ─── Derived data ───────────────────────────────────

  const body = composeUnitBody(blocks, activities);
  const hasBlocks = blocks.length > 0;

  function activitiesInBlock(blockId: string): ProgrammeActivity[] {
    return activities
      .filter((a) => a.block_id === blockId)
      .sort((a, b) => a.ordinal - b.ordinal);
  }

  // ─── Picker / type pick ─────────────────────────────

  function openUnitPicker() {
    setAddBlockOpen(false);
    setPickerScope({ kind: 'unit' });
  }
  function openBlockPicker(blockId: string) {
    setAddBlockOpen(false);
    setPickerScope({ kind: 'block', blockId });
  }
  function closePicker() {
    setPickerScope(null);
  }
  function handlePick(type: ActivityType) {
    if (!pickerScope) return;
    const blockId =
      pickerScope.kind === 'block' ? pickerScope.blockId : null;
    setPickerScope(null);
    // Library Note has its own attach flow (pick a note), not the
    // standard per-type editor modal.
    if (type === 'LIBRARY_NOTE') {
      setLibraryNoteModal({ mode: 'create', blockId });
      return;
    }
    if (type === 'SHELF') {
      setShelfModal({ mode: 'create', blockId });
      return;
    }
    setModalState({ kind: 'create', type, blockId });
  }

  // ─── + Add block (inline rename) ────────────────────

  function openAddBlock() {
    setPickerScope(null);
    setAddBlockTitle('');
    setAddBlockOpen(true);
  }
  function cancelAddBlock() {
    setAddBlockOpen(false);
    setAddBlockTitle('');
  }
  function submitAddBlock() {
    const trimmed = addBlockTitle.trim();
    if (trimmed.length === 0) {
      setError('Block title is required.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createBlockAction(unit.unit_id, {
        title: trimmed,
        description: '',
        is_published: false,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAddBlockOpen(false);
      setAddBlockTitle('');
      router.refresh();
    });
  }

  // ─── Activity click / reorder / delete ──────────────

  function handleActivityClick(activity: ProgrammeActivity) {
    if (activity.type === 'LIBRARY_NOTE') {
      setLibraryNoteModal({ mode: 'edit', activityId: activity.activity_id });
      return;
    }
    if (activity.type === 'SHELF') {
      setShelfModal({ mode: 'edit', activityId: activity.activity_id });
      return;
    }
    setModalState({ kind: 'edit', activity });
  }

  function handleActivityReorder(
    activity: ProgrammeActivity,
    direction: 'up' | 'down'
  ) {
    setError(null);
    startTransition(async () => {
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

  function handleActivityDeleteRequest(activity: ProgrammeActivity) {
    if (activity.block_id === null) {
      setDeleteActivity({ kind: 'simple', activity });
      return;
    }
    // In-block: detect last-in-block to swap the prompt.
    const siblings = activities.filter((a) => a.block_id === activity.block_id);
    if (siblings.length <= 1) {
      const parentBlock = blocks.find(
        (b) => b.block_id === activity.block_id
      );
      setDeleteActivity({
        kind: 'last-in-block',
        activity,
        blockTitle: parentBlock?.title ?? 'this block',
      });
    } else {
      setDeleteActivity({ kind: 'simple', activity });
    }
  }

  function handleSimpleDeleteConfirm() {
    if (!deleteActivity || deleteActivity.kind !== 'simple') return;
    setError(null);
    startTransition(async () => {
      const result = await deleteActivityAction(
        deleteActivity.activity.activity_id
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDeleteActivity(null);
      router.refresh();
    });
  }

  function handleLastInBlockChoice(choice: 'cascade' | 'preserve') {
    if (!deleteActivity || deleteActivity.kind !== 'last-in-block') return;
    setError(null);
    startTransition(async () => {
      const result = await deleteLastBlockActivityAction(
        deleteActivity.activity.activity_id,
        choice
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDeleteActivity(null);
      router.refresh();
    });
  }

  // ─── Move-into-block / Move-out-of-block ────────────

  function openMoveIntoBlock(activity: ProgrammeActivity) {
    if (!hasBlocks) return;
    setMoveActivityTo(activity);
  }
  function pickMoveTarget(blockId: string) {
    if (!moveActivityTo) return;
    const activityId = moveActivityTo.activity_id;
    setError(null);
    startTransition(async () => {
      const result = await moveActivityIntoBlockAction(activityId, blockId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMoveActivityTo(null);
      router.refresh();
    });
  }

  function handleActivityMoveOut(activity: ProgrammeActivity) {
    setError(null);
    startTransition(async () => {
      const result = await moveActivityOutOfBlockAction(activity.activity_id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  // ─── Block reorder / edit / delete ──────────────────

  function handleBlockReorder(
    block: ProgrammeBlock,
    direction: 'up' | 'down'
  ) {
    setError(null);
    startTransition(async () => {
      const result = await reorderBlockAction(block.block_id, direction);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleBlockDeleteRequest(block: ProgrammeBlock) {
    setDeleteBlockTarget({
      block,
      activityCount: activitiesInBlock(block.block_id).length,
    });
  }
  function handleBlockDeleteConfirm() {
    if (!deleteBlockTarget) return;
    setError(null);
    const blockId = deleteBlockTarget.block.block_id;
    startTransition(async () => {
      const result = await deleteBlockAction(blockId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDeleteBlockTarget(null);
      router.refresh();
    });
  }

  // One-click Live/Draft toggle for the unit header — reuses
  // editUnitAction with the current title/description (the full editor
  // is still a click away via "Edit").
  function handleUnitPublishToggle() {
    setError(null);
    startTransition(async () => {
      const result = await editUnitAction(unit.unit_id, {
        title: unit.title ?? '',
        description: unit.description ?? '',
        is_published: !unit.is_published,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  // ─── Render ─────────────────────────────────────────

  const unitTitle = unit.title?.trim();

  return (
    <>
      {/* ─── Unit header ────────────────────────────── */}

      <header className="cur-detail-head">
        <div className="cur-detail-eyebrow">
          <span className="cur-detail-index">
            {unitLabel(unit.unit_index, programmeUnitLabel)}
          </span>
          <span className={`unit-pill ${unitStatusPillClass(unit.is_published)}`}>
            {unitStatusLabel(unit.is_published)}
          </span>
        </div>

        <div className="cur-detail-titlerow">
          <h1 className={'cur-detail-title' + (unitTitle ? '' : ' untitled')}>
            {unitTitle || 'Untitled'}
          </h1>
          <div className="cur-detail-actions">
            <button
              type="button"
              className="cur-btn-ghost-sm"
              onClick={() => setEditUnitOpen(true)}
              disabled={isPending}
            >
              <CurIcon name="pencil" size={14} /> Edit
            </button>
            {unit.is_published ? (
              <button
                type="button"
                className="cur-btn-ghost-sm"
                onClick={handleUnitPublishToggle}
                disabled={isPending}
              >
                <CurIcon name="eyeOff" size={14} /> Unpublish
              </button>
            ) : (
              <button
                type="button"
                className="cur-btn-accent-sm"
                onClick={handleUnitPublishToggle}
                disabled={isPending}
              >
                <CurIcon name="publish" size={14} /> Publish
              </button>
            )}
          </div>
        </div>

        {unit.description && (
          <p className="cur-detail-desc">{unit.description}</p>
        )}
      </header>

      {/* ─── Body — interleaved blocks + loose rows ─── */}

      <section className="cur-detail-body">
        <div className="cur-detail-inner">
        {body.length === 0 && !pickerScope && !addBlockOpen && (
          <div className="cur-empty">
            <div className="cur-empty-icon">
              <CurIcon name="layers" size={24} />
            </div>
            <h2 className="cur-empty-title">Nothing here yet</h2>
            <p className="cur-empty-sub">
              Add your first activity — a reading, PDF, quiz or live
              session — or group activities into a block.
            </p>
            <div className="cur-add-row cur-add-row-empty">
              <button
                type="button"
                className="cur-add-btn"
                onClick={openUnitPicker}
              >
                <CurIcon name="plus" size={14} /> Add activity
              </button>
              <button
                type="button"
                className="cur-add-btn"
                onClick={openAddBlock}
              >
                <CurIcon name="plus" size={14} /> Add block
              </button>
            </div>
          </div>
        )}

        {body.length > 0 && (
          <ul className="unit-body-list" role="list">
            {body.map((entry, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === body.length - 1;
              if (entry.kind === 'block') {
                return (
                  <li key={`block-${entry.block.block_id}`} className="unit-body-item">
                    <BlockCard
                      block={entry.block}
                      activities={entry.activities}
                      canMoveUp={!isFirst}
                      canMoveDown={!isLast}
                      reorderPending={isPending}
                      onReorder={(direction) =>
                        handleBlockReorder(entry.block, direction)
                      }
                      onEdit={() => setEditBlockTarget(entry.block)}
                      onDelete={() => handleBlockDeleteRequest(entry.block)}
                      onAddActivity={() => openBlockPicker(entry.block.block_id)}
                      onActivityClick={handleActivityClick}
                      onActivityReorder={handleActivityReorder}
                      onActivityDelete={handleActivityDeleteRequest}
                      onActivityMoveOut={handleActivityMoveOut}
                    />
                    {/* Inline picker if scoped to this block */}
                    {pickerScope?.kind === 'block' &&
                      pickerScope.blockId === entry.block.block_id && (
                        <div className="block-card-picker-slot">
                          <ActivityPicker
                            onPick={handlePick}
                            onCancel={closePicker}
                          />
                        </div>
                      )}
                  </li>
                );
              }
              // Loose activity
              return (
                <li key={`act-${entry.activity.activity_id}`} className="unit-body-item">
                  <ActivityRow
                    activity={entry.activity}
                    canMoveUp={!isFirst}
                    canMoveDown={!isLast}
                    reorderPending={isPending}
                    onClick={() => handleActivityClick(entry.activity)}
                    onReorder={(direction) =>
                      handleActivityReorder(entry.activity, direction)
                    }
                    onDelete={() => handleActivityDeleteRequest(entry.activity)}
                    onMoveIntoBlock={() => openMoveIntoBlock(entry.activity)}
                    hasBlocks={hasBlocks}
                  />
                </li>
              );
            })}
          </ul>
        )}

        {/* ─── Unit-scope picker (loose entry point) ──── */}

        {pickerScope?.kind === 'unit' && (
          <ActivityPicker onPick={handlePick} onCancel={closePicker} />
        )}

        {/* ─── Inline + Add block form ────────────────── */}

        {addBlockOpen && (
          <div className="add-block-inline">
            <input
              type="text"
              className="prog-input"
              value={addBlockTitle}
              onChange={(e) => setAddBlockTitle(e.target.value)}
              placeholder="Block title — e.g. Pre-tutorial reading"
              autoFocus
              disabled={isPending}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitAddBlock();
                if (e.key === 'Escape') cancelAddBlock();
              }}
            />
            <div className="add-block-inline-actions">
              <button
                type="button"
                className="prog-btn prog-btn-ghost"
                onClick={cancelAddBlock}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="prog-btn prog-btn-primary"
                onClick={submitAddBlock}
                disabled={isPending || addBlockTitle.trim() === ''}
              >
                {isPending ? 'Creating…' : 'Add block'}
              </button>
            </div>
          </div>
        )}

        {/* ─── Bottom triggers (paired) ───────────────── */}

        {body.length > 0 && !pickerScope && !addBlockOpen && (
          <div className="cur-add-row">
            <button
              type="button"
              className="cur-add-btn"
              onClick={openUnitPicker}
            >
              <CurIcon name="plus" size={14} /> Add activity
            </button>
            <button
              type="button"
              className="cur-add-btn"
              onClick={openAddBlock}
            >
              <CurIcon name="plus" size={14} /> Add block
            </button>
          </div>
        )}
        </div>
      </section>

      {/* ─── Modals + overlays ─────────────────────── */}

      {modalState.kind === 'create' && (
        <ActivityModal
          mode="create"
          unitId={unit.unit_id}
          type={modalState.type}
          blockId={modalState.blockId}
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

      {libraryNoteModal?.mode === 'create' && (
        <LibraryNoteAttachModal
          mode="create"
          unitId={unit.unit_id}
          blockId={libraryNoteModal.blockId}
          onClose={() => setLibraryNoteModal(null)}
        />
      )}

      {libraryNoteModal?.mode === 'edit' && (
        <LibraryNoteAttachModal
          mode="edit"
          activityId={libraryNoteModal.activityId}
          onClose={() => setLibraryNoteModal(null)}
        />
      )}

      {shelfModal?.mode === 'create' && (
        <ShelfAttachModal
          mode="create"
          unitId={unit.unit_id}
          blockId={shelfModal.blockId}
          onClose={() => setShelfModal(null)}
        />
      )}

      {shelfModal?.mode === 'edit' && (
        <ShelfAttachModal
          mode="edit"
          activityId={shelfModal.activityId}
          onClose={() => setShelfModal(null)}
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

      {editBlockTarget && (
        <BlockFormModal
          blockId={editBlockTarget.block_id}
          initial={{
            title: editBlockTarget.title,
            description: editBlockTarget.description ?? '',
            is_published: editBlockTarget.is_published,
          }}
          onClose={() => setEditBlockTarget(null)}
        />
      )}

      {moveActivityTo && (
        <MoveIntoBlockMenu
          activityTitle={moveActivityTo.title}
          blocks={blocks}
          onPick={pickMoveTarget}
          onCancel={() => setMoveActivityTo(null)}
          pending={isPending}
        />
      )}

      {deleteActivity?.kind === 'simple' && (
        <DeleteActivityConfirm
          activityTitle={deleteActivity.activity.title}
          pending={isPending}
          onCancel={() => setDeleteActivity(null)}
          onConfirm={handleSimpleDeleteConfirm}
        />
      )}

      {deleteActivity?.kind === 'last-in-block' && (
        <LastInBlockPrompt
          activityTitle={deleteActivity.activity.title}
          blockTitle={deleteActivity.blockTitle}
          pending={isPending}
          onMoveOut={() => handleLastInBlockChoice('preserve')}
          onDeleteBoth={() => handleLastInBlockChoice('cascade')}
          onCancel={() => setDeleteActivity(null)}
        />
      )}

      {deleteBlockTarget && (
        <DeleteBlockConfirm
          blockTitle={deleteBlockTarget.block.title}
          activityCount={deleteBlockTarget.activityCount}
          pending={isPending}
          onCancel={() => setDeleteBlockTarget(null)}
          onConfirm={handleBlockDeleteConfirm}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}
