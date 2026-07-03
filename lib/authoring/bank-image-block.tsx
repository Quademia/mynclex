'use client';

// mynclex/lib/authoring/bank-image-block.tsx
//
// Bank rich-content Slice 7 — the EDITOR-side image block for bank rich
// docs. A parametrised sibling of the library's lib/library/image-block.tsx
// (deliberately its own node so the two doc ecosystems stay decoupled):
//
//   node `bankImage`, attrs { assetId, alt, caption }
//
// The bytes live in Supabase Storage (bucket nclex-bank-images, purpose
// BANK_IMAGE) behind the shared media-asset foundation; the doc only
// carries the asset_id. Slice 7 hosts it in the chart-tab NARRATIVE body
// (case study + trend, via the one shared NarrativeTabEditorV2); Slice 8
// points the same block at question stems — keep it host-agnostic.
//
// Read-side rendering is NOT here: NarrativeView / RichRender render the
// node via <BankImageView> with a context-appropriate URL resolver
// (curator action in previews, the attempt-anchored action in the runner).
//
// The NodeView has two states, mirroring the library block:
//   • empty (no assetId) — an upload dropzone; the picked file is
//     downscaled in the browser (resizeImage) before the upload action,
//     then the returned asset_id is written to the node.
//   • filled — fetches a 1-hour signed URL via getBankImageUrlAction
//     (curator gate: owner-or-bank-curator) and renders the <img>, plus
//     alt-text + optional caption inputs.
//
// Alt text is collected but advisory (matches the library's posture —
// no publish gate in Slice 7). Presentational classes reuse the
// library's .lib-image-* styles (styles/library.css is loaded app-wide).

import { Node } from '@tiptap/core';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';

import { UploadField } from '@/components/media/upload-field';
import { resizeImage } from '@/lib/media/resize-image';
import { getBankImageUrlAction } from './bank-image-actions';
import { emitAuthBlockUpload } from './block-upload-event';
import {
  getCachedBankImageUrl,
  cacheBankImageUrl,
  evictBankImageUrl,
} from './bank-image-url-cache';

export const BankImageBlock = Node.create({
  name: 'bankImage',
  group: 'block',
  atom: true,
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      assetId: { default: null },
      alt: { default: '' },
      caption: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-bank-image]' }];
  },

  renderHTML({ node }) {
    return [
      'figure',
      {
        'data-bank-image': '',
        'data-asset-id': (node.attrs.assetId as string | null) ?? '',
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BankImageBlockView);
  },
});

function BankImageBlockView({
  node,
  updateAttributes,
  editor,
  selected,
  deleteNode,
}: NodeViewProps) {
  const assetId = node.attrs.assetId as string | null;
  const alt = (node.attrs.alt as string) ?? '';
  const caption = (node.attrs.caption as string) ?? '';
  const editable = editor.isEditable;

  if (!assetId) {
    return (
      <NodeViewWrapper
        as="figure"
        className="lib-image-block is-empty"
        data-bank-image=""
      >
        <div className="lib-image-uploader" contentEditable={false}>
          <UploadField
            purpose="BANK_IMAGE"
            label="Image"
            hint="PNG, JPG or WebP. Large images are shrunk automatically (max 5 MB)."
            transform={(file) => resizeImage(file)}
            onUploaded={(id) => updateAttributes({ assetId: id })}
            onUploadingChange={emitAuthBlockUpload}
            disabled={!editable}
          />
          {editable && (
            <button
              type="button"
              className="lib-image-remove-empty"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => deleteNode()}
            >
              Remove block
            </button>
          )}
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <FilledImage
      assetId={assetId}
      alt={alt}
      caption={caption}
      editable={editable}
      selected={selected}
      updateAttributes={updateAttributes}
      deleteNode={deleteNode}
    />
  );
}

// Resolution state tagged with its asset id — a stale result for a
// previous assetId is ignored at render time, so the effect needs no
// synchronous setState "reset" (react-hooks/set-state-in-effect).
type ResolveState =
  | { assetId: string; url: string }
  | { assetId: string; error: string };

function FilledImage({
  assetId,
  alt,
  caption,
  editable,
  selected,
  updateAttributes,
  deleteNode,
}: {
  assetId: string;
  alt: string;
  caption: string;
  editable: boolean;
  selected: boolean;
  updateAttributes: NodeViewProps['updateAttributes'];
  deleteNode: NodeViewProps['deleteNode'];
}) {
  const [state, setState] = useState<ResolveState | null>(null);
  // Bumped when a cached URL fails to load — re-runs the fetch effect
  // after the eviction. Capped at one retry per mount.
  const [retryTick, setRetryTick] = useState(0);
  const retriedRef = useRef(false);

  // Cache first (bank-image-url-cache): a hit renders immediately with
  // no server round-trip — tab switches in the wrapper stay instant.
  const cachedUrl = getCachedBankImageUrl(assetId);
  const current = state && state.assetId === assetId ? state : null;
  const url = current && 'url' in current ? current.url : cachedUrl;
  const error = current && 'error' in current ? current.error : null;

  useEffect(() => {
    if (getCachedBankImageUrl(assetId)) return; // nothing to fetch
    let cancelled = false;
    getBankImageUrlAction(assetId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        cacheBankImageUrl(assetId, res.url);
        setState({ assetId, url: res.url });
      } else {
        setState({ assetId, error: res.error });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [assetId, retryTick]);

  function onImgError() {
    if (retriedRef.current) return; // one re-mint per mount, then give up
    retriedRef.current = true;
    evictBankImageUrl(assetId);
    setState({ assetId, error: 'Reloading image…' });
    setRetryTick((t) => t + 1);
  }

  return (
    <NodeViewWrapper
      as="figure"
      className={selected ? 'lib-image-block is-selected' : 'lib-image-block'}
      data-bank-image=""
    >
      <div className="lib-image-frame" contentEditable={false}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={alt} className="lib-image-img" onError={onImgError} />
        ) : error ? (
          <div className="lib-image-state lib-image-error">{error}</div>
        ) : (
          <div className="lib-image-state lib-image-loading">Loading image…</div>
        )}
        {editable && (
          <button
            type="button"
            className="lib-image-remove"
            title="Remove image"
            aria-label="Remove image"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => deleteNode()}
          >
            ×
          </button>
        )}
      </div>

      {editable ? (
        <div className="lib-image-fields" contentEditable={false}>
          <input
            type="text"
            className="lib-image-field lib-image-alt"
            placeholder="Describe this image (alt text)"
            value={alt}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => updateAttributes({ alt: e.target.value })}
          />
          <input
            type="text"
            className="lib-image-field lib-image-caption"
            placeholder="Caption (optional)"
            value={caption}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => updateAttributes({ caption: e.target.value })}
          />
        </div>
      ) : caption ? (
        <figcaption className="lib-image-figcaption">{caption}</figcaption>
      ) : null}
    </NodeViewWrapper>
  );
}
