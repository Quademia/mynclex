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

import { Fragment, type CSSProperties, type ReactNode } from 'react';
import type { RichDoc, RichNode, RichMark } from './rich-doc';

// Mirror a block node's alignment (set by the TextAlign extension). Left is
// the default, so only centre / right / justify need an inline style.
function alignStyle(node: RichNode): CSSProperties | undefined {
  const a = node.attrs?.textAlign;
  return typeof a === 'string' && a !== 'left'
    ? { textAlign: a as CSSProperties['textAlign'] }
    : undefined;
}

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

// Optional custom-block seam (Slice 7). Hosts that carry non-text block
// nodes (the bank image today) pass a renderer keyed off node.type; it
// returns a ReactNode to take the node over, or null/undefined to fall
// through to the default handling. Kept generic so Slice 8 (stem images)
// reuses it unchanged.
export type CustomBlockRenderer = (
  node: RichNode,
  key: string,
) => ReactNode | null | undefined;

// Render the block-level nodes the rich field can produce. Unknown blocks
// fall through to rendering their children so nothing is silently lost.
function RenderBlock({
  node,
  k,
  custom,
}: {
  node: RichNode;
  k: string;
  custom?: CustomBlockRenderer;
}): ReactNode {
  // Custom nodes first — an atom node like `bankImage` has no children,
  // so the default fall-through would silently render nothing.
  const el = custom?.(node, k);
  if (el != null) return <Fragment key={k}>{el}</Fragment>;

  switch (node.type) {
    case 'paragraph':
      return (
        <p key={k} style={alignStyle(node)}>
          <RenderInline content={node.content} />
        </p>
      );
    case 'heading': {
      const level = (node.attrs?.level as number | undefined) ?? 2;
      const Tag = (level === 3 ? 'h3' : 'h2') as 'h2' | 'h3';
      return (
        <Tag key={k} style={alignStyle(node)}>
          <RenderInline content={node.content} />
        </Tag>
      );
    }
    case 'bulletList':
      return (
        <ul key={k}>
          <RenderBlocks nodes={node.content} prefix={k} custom={custom} />
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={k}>
          <RenderBlocks nodes={node.content} prefix={k} custom={custom} />
        </ol>
      );
    case 'listItem':
      return (
        <li key={k}>
          <RenderBlocks nodes={node.content} prefix={k} custom={custom} />
        </li>
      );
    case 'blockquote':
      return (
        <blockquote key={k}>
          <RenderBlocks nodes={node.content} prefix={k} custom={custom} />
        </blockquote>
      );
    default:
      // Unknown block — render its children inline-or-block as available.
      return <RenderBlocks key={k} nodes={node.content} prefix={k} custom={custom} />;
  }
}

function RenderBlocks({
  nodes,
  prefix,
  custom,
}: {
  nodes?: RichNode[];
  prefix: string;
  custom?: CustomBlockRenderer;
}): ReactNode {
  if (!nodes || nodes.length === 0) return null;
  return (
    <>
      {nodes.map((node, i) => (
        <RenderBlock
          key={`${prefix}-${i}`}
          k={`${prefix}-${i}`}
          node={node}
          custom={custom}
        />
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
  custom,
}: {
  doc: RichDoc;
  className?: string;
  inline?: boolean;
  /** Custom-block seam — see CustomBlockRenderer. Ignored in `inline`
   *  mode (a block node can't live inside phrasing content anyway). */
  custom?: CustomBlockRenderer;
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
      <RenderBlocks nodes={doc.content} prefix="b" custom={custom} />
    </div>
  );
}

// ── Slot splicing (marker-stem types: Cloze {N}, later Highlight / Drag-drop) ──
//
// Renders a rich doc but, wherever a marker matching `pattern` appears in the
// prose, hands that occurrence to `renderSlot` to inject an interactive node
// (a Cloze dropdown, a review pill, …) in place of the marker text. Block
// structure + inline marks around the marker are preserved verbatim — the
// curator's formatting survives, the slot sits inline where the marker was.
//
// `pattern` must capture the marker key in group 1 (e.g. /\{(\d+)\}/ → the N).
// `renderSlot(key, index)` receives that key string plus the running 0-based
// occurrence index across the whole doc (the positional blank number).
//
// Decoupled-marker contract (Slice 6d, Option B): the marker lives as plain
// text in the doc. Even if a stray mark clings to it, the regex still finds it
// in the text run and the slot renders clean — so a mangled-format marker can
// never break the student view; save-time normalisation strips the marks for
// storage.

type SlotRenderer = (key: string, index: number) => ReactNode;

// A plain, mutable walk cursor. These are NOT React components — they're
// helper functions invoked synchronously within RichRenderWithSlots's single
// render pass, so `next()` increments exactly once per marker in document
// order. (An earlier version made these React components sharing the counter;
// StrictMode / concurrent double-invocation then over-counted the index,
// producing nondeterministic blank numbers + out-of-range slots — a hydration
// mismatch and empty dropdowns. Plain functions keep the count deterministic.)
interface SlotCursor {
  pattern: RegExp;
  renderSlot: SlotRenderer;
  n: number;
  // Slice 8 — same custom-block seam as RichRender, so a marker stem can
  // carry a `bankImage` node alongside its plain-text markers. Without it
  // the atom falls into blockWithSlots' default case, which recurses into
  // children an atom doesn't have → the image silently vanishes.
  custom?: CustomBlockRenderer;
}

function renderMarkedText(
  text: string,
  marks: RichMark[] | undefined,
  key: string,
): ReactNode {
  let el: ReactNode = text;
  (marks ?? []).forEach((mark, mi) => {
    el = applyMark(el, mark, `${key}-m${mi}`);
  });
  return <Fragment key={key}>{el}</Fragment>;
}

function inlineWithSlots(content: RichNode[] | undefined, cur: SlotCursor): ReactNode {
  if (!content || content.length === 0) return null;
  const out: ReactNode[] = [];
  content.forEach((node, i) => {
    if (node.type === 'hardBreak') {
      out.push(<br key={`br${i}`} />);
      return;
    }
    if (typeof node.text !== 'string') return;
    const text = node.text;
    const re = new RegExp(cur.pattern.source, 'g');
    let last = 0;
    let part = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) {
        out.push(
          renderMarkedText(text.slice(last, m.index), node.marks, `t${i}-${part++}`),
        );
      }
      const idx = cur.n;
      cur.n += 1;
      out.push(
        <Fragment key={`s${i}-${m.index}`}>{cur.renderSlot(m[1], idx)}</Fragment>,
      );
      last = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex++; // guard against a zero-width match
    }
    if (last < text.length) {
      out.push(renderMarkedText(text.slice(last), node.marks, `t${i}-${part++}`));
    }
  });
  return <>{out}</>;
}

function blockWithSlots(node: RichNode, k: string, cur: SlotCursor): ReactNode {
  // Custom nodes first — mirrors RenderBlock (markers never sit inside an
  // atom, so the slot cursor is unaffected by a custom take-over).
  const el = cur.custom?.(node, k);
  if (el != null) return <Fragment key={k}>{el}</Fragment>;

  switch (node.type) {
    case 'paragraph':
      return (
        <p key={k} style={alignStyle(node)}>
          {inlineWithSlots(node.content, cur)}
        </p>
      );
    case 'heading': {
      const level = (node.attrs?.level as number | undefined) ?? 2;
      const Tag = (level === 3 ? 'h3' : 'h2') as 'h2' | 'h3';
      return (
        <Tag key={k} style={alignStyle(node)}>
          {inlineWithSlots(node.content, cur)}
        </Tag>
      );
    }
    case 'bulletList':
      return <ul key={k}>{blocksWithSlots(node.content, k, cur)}</ul>;
    case 'orderedList':
      return <ol key={k}>{blocksWithSlots(node.content, k, cur)}</ol>;
    case 'listItem':
      return <li key={k}>{blocksWithSlots(node.content, k, cur)}</li>;
    case 'blockquote':
      return <blockquote key={k}>{blocksWithSlots(node.content, k, cur)}</blockquote>;
    default:
      return <Fragment key={k}>{blocksWithSlots(node.content, k, cur)}</Fragment>;
  }
}

function blocksWithSlots(
  nodes: RichNode[] | undefined,
  prefix: string,
  cur: SlotCursor,
): ReactNode {
  if (!nodes || nodes.length === 0) return null;
  return <>{nodes.map((node, i) => blockWithSlots(node, `${prefix}-${i}`, cur))}</>;
}

/**
 * Render a rich doc with interactive slots spliced in at every `pattern`
 * marker. See the block comment above for the contract.
 */
export function RichRenderWithSlots({
  doc,
  pattern,
  renderSlot,
  className,
  custom,
}: {
  doc: RichDoc;
  pattern: RegExp;
  renderSlot: SlotRenderer;
  className?: string;
  /** Custom-block seam — see CustomBlockRenderer (Slice 8: stem images). */
  custom?: CustomBlockRenderer;
}) {
  const cur: SlotCursor = { pattern, renderSlot, n: 0, custom };
  return (
    <div className={className ? `auth-rich ${className}` : 'auth-rich'}>
      {blocksWithSlots(doc.content, 'b', cur)}
    </div>
  );
}
