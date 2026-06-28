// mynclex/lib/authoring/rich-render.tsx
//
// Rich-content relook — Slice 1.
//
// Read-only renderer: turns a stored RichDoc into formatted React. Used by
// the curator preview pane now, and by the student runner later, so a
// curator's emphasis (bold / lists / highlight / …) survives verbatim from
// authoring through to the student view.
//
// No hooks, no `@tiptap/*` — safe to render on the server or the client.
// Mark handling mirrors the library's student read renderer
// (lib/library/student/read-inline.tsx) so the two surfaces stay consistent.

import { Fragment, type ReactNode } from 'react';
import type { RichDoc, RichNode, RichMark } from './rich-doc';

function colorAttr(mark: RichMark | undefined): string | undefined {
  const c = mark?.attrs?.color;
  return typeof c === 'string' ? c : undefined;
}

// Wrap `el` with one inline mark. Marks compose by nesting; colour-bearing
// marks carry their value as an inline style so the exact tutor-picked
// colour shows.
function applyMark(el: ReactNode, mark: RichMark, key: string): ReactNode {
  switch (mark.type) {
    case 'bold':
      return <strong key={key}>{el}</strong>;
    case 'italic':
      return <em key={key}>{el}</em>;
    case 'underline':
      return <u key={key}>{el}</u>;
    case 'strike':
      return <s key={key}>{el}</s>;
    case 'code':
      return <code key={key}>{el}</code>;
    case 'subscript':
      return <sub key={key}>{el}</sub>;
    case 'superscript':
      return <sup key={key}>{el}</sup>;
    case 'highlight': {
      const color = colorAttr(mark);
      return (
        <mark key={key} style={color ? { backgroundColor: color } : undefined}>
          {el}
        </mark>
      );
    }
    case 'textStyle': {
      const color = colorAttr(mark);
      return color ? (
        <span key={key} style={{ color }}>
          {el}
        </span>
      ) : (
        <Fragment key={key}>{el}</Fragment>
      );
    }
    case 'link': {
      const href = mark.attrs?.href;
      if (typeof href !== 'string' || !href) {
        return <Fragment key={key}>{el}</Fragment>;
      }
      return (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer">
          {el}
        </a>
      );
    }
    default:
      return <Fragment key={key}>{el}</Fragment>;
  }
}

function RenderInline({ content }: { content?: RichNode[] }) {
  if (!content || content.length === 0) return null;
  return (
    <>
      {content.map((node, i) => {
        if (node.type === 'hardBreak') return <br key={i} />;
        if (typeof node.text !== 'string') return null;

        let el: ReactNode = node.text;
        const marks = node.marks ?? [];
        marks.forEach((mark, mi) => {
          el = applyMark(el, mark, `m${i}-${mi}`);
        });
        return <Fragment key={i}>{el}</Fragment>;
      })}
    </>
  );
}

// Render the block-level nodes the rich field can produce. Unknown blocks
// fall through to rendering their children so nothing is silently lost.
function RenderBlock({ node, k }: { node: RichNode; k: string }): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return (
        <p key={k}>
          <RenderInline content={node.content} />
        </p>
      );
    case 'heading': {
      const level = (node.attrs?.level as number | undefined) ?? 2;
      const Tag = (level === 3 ? 'h3' : 'h2') as 'h2' | 'h3';
      return (
        <Tag key={k}>
          <RenderInline content={node.content} />
        </Tag>
      );
    }
    case 'bulletList':
      return (
        <ul key={k}>
          <RenderBlocks nodes={node.content} prefix={k} />
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={k}>
          <RenderBlocks nodes={node.content} prefix={k} />
        </ol>
      );
    case 'listItem':
      return (
        <li key={k}>
          <RenderBlocks nodes={node.content} prefix={k} />
        </li>
      );
    case 'blockquote':
      return (
        <blockquote key={k}>
          <RenderBlocks nodes={node.content} prefix={k} />
        </blockquote>
      );
    default:
      // Unknown block — render its children inline-or-block as available.
      return <RenderBlocks key={k} nodes={node.content} prefix={k} />;
  }
}

function RenderBlocks({
  nodes,
  prefix,
}: {
  nodes?: RichNode[];
  prefix: string;
}): ReactNode {
  if (!nodes || nodes.length === 0) return null;
  return (
    <>
      {nodes.map((node, i) => (
        <RenderBlock key={`${prefix}-${i}`} k={`${prefix}-${i}`} node={node} />
      ))}
    </>
  );
}

// ── Inline flattening ──
// Some hosts can't take block elements (a rich field rendered inside a
// <button> option or a <p> instruction line — block-in-phrasing is invalid
// HTML). For those, `inline` mode keeps the inline marks (bold / highlight /
// …) but flattens block structure to lines joined by <br>. Lists/blockquotes
// recurse so their text survives.
function collectLines(
  nodes: RichNode[] | undefined,
  lines: ReactNode[],
  keyBase: string,
): void {
  if (!nodes) return;
  nodes.forEach((node, i) => {
    const k = `${keyBase}-${i}`;
    if (
      node.type === 'bulletList' ||
      node.type === 'orderedList' ||
      node.type === 'listItem' ||
      node.type === 'blockquote'
    ) {
      collectLines(node.content, lines, k);
    } else {
      lines.push(<RenderInline key={k} content={node.content} />);
    }
  });
}

/**
 * Render a stored rich document read-only. `doc` is the parsed RichDoc
 * (use `parseRichDoc` on the raw column value first).
 *
 * `inline` flattens block structure to a single phrasing-content run (lines
 * joined by <br>) — use it where a block element would be invalid (inside a
 * <button> option, a <p> instruction, a table cell that must stay inline).
 */
export function RichRender({
  doc,
  className,
  inline = false,
}: {
  doc: RichDoc;
  className?: string;
  inline?: boolean;
}) {
  if (inline) {
    const lines: ReactNode[] = [];
    collectLines(doc.content, lines, 'l');
    return (
      <span className={className ? `auth-rich-inline ${className}` : 'auth-rich-inline'}>
        {lines.map((ln, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {ln}
          </Fragment>
        ))}
      </span>
    );
  }
  return (
    <div className={className ? `auth-rich ${className}` : 'auth-rich'}>
      <RenderBlocks nodes={doc.content} prefix="b" />
    </div>
  );
}
