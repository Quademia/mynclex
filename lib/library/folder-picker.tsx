// mynclex/lib/library/folder-picker.tsx
//
// Popover with the tutor's folders as a clickable list, used by:
//   • the new-note modal (assign on create)
//   • the editor inline meta row (reparent an existing note)
//
// Single-select. The caller passes `value` (currently selected
// folder_id, or null for root) and `onChange` that receives the
// next value on click; the popover auto-closes after pick.
//
// "Root (no folder)" is always the first option — corresponds to
// `folder_id IS NULL` in the schema.

'use client';

import { useEffect, useRef } from 'react';
import type { LibraryFolderWithCount } from './types';

interface FolderPickerProps {
  folders: LibraryFolderWithCount[];
  value: string | null;          // folder_id, or null for root
  onChange: (next: string | null) => void;
  onClose: () => void;
  className?: string;
}

export function FolderPicker({
  folders,
  value,
  onChange,
  onClose,
  className,
}: FolderPickerProps) {
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointer(e: PointerEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  function pick(next: string | null) {
    onChange(next);
    onClose();
  }

  return (
    <div
      ref={popRef}
      className={`lib-popover lib-folder-picker${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-label="Pick a folder"
    >
      <div className="lib-popover-head">Move to folder</div>
      <div className="lib-popover-body">
        <button
          type="button"
          className={`lib-fp-row${value === null ? ' is-on' : ''}`}
          onClick={() => pick(null)}
        >
          <span className="lib-fp-ic" aria-hidden="true">⌖</span>
          <span className="lib-fp-name">Root (no folder)</span>
          {value === null && <span className="lib-fp-check">✓</span>}
        </button>

        {folders.length === 0 ? (
          <div className="lib-fp-empty">
            No folders yet — create one from the library home.
          </div>
        ) : (
          folders.map((f) => {
            const on = value === f.folder_id;
            return (
              <button
                key={f.folder_id}
                type="button"
                className={`lib-fp-row${on ? ' is-on' : ''}`}
                onClick={() => pick(f.folder_id)}
              >
                <span className="lib-fp-ic" aria-hidden="true">📁</span>
                <span className="lib-fp-name">{f.name}</span>
                {on && <span className="lib-fp-check">✓</span>}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
