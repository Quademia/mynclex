// mynclex/lib/curriculum/cur-menu.tsx
//
// Small reusable ⋯ dropdown for the curriculum workspace (unit rail
// items now; block + activity rows in the detail-pane restyle). Body-
// portaled + fixed-positioned via the shared use-popover-position hook
// so it never clips inside the rail's own overflow scroll. Items can be
// disabled with a hint (the "coming soon" unit placeholders — Delete /
// Reorder — until units are decoupled from programme length).

'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePopoverPosition } from '@/lib/library/use-popover-position';
import { CurIcon } from './cur-icon';

export type CurMenuItem =
  | { sep: true }
  | {
      sep?: false;
      label: string;
      icon: string;
      onClick?: () => void;
      danger?: boolean;
      disabled?: boolean;
      hint?: string;
    };

export function CurMenu({
  items,
  ariaLabel,
  tint = false,
  size = 16,
}: {
  items: CurMenuItem[];
  ariaLabel: string;
  tint?: boolean;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const { ref: popRef, style } = usePopoverPosition({
    getAnchorRect: () => btnRef.current?.getBoundingClientRect() ?? null,
    zIndex: 80,
  });

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
    // popRef is a stable ref object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <span className="cur-menu-wrap">
      <button
        ref={btnRef}
        type="button"
        className={'cur-icon-btn' + (tint ? ' on-tint' : '') + (open ? ' is-open' : '')}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <CurIcon name="more" size={size} />
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div ref={popRef} style={style} className="cur-menu" role="menu">
            {items.map((item, i) => {
              if ('sep' in item && item.sep) {
                return <div key={`sep-${i}`} className="cur-menu-sep" />;
              }
              const it = item as Extract<CurMenuItem, { label: string }>;
              return (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  className={it.danger ? 'danger' : undefined}
                  disabled={it.disabled}
                  title={it.hint}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (it.disabled) return;
                    setOpen(false);
                    it.onClick?.();
                  }}
                >
                  <CurIcon name={it.icon} size={15} />
                  <span className="cur-menu-label">{it.label}</span>
                  {it.disabled && it.hint && (
                    <span className="cur-menu-soon">Soon</span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </span>
  );
}
