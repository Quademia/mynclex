// mynclex/lib/curriculum/curriculum-workspace.tsx
//
// The curriculum master-detail shell (2026-06 redesign — CD "Curriculum
// Workspace", Unit-rail variant). Lives in the curriculum LAYOUT, so the
// rail persists while the detail pane ({children}) swaps as you click
// between units. Replaces the old two-page flow (units grid → separate
// unit-builder page) with one workspace.
//
// The rail is the old unit-card content, restyled. Selecting a unit is a
// real <Link> (deep-linkable URL: /curriculum/unit/<id>); the active unit
// is read from the pathname. On narrow screens the rail collapses to a
// "Units" slide-over.
//
// Unit management on the rail:
//   • Real: Select · Rename (UnitFormModal) · Publish/Unpublish
//     (editUnitAction) · Add unit (appendUnitAction = length +1).
//   • Placeholder (disabled, "Soon"): Delete · Reorder — blocked by the
//     units-tied-to-length model; revisit when units are decoupled.

'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { CurIcon } from './cur-icon';
import { CurMenu } from './cur-menu';
import type { CurMenuItem } from './cur-menu';
import { UnitFormModal } from './unit-form-modal';
import { UnpublishUnitConfirm } from '@/lib/overlays/curriculum/unpublish-unit-confirm';
import { AddUnitConfirm } from '@/lib/overlays/curriculum/add-unit-confirm';
import { DeleteUnitConfirm } from '@/lib/overlays/curriculum/delete-unit-confirm';
import {
  appendUnitAction,
  deleteUnitAction,
  editUnitAction,
  reorderUnitAction,
} from './actions';
import {
  formatUnitCounts,
  formatUnitTitle,
  unitLabel,
  unitStatusLabel,
  unitStatusPillClass,
} from './format';
import type { UnitGridRow } from './types';
import type { UnitLabel } from '@/lib/programmes/types';

interface CurriculumWorkspaceProps {
  programmeId: string;
  unitLabel: UnitLabel;
  lengthUnits: number;
  programmePublished: boolean;
  units: UnitGridRow[];
  children: ReactNode;
}

function selectedUnitFromPath(pathname: string): string | null {
  const m = pathname.match(/\/curriculum\/unit\/([^/]+)/);
  return m ? m[1] : null;
}

export function CurriculumWorkspace({
  programmeId,
  unitLabel: label,
  lengthUnits,
  programmePublished,
  units,
  children,
}: CurriculumWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const selectedId = useMemo(() => selectedUnitFromPath(pathname), [pathname]);

  const [narrow, setNarrow] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addConfirmOpen, setAddConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 980px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Closing the slide-over on navigation is done in the click handlers
  // (rail item <Link> + Add-unit), not an effect — avoids a sync setState
  // on every route change.
  const closeRail = () => setRailOpen(false);

  const noun = label === 'WEEK' ? 'week' : 'module';
  const atCap = lengthUnits >= 52;

  // Adding a unit bumps the programme's stated length — confirm first
  // (the symmetric partner to the length-decrease confirm).
  function handleAddUnit() {
    if (atCap) {
      setError(`A programme can have at most 52 ${label === 'WEEK' ? 'weeks' : 'modules'}.`);
      return;
    }
    setError(null);
    setAddConfirmOpen(true);
  }

  function doAddUnit() {
    setError(null);
    startTransition(async () => {
      const result = await appendUnitAction(programmeId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAddConfirmOpen(false);
      router.push(
        `/tutor/programme/${programmeId}/curriculum/unit/${result.unit_id}`
      );
      router.refresh();
      closeRail();
    });
  }

  return (
    <div
      className={
        'cur-workspace' +
        (narrow ? ' is-narrow' : '') +
        (railOpen ? ' rail-open' : '')
      }
    >
      <aside className="cur-rail" aria-label="Units">
        <div className="cur-rail-head">
          <span className="cur-rail-head-title">
            {label === 'WEEK' ? 'Weeks' : 'Modules'}
          </span>
          <button
            type="button"
            className="cur-rail-add"
            onClick={handleAddUnit}
            disabled={isPending || atCap}
            title={atCap ? 'Maximum of 52 reached' : undefined}
          >
            <CurIcon name="plus" size={13} /> Add {noun}
          </button>
        </div>
        <div className="cur-rail-list">
          {units.map((unit, i) => (
            <UnitRailItem
              key={unit.unit_id}
              unit={unit}
              programmeId={programmeId}
              label={label}
              programmePublished={programmePublished}
              canMoveUp={i > 0}
              canMoveDown={i < units.length - 1}
              selected={unit.unit_id === selectedId}
              onNavigate={closeRail}
              onError={setError}
            />
          ))}
        </div>
      </aside>

      {narrow && railOpen && (
        <div className="cur-scrim" onClick={() => setRailOpen(false)} />
      )}

      <div className="cur-detail-host">
        {narrow && (
          <div className="cur-detail-mobilebar">
            <button
              type="button"
              className="cur-units-btn"
              onClick={() => setRailOpen((v) => !v)}
            >
              <CurIcon name="menu" size={16} /> Units
            </button>
          </div>
        )}
        {children}
      </div>

      {addConfirmOpen && (
        <AddUnitConfirm
          unitLabel={label}
          currentLength={lengthUnits}
          pending={isPending}
          onCancel={() => setAddConfirmOpen(false)}
          onConfirm={doAddUnit}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function UnitRailItem({
  unit,
  programmeId,
  label,
  programmePublished,
  canMoveUp,
  canMoveDown,
  selected,
  onNavigate,
  onError,
}: {
  unit: UnitGridRow;
  programmeId: string;
  label: UnitLabel;
  programmePublished: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  selected: boolean;
  onNavigate?: () => void;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [renameOpen, setRenameOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isOnlyUnit = !canMoveUp && !canMoveDown;

  const heading = unitLabel(unit.unit_index, label);
  const customTitle = formatUnitTitle(unit, label);
  const hasCustomTitle = customTitle !== heading;
  const isEmpty = unit.block_count === 0 && unit.activity_count === 0;
  const href = `/tutor/programme/${programmeId}/curriculum/unit/${unit.unit_id}`;

  function doTogglePublish() {
    startTransition(async () => {
      const result = await editUnitAction(unit.unit_id, {
        title: unit.title ?? '',
        description: unit.description ?? '',
        is_published: !unit.is_published,
      });
      if (!result.ok) {
        onError(result.error);
        return;
      }
      setUnpublishOpen(false);
      router.refresh();
    });
  }

  // Unpublishing a live unit while the programme is live pulls it
  // from students — confirm first. Publishing (or any toggle in a
  // draft programme) is silent.
  function togglePublish() {
    if (unit.is_published && programmePublished) {
      setUnpublishOpen(true);
      return;
    }
    doTogglePublish();
  }

  function reorder(direction: 'up' | 'down') {
    startTransition(async () => {
      const result = await reorderUnitAction(unit.unit_id, direction);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function doDelete() {
    startTransition(async () => {
      const result = await deleteUnitAction(unit.unit_id);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      setDeleteOpen(false);
      // If the deleted unit was the open one, land on a valid unit via
      // the index redirect; otherwise just refresh the rail in place.
      if (selected) {
        router.push(`/tutor/programme/${programmeId}/curriculum`);
      }
      router.refresh();
    });
  }

  const menuItems: CurMenuItem[] = [
    { label: 'Rename', icon: 'pencil', onClick: () => setRenameOpen(true) },
    {
      label: unit.is_published ? 'Unpublish' : 'Publish',
      icon: unit.is_published ? 'eyeOff' : 'publish',
      onClick: togglePublish,
    },
    {
      label: 'Move up',
      icon: 'arrowUp',
      disabled: !canMoveUp || isPending,
      onClick: () => reorder('up'),
    },
    {
      label: 'Move down',
      icon: 'arrowDown',
      disabled: !canMoveDown || isPending,
      onClick: () => reorder('down'),
    },
    { sep: true },
    {
      label: 'Delete',
      icon: 'trash',
      danger: true,
      disabled: isOnlyUnit || isPending,
      hint: isOnlyUnit ? 'A programme needs at least one unit' : undefined,
      onClick: () => setDeleteOpen(true),
    },
  ];

  return (
    <div
      className={
        'unit-item' +
        (selected ? ' selected' : '') +
        (isEmpty ? ' is-empty' : '')
      }
    >
      <Link
        href={href}
        className="unit-item-link"
        aria-label={`Open ${customTitle}`}
        onClick={onNavigate}
      >
        <span className="sr-only">Open {customTitle}</span>
      </Link>

      <div className="unit-item-head">
        <span className="unit-item-grip" aria-hidden="true">
          <CurIcon name="grip" size={15} />
        </span>
        <span className="unit-item-index">{heading}</span>
        <span className="unit-item-head-spacer" />
        <span className={`unit-pill ${unitStatusPillClass(unit.is_published)} sm`}>
          {unitStatusLabel(unit.is_published)}
        </span>
        <CurMenu items={menuItems} ariaLabel={`Actions for ${heading}`} tint={selected} />
      </div>

      <span className={'unit-item-title' + (hasCustomTitle ? '' : ' untitled')}>
        {hasCustomTitle ? customTitle : 'Untitled'}
      </span>

      <span className="unit-item-meta">
        {isEmpty ? (
          <span className="unit-item-empty-tag">Empty — no content yet</span>
        ) : (
          <>
            <span>{formatUnitCounts(unit.block_count, unit.activity_count)}</span>
            {unit.published_activity_count > 0 && (
              <span className="unit-item-live">
                {unit.published_activity_count} live
              </span>
            )}
          </>
        )}
      </span>

      {renameOpen && (
        <UnitFormModal
          unitId={unit.unit_id}
          unitIndex={unit.unit_index}
          programmeUnitLabel={label}
          initial={{
            title: unit.title ?? '',
            description: unit.description ?? '',
            is_published: unit.is_published,
          }}
          onClose={() => setRenameOpen(false)}
        />
      )}

      {unpublishOpen && (
        <UnpublishUnitConfirm
          unitLabel={heading}
          pending={isPending}
          onCancel={() => setUnpublishOpen(false)}
          onConfirm={doTogglePublish}
        />
      )}

      {deleteOpen && (
        <DeleteUnitConfirm
          unitLabel={heading}
          blockCount={unit.block_count}
          activityCount={unit.activity_count}
          pending={isPending}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={doDelete}
        />
      )}
    </div>
  );
}
