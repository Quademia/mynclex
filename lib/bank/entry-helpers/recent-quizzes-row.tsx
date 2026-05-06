// mynclex/lib/bank/entry-helpers/recent-quizzes-row.tsx
//
// Pure presentation. Renders the "RECENT" eyebrow + up to 3 chip
// buttons of the student's most recent finished attempts. Click a
// chip → caller decides what to do (Builder repopulates the form;
// Dashboard might navigate-and-restore).
//
// Returns null if there are no recents — caller doesn't need to gate.

'use client';

import type { RecentAttempt } from './types';

interface RecentQuizzesRowProps {
  recents: RecentAttempt[];
  onSelect: (attempt: RecentAttempt) => void;
}

export function RecentQuizzesRow({ recents, onSelect }: RecentQuizzesRowProps) {
  if (recents.length === 0) return null;

  return (
    <div className="bk-recent-row">
      <span className="bk-recent-eyebrow">Recent</span>
      <div className="bk-recent-chips">
        {recents.map((r) => (
          <button
            key={r.attempt_id}
            type="button"
            className="bk-recent-chip"
            onClick={() => onSelect(r)}
            title={`Restore this configuration: ${r.intent === 'STUDY' ? 'Study' : 'Exam'} · ${r.mode_label} · ${r.summary}`}
          >
            <span className={'bk-recent-pill ' + (r.intent === 'STUDY' ? 'study' : 'exam')}>
              {r.intent === 'STUDY' ? 'Study' : 'Exam'}
            </span>
            <span className="bk-recent-summary">{r.summary}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
