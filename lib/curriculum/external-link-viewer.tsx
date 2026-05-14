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
// authoring, viewer for consuming).

'use client';

import { ViewerModalShell } from './viewer-modal-shell';
import { activityEstimatedMinutes } from './format';
import type { ActivityPayloadExternalLink, ProgrammeActivity } from './types';

// Render-time guard mirroring external-link-editor.tsx's safeParse.
// The action layer already restricts the scheme to http/https at
// write time (slice 9.3d-a) — this is cheap defence-in-depth so a
// bad value renders an honest "unavailable" state instead of a
// broken link. Returns the normalised href, or null.
function safeHttpUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

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
      <div className="external-link-viewer">
        {activity.description && (
          <p className="external-link-viewer-desc">{activity.description}</p>
        )}
        {activity.note && (
          <p className="external-link-viewer-note">
            <strong>Note:</strong> {activity.note}
          </p>
        )}
        {estMinutes != null && (
          <p className="external-link-viewer-est">
            Estimated time: ~{estMinutes} min
          </p>
        )}

        {url ? (
          <a
            className="external-link-viewer-open"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>Open link in new tab ↗</span>
            {domain && (
              <span className="external-link-viewer-domain">{domain}</span>
            )}
          </a>
        ) : (
          <p className="external-link-viewer-broken">
            This link isn&apos;t available yet — ask your tutor to check it.
          </p>
        )}
      </div>
    </ViewerModalShell>
  );
}
