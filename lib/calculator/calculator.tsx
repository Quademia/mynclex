// mynclex/lib/calculator/calculator.tsx
//
// The on-screen calculator widget (BUILD_LIST slice #16).
//
// A draggable, standard (non-scientific) calculator that mirrors the one the
// NCLEX gives candidates at the Pearson VUE screen — the four functions,
// decimals, clear/backspace, ±, √, %, 1/x and the five-key memory row. Built
// as an app-wide cross-cutting widget (its home is lib/calculator/, in the
// spirit of lib/overlays/ / lib/toast/): any surface can mount it. The runner
// is the first caller; a curator preview or a stand-alone med-math tool could
// mount it later with the same one-liner.
//
// All arithmetic lives in ./calculator-logic (pure + testable); this file is
// the view — panel chrome, the drag behaviour, the button grid and optional
// keyboard entry.

'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { applyKey, INITIAL_CALC, type CalcKey } from './calculator-logic';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Btn {
  label: string;
  key: CalcKey;
  variant: 'num' | 'op' | 'fn' | 'eq';
  /** The 0 key spans two columns, like a physical calculator. */
  wide?: boolean;
  /** Spoken label for symbol-only keys. */
  aria?: string;
}

const MEMORY_KEYS: Btn[] = [
  { label: 'MC', key: 'mc',     variant: 'fn', aria: 'Memory clear' },
  { label: 'MR', key: 'mr',     variant: 'fn', aria: 'Memory recall' },
  { label: 'MS', key: 'ms',     variant: 'fn', aria: 'Memory store' },
  { label: 'M+', key: 'mPlus',  variant: 'fn', aria: 'Memory add' },
  { label: 'M−', key: 'mMinus', variant: 'fn', aria: 'Memory subtract' },
];

const MAIN_KEYS: Btn[] = [
  { label: '%',   key: 'pct',        variant: 'fn', aria: 'Percent' },
  { label: 'CE',  key: 'clearEntry', variant: 'fn', aria: 'Clear entry' },
  { label: 'C',   key: 'clear',      variant: 'fn', aria: 'Clear all' },
  { label: '⌫',   key: 'back',       variant: 'fn', aria: 'Backspace' },

  { label: '±',   key: 'neg',        variant: 'fn', aria: 'Toggle sign' },
  { label: '√',   key: 'sqrt',       variant: 'fn', aria: 'Square root' },
  { label: '1/x', key: 'recip',      variant: 'fn', aria: 'Reciprocal' },
  { label: '÷',   key: 'div',        variant: 'op', aria: 'Divide' },

  { label: '7',   key: '7',          variant: 'num' },
  { label: '8',   key: '8',          variant: 'num' },
  { label: '9',   key: '9',          variant: 'num' },
  { label: '×',   key: 'mul',        variant: 'op', aria: 'Multiply' },

  { label: '4',   key: '4',          variant: 'num' },
  { label: '5',   key: '5',          variant: 'num' },
  { label: '6',   key: '6',          variant: 'num' },
  { label: '−',   key: 'sub',        variant: 'op', aria: 'Subtract' },

  { label: '1',   key: '1',          variant: 'num' },
  { label: '2',   key: '2',          variant: 'num' },
  { label: '3',   key: '3',          variant: 'num' },
  { label: '+',   key: 'add',        variant: 'op', aria: 'Add' },

  { label: '0',   key: '0',          variant: 'num', wide: true },
  { label: '.',   key: 'dot',        variant: 'num', aria: 'Decimal point' },
  { label: '=',   key: 'eq',         variant: 'eq', aria: 'Equals' },
];

// Physical-keyboard → CalcKey. Returns 'close' for Escape, null for keys we
// don't own (so the browser keeps them).
function mapKeyboard(e: KeyboardEvent): CalcKey | 'close' | null {
  const { key } = e;
  if (key >= '0' && key <= '9') return key as CalcKey;
  switch (key) {
    case '.': case ',': return 'dot';
    case '+': return 'add';
    case '-': return 'sub';
    case '*': return 'mul';
    case '/': return 'div';
    case '=': case 'Enter': return 'eq';
    case 'Backspace': return 'back';
    case 'Delete': return 'clearEntry';
    case 'Escape': return 'close';
    default: return null;
  }
}

export function Calculator({ open, onClose }: Props) {
  const [state, dispatch] = useReducer(applyKey, INITIAL_CALC);

  // Position: null = use the CSS default anchor (top-right). Becomes an
  // explicit {x,y} the moment the user drags, so we never touch `window`
  // during render (no hydration mismatch).
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Holds the active drag's teardown while a drag is in flight, so an unmount
  // mid-drag (panel closed) can detach the window listeners.
  const dragCleanup = useRef<(() => void) | null>(null);

  const onHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.calc-close')) return; // let the × click through
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const off = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    setPos({ x: rect.left, y: rect.top }); // seed from current spot so it doesn't jump

    // Function declarations (hoisted) so `up` can detach itself cleanly.
    function move(ev: PointerEvent) {
      const w = panelRef.current?.offsetWidth ?? 260;
      const h = panelRef.current?.offsetHeight ?? 360;
      setPos({
        x: Math.max(0, Math.min(ev.clientX - off.dx, window.innerWidth - w)),
        y: Math.max(0, Math.min(ev.clientY - off.dy, window.innerHeight - h)),
      });
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      dragCleanup.current = null;
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    dragCleanup.current = up;
    e.preventDefault();
  }, []);

  // Detach listeners if the panel unmounts mid-drag.
  useEffect(() => () => dragCleanup.current?.(), []);

  // Keyboard entry — only while open, and never when a real text field is
  // focused (a cloze fill-in must keep its own keystrokes).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
                 el.tagName === 'SELECT' || el.isContentEditable)) return;
      const mapped = mapKeyboard(e);
      if (mapped === null) return;
      e.preventDefault();
      if (mapped === 'close') onClose();
      else dispatch(mapped);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const style = pos ? { left: pos.x, top: pos.y, right: 'auto' as const } : undefined;

  return (
    <div
      ref={panelRef}
      className={'calc-panel' + (pos ? ' calc-moved' : '')}
      style={style}
      role="dialog"
      aria-label="Calculator"
    >
      <div className="calc-head" onPointerDown={onHeaderPointerDown}>
        <span className="calc-title">Calculator</span>
        <button
          type="button"
          className="calc-close"
          onClick={onClose}
          aria-label="Close calculator"
          title="Close"
        >
          ✕
        </button>
      </div>

      <div className="calc-display">
        {state.memActive && <span className="calc-mem-flag" aria-hidden="true">M</span>}
        {/* Running expression — the small line that shows the operation in
            progress (e.g. "10 ×", then "10 × 2 ="). Non-breaking space keeps
            the row height when empty so the display doesn't jump. */}
        <div className="calc-expr" aria-hidden="true">{state.expr || ' '}</div>
        <div className="calc-value" aria-live="polite">{state.display}</div>
      </div>

      <div className="calc-mem-row">
        {MEMORY_KEYS.map((b) => (
          <CalcButton key={b.key} btn={b} onPress={dispatch} />
        ))}
      </div>

      <div className="calc-grid">
        {MAIN_KEYS.map((b) => (
          <CalcButton
            key={b.key}
            btn={b}
            onPress={dispatch}
            // The pending operator stays lit until the next operand — a
            // persistent "a multiply is armed" signal alongside the line.
            armed={state.op !== null && b.key === state.op}
          />
        ))}
      </div>
    </div>
  );
}

function CalcButton({
  btn,
  onPress,
  armed = false,
}: {
  btn: Btn;
  onPress: (k: CalcKey) => void;
  armed?: boolean;
}) {
  // A brief press-flash confirms the tap registered — cleared after ~130ms.
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  function handleClick() {
    onPress(btn.key);
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 130);
  }

  return (
    <button
      type="button"
      className={
        'calc-btn calc-btn-' + btn.variant +
        (btn.wide ? ' calc-btn-wide' : '') +
        (armed ? ' calc-btn-armed' : '') +
        (flash ? ' calc-btn-flash' : '')
      }
      onClick={handleClick}
      aria-label={btn.aria}
    >
      {btn.label}
    </button>
  );
}
