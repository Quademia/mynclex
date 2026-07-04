'use client';

// mynclex/lib/authoring/bank-image-lightbox.tsx
//
// Bank rich-content Slice 7 follow-up — full-screen expand for a bank
// image (Sam: inline placement is right, but detail-dense images like
// ECG strips are unreadable at column width; stored images carry up to
// 1600px of detail, the panel shows ~a third of it).
//
// Pattern = the familiar photo lightbox: tap the inline image → a
// dimmed full-screen overlay with the image fit-to-screen; tap the
// image again → 100% natural size (scroll to pan); tap anywhere else /
// the × / Esc → back to the quiz, untouched. Also exam-authentic — the
// real NGN exam lets candidates enlarge exhibit images.
//
// Portaled to <body> so the runner panel's overflow/stacking can't
// clip it. No re-fetch: the caller passes the already-resolved signed
// URL (the browser serves the bytes from its HTTP cache).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function BankImageLightbox({
  url,
  alt,
  caption,
  onClose,
}: {
  url: string;
  alt: string;
  caption: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState<'fit' | 'full'>('fit');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    // Hold the page still behind the overlay while it's open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className={'auth-lightbox' + (zoom === 'full' ? ' is-full' : '')}
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Expanded image'}
      onClick={onClose}
    >
      <button
        type="button"
        className="auth-lightbox-close"
        aria-label="Close"
        title="Close"
        onClick={onClose}
      >
        ×
      </button>
      <figure className="auth-lightbox-fig">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className="auth-lightbox-img"
          title={zoom === 'fit' ? 'View full size' : 'Fit to screen'}
          onClick={(e) => {
            e.stopPropagation();
            setZoom((z) => (z === 'fit' ? 'full' : 'fit'));
          }}
        />
        {caption && (
          <figcaption
            className="auth-lightbox-caption"
            onClick={(e) => e.stopPropagation()}
          >
            {caption}
          </figcaption>
        )}
      </figure>
    </div>,
    document.body,
  );
}
