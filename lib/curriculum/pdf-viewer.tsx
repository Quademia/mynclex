// mynclex/lib/curriculum/pdf-viewer.tsx
//
// Slice 10.4 — the PDF activity viewer. Third of the per-type
// viewers; a modal, reusing <ViewerModalShell> + the shared
// .viewer-modal-* vocabulary.
//
// Unlike External link and Live session, a PDF activity's payload
// only carries an opaque pdf_asset_id — the file lives in a
// private bucket. So the modal does a small server fetch when it
// opens (getStudentPdfActivityUrl) to mint a short-lived signed
// URL, with a "preparing…" state while it does. The student opens
// the PDF in a new tab; the browser's built-in viewer handles
// rendering, download, and print — we don't embed it.

'use client';

import { useEffect, useState } from 'react';
import { ViewerModalShell } from './viewer-modal-shell';
import { activityEstimatedMinutes, formatFileSize } from './format';
import { getStudentPdfActivityUrl } from './student-actions';
import { MarkDoneButton } from '@/lib/progress/mark-done-button';
import type { StudentActivity } from './types';

type FetchState =
  | { phase: 'loading' }
  | {
      phase: 'ready';
      filename: string;
      sizeBytes: number;
      url: string;
    }
  | { phase: 'error'; message: string };

export function PdfViewer({
  activity,
  onClose,
}: {
  activity: StudentActivity;
  onClose: () => void;
}) {
  const [state, setState] = useState<FetchState>({ phase: 'loading' });
  const estMinutes = activityEstimatedMinutes(activity);

  // Mint the signed URL on open. The modal mounts fresh each time
  // it's opened, so this re-fetches a fresh link every time —
  // correct, since signed URLs are short-lived. The `cancelled`
  // guard handles unmount + React Strict Mode's double-invoke.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getStudentPdfActivityUrl(activity.activity_id);
      if (cancelled) return;
      if (result.ok) {
        setState({
          phase: 'ready',
          filename: result.original_filename,
          sizeBytes: result.size_bytes,
          url: result.signed_url,
        });
      } else {
        setState({ phase: 'error', message: result.error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activity.activity_id]);

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

        {state.phase === 'loading' && (
          <p className="pdf-viewer-status">Preparing the document…</p>
        )}

        {state.phase === 'error' && (
          <p className="viewer-modal-broken">{state.message}</p>
        )}

        {state.phase === 'ready' && (
          <>
            <div className="pdf-viewer-file">
              <span className="pdf-viewer-file-icon" aria-hidden="true">
                📄
              </span>
              <span className="pdf-viewer-file-meta">
                <span className="pdf-viewer-file-name">{state.filename}</span>
                <span className="pdf-viewer-file-size">
                  {formatFileSize(state.sizeBytes)}
                </span>
              </span>
            </div>
            <a
              className="viewer-modal-cta"
              href={state.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open PDF in new tab ↗
            </a>
          </>
        )}

        <MarkDoneButton
          activityId={activity.activity_id}
          isDone={activity.isDone}
        />
      </div>
    </ViewerModalShell>
  );
}
