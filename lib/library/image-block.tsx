'use client';

// mynclex/lib/library/image-block.tsx
//
// Tiptap "Image" block for the tutor library editor (slice 11.6a).
//
// Stored as an atom block node `libImage` with three attrs:
//   { assetId, alt, caption }
// The bytes live in Supabase Storage (bucket nclex-library-images)
// behind the shared media-asset foundation; the doc only carries the
// asset_id. The student read view (slice 11.13) renders the same JSON
// without Tiptap, minting its own enrolment-gated URL.
//
// The NodeView has two states:
//   • empty (no assetId) — an upload dropzone. The picked file is
//     downscaled in the browser (resizeImage) before it hits the
//     upload action, then the returned asset_id is written to the
//     node.
//   • filled — fetches a 1-hour signed URL via getLibraryImageUrlAction
//     and renders the <img>, plus alt-text + optional caption inputs.
//
// Alt text is collected here but NOT enforced at publish — that gate
// lands in slice 11.10.

import { Node } from '@tiptap/core';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import { useEffect, useState } from 'react';

import { UploadField } from '@/components/media/upload-field';
import { resizeImage } from '@/lib/media/resize-image';
import { getLibraryImageUrlAction } from './image-actions';
import { emitBlockUpload } from './block-upload-event';

export const ImageBlock = Node.create({
  name: 'libImage',
  group: 'block',
  atom: true,
  draggable: false, // reordering is handled by the global DragHandle
  selectable: true,

  addAttributes() {
    return {
      assetId: { default: null },
      alt: { default: '' },
      caption: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-lib-image]' }];
  },

  renderHTML({ node }) {
    return [
      'figure',
      {
        'data-lib-image': '',
        'data-asset-id': (node.attrs.assetId as string | null) ?? '',
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView);
  },
});

function ImageBlockView({
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
        data-lib-image=""
      >
        <div className="lib-image-uploader" contentEditable={false}>
          <UploadField
            purpose="LIBRARY_IMAGE"
            label="Image"
            hint="PNG, JPG or WebP. Large images are shrunk automatically (max 5 MB)."
            transform={(file) => resizeImage(file)}
            onUploaded={(id) => updateAttributes({ assetId: id })}
            onUploadingChange={emitBlockUpload}
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
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setError(null);
    getLibraryImageUrlAction(assetId).then((res) => {
      if (cancelled) return;
      if (res.ok) setUrl(res.url);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return (
    <NodeViewWrapper
      as="figure"
      className={selected ? 'lib-image-block is-selected' : 'lib-image-block'}
      data-lib-image=""
    >
      <div className="lib-image-frame" contentEditable={false}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={alt} className="lib-image-img" />
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
