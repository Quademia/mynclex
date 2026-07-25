// mynclex/lib/calculator/calculator-logic.test.ts
//
// The on-screen calculator state machine (BUILD_LIST slice #16). Pure — the
// draggable panel + keyboard entry are exercised in the browser.

import { describe, it, expect } from 'vitest';
import { applyKey, INITIAL_CALC, formatNumber, type CalcKey, type CalcState } from './calculator-logic';

// Feed a sequence of keys through the reducer from the initial state.
function run(keys: CalcKey[], from: CalcState = INITIAL_CALC): CalcState {
  return keys.reduce(applyKey, from);
}
const shown = (keys: CalcKey[]) => run(keys).display;

describe('digit entry', () => {
  it('starts at 0', () => {
    expect(INITIAL_CALC.display).toBe('0');
  });

  it('replaces the leading zero', () => {
    expect(shown(['7'])).toBe('7');
    expect(shown(['4', '2'])).toBe('42');
  });

  it('keeps interior/trailing zeros', () => {
    expect(shown(['1', '0', '0', '0'])).toBe('1000');
  });

  it('caps a runaway entry', () => {
    const many = Array<CalcKey>(30).fill('9');
    expect(shown(many).length).toBeLessThanOrEqual(16);
  });
});

describe('decimals', () => {
  it('adds a single decimal point only', () => {
    expect(shown(['1', 'dot', '5'])).toBe('1.5');
    expect(shown(['1', 'dot', 'dot', '5'])).toBe('1.5');
  });

  it('a leading decimal becomes 0.', () => {
    expect(shown(['dot', '5'])).toBe('0.5');
  });
});

describe('the four functions', () => {
  it('adds', () => {
    expect(shown(['2', 'add', '3', 'eq'])).toBe('5');
  });
  it('subtracts', () => {
    expect(shown(['9', 'sub', '4', 'eq'])).toBe('5');
  });
  it('multiplies', () => {
    expect(shown(['6', 'mul', '7', 'eq'])).toBe('42');
  });
  it('divides — the med-math case 1000 mL / 8 hr', () => {
    expect(shown(['1', '0', '0', '0', 'div', '8', 'eq'])).toBe('125');
  });
});

describe('operator chaining without =', () => {
  it('folds the pending op when the next operator is pressed', () => {
    // 2 + 3 × 4  →  (2+3)=5 shown on ×, then ×4 = 20
    expect(shown(['2', 'add', '3', 'mul', '4', 'eq'])).toBe('20');
  });

  it('swaps the operator when pressed consecutively', () => {
    // 8 − then × 2  →  16, not a subtraction
    expect(shown(['8', 'sub', 'mul', '2', 'eq'])).toBe('16');
  });
});

describe('floating-point noise is hidden', () => {
  it('0.1 + 0.2 reads exactly 0.3', () => {
    expect(shown(['dot', '1', 'add', 'dot', '2', 'eq'])).toBe('0.3');
  });
});

describe('divide by zero', () => {
  const errored = run(['5', 'div', '0', 'eq']);

  it('shows an error', () => {
    expect(errored.display).toBe('Error');
    expect(errored.error).toBe(true);
  });

  it('latches — digits are ignored until cleared', () => {
    expect(applyKey(errored, '7').display).toBe('Error');
  });

  it('C clears the error back to 0', () => {
    expect(applyKey(errored, 'clear').display).toBe('0');
    expect(applyKey(errored, 'clear').error).toBe(false);
  });

  it('CE also clears the error', () => {
    expect(applyKey(errored, 'clearEntry').display).toBe('0');
    expect(applyKey(errored, 'clearEntry').error).toBe(false);
  });
});

describe('clear semantics', () => {
  it('CE clears the current entry but keeps the pending operation', () => {
    // 5 + 9, CE, 3, =  →  5 + 3 = 8
    expect(shown(['5', 'add', '9', 'clearEntry', '3', 'eq'])).toBe('8');
  });

  it('C wipes the whole calculation', () => {
    expect(shown(['5', 'add', '9', 'clear'])).toBe('0');
  });
});

describe('backspace', () => {
  it('drops the last digit', () => {
    expect(shown(['1', '2', '3', 'back'])).toBe('12');
  });
  it('a single digit backspaces to 0', () => {
    expect(shown(['7', 'back'])).toBe('0');
  });
});

describe('unary functions', () => {
  it('± toggles sign', () => {
    expect(shown(['5', 'neg'])).toBe('-5');
    expect(shown(['5', 'neg', 'neg'])).toBe('5');
  });
  it('√ takes a square root', () => {
    expect(shown(['1', '4', '4', 'sqrt'])).toBe('12');
  });
  it('√ of a negative errors', () => {
    expect(run(['5', 'neg', 'sqrt']).error).toBe(true);
  });
  it('1/x reciprocates', () => {
    expect(shown(['4', 'recip'])).toBe('0.25');
  });
  it('1/x of zero errors', () => {
    expect(run(['0', 'recip']).error).toBe(true);
  });
  it('% of a pending operation — 200 + 10% = 220', () => {
    expect(shown(['2', '0', '0', 'add', '1', '0', 'pct', 'eq'])).toBe('220');
  });
});

describe('memory row', () => {
  it('MS stores, C clears the entry, MR recalls', () => {
    const s = run(['4', '2', 'ms', 'clear', 'mr']);
    expect(s.display).toBe('42');
    expect(s.memActive).toBe(true);
  });

  it('M+ and M- accumulate', () => {
    // store 10, add 5 → 15, recall
    const s = run(['1', '0', 'ms', 'clear', '5', 'mPlus', 'clear', 'mr']);
    expect(s.display).toBe('15');
  });

  it('MC clears memory and its indicator', () => {
    const s = run(['7', 'ms', 'mc']);
    expect(s.memActive).toBe(false);
    expect(s.memory).toBe(0);
  });
});

describe('formatNumber', () => {
  it('renders integers plainly', () => {
    expect(formatNumber(125)).toBe('125');
    expect(formatNumber(0)).toBe('0');
  });
  it('kills binary-float noise', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0.3');
  });
  it('falls back to exponential for extreme magnitudes', () => {
    expect(formatNumber(1e20)).toContain('e');
  });
  it('reports non-finite as Error', () => {
    expect(formatNumber(Infinity)).toBe('Error');
  });
});
