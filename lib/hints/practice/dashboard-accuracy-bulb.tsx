// mynclex/lib/hints/practice/dashboard-accuracy-bulb.tsx
//
// Explains the Bank Dashboard's "Accuracy by category" card (Path B —
// each unique explainer is its own file wrapping the shared shell with
// its content baked in). Lives under hints/practice/ because that is
// the student-consumption area; hints/bank/ is the curator's.
//
// Two jobs, both honesty jobs: say exactly what the number is a ratio
// of, and stop a low bar reading as a grade. It also states plainly
// that CAT sittings are left out, because a student who has sat one
// will otherwise wonder why these bars don't move afterwards.

import { Bulb } from '@/lib/hints/shared/bulb';

export function DashboardAccuracyBulb() {
  return (
    <Bulb title="Where these numbers come from" bulbTitle="How is my accuracy worked out?">
      <ul>
        <li>
          Each bar is <strong>correct ÷ answered</strong> for that area, across every
          question you have answered in the bank — practice sets and readiness packs
          together.
        </li>
        <li>
          The eight areas are the <strong>NCLEX blueprint&rsquo;s own categories</strong>,
          not ours.
        </li>
        <li>
          <strong>CAT sittings are left out.</strong> A CAT deliberately serves questions
          at the edge of your ability, so roughly half come out wrong however strong you
          are. Counting them would pull every bar toward 50% and tell you nothing.
        </li>
        <li>
          A low bar <strong>isn&rsquo;t a grade</strong> — it is simply where a focused set
          of questions will help you most.
        </li>
      </ul>
    </Bulb>
  );
}
