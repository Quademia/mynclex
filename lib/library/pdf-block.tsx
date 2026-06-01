'use client';

// mynclex/lib/library/pdf-block.tsx
//
// Tiptap "PDF" block for the tutor library editor (slice 11.6b).
//
// Stored as an atom block node `libPdf` with attrs:
//   { assetId, title, filename }
// The bytes live in Supabase Storage (bucket nclex-library-pdfs)
// behind the shared media-asset foundation; the doc only carries the
// asset_id plus a display title + the original filename. The student
// read view (slice 11.13) renders the same JSON without Tiptap,
// minting its own enrolment-gated URL.
//
// The NodeView has two states:
//   • empty (no assetId) — an upload dropzone (UploadField). The
//     returned asset_id + filename are written to the node; the title
//     defaults to the filename (sans extension).
//   • filled — a link-card. The signed URL is minted on *click* (not
//     on render) via getLibraryPdfUrlAction, then opened in a new tab.
//     Minting on click sidesteps the 1-hour signed-URL expiry on a
//     note left open.

import { Node } from '@tiptap/core';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import { useState } from 'react';

import { UploadField } from '@/components/media/upload-field';
import { emitBlockUpload } from './block-upload-event';
import { getLibraryPdfUrlAction } from './pdf-actions';

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(0, dot) : filename;
}

export const PdfBlock = Node.create({
  name: 'libPdf',
  group: 'block',
  atom: true,
  draggable: false, // reordering is handled by the global DragHandle
  selectable: true,

  addAttributes() {
    return {
      assetId: { default: null },
      title: { default: '' },
      filename: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-lib-pdf]' }];
  },

  renderHTML({ node }) {
    return [
      'div',
      {
        'data-lib-pdf': '',
        'data-asset-id': (node.attrs.assetId as string | null) ?? '',
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PdfBlockView);
  },
});

function PdfBlockView({
  node,
  updateAttributes,
  editor,
  selected,
  deleteNode,
}: NodeViewProps) {
  const assetId = node.attrs.assetId as string | null;
  const title = (node.attrs.title as string) ?? '';
  const filename = (node.attrs.filename as string) ?? '';
  const editable = editor.isEditable;

  if (!assetId) {
    return (
      <NodeViewWrapper
        as="div"
        className="lib-pdf-block is-empty"
        data-lib-pdf=""
      >
        <div className="lib-pdf-uploader" contentEditable={false}>
          <UploadField
            purpose="LIBRARY_PDF"
            label="PDF"
            hint="PDF only, up to 25 MB. The student opens it in a new tab."
            onUploaded={(id, meta) =>
              updateAttributes({
                assetId: id,
                filename: meta.filename,
                title: stripExtension(meta.filename),
              })
            }
            onUploadingChange={emitBlockUpload}
            disabled={!editable}
          />
          {editable && (
            <button
              type="button"
              className="lib-pdf-remove-empty"
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
    <FilledPdf
      assetId={assetId}
      title={title}
      filename={filename}
      editable={editable}
      selected={selected}
      updateAttributes={updateAttributes}
      deleteNode={deleteNode}
    />
  );
}

function FilledPdf({
  assetId,
  title,
  filename,
  editable,
  selected,
  updateAttributes,
  deleteNode,
}: {
  assetId: string;
  title: string;
  filename: string;
  editable: boolean;
  selected: boolean;
  updateAttributes: NodeViewProps['updateAttributes'];
  deleteNode: NodeViewProps['deleteNode'];
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPdf() {
    if (opening) return;
    setOpening(true);
    setError(null);
    // Open a blank tab synchronously so the click gesture isn't lost
    // by the time the async URL mint returns (pop-up blockers gate on
    // the user gesture). Point it at the signed URL once we have it.
    const tab = window.open('', '_blank', 'noopener,noreferrer');
    const res = await getLibraryPdfUrlAction(assetId);
    if (res.ok) {
      if (tab) tab.location.href = res.url;
      else window.open(res.url, '_blank', 'noopener,noreferrer');
    } else {
      if (tab) tab.close();
      setError(res.error);
    }
    setOpening(false);
  }

  return (
    <NodeViewWrapper
      as="div"
      className={selected ? 'lib-pdf-block is-selected' : 'lib-pdf-block'}
      data-lib-pdf=""
    >
      <div className="lib-pdf-card" contentEditable={false}>
        <span className="lib-pdf-icon" aria-hidden="true">
          <PdfGlyph />
        </span>
        <div className="lib-pdf-meta">
          {editable ? (
            <input
              type="text"
              className="lib-pdf-title-input"
              placeholder="PDF title"
              value={title}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => updateAttributes({ title: e.target.value })}
            />
          ) : (
            <span className="lib-pdf-title">{title || filename || 'PDF'}</span>
          )}
          {filename ? (
            <span className="lib-pdf-filename">{filename}</span>
          ) : null}
          {error ? <span className="lib-pdf-error">{error}</span> : null}
        </div>
        <button
          type="button"
          className="lib-pdf-open"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openPdf}
          disabled={opening}
        >
          {opening ? 'Opening…' : 'Open PDF ↗'}
        </button>
        {editable && (
          <button
            type="button"
            className="lib-pdf-remove"
            title="Remove PDF"
            aria-label="Remove PDF"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => deleteNode()}
          >
            ×
          </button>
        )}
      </div>
    </NodeViewWrapper>
  );
}

function PdfGlyph() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}
