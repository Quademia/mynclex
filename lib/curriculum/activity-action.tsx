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
import { activityEstimatedMinutes } from './format';
import { ExternalLinkViewer } from './external-link-viewer';
import type { ProgrammeActivity } from './types';

export function ActivityAction({ activity }: { activity: ProgrammeActivity }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const estMinutes = activityEstimatedMinutes(activity);

  // Which types have a wired-up viewer. Grows one entry per
  // per-type viewer slice; everything else stays disabled.
  const isLaunchable = activity.type === 'EXTERNAL_LINK';

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
    </div>
  );
}
