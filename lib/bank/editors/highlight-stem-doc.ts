// mynclex/lib/bank/editors/highlight-stem-doc.ts
//
// Highlight rich-passage helpers — Slice 6e (Option B, decoupled markers).
//
// The Highlight passage (stem) is a rich document; the [[chunk]] markers live
// as PLAIN TEXT inside its prose (no custom Tiptap node, same rule as Cloze
// {N}). Unlike Cloze, a Highlight marker carries the clickable text itself —
// `[[184/96]]` IS the words the student reads — so there is no renumber step
// (chunk IDs are assigned positionally by the parser, not numbered in the
// prose). These pure helpers are the "boundary" that keeps the decoupling
// honest:
//
//   - highlightStemScanText / highlightChunkTexts — read the [[chunk]] spans
//     out of a doc (the editor's live in-passage tracking + the parser's scan),
//     tolerating stray formatting because they scan the doc's flattened text.
//   - normalizeHighlightStem — the auto-tidy: strip any marks clinging to a
//     [[…]] span and re-isolate each one into its own mark-free text node, so
//     storage is clean and the runner's slot splice is trivial. Run on save
//     (idempotent; safe to run anytime). This is what enforces "chunk text
//     stays plain" — the bracketed span never carries bold/colour/etc.
//   - stripBracketsFromDoc — Clear-all: unwrap every [[x]] back to x (the
//     inner text IS passage content, unlike Cloze where the marker is dropped).
//   - appendChunkToDoc — the Wrap/Insert fallback when the stem isn't the live
//     editor (append a placeholder [[finding]] the curator then edits).
//
// No '@tiptap/*' import — pure data, usable from the Server Action save path.

import {
  type RichDoc,
  type RichNode,
  type RichMark,
  richDocToPlain,
} from '@/lib/authoring/rich-doc';

// Non-greedy: [[foo]]bar[[baz]] → two matches, not one long span. Shared
// shape with the parser (lib/bank/parsers/highlight.ts) + the editor.
const BRACKET_G = /\[\[(.+?)\]\]/g;

// ─────────────────────────────────────────────────────────────
// Reading chunks out of a doc
// ─────────────────────────────────────────────────────────────

/**
 * Flatten the passage doc to a single scan string for bracket detection. Block
 * text is joined by newlines (richDocToPlain); a marker split across two text
 * nodes within one block is rejoined because that block's inline text is
 * concatenated before scanning.
 */
export function highlightStemScanText(doc: RichDoc): string {
  return richDocToPlain(doc);
}

/**
 * The inner text of every [[chunk]] span, in passage order, WITH duplicates
 * (two identical bracketed spans both appear — the parser keys decisions by
 * text, so dupes share a card). The decoupled twin of the editor's legacy
 * extractPassageTexts(string), reading from a doc.
 */
export function highlightChunkTexts(doc: RichDoc): string[] {
  const out: string[] = [];
  const text = highlightStemScanText(doc);
  BRACKET_G.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BRACKET_G.exec(text)) !== null) out.push(m[1]);
  return out;
}

// ─────────────────────────────────────────────────────────────
// Normalisation — strip marks off [[chunk]] spans + isolate each
// ─────────────────────────────────────────────────────────────

function sameMarks(a: RichMark[] | undefined, b: RichMark[] | undefined): boolean {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  return JSON.stringify(aa) === JSON.stringify(bb);
}

// Rebuild one run of consecutive text characters (each tagged with its source
// marks) into text nodes: every [[chunk]] span becomes its own mark-free node;
// the gaps between spans are re-grouped into runs of identical marks.
function rebuildRun(run: { ch: string; marks?: RichMark[] }[]): RichNode[] {
  const str = run.map((r) => r.ch).join('');
  const out: RichNode[] = [];

  const emitPlain = (from: number, to: number) => {
    let i = from;
    while (i < to) {
      const marks = run[i].marks;
      let j = i + 1;
      while (j < to && sameMarks(run[j].marks, marks)) j++;
      const text = str.slice(i, j);
      out.push(
        marks && marks.length > 0
          ? { type: 'text', text, marks }
          : { type: 'text', text },
      );
      i = j;
    }
  };

  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(BRACKET_G.source, 'g');
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) emitPlain(last, m.index);
    out.push({ type: 'text', text: m[0] }); // the whole [[chunk]] — mark-free
    last = m.index + m[0].length;
  }
  if (last < str.length) emitPlain(last, str.length);
  return out;
}

// Normalise an inline content array: text nodes are flattened to chars (with
// their marks), non-text inline nodes (hardBreak) act as barriers and pass
// through, then each char-run is rebuilt with [[chunk]] spans isolated + clean.
function normalizeInline(nodes: RichNode[] | undefined): RichNode[] | undefined {
  if (!nodes) return nodes;
  const out: RichNode[] = [];
  let run: { ch: string; marks?: RichMark[] }[] = [];
  const flush = () => {
    if (run.length > 0) {
      out.push(...rebuildRun(run));
      run = [];
    }
  };
  for (const n of nodes) {
    if (typeof n.text === 'string') {
      // Iterate UTF-16 code units so slice indices stay aligned (the bracket
      // delimiters are ASCII; this avoids surrogate-pair index drift).
      for (let k = 0; k < n.text.length; k++) {
        run.push({ ch: n.text[k], marks: n.marks });
      }
    } else {
      flush();
      out.push(n);
    }
  }
  flush();
  return out;
}

// Block types that hold inline content directly.
const INLINE_BLOCKS = new Set(['paragraph', 'heading']);

function normalizeBlocks(nodes: RichNode[] | undefined): RichNode[] | undefined {
  if (!nodes) return nodes;
  return nodes.map((n) => {
    if (INLINE_BLOCKS.has(n.type)) {
      return { ...n, content: normalizeInline(n.content) };
    }
    if (n.content) {
      return { ...n, content: normalizeBlocks(n.content) };
    }
    return n;
  });
}

/**
 * Auto-tidy the [[chunk]] spans in a passage doc: strip any formatting marks
 * off every span (delimiters AND inner text) and isolate each into its own
 * clean text node. Idempotent. Run on save so storage is clean, the runner's
 * RichRenderWithSlots splice is trivial, and "chunk text stays plain" holds.
 */
export function normalizeHighlightStem(doc: RichDoc): RichDoc {
  return { type: 'doc', content: normalizeBlocks(doc.content) ?? [] };
}

// ─────────────────────────────────────────────────────────────
// Editor toolbar ops
// ─────────────────────────────────────────────────────────────

/** Unwrap every [[chunk]] back to its inner text (Clear-all-chunks), collapsing
 *  the double spaces the unwrap might leave behind. The inner text IS passage
 *  content, so we keep it — unlike Cloze, where the {N} marker is dropped. */
export function stripBracketsFromDoc(doc: RichDoc): RichDoc {
  function walk(nodes: RichNode[] | undefined): RichNode[] | undefined {
    if (!nodes) return nodes;
    return nodes
      .map((n) => {
        if (typeof n.text === 'string') {
          const text = n.text.replace(BRACKET_G, '$1').replace(/ {2,}/g, ' ');
          return { ...n, text };
        }
        if (n.content) return { ...n, content: walk(n.content) };
        return n;
      })
      .filter((n) => !(typeof n.text === 'string' && n.text === ''));
  }
  return { type: 'doc', content: walk(doc.content) ?? [] };
}

/** Append a chunk (e.g. "[[finding]]") to the end of the last paragraph,
 *  creating a paragraph if the doc has none. Used as the Wrap/Insert fallback
 *  when the stem field isn't the live editor (so we can't wrap a selection). */
export function appendChunkToDoc(doc: RichDoc, marker: string): RichDoc {
  const content = doc.content.slice();
  for (let i = content.length - 1; i >= 0; i--) {
    if (content[i].type === 'paragraph') {
      const para = content[i];
      const kids = (para.content ?? []).slice();
      const needsSpace =
        kids.length > 0 &&
        typeof kids[kids.length - 1].text === 'string' &&
        !/\s$/.test(kids[kids.length - 1].text as string);
      kids.push({ type: 'text', text: `${needsSpace ? ' ' : ''}${marker}` });
      content[i] = { ...para, content: kids };
      return { type: 'doc', content };
    }
  }
  content.push({ type: 'paragraph', content: [{ type: 'text', text: marker }] });
  return { type: 'doc', content };
}
