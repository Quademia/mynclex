// mynclex/lib/tutor-quiz/quiz-stat-strip.tsx
//
// Server component — the summary stat strip above the /tutor/quizzes
// grid (2026-06 Claude Design "Quiz UI Uplift", List A). Whole-list
// counts derived from the QuizListRow[] the page already fetches — no
// new query. Four cells: Total · Published · In progress (drafts) ·
// Questions used (sum of item_count).

import type { QuizListRow } from './types';
import { QuizIcon, type QuizIconName } from './quiz-icons';

export function QuizStatStrip({ quizzes }: { quizzes: QuizListRow[] }) {
  const total = quizzes.length;
  const published = quizzes.filter((q) => q.status === 'PUBLISHED').length;
  const drafts = quizzes.filter((q) => q.status === 'DRAFT').length;
  const questions = quizzes.reduce((a, q) => a + q.item_count, 0);

  return (
    <div className="quizzes-stats">
      <Stat icon="quiz" tone="navy" value={total} label="Total quizzes" />
      <Stat
        icon="check-circle"
        tone="green"
        value={published}
        suffix="live"
        label="Published"
      />
      <Stat
        icon="pencil"
        tone="amber"
        value={drafts}
        suffix="drafts"
        label="In progress"
      />
      <Stat
        icon="list-checks"
        tone="teal"
        value={questions}
        suffix="in bank"
        label="Questions used"
      />
    </div>
  );
}

function Stat({
  icon,
  tone,
  value,
  suffix,
  label,
}: {
  icon: QuizIconName;
  tone: 'navy' | 'green' | 'amber' | 'teal';
  value: number;
  suffix?: string;
  label: string;
}) {
  return (
    <div className="quizzes-stat">
      <div className="quizzes-stat-top">
        <span className={`ic ${tone}`}>
          <QuizIcon name={icon} />
        </span>
        {label}
      </div>
      <div className="quizzes-stat-val">
        {value}
        {suffix && <small> {suffix}</small>}
      </div>
    </div>
  );
}
