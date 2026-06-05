// mynclex/lib/bank/hover-peek.tsx
//
// Hover-to-peek: wrap a list cell (a title / stem) so hovering it shows
// a popover with the FULL content — the entire scenario, the whole stem.
// Nothing is clamped: the purpose is to read the thing without opening
// the row.
//
// Positioning is viewport-aware: it opens into whichever side of the row
// (above / below) has more room and grows to the content. If the content
// is still taller than that space, the popover caps at the available
// height and scrolls — so everything is always reachable, never cut off
// the bottom of the screen. Because a tall popover must be scrollable,
// the panel is interactive (hoverable) with a short grace delay so
// moving the mouse from the row into the popover doesn't dismiss it.
//
// Portaled to <body> + position:fixed so a table's scroll container
// can't clip it.

'use client';

import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const MARGIN = 12;     // keep this far from the viewport edges
const GAP    = 6;      // gap between the row and the popover
const PANEL_W = 420;
const HIDE_DELAY = 140;

interface PeekPos {
  left:       number;
  maxHeight:  number;
  top?:       number;   // when opening downward
  bottom?:    number;   // when opening upward (anchored to viewport bottom)
}

export function HoverPeek({
  children,
  panel,
  className,
}: {
  children:   ReactNode;  // the cell content (e.g. the title)
  panel:      ReactNode;  // the popover content
  className?: string;     // extra class on the trigger (e.g. a line-clamp)
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<PeekPos | null>(null);

  function compute() {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - MARGIN;
    const spaceAbove = r.top - MARGIN;
    const below = spaceBelow >= spaceAbove;
    const left = Math.min(r.left, Math.max(8, window.innerWidth - PANEL_W - MARGIN));
    const maxHeight = Math.max(120, (below ? spaceBelow : spaceAbove) - GAP);
    setPos(
      below
        ? { left, maxHeight, top: r.bottom + GAP }
        : { left, maxHeight, bottom: window.innerHeight - r.top + GAP },
    );
  }

  function cancelHide() {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  }
  function scheduleHide() {
    cancelHide();
    hideTimer.current = setTimeout(() => setPos(null), HIDE_DELAY);
  }

  return (
    <span
      ref={ref}
      className={className ? `hover-peek-trigger ${className}` : 'hover-peek-trigger'}
      onMouseEnter={() => { cancelHide(); compute(); }}
      onMouseLeave={scheduleHide}
    >
      {children}
      {pos && typeof document !== 'undefined' && createPortal(
        <div
          className="hover-peek-panel"
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, maxHeight: pos.maxHeight }}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          {panel}
        </div>,
        document.body,
      )}
    </span>
  );
}
