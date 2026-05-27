'use client';

// mynclex/lib/library/color-swatch-picker.tsx
//
// Small reusable swatch picker for the editor toolbar. Used by:
//   • the Highlight button (background tints, default yellow)
//   • the Text Color button (foreground colours)
//
// Renders 6 brand-aligned swatches + a "Remove" pill. Anchored
// below the trigger button. Click-outside + Esc close.

import { useEffect, useRef } from 'react';

export type ColorSwatch = {
  /** CSS colour passed to Tiptap's color/highlight commands. */
  value: string;
  /** Tooltip name. */
  label: string;
};

interface ColorSwatchPickerProps {
  swatches: ColorSwatch[];
  /** Currently-set colour, if any. Used to highlight the active swatch. */
  activeValue?: string | null;
  /** Called when the tutor picks a swatch. */
  onPick: (value: string) => void;
  /** Called when the tutor picks "Remove" — strips the mark. */
  onRemove: () => void;
  /** Called when the picker should close (click-outside, Esc, after pick). */
  onClose: () => void;
  /** Anchor rect for positioning. */
  anchorRect: DOMRect;
}

export function ColorSwatchPicker({
  swatches,
  activeValue,
  onPick,
  onRemove,
  onClose,
  anchorRect,
}: ColorSwatchPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (
        rootRef.current &&
        !rootRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      className="lib-tiptap-swatch-pop"
      style={{
        position: 'fixed',
        left: anchorRect.left,
        top: anchorRect.bottom + 6,
        zIndex: 100,
      }}
      role="dialog"
      aria-label="Pick a colour"
    >
      <div className="lib-tiptap-swatch-grid">
        {swatches.map((s) => {
          const isActive = activeValue?.toLowerCase() === s.value.toLowerCase();
          return (
            <button
              key={s.value}
              type="button"
              className={
                isActive
                  ? 'lib-tiptap-swatch is-active'
                  : 'lib-tiptap-swatch'
              }
              style={{ background: s.value }}
              title={s.label}
              aria-label={s.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(s.value);
                onClose();
              }}
            />
          );
        })}
      </div>
      <button
        type="button"
        className="lib-tiptap-swatch-remove"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          onRemove();
          onClose();
        }}
      >
        Remove
      </button>
    </div>
  );
}

/**
 * Highlight palette — soft background tints. Mirrors Notion's
 * highlight palette but tuned to read on the editor's white
 * background. First swatch (pale yellow) is the marker-pen default.
 */
export const HIGHLIGHT_SWATCHES: ColorSwatch[] = [
  { value: '#fef08a', label: 'Yellow' },
  { value: '#bef264', label: 'Lime' },
  { value: '#bbf7d0', label: 'Mint' },
  { value: '#bae6fd', label: 'Sky' },
  { value: '#ddd6fe', label: 'Lavender' },
  { value: '#fbcfe8', label: 'Pink' },
];

/**
 * Text-colour palette — saturated enough to read on white but not
 * neon. Default-black is implicit (the "Remove" button).
 */
export const TEXT_COLOR_SWATCHES: ColorSwatch[] = [
  { value: '#dc2626', label: 'Red' },
  { value: '#ea580c', label: 'Orange' },
  { value: '#16a34a', label: 'Green' },
  { value: '#0284c7', label: 'Blue' },
  { value: '#7c3aed', label: 'Purple' },
  { value: '#737373', label: 'Grey' },
];
