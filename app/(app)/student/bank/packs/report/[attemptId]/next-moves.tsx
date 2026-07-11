'use client';

// mynclex/app/(app)/student/bank/packs/report/[attemptId]/next-moves.tsx
//
// "Your next moves" (§11.5, Slice ③) — turns the breakdown into action:
// remediation cards that deep-link into the practice builder pre-filtered to
// the weak category (fresh questions — pack questions are reserved), quick
// wins (near-misses), and a strengths mirror.

import type { ReportItem } from '@/lib/payments/readiness-report';
import { nextMoves } from '@/lib/payments/readiness-breakdowns';

/** Deep-link into the builder pre-filtered to one subcategory (Slice ③). */
function practiceHref(subcat: string): string {
  return `/student/bank/practice?subcat=${encodeURIComponent(subcat)}`;
}

export default function NextMoves({
  items,
  reviewOpen,
  attemptId,
}: {
  items: ReportItem[];
  reviewOpen: boolean;
  attemptId: string;
}) {
  const { moves, strengths, oneAway, partial } = nextMoves(items);

  return (
    <div className="rs-nm-grid">
      <div className="rs-nm-moves">
        {moves.length > 0 ? (
          moves.map((m) => (
            <div className="rs-nm-move" key={m.name}>
              <div className="rs-nm-move-txt">
                <div className="rs-nm-move-name">{m.name}</div>
                <div className="rs-nm-move-detail">
                  You got {m.correct} of {m.n} — practise this category with fresh questions.
                </div>
              </div>
              <a className="rs-btn rs-btn-teal rs-nm-practise" href={practiceHref(m.name)}>
                Practise →
              </a>
            </div>
          ))
        ) : (
          <p className="rs-rep-foot">
            No single area stood out as weak — nice work. Keep practising across the blueprint.
          </p>
        )}
        <p className="rs-rep-foot">
          Pack questions are reserved — you&rsquo;ll never re-see them in the bank. Each link opens
          the practice builder pre-filtered to that category, with fresh questions.
        </p>
      </div>

      <div className="rs-nm-side">
        <div className="rs-nm-card rs-nm-wins">
          <div className="rs-nm-card-h">Quick wins</div>
          {partial > 0 ? (
            <p>
              You were <strong>one answer away on {oneAway}</strong> of your {partial}{' '}
              partially-correct questions — your fastest gains.
            </p>
          ) : (
            <p>No near-misses this time — you didn&rsquo;t leave partial credit on the table.</p>
          )}
          {reviewOpen && partial > 0 && (
            <a className="rs-nm-link" href={`/session/${attemptId}`}>
              See them in review →
            </a>
          )}
        </div>

        {strengths.length > 0 && (
          <div className="rs-nm-card rs-nm-strengths">
            <div className="rs-nm-card-h">Build on your strengths</div>
            <ul className="rs-nm-strength-list">
              {strengths.map((s) => (
                <li key={s.name}>
                  <strong>{s.name}</strong> — {s.correct} of {s.n}
                </li>
              ))}
            </ul>
            <p className="rs-nm-strength-note">These held up under exam pressure.</p>
          </div>
        )}
      </div>
    </div>
  );
}
