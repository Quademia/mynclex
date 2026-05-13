// mynclex/lib/curriculum/activity-modal.tsx
//
// Activity editor modal shell. Holds:
//   • The header (type label + Save / Cancel buttons + close).
//   • The shared fields (Title + Description + Note to student)
//     — these sit above the divider for every type per
//     curriculum-authoring-ux.md screen 6 (+ description added
//     in slice 9.3d-a).
//   • A slot below the divider that dispatches on activity type
//     to the right body component. TEXT + EXTERNAL_LINK +
//     ONLINE_LIVE_SESSION shipped in 9.3d-a; PDF in 9.3d-c; MOCK
//     + PRACTICE_QUIZ ship as placeholders in 9.3d-d (body has no
//     editable fields — just an explanation panel — pending the
//     central tutor-quiz system).
//
// Body state is a discriminated union by type so each branch
// holds exactly the fields its editor needs. Initial body in
// create mode = empty defaults for the chosen type; in edit
// mode = parsed from activity.payload via per-type readers.
//
// Cancel with unsaved edits surfaces <DiscardConfirm> — same
// guard pattern as <ProgrammeFormModal> / <CohortFormModal>.

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import { TextEditor } from './text-editor';
import { ExternalLinkEditor } from './external-link-editor';
import { OnlineLiveSessionEditor } from './online-live-session-editor';
import { PdfEditor } from './pdf-editor';
import { QuizPlaceholderEditor } from './quiz-placeholder-editor';
import {
  createActivityAction,
  editActivityAction,
  getOwnedAssetPreviewAction,
} from './actions';
import type {
  ActivityFormValues,
  ActivityType,
  ExternalLinkActivityBodyValues,
  OnlineLiveSessionActivityBodyValues,
  PdfActivityBodyValues,
  PdfActivityPreview,
  ProgrammeActivity,
  TextActivityBodyValues,
} from './types';

type ActivityModalProps =
  | {
      mode: 'create';
      unitId: string;
      type: ActivityType;
      // null → loose under the unit. Set → append to that block.
      blockId: string | null;
      onClose: () => void;
    }
  | {
      mode: 'edit';
      activity: ProgrammeActivity;
      onClose: () => void;
    };

// Display name in the modal header by activity type. Mirrors the
// picker copy in activity-picker.tsx.
const TYPE_LABELS: Record<ActivityType, string> = {
  TEXT: 'Text content',
  PDF: 'PDF upload',
  EXTERNAL_LINK: 'External link',
  ONLINE_LIVE_SESSION: 'Online live session',
  MOCK: 'Mock assessment',
  PRACTICE_QUIZ: 'Practice quiz',
};

// Discriminated body-state by activity type. The four editor-
// enabled types each carry their own value shape. MOCK +
// PRACTICE_QUIZ have no editable body fields today (placeholders
// per slice 9.3d-d) — they carry an empty marker. UNSUPPORTED
// stays as defence-in-depth for any future type the modal hasn't
// learned about yet.
type EditorBodyState =
  | { type: 'TEXT'; values: TextActivityBodyValues }
  | { type: 'PDF'; values: PdfActivityBodyValues }
  | { type: 'EXTERNAL_LINK'; values: ExternalLinkActivityBodyValues }
  | {
      type: 'ONLINE_LIVE_SESSION';
      values: OnlineLiveSessionActivityBodyValues;
    }
  | { type: 'MOCK' }
  | { type: 'PRACTICE_QUIZ' }
  | { type: 'UNSUPPORTED' };

// ---------- Per-type initial body readers ----------

function emptyBody(type: ActivityType): EditorBodyState {
  switch (type) {
    case 'TEXT':
      return { type, values: { body: '', estimated_minutes: '' } };
    case 'PDF':
      return { type, values: { pdf_asset_id: null, estimated_minutes: '' } };
    case 'EXTERNAL_LINK':
      return { type, values: { url: '', estimated_minutes: '' } };
    case 'ONLINE_LIVE_SESSION':
      return {
        type,
        values: {
          scheduled_at: '',
          duration_minutes: '',
          join_url: '',
          recording_url: '',
        },
      };
    case 'MOCK':
      return { type };
    case 'PRACTICE_QUIZ':
      return { type };
    default:
      return { type: 'UNSUPPORTED' };
  }
}

function bodyFromActivity(activity: ProgrammeActivity): EditorBodyState {
  const p = activity.payload as Record<string, unknown>;
  const asStr = (v: unknown) => (typeof v === 'string' ? v : '');
  const asNumStr = (v: unknown) =>
    typeof v === 'number' ? String(v) : '';

  switch (activity.type) {
    case 'TEXT':
      return {
        type: 'TEXT',
        values: {
          body: asStr(p.body),
          estimated_minutes: asNumStr(p.estimated_minutes),
        },
      };
    case 'PDF':
      return {
        type: 'PDF',
        values: {
          pdf_asset_id: asStr(p.pdf_asset_id) || null,
          estimated_minutes: asNumStr(p.estimated_minutes),
        },
      };
    case 'EXTERNAL_LINK':
      return {
        type: 'EXTERNAL_LINK',
        values: {
          url: asStr(p.url),
          estimated_minutes: asNumStr(p.estimated_minutes),
        },
      };
    case 'ONLINE_LIVE_SESSION': {
      const iso = asStr(p.scheduled_at);
      return {
        type: 'ONLINE_LIVE_SESSION',
        values: {
          scheduled_at: iso ? utcIsoToLocalInput(iso) : '',
          duration_minutes: asNumStr(p.duration_minutes),
          join_url: asStr(p.join_url),
          recording_url: asStr(p.recording_url),
        },
      };
    }
    case 'MOCK':
      return { type: 'MOCK' };
    case 'PRACTICE_QUIZ':
      return { type: 'PRACTICE_QUIZ' };
    default:
      return { type: 'UNSUPPORTED' };
  }
}

// UTC ISO → local "YYYY-MM-DDTHH:MM" for the datetime-local input.
function utcIsoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

// ---------- Dirty comparison ----------

function bodyEqual(a: EditorBodyState, b: EditorBodyState): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'TEXT' && b.type === 'TEXT') {
    return (
      a.values.body === b.values.body &&
      a.values.estimated_minutes === b.values.estimated_minutes
    );
  }
  if (a.type === 'PDF' && b.type === 'PDF') {
    return (
      a.values.pdf_asset_id === b.values.pdf_asset_id &&
      a.values.estimated_minutes === b.values.estimated_minutes
    );
  }
  if (a.type === 'EXTERNAL_LINK' && b.type === 'EXTERNAL_LINK') {
    return (
      a.values.url === b.values.url &&
      a.values.estimated_minutes === b.values.estimated_minutes
    );
  }
  if (a.type === 'ONLINE_LIVE_SESSION' && b.type === 'ONLINE_LIVE_SESSION') {
    return (
      a.values.scheduled_at === b.values.scheduled_at &&
      a.values.duration_minutes === b.values.duration_minutes &&
      a.values.join_url === b.values.join_url &&
      a.values.recording_url === b.values.recording_url
    );
  }
  return true; // MOCK / PRACTICE_QUIZ / UNSUPPORTED — no editable fields
}

// ---------- Component ----------

export function ActivityModal(props: ActivityModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  const isEdit = props.mode === 'edit';
  const activityType = isEdit ? props.activity.type : props.type;
  const typeLabel = TYPE_LABELS[activityType];

  // Shell fields — Title + Description + Note + Live/Draft.
  // Pre-fill in edit mode; defaults on create (is_published =
  // false matches the DB default and the unit/block modal pattern).
  const [title, setTitle] = useState(isEdit ? props.activity.title : '');
  const [description, setDescription] = useState(
    isEdit ? (props.activity.description ?? '') : ''
  );
  const [note, setNote] = useState(isEdit ? (props.activity.note ?? '') : '');
  const [isPublished, setIsPublished] = useState(
    isEdit ? props.activity.is_published : false
  );

  // Type-specific body state — discriminated union.
  const initialBody: EditorBodyState = isEdit
    ? bodyFromActivity(props.activity)
    : emptyBody(activityType);
  const [body, setBody] = useState<EditorBodyState>(initialBody);

  // PDF preview metadata. Fetched whenever a PDF asset becomes
  // attached — both in edit-mode initial load (if the activity
  // already has a pdf_asset_id) and after a fresh upload. Cleared
  // on Replace. The current pdf_asset_id is the dep that drives
  // the fetch; the action mints a 1-hour signed URL via service
  // role (the asset table's RLS already gates ownership at the
  // SELECT).
  const [pdfPreview, setPdfPreview] = useState<PdfActivityPreview | null>(null);

  const currentPdfAssetId =
    body.type === 'PDF' ? body.values.pdf_asset_id : null;

  useEffect(() => {
    if (currentPdfAssetId === null) {
      setPdfPreview(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await getOwnedAssetPreviewAction(currentPdfAssetId);
      if (cancelled) return;
      if (result.ok) {
        setPdfPreview({
          original_filename: result.original_filename,
          size_bytes: result.size_bytes,
          signed_url: result.signed_url,
        });
      } else {
        setPdfPreview(null);
        setError(result.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentPdfAssetId]);

  // Track dirty state so Cancel surfaces the discard guard.
  const initialTitle = isEdit ? props.activity.title : '';
  const initialDescription = isEdit ? (props.activity.description ?? '') : '';
  const initialNote = isEdit ? (props.activity.note ?? '') : '';
  const initialIsPublished = isEdit ? props.activity.is_published : false;
  const isDirty =
    title !== initialTitle ||
    description !== initialDescription ||
    note !== initialNote ||
    isPublished !== initialIsPublished ||
    !bodyEqual(body, initialBody);

  function attemptClose() {
    if (isPending) return;
    if (isDirty) setShowDiscard(true);
    else props.onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') attemptClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, isPending]);

  // Parse body state → ActivityFormValues for the server action.
  // Returns null and sets error if client-side validation fails;
  // the server re-validates everything regardless.
  function buildValues(): ActivityFormValues | null {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setError('Title is required.');
      return null;
    }
    const common = {
      title: trimmedTitle,
      description,
      note,
      is_published: isPublished,
    };

    if (body.type === 'TEXT') {
      const emRaw = body.values.estimated_minutes.trim();
      const em = emRaw === '' ? null : parseInt(emRaw, 10);
      if (em !== null && (!Number.isInteger(em) || em < 1)) {
        setError('Estimated time must be a positive number, or blank.');
        return null;
      }
      return {
        type: 'TEXT',
        ...common,
        body: body.values.body,
        estimated_minutes: em,
      };
    }

    if (body.type === 'PDF') {
      if (body.values.pdf_asset_id === null) {
        setError('Please upload a PDF before saving.');
        return null;
      }
      const emRaw = body.values.estimated_minutes.trim();
      const em = emRaw === '' ? null : parseInt(emRaw, 10);
      if (em !== null && (!Number.isInteger(em) || em < 1)) {
        setError('Estimated time must be a positive number, or blank.');
        return null;
      }
      return {
        type: 'PDF',
        ...common,
        pdf_asset_id: body.values.pdf_asset_id,
        estimated_minutes: em,
      };
    }

    if (body.type === 'EXTERNAL_LINK') {
      const url = body.values.url.trim();
      if (url.length === 0) {
        setError('URL is required.');
        return null;
      }
      const emRaw = body.values.estimated_minutes.trim();
      const em = emRaw === '' ? null : parseInt(emRaw, 10);
      if (em !== null && (!Number.isInteger(em) || em < 1)) {
        setError('Estimated time must be a positive number, or blank.');
        return null;
      }
      return {
        type: 'EXTERNAL_LINK',
        ...common,
        url,
        estimated_minutes: em,
      };
    }

    if (body.type === 'MOCK') {
      return { type: 'MOCK', ...common };
    }

    if (body.type === 'PRACTICE_QUIZ') {
      return { type: 'PRACTICE_QUIZ', ...common };
    }

    if (body.type === 'ONLINE_LIVE_SESSION') {
      const sched = body.values.scheduled_at.trim();
      if (sched.length === 0) {
        setError('Session date and time are required.');
        return null;
      }
      let scheduledIso: string;
      const d = new Date(sched);
      if (isNaN(d.getTime())) {
        setError('Session date/time is not valid.');
        return null;
      }
      scheduledIso = d.toISOString();

      const durRaw = body.values.duration_minutes.trim();
      if (durRaw === '') {
        setError('Duration is required.');
        return null;
      }
      const dur = parseInt(durRaw, 10);
      if (!Number.isInteger(dur) || dur < 1) {
        setError('Duration must be a positive whole number of minutes.');
        return null;
      }

      const joinUrl = body.values.join_url.trim();
      if (joinUrl.length === 0) {
        setError('Join URL is required.');
        return null;
      }

      const recordingUrlTrimmed = body.values.recording_url.trim();
      const recording_url =
        recordingUrlTrimmed === '' ? null : recordingUrlTrimmed;

      return {
        type: 'ONLINE_LIVE_SESSION',
        ...common,
        scheduled_at: scheduledIso,
        duration_minutes: dur,
        join_url: joinUrl,
        recording_url,
      };
    }

    setError('This activity type is not editable yet.');
    return null;
  }

  function handleSubmit() {
    setError(null);
    const values = buildValues();
    if (values === null) return;

    startTransition(async () => {
      const result = isEdit
        ? await editActivityAction(props.activity.activity_id, values)
        : await createActivityAction(props.unitId, values, props.blockId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      props.onClose();
      router.refresh();
    });
  }

  const headerTitle = isEdit ? `Edit · ${typeLabel}` : `New · ${typeLabel}`;
  const submitLabel = isEdit
    ? isPending
      ? 'Saving…'
      : 'Save changes'
    : isPending
      ? 'Creating…'
      : 'Add activity';

  return (
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={headerTitle}
        onClick={(e) => {
          if (e.target === e.currentTarget) attemptClose();
        }}
      >
        <div className="prog-modal activity-modal">
          <header className="prog-modal-header">
            <h2 className="prog-modal-title">{headerTitle}</h2>
            <button
              type="button"
              className="prog-modal-close"
              aria-label="Close"
              onClick={attemptClose}
              disabled={isPending}
            >
              ✕
            </button>
          </header>

          <div className="prog-modal-body activity-modal-body">
            <section className="prog-form-section">
              <label className="prog-field">
                <span className="prog-field-label">
                  Title <span className="prog-required">*</span>
                </span>
                <input
                  type="text"
                  className="prog-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isPending}
                  autoFocus
                />
              </label>

              <label className="prog-field">
                <span className="prog-field-label">Description</span>
                <textarea
                  className="prog-input"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isPending}
                  placeholder="Optional. What this activity is about — appears under the title on the student's checklist."
                />
              </label>

              <label className="prog-field">
                <span className="prog-field-label">Note to student</span>
                <textarea
                  className="prog-input"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={isPending}
                  placeholder="Optional. A directive shown above the activity body (e.g., when to do it)."
                />
              </label>

              <div className="prog-field">
                <span className="prog-field-label">Status</span>
                <label className="prog-toggle prog-toggle-inline">
                  <input
                    type="checkbox"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
                    disabled={isPending}
                  />
                  <span>Live — student-visible in cohorts</span>
                </label>
                <span className="prog-field-help">
                  Off → Draft. Draft activities don&apos;t surface in
                  any cohort&apos;s checklist.
                </span>
              </div>
            </section>

            <div className="activity-modal-divider" />

            {body.type === 'TEXT' && (
              <TextEditor
                values={body.values}
                onChange={(values) =>
                  setBody({ type: 'TEXT', values })
                }
                disabled={isPending}
              />
            )}

            {body.type === 'PDF' && (
              <PdfEditor
                values={body.values}
                onChange={(values) =>
                  setBody({ type: 'PDF', values })
                }
                preview={pdfPreview}
                onUploaded={(assetId) =>
                  setBody({
                    type: 'PDF',
                    values: { ...body.values, pdf_asset_id: assetId },
                  })
                }
                onClearAsset={() =>
                  setBody({
                    type: 'PDF',
                    values: { ...body.values, pdf_asset_id: null },
                  })
                }
                disabled={isPending}
              />
            )}

            {body.type === 'EXTERNAL_LINK' && (
              <ExternalLinkEditor
                values={body.values}
                onChange={(values) =>
                  setBody({ type: 'EXTERNAL_LINK', values })
                }
                disabled={isPending}
              />
            )}

            {body.type === 'ONLINE_LIVE_SESSION' && (
              <OnlineLiveSessionEditor
                values={body.values}
                onChange={(values) =>
                  setBody({ type: 'ONLINE_LIVE_SESSION', values })
                }
                disabled={isPending}
              />
            )}

            {body.type === 'MOCK' && (
              <QuizPlaceholderEditor type="MOCK" />
            )}

            {body.type === 'PRACTICE_QUIZ' && (
              <QuizPlaceholderEditor type="PRACTICE_QUIZ" />
            )}

            {body.type === 'UNSUPPORTED' && (
              <p className="activity-editor-unsupported">
                This activity type&apos;s editor isn&apos;t available yet.
              </p>
            )}
          </div>

          <footer className="prog-modal-footer">
            <button
              type="button"
              className="prog-btn prog-btn-ghost"
              onClick={attemptClose}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="prog-btn prog-btn-primary"
              onClick={handleSubmit}
              disabled={isPending || title.trim() === ''}
            >
              {submitLabel}
            </button>
          </footer>
        </div>
      </div>

      {showDiscard && (
        <DiscardConfirm
          onKeepEditing={() => setShowDiscard(false)}
          onDiscard={() => {
            setShowDiscard(false);
            props.onClose();
          }}
          pending={isPending}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}
