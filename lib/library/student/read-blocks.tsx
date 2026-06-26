// mynclex/lib/library/student/read-blocks.tsx
//
// The read-view block renderer (slice 11.13a). One dispatcher walks the
// note's Tiptap doc and renders each block read-only. Simple text blocks
// (heading / paragraph / list / quote / code / rule) are handled inline;
// the richer blocks (callout, drug card, lab values, table) and media
// (image / pdf / video) delegate to their own read pieces — mirroring
// the editor's one-file-per-block structure.
//
// All blocks reuse the editor's standalone .lib-* classes so they look
// identical; the text blocks render inside a `.lib-read-prose` container
// whose styles mirror the editor's ProseMirror prose (the editor's prose
// CSS is scoped to `.lib-tiptap-body .ProseMirror`, so the read body
// needs its own mirror — see styles/library.css SLICE 11.13).

import type { CSSProperties, ReactNode } from 'react';
import { RenderInline, type ReadNode } from './read-inline';
import { ImageRead, PdfRead, VideoRead } from './read-media-blocks';
import { EmbedPlayer } from './embed-player';
import { CALLOUT_TONES, CALLOUT_TONE_META } from '../callout-block';
import type { DrugField } from '../drug-card-block';
import type { LabColumn } from '../lab-values-block';

export type ReadHeading = { id: string; level: 2 | 3; text: string };

// `renderEmbed` lets a host swap the embedded-questions leaf. The student
// read view leaves it undefined → the interactive EmbedPlayer (default).
// The tutor programme-library preview injects a read-only, non-writing
// renderer (it shows what students answer, but never logs an attempt).
type ReadCtx = {
  noteId: string;
  renderEmbed?: (noteId: string, blockId: string, title: string) => ReactNode;
};

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function headingText(node: ReadNode): string {
  return (node.content ?? []).map((n) => n.text ?? '').join('');
}

function alignStyle(node: ReadNode): CSSProperties | undefined {
  const a = node.attrs?.textAlign;
  if (a === 'center' || a === 'right' || a === 'justify') {
    return { textAlign: a };
  }
  return undefined;
}

// Headings for the Contents rail. Ordinal ids (`h-0`, `h-1`, …) match
// the anchors RenderBlocks assigns, so the TOC + scroll-spy line up.
export function extractHeadings(blocks: ReadNode[]): ReadHeading[] {
  const out: ReadHeading[] = [];
  let i = 0;
  for (const b of blocks) {
    if (b.type === 'heading') {
      out.push({
        id: `h-${i}`,
        level: Number(b.attrs?.level) === 3 ? 3 : 2,
        text: headingText(b),
      });
      i++;
    }
  }
  return out;
}

export function RenderBlocks({
  blocks,
  ctx,
}: {
  blocks: ReadNode[];
  ctx: ReadCtx;
}) {
  let h = 0;
  return (
    <>
      {blocks.map((b, idx) => {
        let anchorId: string | undefined;
        if (b.type === 'heading') {
          anchorId = `h-${h}`;
          h++;
        }
        return (
          <RenderBlock key={idx} node={b} anchorId={anchorId} ctx={ctx} />
        );
      })}
    </>
  );
}

function RenderBlock({
  node,
  anchorId,
  ctx,
}: {
  node: ReadNode;
  anchorId?: string;
  ctx: ReadCtx;
}): ReactNode {
  switch (node.type) {
    case 'heading': {
      const level = Number(node.attrs?.level) === 3 ? 3 : 2;
      const inner = <RenderInline content={node.content} />;
      return level === 3 ? (
        <h3 id={anchorId} style={alignStyle(node)}>
          {inner}
        </h3>
      ) : (
        <h2 id={anchorId} style={alignStyle(node)}>
          {inner}
        </h2>
      );
    }
    case 'paragraph':
      return (
        <p style={alignStyle(node)}>
          <RenderInline content={node.content} />
        </p>
      );
    case 'bulletList':
      return (
        <ul>
          {(node.content ?? []).map((li, i) => (
            <li key={i}>
              <RenderChildren nodes={li.content} ctx={ctx} />
            </li>
          ))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol>
          {(node.content ?? []).map((li, i) => (
            <li key={i}>
              <RenderChildren nodes={li.content} ctx={ctx} />
            </li>
          ))}
        </ol>
      );
    case 'blockquote':
      return (
        <blockquote>
          <RenderChildren nodes={node.content} ctx={ctx} />
        </blockquote>
      );
    case 'codeBlock':
      return (
        <pre>
          <code>{(node.content ?? []).map((n) => n.text ?? '').join('')}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr />;
    case 'callout':
      return <RenderCallout node={node} />;
    case 'drug_card':
      return <RenderDrugCard node={node} />;
    case 'lab_values':
      return <RenderLabValues node={node} />;
    case 'table':
      return <RenderTable node={node} ctx={ctx} />;
    case 'libImage':
      return (
        <ImageRead
          noteId={ctx.noteId}
          assetId={
            typeof node.attrs?.assetId === 'string' ? node.attrs.assetId : null
          }
          alt={asString(node.attrs?.alt)}
          caption={asString(node.attrs?.caption)}
        />
      );
    case 'libPdf':
      return (
        <PdfRead
          noteId={ctx.noteId}
          assetId={
            typeof node.attrs?.assetId === 'string' ? node.attrs.assetId : null
          }
          title={asString(node.attrs?.title)}
          filename={asString(node.attrs?.filename)}
        />
      );
    case 'libVideo':
      return (
        <VideoRead
          url={asString(node.attrs?.url)}
          provider={
            typeof node.attrs?.provider === 'string'
              ? node.attrs.provider
              : null
          }
          videoId={
            typeof node.attrs?.videoId === 'string' ? node.attrs.videoId : null
          }
          title={asString(node.attrs?.title)}
          caption={asString(node.attrs?.caption)}
        />
      );
    case 'embedded_questions': {
      // The inline player (11.13b). block_id was backfilled onto every
      // existing block + stamped on new ones; if somehow absent, skip
      // rather than render an unkeyed, un-recordable player.
      const blockId =
        typeof node.attrs?.id === 'string' ? node.attrs.id : null;
      if (!blockId) return null;
      const title =
        typeof node.attrs?.title === 'string' ? node.attrs.title : '';
      if (ctx.renderEmbed) return ctx.renderEmbed(ctx.noteId, blockId, title);
      // Anchor so "My practice" can deep-link to this block
      // (…/note/<id>#practice-<blockId>). scroll-margin keeps it clear of
      // any sticky chrome.
      return (
        <div id={`practice-${blockId}`} style={{ scrollMarginTop: '80px' }}>
          <EmbedPlayer noteId={ctx.noteId} blockId={blockId} title={title} />
        </div>
      );
    }
    default:
      return null;
  }
}

// Render a list of block-level children (list-item contents, quote
// paragraphs, table-cell contents). No heading anchors here — anchors
// are a top-level (TOC) concern.
function RenderChildren({
  nodes,
  ctx,
}: {
  nodes?: ReadNode[];
  ctx: ReadCtx;
}) {
  return (
    <>
      {(nodes ?? []).map((n, i) => (
        <RenderBlock key={i} node={n} ctx={ctx} />
      ))}
    </>
  );
}

// ── Callout ───────────────────────────────────────────────────────────
function RenderCallout({ node }: { node: ReadNode }) {
  const raw = node.attrs?.tone;
  const tone = (CALLOUT_TONES as readonly string[]).includes(raw as string)
    ? (raw as keyof typeof CALLOUT_TONE_META)
    : 'note';
  const meta = CALLOUT_TONE_META[tone];
  return (
    <div className="lib-callout" data-callout="" data-tone={tone}>
      <div className="lib-callout-tab-wrap">
        <span className="lib-callout-tab">
          <span className="lib-callout-ic" aria-hidden="true">
            {meta.icon}
          </span>
          <span className="lib-callout-label">{meta.label}</span>
        </span>
      </div>
      <div className="lib-callout-body">
        <RenderInline content={node.content} />
      </div>
    </div>
  );
}

// ── Drug card ─────────────────────────────────────────────────────────
function RenderDrugCard({ node }: { node: ReadNode }) {
  const name = asString(node.attrs?.name);
  const drugClass = asString(node.attrs?.drug_class);
  const fields = Array.isArray(node.attrs?.fields)
    ? (node.attrs!.fields as DrugField[])
    : [];
  return (
    <div className="lib-drug" data-drug-card="">
      <div className="lib-drug-inner">
        <div className="lib-drug-head">
          <div className="lib-drug-title-row">
            <span className="lib-drug-pill" aria-hidden="true">
              💊
            </span>
            <div className="lib-drug-name">{name}</div>
          </div>
          {drugClass && <div className="lib-drug-class">{drugClass}</div>}
        </div>
        <div className="lib-drug-fields">
          {fields.map((f, i) => (
            <div className="lib-drug-field" key={i}>
              <div className="lib-drug-label-cell">
                <div className="lib-drug-label">{f.label}</div>
              </div>
              <div className="lib-drug-value-cell">
                <div className="lib-drug-value lib-read-pre">{f.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Lab values ────────────────────────────────────────────────────────
function RenderLabValues({ node }: { node: ReadNode }) {
  const title = asString(node.attrs?.title);
  const columns = Array.isArray(node.attrs?.columns)
    ? (node.attrs!.columns as LabColumn[])
    : [];
  const rows = Array.isArray(node.attrs?.rows)
    ? (node.attrs!.rows as string[][])
    : [];
  return (
    <div className="lib-lab">
      <div className="lib-lab-head">
        <span className="lib-lab-icon" aria-hidden="true">
          🧪
        </span>
        <div className="lib-lab-title">{title}</div>
      </div>
      <table className="lib-lab-table">
        <thead>
          <tr>
            {columns.map((c, ci) => (
              <th key={ci}>
                <div className="lib-lab-col">{c.label}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {columns.map((_, ci) => (
                <td key={ci}>
                  <div className="lib-lab-cell lib-read-pre">{row[ci] ?? ''}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Table (generic Tiptap table) ──────────────────────────────────────
function RenderTable({ node, ctx }: { node: ReadNode; ctx: ReadCtx }) {
  const colorTheme = asString(node.attrs?.colorTheme) || 'none';
  const rows = node.content ?? [];
  return (
    <div className="lib-table-block-readonly">
      <table data-color={colorTheme}>
        <tbody>
          {rows.map((row, ri) => {
            const sub = row.attrs?.isSubheader === true;
            return (
              <tr key={ri} data-subheader={sub ? 'true' : undefined}>
                {(row.content ?? []).map((cell, ci) => {
                  const Tag = cell.type === 'tableHeader' ? 'th' : 'td';
                  const colSpan =
                    typeof cell.attrs?.colspan === 'number' &&
                    cell.attrs.colspan > 1
                      ? cell.attrs.colspan
                      : undefined;
                  const rowSpan =
                    typeof cell.attrs?.rowspan === 'number' &&
                    cell.attrs.rowspan > 1
                      ? cell.attrs.rowspan
                      : undefined;
                  return (
                    <Tag key={ci} colSpan={colSpan} rowSpan={rowSpan}>
                      <RenderChildren nodes={cell.content} ctx={ctx} />
                    </Tag>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

