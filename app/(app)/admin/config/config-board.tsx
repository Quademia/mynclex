// mynclex/app/(app)/admin/config/config-board.tsx
//
// The interactive System Config board. One tile per known setting; the
// control matches the setting's type — a yes/no switch flips inline (with a
// confirm when turning a consequential one OFF), a percentage opens a small
// editor modal. Saving goes through the SYSTEM_MANAGE-gated action, which
// re-validates, so the client is just the convenient surface.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateConfigAction } from './actions';
import {
  type ConfigDef,
  fractionToPercent,
  percentToFraction,
  formatConfigValue,
} from './config-defs';

export interface ConfigItem {
  def: ConfigDef;
  value: string;
}

export function ConfigBoard({ items }: { items: ConfigItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [confirmOff, setConfirmOff] = useState<ConfigDef | null>(null);
  const [editPercent, setEditPercent] = useState<{ def: ConfigDef; value: string } | null>(null);
  const [editInteger, setEditInteger] = useState<{ def: ConfigDef; value: string } | null>(null);

  function save(def: ConfigDef, value: string) {
    setBusyKey(def.key);
    startTransition(async () => {
      const res = await updateConfigAction(def.key, value);
      setBusyKey(null);
      setConfirmOff(null);
      setEditPercent(null);
      setEditInteger(null);
      if (!res.ok) {
        setToast({ tone: 'error', message: res.error });
        return;
      }
      setToast({ tone: 'success', message: `Saved “${def.label}”.` });
      router.refresh();
    });
  }

  function onToggle(def: ConfigDef, current: string) {
    const next = current === 'true' ? 'false' : 'true';
    // Turning a consequential setting OFF asks first.
    if (next === 'false' && def.confirmOff) {
      setConfirmOff(def);
      return;
    }
    save(def, next);
  }

  return (
    <>
      <ul className="cfg-grid">
        {items.map(({ def, value }) => {
          const rowBusy = busyKey === def.key && pending;
          return (
            <li className="cfg-tile" key={def.key}>
              <div className="cfg-tile-main">
                <div className="cfg-tile-label">{def.label}</div>
                <div className="cfg-tile-desc">{def.description}</div>
                <code className="cfg-tile-key">{def.key}</code>
              </div>
              <div className="cfg-tile-control">
                {def.type === 'boolean' ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={value === 'true'}
                    aria-label={def.label}
                    className={`cfg-switch${value === 'true' ? ' on' : ''}`}
                    onClick={() => onToggle(def, value)}
                    disabled={pending}
                  >
                    <span className="cfg-switch-track" aria-hidden="true">
                      <span className="cfg-switch-knob" />
                    </span>
                    <span className="cfg-switch-text">
                      {rowBusy ? '…' : formatConfigValue(def, value)}
                    </span>
                  </button>
                ) : (
                  <>
                    <span className="cfg-tile-value">{formatConfigValue(def, value)}</span>
                    <button
                      type="button"
                      className="cfg-edit-btn"
                      onClick={() =>
                        def.type === 'integer'
                          ? setEditInteger({ def, value })
                          : setEditPercent({ def, value })
                      }
                      disabled={pending}
                    >
                      Edit
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {confirmOff && (
        <ConfigModal
          title={`Turn off “${confirmOff.label}”?`}
          body={confirmOff.confirmOff}
          confirmLabel="Turn off"
          danger
          pending={pending}
          onClose={() => {
            if (!pending) setConfirmOff(null);
          }}
          onConfirm={() => save(confirmOff, 'false')}
        />
      )}

      {editPercent && (
        <PercentEditor
          item={editPercent}
          pending={pending}
          onClose={() => {
            if (!pending) setEditPercent(null);
          }}
          onSave={(fraction) => save(editPercent.def, fraction)}
        />
      )}

      {editInteger && (
        <IntegerEditor
          item={editInteger}
          pending={pending}
          onClose={() => {
            if (!pending) setEditInteger(null);
          }}
          onSave={(value) => save(editInteger.def, value)}
        />
      )}

      {toast && (
        <ConfigToast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />
      )}
    </>
  );
}

function PercentEditor({
  item,
  pending,
  onClose,
  onSave,
}: {
  item: { def: ConfigDef; value: string };
  pending: boolean;
  onClose: () => void;
  onSave: (fraction: string) => void;
}) {
  const [percent, setPercent] = useState(fractionToPercent(item.value));
  const valid = Number.isInteger(percent) && percent >= 0 && percent <= 99;

  return (
    <ConfigModal
      title={`Edit “${item.def.label}”`}
      body={item.def.description}
      confirmLabel="Save"
      pending={pending}
      confirmDisabled={!valid}
      onClose={onClose}
      onConfirm={() => onSave(percentToFraction(percent))}
    >
      <label className="cfg-field">
        <span className="cfg-field-label">Discount</span>
        <span className="cfg-field-pct">
          <input
            type="number"
            min={0}
            max={99}
            className="cfg-input"
            value={Number.isNaN(percent) ? '' : percent}
            onChange={(e) => setPercent(parseInt(e.target.value, 10))}
            disabled={pending}
          />
          <span className="cfg-field-suffix">%</span>
        </span>
      </label>
    </ConfigModal>
  );
}

function IntegerEditor({
  item,
  pending,
  onClose,
  onSave,
}: {
  item: { def: ConfigDef; value: string };
  pending: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const min = item.def.min ?? 1;
  const max = item.def.max ?? 999999;
  const [n, setN] = useState<number>(parseInt(item.value, 10));
  const valid = Number.isInteger(n) && n >= min && n <= max;

  return (
    <ConfigModal
      title={`Edit “${item.def.label}”`}
      body={item.def.description}
      confirmLabel="Save"
      pending={pending}
      confirmDisabled={!valid}
      onClose={onClose}
      onConfirm={() => onSave(String(n))}
    >
      <label className="cfg-field">
        <span className="cfg-field-label">
          Value ({min}–{max})
        </span>
        <input
          type="number"
          min={min}
          max={max}
          step={1}
          className="cfg-input"
          value={Number.isNaN(n) ? '' : n}
          onChange={(e) => setN(parseInt(e.target.value, 10))}
          disabled={pending}
        />
      </label>
    </ConfigModal>
  );
}

function ConfigModal({
  title,
  body,
  confirmLabel,
  danger,
  pending,
  confirmDisabled,
  children,
  onClose,
  onConfirm,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  pending: boolean;
  confirmDisabled?: boolean;
  children?: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="cfg-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="cfg-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="cfg-modal-title">{title}</h2>
        {body && <p className="cfg-modal-body">{body}</p>}
        {children}
        <div className="cfg-modal-actions">
          <button type="button" className="cfg-btn cfg-btn-ghost" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className={`cfg-btn ${danger ? 'cfg-btn-danger' : 'cfg-btn-primary'}`}
            onClick={onConfirm}
            disabled={pending || confirmDisabled}
          >
            {pending ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfigToast({
  tone,
  message,
  onDismiss,
}: {
  tone: 'success' | 'error';
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className={`cfg-toast cfg-toast-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span>{message}</span>
      <button type="button" className="cfg-toast-close" aria-label="Dismiss" onClick={onDismiss}>
        ✕
      </button>
    </div>
  );
}
