// mynclex/lib/hints/bank/difficulty-calibration-bulb.tsx
//
// Bulb explaining the two difficulty fields on the Classification tab —
// the editable "Set difficulty" label and the read-only "Calibrated
// difficulty" readout (IRT + source). CAT Slice 10a.
// See bank-consumption-cat.html §5.1 / §5.2 / §5.5.

import { Bulb } from '@/lib/hints/shared/bulb';

export function DifficultyCalibrationBulb() {
  return (
    <Bulb title="Difficulty & calibration" bulbTitle="What do these two fields mean?">
      <ul className="auth-help-bulb-list">
        <li>
          <strong>Set difficulty</strong> — your authoring label. On save it
          seeds the item&apos;s IRT number (Very easy −2 · Easy −1 · Medium 0 ·
          Hard +1 · Very hard +2). Change it any time; the number follows.
        </li>
        <li>
          <strong>Calibrated difficulty</strong> — the difficulty the system
          actually uses, read-only. The band comes from the IRT number
          (cut-offs at ±0.5 / ±1.5).
        </li>
        <li>
          <strong>CURATOR</strong> — the number is still seeded from your label.
          Everything reads this until enough students have answered.
        </li>
        <li>
          <strong>EMPIRICAL</strong> — the number was recalibrated from real
          student responses, so it can differ from your label.
        </li>
        <li>
          <strong>≠ label</strong> — the measured band disagrees with your
          label (e.g. you set Medium, the data measured Hard).
        </li>
      </ul>
    </Bulb>
  );
}
