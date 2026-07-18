// mynclex/app/(app)/student/bank/cat/result/[attemptId]/abandoned-view.tsx
//
// The abandoned CAT (§16.5) — a genuinely separate surface, not the results
// page with its regions blanked out.
//
// An abandoned CAT produced no verdict, no ability estimate and no
// trajectory. Rendering the normal page with holes in it would imply the
// measurement exists and is merely missing; it never happened. So this says
// so plainly and offers the one useful thing: start a fresh one.

import Link from 'next/link';
import type { CatAbandonedReport } from '@/lib/practice/cat/report';

export function CatAbandonedView({ report }: { report: CatAbandonedReport }) {
  return (
    <div className="catr catr-abandoned">
      <header className="catr-top">
        <Link href="/student/bank/cat" className="catr-back">
          ← CAT home
        </Link>
      </header>

      <div className="catr-abandoned-body">
        <p className="catr-eyebrow">Computerised Adaptive Test</p>
        <h1 className="catr-headline">This CAT ended early</h1>

        <p className="catr-body">
          You left before the exam finished, so it stopped without measuring where you
          stand. A CAT is one continuous sitting — it can’t be paused or resumed.
        </p>
        <p className="catr-body">
          There’s no verdict, ability estimate or breakdown for an exam that didn’t
          complete.{' '}
          {report.itemsSeen > 0 && (
            <>You had reached question {report.itemsSeen}. </>
          )}
          When you’re ready, start a fresh one.
        </p>

        <div className="catr-actions">
          <Link href="/student/bank/cat" className="catr-btn catr-btn-primary">
            Start a new CAT
          </Link>
        </div>
      </div>
    </div>
  );
}
