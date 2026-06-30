// mynclex/lib/bank/editors/drag-drop-stem-doc.ts
//
// Drag-drop (SENTENCE) rich-stem helpers — Slice 6f (Option B, decoupled
// markers).
//
// The SENTENCE-subtype stem is a rich document; the [N] slot markers (single
// brackets — distinct from Highlight's [[double]] and Cloze's {N}) live as
// PLAIN TEXT inside its prose. Like Cloze's {N}, a drag-drop [N] is a positional
// INDEX (it maps to slot sN), not displayed content — so there is no renumber
// step (the drag-drop parser preserves markers byte-identical on save; gaps like
// [1] [3] are intentionally kept). These pure helpers are the "boundary" that
// keeps the decoupling honest:
//
//   - dragDropStemScanText — flatten the doc to a scan string (the editor's live
//     slot reconciliation + the parser's marker scan read from this).
//   - normalizeDragDropStem — the auto-tidy: strip any marks clinging to an [N]
//     and re-isolate each one into its own mark-free text node, so storage is
//     clean and the runner's slot splice is trivial. Run on save (idempotent).
//   - appendMarkerToDoc — the Insert-marker fallback when the stem isn't the live
//     editor (so we can't insert at a caret).
//
// ORDERED-subtype stems carry no markers — they're a normal rich stem; these
// helpers are no-ops on them (scan returns the prose, normalize finds nothing).
//
// No '@tiptap/*' import — pure data, usable from the Server Action save path.

import {
  type RichDoc,
  type RichNode,
  type RichMark,
  richDocToPlain,
} from '@/lib/authoring/rich-doc';

// Single-bracket positive integer, e.g. [1] [12]. Shared shape with the parser
// (lib/bank/parsers/drag-drop.ts) + the editor.
const MARKER_G = /\[(\d+)\]/g;

// ─────────────────────────────────────────────────────────────
// Reading markers out of a doc
// ─────────────────────────────────────────────────────────────

/**
 * Flatten the stem doc to a single scan string for marker detection. Block text
 * is joined by newlines (richDocToPlain); a marker split across two text nodes
 * within one block is rejoined because that block's inline text is concatenated
 * before scanning.
 */
export function dragDropStemScanText(doc: RichDoc): string {
  return richDocToPlain(doc);
}

// ─────────────────────────────────────────────────────────────
// Normalisation — strip marks off [N] markers + isolate each one
// ─────────────────────────────────────────────────────────────

function sameMarks(a: RichMark[] | undefined, b: RichMark[] | undefined): boolean {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  return JSON.stringify(aa) === JSON.stringify(bb);
}

// Rebuild one run of consecutive text characters (each tagged with its source
// marks) into text nodes: marker spans become their own mark-free node; the gaps
// between markers are re-grouped into runs of identical marks.
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
  const re = new RegExp(MARKER_G.source, 'g');
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) emitPlain(last, m.index);
    out.push({ type: 'text', text: m[0] }); // the marker — mark-free
    last = m.index + m[0].length;
  }
  if (last < str.length) emitPlain(last, str.length);
  return out;
}

// Normalise an inline content array: text nodes are flattened to chars (with
// their marks), non-text inline nodes (hardBreak) act as barriers and pass
// through, then each char-run is rebuilt with markers isolated + clean.
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
      // Iterate UTF-16 code units so slice indices stay aligned (markers are
      // ASCII; this avoids surrogate-pair index drift).
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
 * Auto-tidy the [N] markers in a stem doc: strip any formatting marks off every
 * marker and isolate each into its own clean text node. Idempotent. Run on save
 * so storage is clean and the runner's RichRenderWithSlots splice is trivial.
 */
export function normalizeDragDropStem(doc: RichDoc): RichDoc {
  return { type: 'doc', content: normalizeBlocks(doc.content) ?? [] };
}

// ─────────────────────────────────────────────────────────────
// Editor toolbar op
// ─────────────────────────────────────────────────────────────

/** Append a marker (e.g. " [3]") to the end of the last paragraph, creating a
 *  paragraph if the doc has none. Used as the Insert-marker fallback when the
 *  stem field isn't the live editor (so we can't insert at a caret). */
export function appendMarkerToDoc(doc: RichDoc, marker: string): RichDoc {
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
