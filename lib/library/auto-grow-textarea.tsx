'use client';

// mynclex/lib/library/auto-grow-textarea.tsx
//
// A textarea that grows to fit its content (no inner scrollbar), used
// by the form-style library blocks (Drug card 11.8, Lab values 11.9)
// for field values and cells. `singleLine` wraps visually but rejects
// Enter — used for labels / column headers that must stay one logical
// line. `onMouseDown` stops propagation so clicking into the box
// doesn't trigger a ProseMirror node selection.

import { useRef, type ChangeEvent } from 'react';

export function AutoGrowTextarea({
  value,
  onChange,
  className,
  placeholder,
  disabled,
  singleLine = false,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Wrap visually but reject Enter — for labels / column headers. */
  singleLine?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  function resize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        if (el) resize(el);
      }}
      className={className}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      rows={1}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (singleLine && e.key === 'Enter') e.preventDefault();
      }}
      onChange={(e) => {
        resize(e.currentTarget);
        onChange(e);
      }}
    />
  );
}
