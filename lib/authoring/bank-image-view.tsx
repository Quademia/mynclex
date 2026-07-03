'use client';

// mynclex/lib/authoring/bank-image-view.tsx
//
// Bank rich-content Slice 7 — the READ-side render of a `bankImage`
// node. Tiptap-free: NarrativeView (and later RichRender hosts in
// Slice 8) drop this in wherever a bank rich doc carries an image.
//
// The URL resolver is INJECTED because the gate differs by context:
//   • curator preview / static editor cards → getBankImageUrlAction
//     (owner-or-bank-curator);
//   • student runner → the attempt-anchored action (Slice 7c) — the
//     asset must be referenced by the caller's own attempt's frozen
//     tab snapshots.
// Both are server actions, so a server component may pass them
// straight through; client hosts may also pass a bound closure.
//
// Presentational classes reuse the library's .lib-image-* styles
// (styles/library.css is loaded app-wide).

import { useEffect, useState } from 'react';
import type { AssetUrlResult } from '@/lib/media/types';

export type BankImageResolver = (assetId: string) => Promise<AssetUrlResult>;

// Resolution state, tagged with the asset id it belongs to — a stale
// result for a previous assetId is simply ignored at render time, so
// the effect never needs a synchronous setState "reset" (which the
// react-hooks/set-state-in-effect rule rightly flags).
type ResolveState =
  | { assetId: string; url: string }
  | { assetId: string; error: string };

export function BankImageView({
  assetId,
  alt,
  caption,
  resolve,
}: {
  assetId: string;
  alt: string;
  caption: string;
  resolve: BankImageResolver;
}) {
  const [state, setState] = useState<ResolveState | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolve(assetId).then(
      (res) => {
        if (cancelled) return;
        if (res.ok) setState({ assetId, url: res.url });
        else setState({ assetId, error: res.error });
      },
      () => {
        if (!cancelled) setState({ assetId, error: 'Could not load image.' });
      },
    );
    return () => {
      cancelled = true;
    };
    // `resolve` is deliberately not a dependency — hosts pass inline
    // closures (new identity every render); re-fetching on identity
    // change would loop. The asset id is the real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  const current = state && state.assetId === assetId ? state : null;
  const url = current && 'url' in current ? current.url : null;
  const error = current && 'error' in current ? current.error : null;

  return (
    <figure className="lib-image-block">
      <div className="lib-image-frame">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={alt} className="lib-image-img" />
        ) : error ? (
          <div className="lib-image-state lib-image-error">{error}</div>
        ) : (
          <div className="lib-image-state lib-image-loading">Loading image…</div>
        )}
      </div>
      {caption ? (
        <figcaption className="lib-image-figcaption">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
