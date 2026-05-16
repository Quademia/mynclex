// mynclex/lib/curriculum/text-viewer.tsx
//
// Slice 10.5 — the Text reading activity viewer. Fourth of the
// per-type viewers. A *wide* modal (reuses <ViewerModalShell> at
// size="wide") — reading content wants a comfortable width, but
// in v1 the body is plain text with no rich formatting, so a
// modal still fits. When the rich-text editor lands and reading
// content gets substantial, the only thing that changes here is
// how the body renders (plain text → formatted) — and that's the
// natural point to revisit promoting Text to its own route.
//
// Renders entirely from the `activity` the list already loaded —
// no new query, no new route, no server action.

'use client';

import { ViewerModalShell } from './viewer-modal-shell';
import { activityEstimatedMinutes } from './format';
import { MarkDoneButton } from '@/lib/progress/mark-done-button';
import type { ActivityPayloadText, StudentActivity } from './types';

export function TextViewer({
  activity,
  onClose,
}: {
  activity: StudentActivity;
  onClose: () => void;
}) {
  const payload = activity.payload as ActivityPayloadText;
  const body = (payload.body ?? '').trim();
  const estMinutes = activityEstimatedMinutes(activity);

  return (
    <ViewerModalShell title={activity.title} onClose={onClose} size="wide">
      <div className="viewer-modal-content">
        {activity.description && (
          <p className="viewer-modal-desc">{activity.description}</p>
        )}
        {activity.note && (
          <p className="viewer-modal-note">
            <strong>Note:</strong> {activity.note}
          </p>
        )}
        {estMinutes != null && (
          <p className="viewer-modal-est">Estimated time: ~{estMinutes} min</p>
        )}

        {body ? (
          <div className="text-viewer-body">{body}</div>
        ) : (
          <p className="text-viewer-empty">
            This reading doesn&apos;t have any content yet.
          </p>
        )}

        <MarkDoneButton
          activityId={activity.activity_id}
          isDone={activity.isDone}
        />
      </div>
    </ViewerModalShell>
  );
}
