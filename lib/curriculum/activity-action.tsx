// mynclex/lib/curriculum/activity-action.tsx
//
// Slice 10.2 — the shared "action" piece for an activity row. ONE
// component, reused by every list view that shows activities — the
// curriculum launcher today, the weekly + calendar views later.
// Each list view just drops in <ActivityAction activity={a} />;
// none of them need to know anything about activity types.
//
// It renders the action area (estimated-time line + a uniform
// "Open" button) and owns the per-type dispatch — what "Open"
// actually does, sized correctly per type:
//   EXTERNAL_LINK → opens the External link modal viewer
//   (others)      → button stays disabled until that type's
//                   viewer slice lands
//
// It also owns the open/close state for any modal it launches, so
// the list views carry zero modal machinery.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { activityEstimatedMinutes } from './format';
import { ExternalLinkViewer } from './external-link-viewer';
import { OnlineLiveSessionViewer } from './online-live-session-viewer';
import { PdfViewer } from './pdf-viewer';
import { TextViewer } from './text-viewer';
import { QuizLaunchViewer } from './quiz-launch-viewer';
import type {
  ActivityPayloadMock,
  ActivityPayloadPracticeQuiz,
  StudentActivity,
} from './types';

export function ActivityAction({
  activity,
  libraryBasePath,
}: {
  activity: StudentActivity;
  // Slice 11.11a — base path (programme or cohort) for the library read
  // view a LIBRARY_NOTE activity links to. Only the curriculum viewer
  // passes it; other callers (none yet) can omit it.
  libraryBasePath?: string;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const estMinutes = activityEstimatedMinutes(activity);

  // Library Note opens the read view on its own page (not a modal) —
  // render an "Open" link instead of the dispatch button.
  if (activity.type === 'LIBRARY_NOTE') {
    const href =
      libraryBasePath && activity.libraryNoteId
        ? `${libraryBasePath}/note/${activity.libraryNoteId}`
        : null;
    return (
      <div className="student-activity-action">
        {href ? (
          <Link className="student-activity-launch" href={href}>
            Open
          </Link>
        ) : (
          <button type="button" className="student-activity-launch" disabled>
            Open
          </button>
        )}
      </div>
    );
  }

  // Which types have a wired-up viewer. Grows one entry per
  // per-type viewer slice. Mock + Practice quiz become launchable
  // only when a quiz is linked (payload.quiz_id non-null) —
  // defence in depth on top of slice 2's publish gate, which
  // blocks publishing an unlinked Mock/Practice activity. A
  // published activity with a null quiz_id (legacy edge) shows the
  // Open button disabled rather than crashing the launch modal.
  const isQuizActivity =
    activity.type === 'MOCK' || activity.type === 'PRACTICE_QUIZ';
  const quizId = isQuizActivity
    ? (activity.payload as ActivityPayloadMock | ActivityPayloadPracticeQuiz)
        .quiz_id
    : null;
  const isLaunchable =
    activity.type === 'TEXT' ||
    activity.type === 'EXTERNAL_LINK' ||
    activity.type === 'ONLINE_LIVE_SESSION' ||
    activity.type === 'PDF' ||
    (isQuizActivity && quizId != null);

  return (
    <div className="student-activity-action">
      {estMinutes != null && (
        <span className="student-activity-est">~{estMinutes} min</span>
      )}
      <button
        type="button"
        className="student-activity-launch"
        disabled={!isLaunchable}
        onClick={() => setViewerOpen(true)}
      >
        Open
      </button>

      {viewerOpen && activity.type === 'EXTERNAL_LINK' && (
        <ExternalLinkViewer
          activity={activity}
          onClose={() => setViewerOpen(false)}
        />
      )}
      {viewerOpen && activity.type === 'ONLINE_LIVE_SESSION' && (
        <OnlineLiveSessionViewer
          activity={activity}
          onClose={() => setViewerOpen(false)}
        />
      )}
      {viewerOpen && activity.type === 'PDF' && (
        <PdfViewer
          activity={activity}
          onClose={() => setViewerOpen(false)}
        />
      )}
      {viewerOpen && activity.type === 'TEXT' && (
        <TextViewer
          activity={activity}
          onClose={() => setViewerOpen(false)}
        />
      )}
      {viewerOpen &&
        (activity.type === 'MOCK' || activity.type === 'PRACTICE_QUIZ') && (
          <QuizLaunchViewer
            target={activity}
            onClose={() => setViewerOpen(false)}
          />
        )}
    </div>
  );
}
