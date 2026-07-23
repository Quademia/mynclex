// mynclex/lib/hints/practice/dashboard-readiness-bulb.tsx
//
// Explains the Bank Dashboard's exam-readiness panel.
//
// This is the copy that has to hold the line: the band is a read on
// real results, not a predicted pass score, and the volume threshold
// buys RELIABILITY — it does not buy an estimate of anyone's chances.
// Figures are interpolated from the constants so the copy cannot drift
// from the rule it describes.

import { Bulb } from '@/lib/hints/shared/bulb';
import { ACCURACY_READY_PCT, VOLUME_GATE } from '@/lib/home/student/bank/readiness';

export function DashboardReadinessBulb() {
  return (
    <Bulb title="How readiness is worked out" bulbTitle="How is my readiness worked out?">
      <ul>
        <li>
          It is a <strong>band, not a predicted pass score</strong>. We don&rsquo;t claim to
          know your chances in the real exam — that would need results from nurses who
          have sat it, which we don&rsquo;t have.
        </li>
        <li>
          It reads three real signals: your overall accuracy (
          <strong>{ACCURACY_READY_PCT}% is the mark</strong>, the same bar a readiness pack
          calls Ready), your latest readiness pack, and your last CAT.
        </li>
        <li>
          <strong>Signals you haven&rsquo;t attempted don&rsquo;t count against you.</strong>{' '}
          The band is worked out from what you have actually done — sitting a pack or a CAT
          adds a signal, it never removes one.
        </li>
        <li>
          It appears once you have answered <strong>{VOLUME_GATE.toLocaleString()}</strong>{' '}
          questions — the point where there is enough practice behind the picture for it to
          be reliable.
        </li>
      </ul>
    </Bulb>
  );
}
