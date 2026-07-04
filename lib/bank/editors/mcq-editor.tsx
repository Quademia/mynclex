// mynclex/lib/bank/editors/mcq-editor.tsx
//
// MCQ editor — first concrete editor in the rebuild. One file holds
// every piece needed to author an MCQ:
//
//   - McqOptionList    : private — the option-list edit row
//                        (radio, rich text, rich feedback, remove).
//   - McqPreview       : private — the live pre-submit student view.
//   - McqEditorBody    : exported — the two-pane edit + preview body.
//                        Mountable anywhere (modal, wrapper-page pane).
//                        Receives `error` + `pending` from its host so
//                        it can show validation errors inline.
//   - McqEditor        : exported — the body wrapped in <ModalFrame>,
//                        used as the default standalone host. Wires
//                        the save / delete server actions, manages
//                        the typed-DELETE confirmation, and closes
//                        the modal on success.
//
// Slice 6a: the content fields (instruction, stem, every option text +
// per-option feedback, rationale) are RICH. The Content tab carries ONE
// roving toolbar (lib/authoring/roving-rich.tsx) that drives whichever field
// is focused. Each rich field stores its document as JSON in a hidden input,
// so the FormData save path is unchanged — the stem/option/feedback/rationale
// columns now hold Tiptap JSON (read-coerced on the way back; no migration).

'use client';

import { useState } from 'react';
import {
  OPTION_LETTERS,
  MIN_OPTIONS,
  MAX_OPTIONS,
  DEFAULT_OPTIONS,
} from '@/lib/bank/classifications';
import { ModalFrame } from '@/lib/bank/atoms/modal-frame';
import { EditorActions } from '@/lib/bank/atoms/editor-actions';
import { EditorTabs, TabPanel } from '@/lib/bank/atoms/editor-tabs';
import { EditorAuthorship } from '@/lib/audit/authorship-line';
import { ClassificationFields } from '@/lib/bank/atoms/classification-fields';
import { HousekeepingFields } from '@/lib/bank/atoms/housekeeping-fields';
import { HiddenItemInputs } from '@/lib/bank/atoms/hidden-item-inputs';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { DeleteConfirm } from '@/lib/overlays/bank/delete-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import {
  PreviewToggle,
  type PreviewViewMode,
} from '@/lib/bank/atoms/preview-toggle';
import { useSaveAction } from '@/lib/bank/hooks/use-save-action';
import { useDirtyGuard } from '@/lib/bank/hooks/use-dirty-guard';
import {
  saveQuestionAction,
  type SaveResult,
} from '@/lib/bank/actions/save-question';
import {
  deleteQuestionAction,
  type DeleteResult,
} from '@/lib/bank/actions/delete-question';
import {
  RovingProvider,
  RovingToolbar,
  RovingRichField,
} from '@/lib/authoring/roving-rich';
import {
  RichInstructionField,
  RichStemField,
  RichRationaleFields,
  STEM_IMAGE_KEYS,
} from '@/lib/authoring/rich-atoms';
import { RichRender } from '@/lib/authoring/rich-render';
import { curatorBankImageRenderer } from '@/lib/authoring/bank-image-render';
import { richTextToPlainLabel } from '@/lib/authoring/bank-image-doc';
import { useAuthUploadsInFlight } from '@/lib/authoring/use-uploads-in-flight';
import {
  parseRichDoc,
  isEmptyRichDoc,
  type RichDoc,
} from '@/lib/authoring/rich-doc';
import type { McqEditorInitial } from './mcq-row-mapper';

// Re-export the shape so existing client callers can keep importing
// it from this file. The canonical definition (and the empty-initial
// constructor) live in mcq-row-mapper.ts so server pages can build
// one without crossing the 'use client' boundary.
export type { McqEditorInitial };

// ─────────────────────────────────────────────────────────────
// McqOptionList — option-list editor (private to this file).
// Text + feedback are rich docs driven by the roving toolbar.
// ─────────────────────────────────────────────────────────────

interface OptionRow {
  id: string;
  text: RichDoc;
  feedback: RichDoc;
}

interface McqOptionListProps {
  options: OptionRow[];
  correctId: string;
  onChange: (next: OptionRow[], correctId: string) => void;
  disabled: boolean;
}

function McqOptionList({ options, correctId, onChange, disabled }: McqOptionListProps) {
  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    const nextLetter = OPTION_LETTERS[options.length];
    onChange([...options, { id: nextLetter, text: emptyDoc(), feedback: emptyDoc() }], correctId);
  }

  function removeOption(idx: number) {
    if (options.length <= MIN_OPTIONS) return;
    const removedId = options[idx].id;
    onChange(
      options.filter((_, i) => i !== idx),
      correctId === removedId ? '' : correctId,
    );
  }

  function updateText(idx: number, text: RichDoc) {
    onChange(
      options.map((o, i) => (i === idx ? { ...o, text } : o)),
      correctId,
    );
  }

  function updateFeedback(idx: number, feedback: RichDoc) {
    onChange(
      options.map((o, i) => (i === idx ? { ...o, feedback } : o)),
      correctId,
    );
  }

  function pickCorrect(id: string) {
    onChange(options, id);
  }

  return (
    <div className="auth-fg">
      <div className="auth-label-row">
        <label className="auth-label">Options *</label>
        <button
          type="button"
          className="auth-link-btn"
          onClick={addOption}
          disabled={disabled || options.length >= MAX_OPTIONS}
        >
          + Add option
        </button>
      </div>
      <p className="auth-hint">Mark one correct option.</p>

      {options.map((opt, idx) => (
        <div key={opt.id} className="auth-option-row">
          <div className="auth-option-correct">
            <input
              type="radio"
              name="correct_id"
              value={opt.id}
              checked={correctId === opt.id}
              onChange={() => pickCorrect(opt.id)}
              disabled={disabled}
              title="Mark as correct"
            />
          </div>
          <div className="auth-option-letter">{opt.id}</div>
          <div className="auth-option-fields">
            <RovingRichField
              fieldKey={`opt:${opt.id}:text`}
              name="option_text"
              value={opt.text}
              onChange={(doc) => updateText(idx, doc)}
              inline
              className="auth-rrf-option"
              ariaLabel={`Option ${opt.id} text`}
              placeholder={`Option ${opt.id} text…`}
            />
            <RovingRichField
              fieldKey={`opt:${opt.id}:fb`}
              name="option_feedback"
              value={opt.feedback}
              onChange={(doc) => updateFeedback(idx, doc)}
              inline
              className="auth-rrf-option-fb"
              ariaLabel={`Option ${opt.id} feedback`}
              placeholder="Per-option feedback (optional)…"
            />
            <input type="hidden" name="option_id" value={opt.id} />
          </div>
          <button
            type="button"
            className="auth-row-remove"
            onClick={() => removeOption(idx)}
            disabled={disabled || options.length <= MIN_OPTIONS}
            title="Remove option"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// McqPreview — dual-mode preview (private).
// Student view: empty radios.
// Answer-key view: option matching `correctId` highlighted with a
// filled green radio + "✓ Correct" pill. All content rendered rich.
// ─────────────────────────────────────────────────────────────

interface McqPreviewProps {
  instruction: RichDoc;
  stem: RichDoc;
  options: OptionRow[];
  correctId: string;
  viewMode: PreviewViewMode;
  onViewModeChange: (next: PreviewViewMode) => void;
}

export function McqPreview({
  instruction,
  stem,
  options,
  correctId,
  viewMode,
  onViewModeChange,
}: McqPreviewProps) {
  const headerText =
    viewMode === 'answer-key'
      ? 'Answer key · curator view'
      : 'Pre-submit · student view';

  return (
    <div className="auth-preview-card">
      <div className="auth-preview-card-header">
        <div className="auth-preview-card-header-text">{headerText}</div>
        <PreviewToggle value={viewMode} onChange={onViewModeChange} />
      </div>
      <div className="auth-preview-card-body">
        {!isEmptyRichDoc(instruction) && (
          <p className="auth-preview-instruction">
            <RichRender doc={instruction} inline />
          </p>
        )}
        <div className="auth-preview-stem">
          {isEmptyRichDoc(stem) ? (
            <span className="auth-preview-placeholder">Stem appears here…</span>
          ) : (
            <RichRender doc={stem} custom={curatorBankImageRenderer} />
          )}
        </div>
        <ol className="auth-preview-options">
          {options.length === 0 && (
            <li className="auth-preview-placeholder">Options appear here as you add them.</li>
          )}
          {options.map((opt) => {
            const isCorrect = viewMode === 'answer-key' && opt.id === correctId;
            return (
              <li
                key={opt.id}
                className={
                  'auth-preview-option' +
                  (isCorrect ? ' auth-preview-option-correct' : '')
                }
              >
                <span
                  className={
                    isCorrect ? 'auth-preview-radio-correct' : 'auth-preview-radio'
                  }
                  aria-hidden="true"
                />
                <span className="auth-preview-letter">{opt.id}.</span>
                <span className="auth-preview-text">
                  {isEmptyRichDoc(opt.text) ? (
                    <span className="auth-preview-placeholder">Option {opt.id} text…</span>
                  ) : (
                    <RichRender doc={opt.text} inline />
                  )}
                </span>
                {isCorrect && (
                  <span className="auth-preview-correct-pill">✓ Correct</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// McqEditorBody — the two-pane body. Mountable anywhere.
// Submits via its parent's onSubmit callback; renders error / pending
// state passed in from the host.
// ─────────────────────────────────────────────────────────────

const FORM_ID = 'auth-mcq-form';

export interface McqEditorBodyProps {
  initial: McqEditorInitial;
  error: string | null;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  /**
   * Optional. Called on every edit so the host's dirty guard can flip
   * dirty=true. Native inputs fire the form's onInput; rich fields write
   * their value through React (no input event), so the rich change
   * handlers call this explicitly.
   */
  onDirty?: () => void;
  /**
   * Optional. Called when the toast is dismissed (auto or click) so
   * the host can clear any server-side error it owns. Body still
   * clears its own client validation error regardless.
   */
  onErrorDismiss?: () => void;
}

export function McqEditorBody({
  initial,
  error,
  pending,
  onSubmit,
  onDirty,
  onErrorDismiss,
}: McqEditorBodyProps) {
  const [tab, setTab] = useState<'content' | 'classification' | 'housekeeping'>('content');
  // Client-side validation surfaces through the same toast that shows
  // server errors. Pre-submit guard checks each tab; if anything's
  // missing we jump to the offending tab and raise a toast instead of
  // letting the server reject blind.
  const [clientError, setClientError] = useState<string | null>(null);
  // Dual-mode preview — defaults to 'student' (matches the prior
  // single-mode behaviour). Curator can flip to 'answer-key' to verify
  // the correct option highlights as expected.
  const [viewMode, setViewMode] = useState<PreviewViewMode>('student');
  // Slice 8 — hold Save while a stem-image upload is in flight (saving
  // then would persist a not-yet-filled image block).
  const uploadsInFlight = useAuthUploadsInFlight();

  // Content state — all rich. Seed from the stored column values via
  // parseRichDoc (legacy plain text wraps as paragraphs; no migration).
  const [stem, setStem] = useState<RichDoc>(() => parseRichDoc(initial.stem));
  const [instruction, setInstruction] = useState<RichDoc>(() => parseRichDoc(initial.instruction));
  const [rationale, setRationale] = useState<RichDoc>(() => parseRichDoc(initial.rationale));
  const [options, setOptions] = useState<OptionRow[]>(() =>
    initial.options.length > 0
      ? initial.options.map((o) => ({
          id: o.id,
          text: parseRichDoc(o.text),
          feedback: parseRichDoc(o.feedback),
        }))
      : defaultOptionRows(),
  );
  const [correctId, setCorrectId] = useState<string>(initial.correct_id);
  // Lifted out of <ClassificationFields> so the tab strip can show a
  // red-dot indicator when the required Client Needs category is unset.
  const [category, setCategory] = useState(initial.client_needs_category);

  // Rich-edit wrappers also flip the dirty guard (no input event fires).
  function markDirty() {
    onDirty?.();
  }

  // Per-tab incompleteness — drives the red-dot indicator.
  const optionsWithText = options.filter((o) => !isEmptyRichDoc(o.text)).length;
  const contentIncomplete =
    isEmptyRichDoc(stem) || !correctId || optionsWithText < MIN_OPTIONS;
  const classificationIncomplete = !category;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (uploadsInFlight) {
      setClientError('An image is still uploading — give it a moment, then save.');
      return;
    }
    if (contentIncomplete) {
      setTab('content');
      setClientError('Fill in the required fields on Content to continue.');
      return;
    }
    if (classificationIncomplete) {
      setTab('classification');
      setClientError('Pick a Client Needs category to continue.');
      return;
    }
    setClientError(null);
    onSubmit(new FormData(e.currentTarget));
  }

  function dismissError() {
    setClientError(null);
    onErrorDismiss?.();
  }

  return (
    <form
      id={FORM_ID}
      className="auth-form"
      noValidate
      onSubmit={handleSubmit}
      onInput={onDirty}
    >
      <HiddenItemInputs type="MCQ" itemId={initial.itemId} surface={initial.surface} parentNoteId={initial.parentNoteId} />

      <ErrorToast error={error ?? clientError} onDismiss={dismissError} />

      <EditorAuthorship
        realm={initial.surface}
        entityType={initial.surface === 'tutor' ? 'tutor_question' : 'bank_item'}
        itemId={initial.itemId}
        title={richTextToPlainLabel(initial.stem)}
      />
      <RovingProvider>
        <div className="auth-split">
          <div className="auth-edit">
            <EditorTabs
              tabs={[
                { id: 'content',        label: 'Content',        incomplete: contentIncomplete },
                { id: 'classification', label: 'Classification', incomplete: classificationIncomplete },
                { id: 'housekeeping',   label: 'Housekeeping' },
              ]}
              active={tab}
              onChange={(id) => setTab(id as typeof tab)}
            >
              <TabPanel id="content">
                <RovingToolbar
                  hint="Click into a field to format it"
                  imageFieldKeys={STEM_IMAGE_KEYS}
                />
                <RichInstructionField
                  value={instruction}
                  onChange={(doc) => { setInstruction(doc); markDirty(); }}
                />
                <RichStemField
                  value={stem}
                  onChange={(doc) => { setStem(doc); markDirty(); }}
                />
                <McqOptionList
                  options={options}
                  correctId={correctId}
                  onChange={(opts, cid) => {
                    setOptions(opts);
                    setCorrectId(cid);
                    markDirty();
                  }}
                  disabled={pending}
                />
                <RichRationaleFields
                  rationale={rationale}
                  onRationaleChange={(doc) => { setRationale(doc); markDirty(); }}
                  defaultRationaleImg={initial.rationale_img}
                />
              </TabPanel>

              <TabPanel id="classification">
                <ClassificationFields
                  category={category}
                  onCategoryChange={setCategory}
                  defaults={{
                    client_needs_subcategory: initial.client_needs_subcategory,
                    nursing_subject: initial.nursing_subject,
                    body_system: initial.body_system,
                    topic: initial.topic,
                    subtopic: initial.subtopic,
                    difficulty: initial.difficulty,
                    bloom_level: initial.bloom_level,
                    tags: initial.tags,
                  }}
                />
              </TabPanel>

              <TabPanel id="housekeeping">
                <HousekeepingFields
                  mode={initial.mode}
                  questionType="MCQ"
                  defaults={{
                    // Per bank-marks-and-scoring §5.2: MCQ max is fixed at 1.
                    marks: 1,
                    question_ref: initial.question_ref,
                    batch_id: initial.batch_id,
                    is_published: initial.is_published,
                    is_free_sample: initial.is_free_sample,
                    is_builder_visible: initial.is_builder_visible,
                    shuffle_options: initial.shuffle_options,
                  }}
                />
              </TabPanel>
            </EditorTabs>
          </div>

          <div className="auth-preview">
            <McqPreview
              instruction={instruction}
              stem={stem}
              options={options}
              correctId={correctId}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          </div>
        </div>
      </RovingProvider>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// McqEditor — default standalone modal host.
// Owns the save / delete action wiring and the typed-DELETE
// confirmation flow.
// ─────────────────────────────────────────────────────────────

export interface McqEditorProps {
  initial: McqEditorInitial;
  /** Closes the modal — caller decides what to do on close. */
  onClose: () => void;
  /** Called after a successful save. Caller typically refetches or revalidates. */
  onSaved?: (result: { item_id: string; created: boolean }) => void;
  /** Called after a successful delete. */
  onDeleted?: (item_id: string) => void;
}

export function McqEditor({ initial, onClose, onSaved, onDeleted }: McqEditorProps) {
  const isEdit = initial.itemId !== null;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  // Dirty guard — intercepts close attempts when the form has
  // unsaved edits. Defined first so the save / delete onSuccess
  // handlers below can call clearDirty() before onClose().
  const guard = useDirtyGuard({
    onClose,
    onSaveAndClose: () => {
      // Programmatic submit. The form's own onSubmit then fires
      // useSaveAction.submit which goes through the same path as
      // clicking Save in the modal header.
      const form = document.getElementById(FORM_ID);
      if (form instanceof HTMLFormElement) form.requestSubmit();
    },
  });

  const save = useSaveAction<SaveResult>(saveQuestionAction, {
    onSuccess: (result) => {
      if (result.ok) {
        guard.clearDirty();
        onSaved?.({ item_id: result.item_id, created: result.created });
        onClose();
      }
    },
  });

  const del = useSaveAction<DeleteResult>(deleteQuestionAction, {
    onSuccess: (result) => {
      if (result.ok) {
        // Delete throws away the row entirely; no point keeping
        // dirty state alive past this point.
        guard.clearDirty();
        onDeleted?.(result.item_id);
        onClose();
      }
    },
  });

  const pending = save.pending || del.pending;
  // Combine errors from both actions so whichever ran most recently
  // is the one shown.
  const error = save.error ?? del.error;

  function startDelete() {
    setConfirmingDelete(true);
    setDeleteText('');
    save.clearError();
    del.clearError();
  }

  function cancelDelete() {
    setConfirmingDelete(false);
    setDeleteText('');
  }

  function confirmDelete() {
    if (!initial.itemId) return;
    if (deleteText !== 'DELETE') return;
    const fd = new FormData();
    fd.set('item_id', initial.itemId);
    fd.set('surface', initial.surface);
    del.submit(fd);
  }

  return (
    <ModalFrame
      title={isEdit ? `Edit MCQ — ${initial.itemId}` : 'New MCQ question'}
      onClose={pending ? () => undefined : guard.requestClose}
      actions={
        <EditorActions
          canDelete={isEdit}
          pending={pending || confirmingDelete || guard.confirming}
          onCancel={guard.requestClose}
          onDelete={isEdit ? startDelete : undefined}
          formId={FORM_ID}
        />
      }
    >
      {guard.confirming && (
        <DiscardConfirm
          onKeepEditing={guard.keepEditing}
          onDiscard={guard.discardAndClose}
          onSaveAndClose={guard.saveAndClose}
          pending={save.pending}
        />
      )}
      {confirmingDelete && initial.itemId && (
        <DeleteConfirm
          itemId={initial.itemId}
          deleteText={deleteText}
          pending={del.pending}
          onTextChange={setDeleteText}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
      <McqEditorBody
        initial={initial}
        error={error}
        pending={pending}
        onSubmit={save.submit}
        onDirty={guard.markDirty}
        onErrorDismiss={() => {
          save.clearError();
          del.clearError();
        }}
      />
    </ModalFrame>
  );
}

// ─────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────

function emptyDoc(): RichDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

function defaultOptionRows(): OptionRow[] {
  return Array.from({ length: DEFAULT_OPTIONS }, (_, i) => ({
    id: OPTION_LETTERS[i],
    text: emptyDoc(),
    feedback: emptyDoc(),
  }));
}
