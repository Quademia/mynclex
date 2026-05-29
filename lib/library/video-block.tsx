'use client';

// mynclex/lib/library/video-block.tsx
//
// Tiptap "Video" block for the tutor library editor (slice 11.6b).
//
// Stored as an atom block node `libVideo` with attrs:
//   { url, provider, videoId, title }
// Unlike the Image/PDF blocks there is NO upload and NO storage — we
// only persist the pasted url plus (for recognised providers) the
// parsed provider + id, and an optional title/caption. The iframe src
// is rebuilt on render via buildEmbedUrl so the embed format stays in
// one place.
//
// The NodeView has three states (classifyVideoUrl decides which):
//   • empty (no url) — a URL input + Embed button.
//   • embed (provider + videoId) — a responsive 16:9 iframe for a
//     recognised YouTube/Vimeo/Loom link, + optional caption.
//   • link (url, no provider) — any other safe http(s) link rendered
//     as a watch-card the student follows out to the source site.
//     This is the universal fallback so no valid link is ever rejected
//     (we can't embed arbitrary sites — cross-origin frame refusals are
//     silent — so we link out instead of showing a blank iframe).
// Every non-empty state offers a "Replace" control back to empty.

import { Node } from '@tiptap/core';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import { useState } from 'react';

import {
  classifyVideoUrl,
  buildEmbedUrl,
  hostLabel,
  VIDEO_PROVIDER_LABEL,
  type VideoProvider,
} from './video-embed';

export const VideoBlock = Node.create({
  name: 'libVideo',
  group: 'block',
  atom: true,
  draggable: false, // reordering is handled by the global DragHandle
  selectable: true,

  addAttributes() {
    return {
      url: { default: '' },
      provider: { default: null },
      videoId: { default: null },
      title: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-lib-video]' }];
  },

  renderHTML({ node }) {
    return [
      'div',
      {
        'data-lib-video': '',
        'data-provider': (node.attrs.provider as string | null) ?? '',
        'data-video-id': (node.attrs.videoId as string | null) ?? '',
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoBlockView);
  },
});

function VideoBlockView({
  node,
  updateAttributes,
  editor,
  selected,
  deleteNode,
}: NodeViewProps) {
  const provider = node.attrs.provider as VideoProvider | null;
  const videoId = node.attrs.videoId as string | null;
  const url = (node.attrs.url as string) ?? '';
  const title = (node.attrs.title as string) ?? '';
  const editable = editor.isEditable;

  // Embed state — recognised provider with a parsed id.
  if (provider && videoId) {
    return (
      <FilledVideo
        provider={provider}
        videoId={videoId}
        title={title}
        editable={editable}
        selected={selected}
        updateAttributes={updateAttributes}
        deleteNode={deleteNode}
      />
    );
  }

  // Link state — a valid URL we don't embed; rendered as a watch-card.
  if (url) {
    return (
      <VideoLinkCard
        url={url}
        title={title}
        editable={editable}
        selected={selected}
        updateAttributes={updateAttributes}
        deleteNode={deleteNode}
      />
    );
  }

  // Empty state — awaiting a pasted link.
  return (
    <VideoEmptyState
      editable={editable}
      onResolved={(attrs) => updateAttributes(attrs)}
      onRemove={() => deleteNode()}
    />
  );
}

function VideoEmptyState({
  editable,
  onResolved,
  onRemove,
}: {
  editable: boolean;
  onResolved: (attrs: {
    url: string;
    provider: VideoProvider | null;
    videoId: string | null;
  }) => void;
  onRemove: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const result = classifyVideoUrl(value);
    if (result.kind === 'invalid') {
      setError('Enter a valid video or web link (starting with https://).');
      return;
    }
    setError(null);
    if (result.kind === 'embed') {
      onResolved({
        url: value.trim(),
        provider: result.embed.provider,
        videoId: result.embed.videoId,
      });
    } else {
      // Any other safe link — store the url only; rendered as a card.
      onResolved({ url: result.link.url, provider: null, videoId: null });
    }
  }

  return (
    <NodeViewWrapper
      as="div"
      className="lib-video-block is-empty"
      data-lib-video=""
    >
      <div className="lib-video-uploader" contentEditable={false}>
        <span className="lib-video-uploader-label">Video</span>
        <div className="lib-video-input-row">
          <input
            type="url"
            className="lib-video-url-input"
            placeholder="Paste a video link — YouTube, Vimeo and Loom play inline; others link out"
            value={value}
            disabled={!editable}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button
            type="button"
            className="lib-video-embed-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
            disabled={!editable || value.trim() === ''}
          >
            Add
          </button>
        </div>
        {error ? <span className="lib-video-error">{error}</span> : null}
        {editable && (
          <button
            type="button"
            className="lib-video-remove-empty"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRemove}
          >
            Remove block
          </button>
        )}
      </div>
    </NodeViewWrapper>
  );
}

function FilledVideo({
  provider,
  videoId,
  title,
  editable,
  selected,
  updateAttributes,
  deleteNode,
}: {
  provider: VideoProvider;
  videoId: string;
  title: string;
  editable: boolean;
  selected: boolean;
  updateAttributes: NodeViewProps['updateAttributes'];
  deleteNode: NodeViewProps['deleteNode'];
}) {
  const embedUrl = buildEmbedUrl(provider, videoId);

  return (
    <NodeViewWrapper
      as="div"
      className={selected ? 'lib-video-block is-selected' : 'lib-video-block'}
      data-lib-video=""
    >
      <div className="lib-video-frame" contentEditable={false}>
        {embedUrl ? (
          <div className="lib-video-aspect">
            <iframe
              className="lib-video-iframe"
              src={embedUrl}
              title={title || `${VIDEO_PROVIDER_LABEL[provider]} video`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        ) : (
          <div className="lib-video-state lib-video-error">
            Could not build the embed for this video.
          </div>
        )}
        {editable && (
          <div className="lib-video-tools">
            <span className="lib-video-provider-pill">
              {VIDEO_PROVIDER_LABEL[provider]}
            </span>
            <button
              type="button"
              className="lib-video-replace"
              title="Replace video"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                updateAttributes({ provider: null, videoId: null, url: '' })
              }
            >
              Replace
            </button>
            <button
              type="button"
              className="lib-video-remove"
              title="Remove video"
              aria-label="Remove video"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => deleteNode()}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {editable ? (
        <input
          type="text"
          className="lib-video-caption-input"
          placeholder="Caption (optional)"
          value={title}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => updateAttributes({ title: e.target.value })}
        />
      ) : title ? (
        <div className="lib-video-caption">{title}</div>
      ) : null}
    </NodeViewWrapper>
  );
}

function VideoLinkCard({
  url,
  title,
  editable,
  selected,
  updateAttributes,
  deleteNode,
}: {
  url: string;
  title: string;
  editable: boolean;
  selected: boolean;
  updateAttributes: NodeViewProps['updateAttributes'];
  deleteNode: NodeViewProps['deleteNode'];
}) {
  const host = hostLabel(url);

  return (
    <NodeViewWrapper
      as="div"
      className={selected ? 'lib-video-block is-selected' : 'lib-video-block'}
      data-lib-video=""
    >
      <div className="lib-video-linkcard" contentEditable={false}>
        <span className="lib-video-linkcard-icon" aria-hidden="true">
          <VideoGlyph />
        </span>
        <div className="lib-video-linkcard-meta">
          {editable ? (
            <input
              type="text"
              className="lib-video-linkcard-title-input"
              placeholder="Video title"
              value={title}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => updateAttributes({ title: e.target.value })}
            />
          ) : (
            <span className="lib-video-linkcard-title">
              {title || 'Video'}
            </span>
          )}
          <span className="lib-video-linkcard-host">{host}</span>
        </div>
        <a
          className="lib-video-linkcard-open"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onMouseDown={(e) => e.stopPropagation()}
        >
          Watch video ↗
        </a>
        {editable && (
          <>
            <button
              type="button"
              className="lib-video-linkcard-replace"
              title="Replace video"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                updateAttributes({ url: '', provider: null, videoId: null })
              }
            >
              Replace
            </button>
            <button
              type="button"
              className="lib-video-linkcard-remove"
              title="Remove video"
              aria-label="Remove video"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => deleteNode()}
            >
              ×
            </button>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

function VideoGlyph() {
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
      <rect x="2" y="4" width="14" height="16" rx="2" />
      <path d="m16 9 6-3v12l-6-3" />
      <path d="m8 9 4 3-4 3z" fill="currentColor" stroke="none" />
    </svg>
  );
}
