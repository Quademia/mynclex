'use client';

// mynclex/lib/library/use-popover-position.ts
//
// Shared positioning hook for the editor's floating popovers
// (slash menu + colour swatch pickers). Handles three cases the
// default "below the anchor" rule gets wrong near viewport edges:
//
//   1. Anchor near the viewport BOTTOM — popover would extend off-
//      screen. Flip and position above the anchor instead.
//   2. Anchor near the viewport RIGHT — popover would extend past
//      the right edge. Slide left so it fits. (Don't flip
//      horizontally — disorienting.)
//   3. Popover taller than the larger side. Constrain its max-
//      height to the available space; the popover's own
//      overflow-y: auto handles internal scroll.
//
// Implementation note: positioning is applied by mutating the
// popover's DOM `style` directly inside a `useLayoutEffect`, NOT
// via React state. Storing the computed style in `setState` would
// trigger a re-render → another layout-effect run → another
// `setState`, looping forever (Maximum update depth exceeded).
// Direct DOM mutation has no such feedback. The layout effect
// runs synchronously after DOM commit but BEFORE paint, so the
// user never sees an unpositioned popover.

import { useLayoutEffect, useRef } from 'react';

export interface UsePopoverPositionOptions {
  /**
   * Returns the anchor's bounding rect. Called inside the layout
   * effect on every render — let it compute fresh each time.
   * Return null to skip positioning (popover stays hidden).
   */
  getAnchorRect: () => DOMRect | null;
  /** Distance between anchor edge and popover edge. Default 6px. */
  gap?: number;
  /** Margin from viewport edges. Default 8px. */
  margin?: number;
  /** z-index applied to the popover. Default 100. */
  zIndex?: number;
}

export interface PopoverPositionResult {
  ref: React.RefObject<HTMLDivElement | null>;
  style: React.CSSProperties;
}

export function usePopoverPosition({
  getAnchorRect,
  gap = 6,
  margin = 8,
  zIndex = 100,
}: UsePopoverPositionOptions): PopoverPositionResult {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const anchor = getAnchorRect();
    const el = ref.current;
    if (!anchor || !el) return;

    const popH = el.offsetHeight;
    const popW = el.offsetWidth;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceBelow = vh - anchor.bottom - margin;
    const spaceAbove = anchor.top - margin;

    let top: number;
    let maxHeight = '';

    if (popH + gap <= spaceBelow) {
      // Fits below — preferred path.
      top = anchor.bottom + gap;
    } else if (popH + gap <= spaceAbove) {
      // Doesn't fit below but fits above — flip.
      top = anchor.top - gap - popH;
    } else if (spaceBelow >= spaceAbove) {
      // Doesn't fit either side; use the larger one with a height cap
      // so internal scroll handles overflow.
      top = anchor.bottom + gap;
      maxHeight = `${Math.max(120, spaceBelow - gap)}px`;
    } else {
      top = margin;
      maxHeight = `${Math.max(120, spaceAbove - gap)}px`;
    }

    // Horizontal: align popover's left with anchor's left, but
    // clamp so it doesn't run off the right edge. If the popover
    // is wider than the viewport, pin it to the left margin.
    let left = anchor.left;
    if (left + popW + margin > vw) left = vw - popW - margin;
    if (left < margin) left = margin;

    // Direct DOM mutation — no setState, no re-render loop.
    el.style.position = 'fixed';
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.maxHeight = maxHeight;
    el.style.zIndex = String(zIndex);
    el.style.visibility = 'visible';
  });

  // Initial inline style — popover renders invisibly at (0, 0)
  // until the layout effect (which runs before paint) takes over.
  const style: React.CSSProperties = {
    position: 'fixed',
    left: 0,
    top: 0,
    visibility: 'hidden',
    zIndex,
  };

  return { ref, style };
}
