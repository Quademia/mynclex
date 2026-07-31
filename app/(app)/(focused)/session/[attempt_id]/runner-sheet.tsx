// mynclex/app/(app)/(focused)/session/[attempt_id]/runner-sheet.tsx
//
// The runner's one bottom-sheet shell, used five ways on compact:
// grid · chart (case/trend) · calculator · session menu · results.
// (docs/product-plan/runner-mobile.md)
//
// One shell rather than five, because everything that makes a sheet
// correct rather than merely present — focus trap, Escape, scroll lock,
// returning focus to whatever opened it — is the same every time, and is
// exactly the part that gets skipped when each surface rolls its own.
//
// The CSS lives in styles/runner-mobile.css. This file owns behaviour.
//
// ⚠ It is positioned ABSOLUTE inside `.rn`, not fixed. In production `.rn`
// is the whole viewport so the two are identical — but absolute also keeps
// the sheet inside the shell when the runner is rendered in a frame (the
// tutorial sandbox, design review). `.rn` is given `position: relative` by
// the mobile layer to be that containing block.

'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface Props {
  /** Uppercase eyebrow in the sheet head — "Question grid", "Calculator". */
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function RunnerSheet({ title, onClose, children }: Props) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  // Captured on mount, before focus moves into the sheet, so we can hand it
  // back on close. Without this a student who opens the grid from the footer
  // and closes it again lands at the top of the document — on a phone that
  // means scrolling back to where they were.
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Captured once: the sheet mounts and unmounts whole, so this node is
    // stable for the effect's life. Read in the cleanup below, where
    // sheetRef.current is no longer guaranteed to point at it.
    const sheetNode = sheetRef.current;
    openerRef.current = document.activeElement as HTMLElement | null;

    // Move focus in, so a keyboard/screen-reader user is actually inside the
    // thing that just appeared. Prefer the first real control; fall back to
    // the sheet itself (it carries tabIndex={-1}).
    const first = sheetNode?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? sheetNode)?.focus();

    // Body scroll lock — without it the page behind scrolls under the sheet
    // on iOS, which reads as the sheet sliding around.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      // Focus trap. Tab off either end wraps to the other, so focus cannot
      // walk out into the runner behind the scrim.
      const nodes = Array.from(
        sheetNode?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      );
      if (nodes.length === 0) return;
      const firstNode = nodes[0];
      const lastNode  = nodes[nodes.length - 1];
      const active    = document.activeElement;

      if (e.shiftKey && (active === firstNode || active === sheetNode)) {
        e.preventDefault();
        lastNode.focus();
      } else if (!e.shiftKey && active === lastNode) {
        e.preventDefault();
        firstNode.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      // Hand focus back to whatever opened the sheet — but only if the sheet
      // still had it. If the caller moved focus somewhere real (a later slice
      // picking a question from the grid, say), that surface owns it and
      // yanking it back would be wrong.
      //
      // ⚠ The test is "focus is nowhere useful", NOT "focus is still inside
      // the sheet". By the time this cleanup runs React has already detached
      // the sheet, so the element that had focus is gone and activeElement
      // has fallen back to <body> — an earlier `contains()` check therefore
      // said false and skipped the restore every single time. Caught by
      // tabbing through it on the rendered page; types and lint were clean.
      const active = document.activeElement;
      const focusWasLost =
        !active || active === document.body || !!sheetNode?.contains(active);
      if (focusWasLost) openerRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <>
      <div className="rn-sheet-scrim" onClick={onClose} />
      <div
        className="rn-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={sheetRef}
      >
        {/* Purely a visual affordance — the grab bar says "this pulls up".
            Dragging is not wired; the scrim, ✕ and Escape all close. */}
        <div className="rn-sheet-grab" aria-hidden="true" />
        <div className="rn-sheet-head">
          <div className="rn-sheet-title">{title}</div>
          <button
            type="button"
            className="rn-sheet-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="rn-sheet-body">{children}</div>
      </div>
    </>
  );
}
