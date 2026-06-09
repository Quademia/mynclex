// mynclex/lib/programmes/programme-card-menu.tsx
//
// The card-corner ⋯ menu on /tutor/programmes. Replaces the single Edit
// pencil with the lifecycle actions the programme backend actually
// supports — Edit · Publish · Archive — surfaced at the list level so a
// tutor doesn't have to open the Overview page for them. Pure
// COMPOSITION: every action + dialog already exists; this wires them to
// a dropdown.
//   • Edit    → the shared ProgrammeFormModal (edit mode).
//   • Publish → publishProgrammeAction (DRAFT → PUBLISHED), one click.
//   • Archive → ProgrammeArchiveConfirm (type-DELETE) → archiveProgrammeAction.
//
// Deliberately NOT here: Unpublish / Restore / Delete. The programme
// lifecycle is one-way (DRAFT → PUBLISHED → ARCHIVED, archived terminal)
// and there is no delete action — a programme owns cohorts, enrolments,
// and payments. Adding those is a separate product decision.
//
// Same job as the Overview page's <ProgrammeStatusControls> — both call
// the same server actions + the same archive confirm; this is a second
// entry point, not a fork. Rendered only on non-archived cards (an
// archived card has no actionable lifecycle, matching Overview).
//
// Lives as a sibling of the card's overlay <Link>; clicks stop
// propagation so the card doesn't navigate.

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { ProgrammeArchiveConfirm } from '@/lib/overlays/programmes/programme-archive-confirm';
import { ProgIcon } from './prog-icon';
import { ProgrammeFormModal } from './programme-form-modal';
import { archiveProgrammeAction, publishProgrammeAction } from './actions';
import type { ProgrammeCardRow, ProgrammeFormValues } from './types';

export function ProgrammeCardMenu({ programme }: { programme: ProgrammeCardRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveText, setArchiveText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isDraft = programme.status === 'DRAFT';
  const isPublished = programme.status === 'PUBLISHED';

  const editInitial: ProgrammeFormValues = {
    title: programme.title,
    tagline: programme.tagline,
    description: programme.description,
    delivery_mode: programme.delivery_mode,
    unit_label: programme.unit_label,
    length_units: programme.length_units,
    price_currency: programme.price_currency,
    show_price_publicly: programme.show_price_publicly,
    payment_collection_mode: programme.payment_collection_mode,
    access_window_days: programme.access_window_days,
    // upfront_total_minor is nullable (transient no-plan case); the form
    // treats it as the canonical full-price field, so coalesce to 0.
    upfront_total_minor: programme.upfront_total_minor ?? 0,
  };

  function handlePublish() {
    setOpen(false);
    setError(null);
    startTransition(async () => {
      const result = await publishProgrammeAction(programme.programme_id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function openArchive() {
    setOpen(false);
    setArchiveText('');
    setArchiveOpen(true);
  }

  function confirmArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveProgrammeAction(programme.programme_id);
      if (!result.ok) {
        setError(result.error);
        setArchiveOpen(false);
        setArchiveText('');
        return;
      }
      setArchiveOpen(false);
      setArchiveText('');
      router.refresh();
    });
  }

  return (
    <div className={`programme-card-menu ${open ? 'is-open' : ''}`} ref={ref}>
      <button
        type="button"
        className="programme-card-menu-btn"
        aria-label={`Actions for ${programme.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <ProgIcon name="more" size={18} />
      </button>

      {open && (
        <div className="programme-card-menu-pop" role="menu">
          <button
            type="button"
            className="programme-card-menu-item"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setEditOpen(true);
            }}
          >
            <ProgIcon name="pencil" size={15} />
            Edit
          </button>

          {isDraft && (
            <button
              type="button"
              className="programme-card-menu-item"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handlePublish();
              }}
            >
              <ProgIcon name="check" size={15} />
              Publish
            </button>
          )}

          <button
            type="button"
            className="programme-card-menu-item is-danger"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openArchive();
            }}
          >
            <ProgIcon name="archive" size={15} />
            Archive
          </button>
        </div>
      )}

      {editOpen && (
        <ProgrammeFormModal
          mode="edit"
          programmeId={programme.programme_id}
          initial={editInitial}
          onClose={() => setEditOpen(false)}
        />
      )}

      {archiveOpen && (
        <ProgrammeArchiveConfirm
          programmeTitle={programme.title}
          isCurrentlyPublished={isPublished}
          deleteText={archiveText}
          pending={isPending}
          onTextChange={setArchiveText}
          onCancel={() => {
            if (isPending) return;
            setArchiveOpen(false);
            setArchiveText('');
          }}
          onConfirm={confirmArchive}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </div>
  );
}
