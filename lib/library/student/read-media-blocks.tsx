// mynclex/lib/library/student/read-media-blocks.tsx
//
// Read-only media blocks for the student note view (slice 11.13a):
// image, PDF, video. Images + PDFs mint a short-lived signed URL via
// the enrolment-gated student actions on mount; video builds an embed
// (or a link card) from the stored provider/videoId — no network.
//
// They reuse the editor blocks' presentational classes (.lib-image-*,
// .lib-pdf-*, .lib-video-*) so they look identical, minus the authoring
// controls.

'use client';

import { useEffect, useState } from 'react';
import {
  getStudentNoteImageUrlAction,
  getStudentNotePdfUrlAction,
} from './read-media-actions';

type UrlState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error' };

// ── Image ────────────────────────────────────────────────────────────
export function ImageRead({
  noteId,
  assetId,
  alt,
  caption,
}: {
  noteId: string;
  assetId: string | null;
  alt: string;
  caption: string;
}) {
  const [state, setState] = useState<UrlState>(() =>
    assetId ? { status: 'loading' } : { status: 'error' },
  );

  useEffect(() => {
    if (!assetId) return;
    let live = true;
    getStudentNoteImageUrlAction(noteId, assetId).then((res) => {
      if (!live) return;
      setState(
        res.ok ? { status: 'ready', url: res.url } : { status: 'error' },
      );
    });
    return () => {
      live = false;
    };
  }, [noteId, assetId]);

  return (
    <figure className="lib-image-frame">
      {state.status === 'ready' ? (
        // Signed, short-lived Storage URL — next/image can't optimise it.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="lib-image-img" src={state.url} alt={alt} />
      ) : state.status === 'loading' ? (
        <div className="lib-image-state lib-image-loading">Loading image…</div>
      ) : (
        <div className="lib-image-state lib-image-error">
          Image unavailable.
        </div>
      )}
      {caption && <figcaption className="lib-image-figcaption">{caption}</figcaption>}
    </figure>
  );
}

// ── PDF ──────────────────────────────────────────────────────────────
export function PdfRead({
  noteId,
  assetId,
  title,
  filename,
}: {
  noteId: string;
  assetId: string | null;
  title: string;
  filename: string;
}) {
  const [state, setState] = useState<UrlState>(() =>
    assetId ? { status: 'loading' } : { status: 'error' },
  );

  useEffect(() => {
    if (!assetId) return;
    let live = true;
    getStudentNotePdfUrlAction(noteId, assetId).then((res) => {
      if (!live) return;
      setState(
        res.ok ? { status: 'ready', url: res.url } : { status: 'error' },
      );
    });
    return () => {
      live = false;
    };
  }, [noteId, assetId]);

  return (
    <div className="lib-pdf-card">
      <span className="lib-pdf-icon" aria-hidden="true">
        📄
      </span>
      <div className="lib-pdf-meta">
        <div className="lib-pdf-title">{title || 'PDF document'}</div>
        {filename && <div className="lib-pdf-filename">{filename}</div>}
      </div>
      {state.status === 'ready' ? (
        <a
          className="lib-pdf-open"
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open
        </a>
      ) : state.status === 'loading' ? (
        <span className="lib-pdf-open" aria-disabled="true">
          …
        </span>
      ) : (
        <span className="lib-pdf-error">Unavailable</span>
      )}
    </div>
  );
}

// ── Video ────────────────────────────────────────────────────────────
function embedSrc(
  provider: string | null,
  videoId: string | null,
): string | null {
  if (!videoId) return null;
  switch (provider) {
    case 'youtube':
      return `https://www.youtube.com/embed/${videoId}`;
    case 'vimeo':
      return `https://player.vimeo.com/video/${videoId}`;
    case 'loom':
      return `https://www.loom.com/embed/${videoId}`;
    default:
      return null;
  }
}

export function VideoRead({
  url,
  provider,
  videoId,
  title,
  caption,
}: {
  url: string;
  provider: string | null;
  videoId: string | null;
  title: string;
  caption: string;
}) {
  const src = embedSrc(provider, videoId);

  if (src) {
    return (
      <div className="lib-video-frame">
        <div className="lib-video-aspect">
          <iframe
            className="lib-video-iframe"
            src={src}
            title={title || 'Embedded video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        {caption && <div className="lib-video-caption">{caption}</div>}
      </div>
    );
  }

  // No safe embed — degrade to a link card.
  return (
    <div className="lib-video-linkcard">
      <span className="lib-video-linkcard-icon" aria-hidden="true">
        ▶
      </span>
      <div className="lib-video-linkcard-meta">
        <div className="lib-pdf-title">{title || 'Video'}</div>
        {url && <div className="lib-video-linkcard-host">{url}</div>}
      </div>
      {url && (
        <a
          className="lib-video-linkcard-open"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open
        </a>
      )}
    </div>
  );
}
