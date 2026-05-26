// mynclex/lib/library/pillar-picker.tsx
//
// Popover with the 8 NCLEX-RN Client Needs sub-categories as
// checkboxes. Reused by:
//   • the new-note modal (initial pillar pick on create)
//   • the editor inline meta row (`+ Add pillar` button)
//
// The trigger is the caller's responsibility — this component
// renders the open popover only (caller controls visibility +
// anchor position via CSS). Click-outside and ESC both close.
//
// Selection is a single source of truth: the caller passes
// `value` (the current array of pillars) and `onChange` that
// receives the new array on every checkbox toggle.

'use client';

import { useEffect, useRef } from 'react';
import { NCLEX_PILLARS, type NclexPillar } from './types';
import { pillarShortName } from './format';

interface PillarPickerProps {
  value: NclexPillar[];
  onChange: (next: NclexPillar[]) => void;
  onClose: () => void;
  /** Optional anchor className override for unusual placements. */
  className?: string;
}

export function PillarPicker({
  value,
  onChange,
  onClose,
  className,
}: PillarPickerProps) {
  const popRef = useRef<HTMLDivElement | null>(null);

  // Click outside or ESC closes. The pointerdown listener captures
  // taps on the trigger button too — caller should stop propagation
  // on the trigger if they want it to toggle (vs. always close).
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

  function toggle(p: NclexPillar) {
    if (value.includes(p)) {
      onChange(value.filter((x) => x !== p));
    } else {
      onChange([...value, p]);
    }
  }

  return (
    <div
      ref={popRef}
      className={`lib-popover lib-pillar-picker${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-label="Pick NCLEX pillars"
    >
      <div className="lib-popover-head">
        Pick at least one NCLEX pillar
      </div>
      <div className="lib-popover-body">
        {NCLEX_PILLARS.map((p) => {
          const on = value.includes(p);
          return (
            <button
              key={p}
              type="button"
              className={`lib-pp-row${on ? ' is-on' : ''}`}
              onClick={() => toggle(p)}
              role="checkbox"
              aria-checked={on}
            >
              <span className="lib-pp-check" aria-hidden="true">
                {on ? '✓' : ''}
              </span>
              <span className="lib-pp-name">
                <span className="full">{p}</span>
                <span className="short">{pillarShortName(p)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
