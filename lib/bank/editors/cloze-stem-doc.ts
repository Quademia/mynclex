// mynclex/lib/bank/editors/cloze-stem-doc.ts
//
// Cloze rich-stem helpers — Slice 6d (Option B, decoupled markers).
//
// The Cloze stem is a rich document; the {N} blank markers live as PLAIN TEXT
// inside its prose (no custom Tiptap node). These pure helpers are the
// "boundary" that keeps that decoupling honest:
//
//   - clozeStemScanText / clozeMarkerOrder — read the marker set out of a doc
//     (the editor's live tracking + save-time ordering), tolerating stray
//     formatting because they scan the doc's flattened text.
//   - normalizeClozeStem — the auto-tidy: strip any marks clinging to a {N}
//     and re-isolate each marker into its own mark-free text node, so storage
//     is clean and renumber/render are trivial. Run on save (and safe to run
//     anytime — it's idempotent).
//   - renumberClozeStem — rewrite the markers in the doc to {1}{2}… to match
//     the parser's gap-closing renumber, keeping the rich stem in lockstep
//     with content.blanks / correct.answers.
//   - stripMarkersFromDoc / appendMarkerToDoc — editor toolbar ops (Clear all,
//     +Add blank fallback).
//
// No '@tiptap/*' import — pure data, usable from the Server Action save path.

import {
  type RichDoc,
  type RichNode,
  type RichMark,
  richDocToPlain,
} from '@/lib/authoring/rich-doc';

const MARKER_G = /\{(\d+)\}/g;
const MARKER_WHOLE = /^\{(\d+)\}$/;

// ─────────────────────────────────────────────────────────────
// Reading markers out of a doc
// ─────────────────────────────────────────────────────────────

/**
 * Flatten the stem doc to a single scan string for marker detection. Block
 * text is joined by newlines (richDocToPlain); a marker split across two text
 * nodes within one block is rejoined because that block's inline text is
 * concatenated before scanning.
 */
export function clozeStemScanText(doc: RichDoc): string {
  return richDocToPlain(doc);
}

/**
 * Marker numbers in first-appearance order, de-duplicated. The decoupled
 * twin of the editor's legacy parseStemMarkers(string), reading from a doc.
 */
export function clozeMarkerOrder(doc: RichDoc): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const text = clozeStemScanText(doc);
  MARKER_G.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER_G.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n >= 1 && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Normalisation — strip marks off markers + isolate each one
// ─────────────────────────────────────────────────────────────

function sameMarks(a: RichMark[] | undefined, b: RichMark[] | undefined): boolean {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  return JSON.stringify(aa) === JSON.stringify(bb);
}

// Rebuild one run of consecutive text characters (each tagged with its source
// marks) into text nodes: marker spans become their own mark-free node; the
// gaps between markers are re-grouped into runs of identical marks.
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
 * Auto-tidy the markers in a stem doc: strip any formatting marks off every
 * {N} and isolate each into its own clean text node. Idempotent. Run on save
 * so storage is clean and renumber/render stay simple.
 */
export function normalizeClozeStem(doc: RichDoc): RichDoc {
  return { type: 'doc', content: normalizeBlocks(doc.content) ?? [] };
}

// ─────────────────────────────────────────────────────────────
// Renumber — rewrite markers to {1}{2}… matching the parser order
// ─────────────────────────────────────────────────────────────

/**
 * Renumber the markers in `doc` so the i-th surviving marker becomes {i+1},
 * given `order` = marker numbers in first-appearance order (the parser's
 * result). Run AFTER normalizeClozeStem so every marker is its own node.
 */
export function renumberClozeStem(doc: RichDoc, order: number[]): RichDoc {
  const remap = new Map<number, number>();
  order.forEach((oldN, i) => remap.set(oldN, i + 1));

  function walk(nodes: RichNode[] | undefined): RichNode[] | undefined {
    if (!nodes) return nodes;
    return nodes.map((n) => {
      if (typeof n.text === 'string') {
        const mm = MARKER_WHOLE.exec(n.text);
        if (mm) {
          const next = remap.get(parseInt(mm[1], 10));
          if (next !== undefined) return { ...n, text: `{${next}}` };
        }
        return n;
      }
      if (n.content) return { ...n, content: walk(n.content) };
      return n;
    });
  }

  return { type: 'doc', content: walk(doc.content) ?? [] };
}

// ─────────────────────────────────────────────────────────────
// Editor toolbar ops
// ─────────────────────────────────────────────────────────────

/** Remove every {N} marker from the doc (Clear-all-blanks), collapsing the
 *  double spaces the removal leaves behind. */
export function stripMarkersFromDoc(doc: RichDoc): RichDoc {
  function walk(nodes: RichNode[] | undefined): RichNode[] | undefined {
    if (!nodes) return nodes;
    return nodes
      .map((n) => {
        if (typeof n.text === 'string') {
          const text = n.text.replace(MARKER_G, '').replace(/ {2,}/g, ' ');
          return { ...n, text };
        }
        if (n.content) return { ...n, content: walk(n.content) };
        return n;
      })
      // Drop text nodes that became empty after marker removal.
      .filter((n) => !(typeof n.text === 'string' && n.text === ''));
  }
  return { type: 'doc', content: walk(doc.content) ?? [] };
}

/** Append a marker (e.g. " {3}") to the end of the last paragraph, creating a
 *  paragraph if the doc has none. Used as the +Add blank fallback when the
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
