// mynclex/lib/library/student/read-inline.tsx
//
// Inline renderer for the student read view (slice 11.13a). Turns a
// Tiptap inline content array (text spans + their marks, plus hard
// breaks) into React, reproducing EVERY formatting mark the editor can
// apply so a tutor's emphasis survives verbatim:
//
//   bold · italic · underline · strike · code · link ·
//   highlight (with the picked colour) · text colour ·
//   subscript · superscript
//
// Defined once here; every text-bearing block (paragraph, heading,
// list item, quote, callout body, table cell) calls <RenderInline>.

import { Fragment, type ReactNode } from 'react';

export type ReadMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type ReadNode = {
  type: string;
  text?: string;
  marks?: ReadMark[];
  attrs?: Record<string, unknown>;
  content?: ReadNode[];
};

function colorAttr(mark: ReadMark | undefined): string | undefined {
  const c = mark?.attrs?.color;
  return typeof c === 'string' ? c : undefined;
}

// Wrap `el` with one mark. Marks compose by nesting; colour-bearing
// marks (highlight / textStyle) carry their value as an inline style so
// the exact tutor-picked colour shows.
function applyMark(el: ReactNode, mark: ReadMark, key: string): ReactNode {
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
      // textStyle only matters when it carries a colour; otherwise it's
      // a no-op wrapper.
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

export function RenderInline({ content }: { content?: ReadNode[] }) {
  if (!content || content.length === 0) return null;
  return (
    <>
      {content.map((node, i) => {
        if (node.type === 'hardBreak') return <br key={i} />;
        if (typeof node.text !== 'string') return null;

        let el: ReactNode = node.text;
        const marks = node.marks ?? [];
        // Innermost-first: each successive mark wraps the previous result.
        marks.forEach((mark, mi) => {
          el = applyMark(el, mark, `m${i}-${mi}`);
        });
        return <Fragment key={i}>{el}</Fragment>;
      })}
    </>
  );
}
