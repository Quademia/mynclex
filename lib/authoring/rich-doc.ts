// mynclex/lib/authoring/rich-doc.ts
//
// Rich-content relook — Slice 1 foundation.
//
// The bank's authoring surface is moving from plain `<input>`/`<textarea>`
// fields to a rich-text primitive (the library's Tiptap engine, repackaged
// for the bank). This module is the small, self-contained data layer that
// the rich field + renderer share: the document shape, plus the parse /
// serialize helpers that move it across the storage and Server-Action
// boundaries safely.
//
// Deliberately free of any `@tiptap/*` import so server code (actions,
// queries, future renderers) can use it without pulling the editor bundle.
// Kept inside lib/authoring/ so the new authoring tree stays decoupled from
// lib/library/ and lib/bank/ (the rebuild's vendoring discipline).
//
// Storage strategy for Slice 1 (the case-study scenario): the rich doc is
// JSON-stringified by the client and stored in the EXISTING text column
// (`scenario_summary`). No schema change. Old plain-text values still read —
// `parseRichDoc` wraps a non-JSON string as paragraphs (one per line).

export type RichMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type RichNode = {
  type: string;
  content?: RichNode[];
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: RichMark[];
};

export type RichDoc = {
  type: 'doc';
  content: RichNode[];
};

// The shape Tiptap renders for a brand-new editor: a single blank paragraph.
export const EMPTY_RICH_DOC: RichDoc = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

function isDocShape(value: unknown): value is RichDoc {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === 'doc' &&
    Array.isArray((value as { content?: unknown }).content)
  );
}

// Turn a plain-text string into a rich doc: one paragraph per line, so the
// newlines that the old `<textarea>` scenario allowed survive the upgrade.
// A blank line becomes an empty paragraph.
function plainTextToDoc(text: string): RichDoc {
  const lines = text.split('\n');
  const content: RichNode[] = lines.map((line) =>
    line.length > 0
      ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
      : { type: 'paragraph' },
  );
  return content.length > 0 ? { type: 'doc', content } : { ...EMPTY_RICH_DOC };
}

/**
 * Best-effort load of any stored field value into a RichDoc.
 *
 * - `null` / `undefined` / `''` → an empty doc (blank paragraph).
 * - A JSON string of a Tiptap doc (`{"type":"doc",...}`) → parsed through.
 * - Anything else (legacy plain text, or JSON that isn't a doc) → wrapped
 *   as paragraphs so existing prose still renders.
 */
export function parseRichDoc(raw: string | null | undefined): RichDoc {
  if (raw == null) return { ...EMPTY_RICH_DOC };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ...EMPTY_RICH_DOC };

  // Only attempt a JSON parse when it looks like a JSON object — avoids
  // mis-reading a prose scenario that happens to start with a digit, etc.
  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isDocShape(parsed)) return parsed;
    } catch {
      // fall through to plain-text handling
    }
  }

  return plainTextToDoc(raw);
}

/**
 * Deep-clone a doc by round-tripping through JSON.
 *
 * ProseMirror builds each node's `attrs` with `Object.create(null)` (a
 * null-prototype object), and `editor.getJSON()` returns those by reference.
 * Such objects are silently dropped when passed *as an argument* across a
 * React Server Action boundary (the slice-11.6a image bug; see CLAUDE.md
 * "Known Workarounds"). Cloning rebuilds every object with the normal
 * `Object.prototype`, which survives the boundary.
 *
 * NOTE for Slice 1: the scenario crosses the boundary as a JSON *string*
 * (via FormData), and `JSON.stringify` already handles null-prototype attrs
 * correctly — so the string path is inherently safe and never hits this
 * gotcha. This helper exists for the later slices (questions/options) that
 * may hand a doc object straight to an action.
 */
export function cloneRichDoc(doc: RichDoc): RichDoc {
  return JSON.parse(JSON.stringify(doc)) as RichDoc;
}

/**
 * True when the doc is just the empty-paragraph default (nothing the curator
 * has typed). Used for dirty-tracking and to store NULL instead of an empty
 * doc blob.
 */
export function isEmptyRichDoc(doc: RichDoc | null | undefined): boolean {
  if (!doc || !doc.content || doc.content.length === 0) return true;
  if (doc.content.length === 1) {
    const only = doc.content[0];
    if (
      only.type === 'paragraph' &&
      (!only.content || only.content.length === 0)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Flatten any stored field value to readable plain text.
 *
 * Accepts the raw column value (JSON rich-doc OR legacy plain text) and
 * returns block text joined by newlines — for places that need a string,
 * not React: list-row hover peeks, lowercased search blobs, etc. Keeps
 * those surfaces from showing raw JSON once a field goes rich.
 */
export function richTextToPlain(raw: string | null | undefined): string {
  const doc = parseRichDoc(raw);
  const lines: string[] = [];

  function inlineText(node: RichNode): string {
    if (typeof node.text === 'string') return node.text;
    if (!node.content) return '';
    return node.content.map(inlineText).join('');
  }

  function walk(nodes: RichNode[] | undefined): void {
    if (!nodes) return;
    for (const n of nodes) {
      if (
        n.type === 'bulletList' ||
        n.type === 'orderedList' ||
        n.type === 'listItem' ||
        n.type === 'blockquote'
      ) {
        walk(n.content);
      } else {
        const t = inlineText(n).trim();
        if (t) lines.push(t);
      }
    }
  }

  walk(doc.content);
  return lines.join('\n');
}

/**
 * Serialize a doc for storage in a text column.
 *
 * Returns `''` for an empty doc so the existing `... || null` save paths
 * store NULL (no empty-doc blobs). Otherwise a compact JSON string of the
 * cloned doc. Pairs with `parseRichDoc` on the way back.
 */
export function serializeRichDoc(doc: RichDoc): string {
  if (isEmptyRichDoc(doc)) return '';
  return JSON.stringify(cloneRichDoc(doc));
}
