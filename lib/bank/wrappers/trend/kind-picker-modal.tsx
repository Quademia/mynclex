// mynclex/lib/bank/wrappers/trend/kind-picker-modal.tsx
//
// Slice 13a — kind preset picker as a centred modal on the trend
// list page. Replaces the routed /new page (option B from the
// 2026-05-01 discussion). Modal pattern matches CS's DiscardConfirm:
// fixed overlay, dimmed backdrop, ESC + backdrop-click close, no
// pending-state lock here since each card just submits a server
// action that redirects.
//
// The list page mounts <KindPickerLauncher surface=...> wherever a
// "+ New trend dataset" trigger is needed (toolbar header + empty
// state). Each launcher carries its own open/close state, so two
// instances on one page coexist without interfering.
//
// Server-action plumbing: each card is its own <form action={...}>
// calling createTrendAction. Form actions are valid inside client
// components, so this works without changes to actions.ts.

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createTrendAction } from './actions';

interface PresetCard {
  kind:        string;
  label:       string;
  description: string;
}

const PRESETS: PresetCard[] = [
  { kind: 'vitals',     label: 'Vitals',           description: 'BP, HR, RR, SpO₂, Temp — pre-seeded rows for a typical vitals panel.' },
  { kind: 'labs',       label: 'Labs',             description: 'Common electrolytes / chemistry. Ref-range column on by default.' },
  { kind: 'io',         label: 'Intake & Output',  description: 'IV / PO intake, urine output, net balance.' },
  { kind: 'neuro',      label: 'Neuro',            description: 'GCS, pupils, orientation, motor strength.' },
  { kind: 'assessment', label: 'Assessment',       description: 'Empty scaffold — build rows + timepoints from scratch.' },
];

type Surface = 'admin' | 'tutor';

interface LauncherProps {
  surface:        Surface;
  /**
   * Optional override for the trigger button class. Defaults to the
   * primary list toolbar style. Empty-state usage can pass in a
   * smaller class if needed; current call sites use the default.
   */
  triggerClassName?: string;
  /** Trigger label. Default "+ New trend dataset". */
  triggerLabel?: string;
}

export function KindPickerLauncher({
  surface,
  triggerClassName = 'auth-cs-btn primary',
  triggerLabel     = '+ New trend dataset',
}: LauncherProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>
      {open && (
        <KindPickerModal
          surface={surface}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface ModalProps {
  surface: Surface;
  onClose: () => void;
}

function KindPickerModal({ surface, onClose }: ModalProps) {
  // ESC key closes the modal. Mirrors the CS DiscardConfirm /
  // DeleteConfirm pattern (those don't have ESC handling because
  // they're alert-style dialogs that should require an explicit
  // choice, but the kind picker is exploratory — ESC is fine).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="auth-kind-modal-overlay"
      onClick={(e) => {
        // Click on backdrop closes. Click anywhere inside the dialog
        // (cards, inputs, etc.) shouldn't.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="auth-kind-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-kind-modal-title"
      >
        <header className="auth-kind-modal-header">
          <h2 id="auth-kind-modal-title" className="auth-kind-modal-title">
            New trend dataset
          </h2>
          <button
            type="button"
            className="auth-kind-modal-close"
            onClick={onClose}
            aria-label="Close picker"
            title="Close (Esc)"
          >
            ×
          </button>
        </header>

        <p className="auth-kind-modal-hint">
          Pick a kind preset to seed the new dataset&apos;s rows + timepoints.
          Everything seeded is editable afterwards. Use Custom to start blank
          with your own kind name.
        </p>

        <div className="auth-kind-grid">
          {PRESETS.map((p) => (
            <form
              key={p.kind}
              action={async (fd: FormData) => {
                await createTrendAction(fd);
              }}
              className="auth-kind-card-form"
            >
              <input type="hidden" name="surface" value={surface} />
              <input type="hidden" name="kind" value={p.kind} />
              <button type="submit" className="auth-kind-card">
                <div className="auth-kind-card-label">{p.label}</div>
                <div className="auth-kind-card-desc">{p.description}</div>
              </button>
            </form>
          ))}

          <CustomKindCard surface={surface} />
        </div>
      </div>
    </div>
  );
}

// Inline custom-name input + Create button. Disabled until name is
// non-empty. Pulled out as a small inner component because it needs
// its own controlled state for the input + submit gate; the preset
// cards above don't.
function CustomKindCard({ surface }: { surface: Surface }) {
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (!canSubmit) {
      e.preventDefault();
    }
  }

  return (
    <form
      action={async (fd: FormData) => {
        await createTrendAction(fd);
      }}
      className="auth-kind-card-form auth-kind-card-form-custom"
      onSubmit={onSubmit}
    >
      <input type="hidden" name="surface" value={surface} />
      <input type="hidden" name="kind" value="custom" />
      <div className="auth-kind-card auth-kind-card-custom">
        <div className="auth-kind-card-label">Custom</div>
        <div className="auth-kind-card-desc">
          Type your own kind name. Empty rows + timepoints — build from scratch.
        </div>
        <input
          type="text"
          name="custom_kind_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. respiratory rhythm, cardiac telemetry"
          className="auth-kind-card-input"
          required
          minLength={1}
          maxLength={64}
        />
        <button
          type="submit"
          className="auth-kind-card-create"
          disabled={!canSubmit}
        >
          Create
        </button>
      </div>
    </form>
  );
}
