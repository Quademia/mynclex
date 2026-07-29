// mynclex/lib/calculator/calculator-logic.ts
//
// Pure state machine for the on-screen calculator (BUILD_LIST slice #16).
//
// The NCLEX gives candidates a *standard* (non-scientific) on-screen
// calculator, modelled on the classic Windows Standard calculator. This
// module reproduces its behaviour exactly — the four functions, decimals,
// clear/backspace, sign toggle, √, %, 1/x and the five-key memory row —
// with no view concern of its own, so it can be unit-tested and reused by
// any surface that mounts <Calculator>.
//
// Design mirrors the codebase's pure-logic + thin-view split (cf.
// lib/practice/cat/report-derive.ts, lib/practice/runner/turn-transition.ts):
// one exported reducer `applyKey(state, key)` drives everything; the widget
// holds no arithmetic.

export type CalcOp = 'add' | 'sub' | 'mul' | 'div';

export type CalcKey =
  // digits + decimal
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'dot'
  // operators + evaluate
  | 'add' | 'sub' | 'mul' | 'div' | 'eq'
  // editing
  | 'clear' | 'clearEntry' | 'back' | 'neg'
  // unary functions
  | 'sqrt' | 'pct' | 'recip'
  // memory row
  | 'mc' | 'mr' | 'ms' | 'mPlus' | 'mMinus';

export interface CalcState {
  /** The string currently on the display (always a valid render). */
  display: string;
  /**
   * The running expression shown on the small line above the display, so
   * the user can see the operation in progress (e.g. "10 ×", then
   * "10 × 2 ="). A basic calculator has no operator precedence — it folds
   * left to right — so this reflects the running fold, never an unevaluated
   * "2 + 3 × 4" that would imply precedence we don't apply.
   */
  expr: string;
  /** Stored left operand / running result; null when none is pending. */
  acc: number | null;
  /** Operator awaiting its right operand; null when none is pending. */
  op: CalcOp | null;
  /** True right after an operator/recall — the next digit starts fresh. */
  waiting: boolean;
  /** Memory register. */
  memory: number;
  /** Whether memory currently holds a stored value (drives the "M" light). */
  memActive: boolean;
  /** Error latch (÷0, √ of a negative). Only C / CE clears it. */
  error: boolean;
  /** True right after "=" so a new digit starts a fresh entry. */
  justEq: boolean;
}

export const INITIAL_CALC: CalcState = {
  display: '0',
  expr: '',
  acc: null,
  op: null,
  waiting: false,
  memory: 0,
  memActive: false,
  error: false,
  justEq: false,
};

// Longest digit run we let the user key in (guards a runaway entry; the
// real display would just scroll otherwise).
const MAX_ENTRY_LEN = 16;

// Operator glyphs for the running-expression line (matches the button faces).
const OP_SYMBOL: Record<CalcOp, string> = { add: '+', sub: '−', mul: '×', div: '÷' };

// ── Number → display string ──────────────────────────────────────────────
// Kills binary-float noise (0.1 + 0.2 → "0.3", not "0.30000000000000004")
// by rounding to 12 significant figures before stringifying, and drops to
// exponential only for magnitudes a fixed display can't show.
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e15 || abs < 1e-9) {
    return trimExponent(n.toExponential(8));
  }
  return Number(n.toPrecision(12)).toString();
}

function trimExponent(s: string): string {
  // "1.20000000e+21" → "1.2e+21"
  return s.replace(/(\.\d*?)0+e/, '$1e').replace(/\.e/, 'e');
}

function toError(s: CalcState, message = 'Error'): CalcState {
  return {
    ...s,
    display: message,
    expr: '',
    acc: null,
    op: null,
    waiting: true,
    justEq: false,
    error: true,
  };
}

function evaluate(a: number, b: number, op: CalcOp): number | null {
  switch (op) {
    case 'add': return a + b;
    case 'sub': return a - b;
    case 'mul': return a * b;
    case 'div': return b === 0 ? null : a / b;
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────

function inputDigit(s: CalcState, d: string): CalcState {
  if (s.error) return s;
  if (s.waiting || s.justEq) {
    // A digit after "=" opens a fresh calculation, so clear the frozen
    // expression; a digit while waiting for the 2nd operand keeps it.
    return { ...s, display: d, waiting: false, justEq: false, expr: s.justEq ? '' : s.expr };
  }
  if (s.display === '0') return { ...s, display: d };
  if (s.display.replace('-', '').replace('.', '').length >= MAX_ENTRY_LEN) return s;
  return { ...s, display: s.display + d };
}

function inputDot(s: CalcState): CalcState {
  if (s.error) return s;
  if (s.waiting || s.justEq) {
    return { ...s, display: '0.', waiting: false, justEq: false, expr: s.justEq ? '' : s.expr };
  }
  if (s.display.includes('.')) return s;
  return { ...s, display: s.display + '.' };
}

function inputOp(s: CalcState, op: CalcOp): CalcState {
  if (s.error) return s;
  const cur = parseFloat(s.display);
  // A pending op with a fresh right operand → fold it before chaining, so
  // "2 + 3 × 4" shows 5 the moment × is pressed, matching a standard calc.
  if (s.op !== null && s.acc !== null && !s.waiting) {
    const r = evaluate(s.acc, cur, s.op);
    if (r === null) return toError(s);
    return {
      ...s, display: formatNumber(r), acc: r, op, waiting: true, justEq: false,
      expr: formatNumber(r) + ' ' + OP_SYMBOL[op],
    };
  }
  // Pressing another operator while already waiting just swaps the operator.
  if (s.waiting && s.acc !== null) {
    return { ...s, op, justEq: false, expr: formatNumber(s.acc) + ' ' + OP_SYMBOL[op] };
  }
  return {
    ...s, acc: cur, op, waiting: true, justEq: false,
    expr: formatNumber(cur) + ' ' + OP_SYMBOL[op],
  };
}

function inputEquals(s: CalcState): CalcState {
  if (s.error) return s;
  if (s.op === null || s.acc === null) return { ...s, justEq: true, waiting: true };
  const cur = parseFloat(s.display);
  const r = evaluate(s.acc, cur, s.op);
  if (r === null) return toError(s);
  // Freeze the full "left op right =" on the expression line, result below.
  return {
    ...s, display: formatNumber(r), acc: null, op: null, waiting: true, justEq: true,
    expr: s.expr + ' ' + s.display + ' =',
  };
}

function backspace(s: CalcState): CalcState {
  if (s.error) return s;
  if (s.waiting || s.justEq) return s; // nothing to erase in a locked entry
  let d = s.display;
  if (d.length <= 1 || (d.length === 2 && d.startsWith('-'))) d = '0';
  else d = d.slice(0, -1);
  if (d === '-' || d === '') d = '0';
  return { ...s, display: d };
}

function negate(s: CalcState): CalcState {
  if (s.error || s.display === '0') return s;
  const d = s.display.startsWith('-') ? s.display.slice(1) : '-' + s.display;
  return { ...s, display: d };
}

function squareRoot(s: CalcState): CalcState {
  if (s.error) return s;
  const v = parseFloat(s.display);
  if (v < 0) return toError(s, 'Invalid input');
  return {
    ...s, display: formatNumber(Math.sqrt(v)), waiting: true, justEq: true,
    expr: '√(' + formatNumber(v) + ')',
  };
}

// Windows-standard percent: with an operation pending, "A + B %" means
// "A + (A × B / 100)" — so % yields acc × cur / 100. With nothing pending
// it is a plain cur / 100.
function percent(s: CalcState): CalcState {
  if (s.error) return s;
  const cur = parseFloat(s.display);
  const r = s.op !== null && s.acc !== null ? (s.acc * cur) / 100 : cur / 100;
  return { ...s, display: formatNumber(r), waiting: false, justEq: false };
}

function reciprocal(s: CalcState): CalcState {
  if (s.error) return s;
  const v = parseFloat(s.display);
  if (v === 0) return toError(s, 'Cannot divide by zero');
  return {
    ...s, display: formatNumber(1 / v), waiting: true, justEq: true,
    expr: '1/(' + formatNumber(v) + ')',
  };
}

function clearAll(s: CalcState): CalcState {
  // C wipes the calculation but keeps whatever is in memory.
  return { ...INITIAL_CALC, memory: s.memory, memActive: s.memActive };
}

function clearEntry(s: CalcState): CalcState {
  // CE clears only the current entry (and any error), keeping acc/op.
  return { ...s, display: '0', waiting: false, error: false, justEq: false };
}

function memRecall(s: CalcState): CalcState {
  if (s.error) return s;
  return { ...s, display: formatNumber(s.memory), waiting: true, justEq: false };
}

function memStore(s: CalcState): CalcState {
  if (s.error) return s;
  return { ...s, memory: parseFloat(s.display), memActive: true };
}

function memAdd(s: CalcState, sign: 1 | -1): CalcState {
  if (s.error) return s;
  return { ...s, memory: s.memory + sign * parseFloat(s.display), memActive: true };
}

// ── The reducer ──────────────────────────────────────────────────────────

export function applyKey(state: CalcState, key: CalcKey): CalcState {
  switch (key) {
    case '0': case '1': case '2': case '3': case '4':
    case '5': case '6': case '7': case '8': case '9':
      return inputDigit(state, key);
    case 'dot':       return inputDot(state);
    case 'add':       return inputOp(state, 'add');
    case 'sub':       return inputOp(state, 'sub');
    case 'mul':       return inputOp(state, 'mul');
    case 'div':       return inputOp(state, 'div');
    case 'eq':        return inputEquals(state);
    case 'clear':     return clearAll(state);
    case 'clearEntry':return clearEntry(state);
    case 'back':      return backspace(state);
    case 'neg':       return negate(state);
    case 'sqrt':      return squareRoot(state);
    case 'pct':       return percent(state);
    case 'recip':     return reciprocal(state);
    case 'mc':        return { ...state, memory: 0, memActive: false };
    case 'mr':        return memRecall(state);
    case 'ms':        return memStore(state);
    case 'mPlus':     return memAdd(state, 1);
    case 'mMinus':    return memAdd(state, -1);
  }
}
