// mynclex/lib/curriculum/external-link-viewer.tsx
//
// Slice 10.2 — the External link activity viewer. First of the
// per-type viewers. An external link is light (a URL + a little
// context), so its viewer is a modal, not a page — it opens over
// the curriculum/weekly/calendar view the student was on, shows
// the activity's info + a clickable link, and they're done.
//
// Renders entirely from the `activity` the list already loaded —
// no new query, no new route.
//
// Pairs with the tutor-side external-link-editor.tsx (editor for
// authoring, viewer for consuming). Shared content classes
// (.viewer-modal-*) come from <ViewerModalShell>'s vocabulary.

'use client';

import { ViewerModalShell } from './viewer-modal-shell';
import { activityEstimatedMinutes, safeHttpUrl } from './format';
import type { ActivityPayloadExternalLink, ProgrammeActivity } from './types';

export function ExternalLinkViewer({
  activity,
  onClose,
}: {
  activity: ProgrammeActivity;
  onClose: () => void;
}) {
  const payload = activity.payload as ActivityPayloadExternalLink;
  const url = safeHttpUrl(payload.url);
  const estMinutes = activityEstimatedMinutes(activity);
  const domain = url ? new URL(url).hostname.replace(/^www\./, '') : null;

  return (
    <ViewerModalShell title={activity.title} onClose={onClose}>
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

        {url ? (
          <a
            className="viewer-modal-cta"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>Open link in new tab ↗</span>
            {domain && <span className="viewer-modal-cta-sub">{domain}</span>}
          </a>
        ) : (
          <p className="viewer-modal-broken">
            This link isn&apos;t available yet — ask your tutor to check it.
          </p>
        )}
      </div>
    </ViewerModalShell>
  );
}
