// mynclex/lib/library/body-tiptap.ts
//
// Body-shape adapter for the Tiptap editor (slice 11.5a).
//
// The DB column `nclex_tutor_library_notes.body` is JSONB. Going
// forward (every 11.5+ save) we persist Tiptap's native document
// shape directly:
//
//   { type: 'doc', content: [block, ...] }
//
// 11.2b textarea-era notes were stored as a plain array of one
// paragraph block (`[{ type: 'paragraph', content: [{ text }] }]`).
// `bodyToTiptap` migrates that legacy shape on load so existing
// notes open cleanly in the new editor. The first save then
// rewrites the row in Tiptap's native shape.
//
// Kept as a free-standing module (no @tiptap/* import) so it can
// be used by server-side queries / future renderers without
// pulling the editor bundle.

type TiptapMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

type TiptapNode = {
  type: string;
  content?: TiptapNode[];
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: TiptapMark[];
};

export type TiptapDoc = {
  type: 'doc';
  content: TiptapNode[];
};

const EMPTY_DOC: TiptapDoc = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

/**
 * Best-effort load of any persisted body into Tiptap's JSONContent.
 *
 * - Native Tiptap doc (`{ type: 'doc', content: [...] }`) — pass through.
 * - Legacy 11.2b array (`[{ type: 'paragraph', content: [{ text }] }]`) —
 *   upgrade text nodes to Tiptap's `{ type: 'text', text }` shape and
 *   wrap in a doc.
 * - Anything else (null / undefined / unknown shape) — return an
 *   empty doc with a single blank paragraph (the shape Tiptap renders
 *   for a brand-new editor).
 */
export function bodyToTiptap(body: unknown): TiptapDoc {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    if (obj.type === 'doc' && Array.isArray(obj.content)) {
      return obj as TiptapDoc;
    }
  }

  if (Array.isArray(body)) {
    const content: TiptapNode[] = [];
    for (const raw of body) {
      if (!raw || typeof raw !== 'object') continue;
      const block = raw as {
        type?: string;
        content?: unknown;
        text?: string;
      };
      // Only the 11.2b paragraph shape exists in legacy data; everything
      // else is forward-compat scaffolding that never actually wrote.
      if (block.type === 'paragraph' && Array.isArray(block.content)) {
        const textNodes: TiptapNode[] = [];
        for (const c of block.content) {
          if (c && typeof c === 'object') {
            const t = (c as { text?: string }).text;
            if (typeof t === 'string' && t.length > 0) {
              textNodes.push({ type: 'text', text: t });
            }
          }
        }
        content.push(
          textNodes.length > 0
            ? { type: 'paragraph', content: textNodes }
            : { type: 'paragraph' },
        );
      }
    }
    if (content.length === 0) return EMPTY_DOC;
    return { type: 'doc', content };
  }

  return EMPTY_DOC;
}

/**
 * Persist Tiptap's JSONContent to the DB. Stored verbatim — no
 * conversion. Existing 11.2b notes get rewritten into this shape
 * on first save, which is fine since `bodyToTiptap` already
 * accepted the legacy shape on load.
 */
export function tiptapToBody(doc: TiptapDoc): unknown {
  return doc;
}

/**
 * True when the doc is just the empty-paragraph default (no content
 * the tutor has typed). Used by the editor's dirty-tracking so an
 * empty just-opened note doesn't fire an autosave by itself.
 */
export function isEmptyDoc(doc: TiptapDoc): boolean {
  if (!doc.content || doc.content.length === 0) return true;
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
 * Walk a Tiptap doc and pull out the H2/H3 headings as a flat list
 * of `{ level, text }` rows. Used by the editor's right-rail
 * outline. Heading levels follow the Tiptap StarterKit default
 * (level on `attrs.level`); text is the concatenated text of all
 * descendant text nodes inside the heading block.
 */
export function deriveOutlineFromDoc(
  doc: TiptapDoc,
): Array<{ level: number; text: string }> {
  const out: Array<{ level: number; text: string }> = [];
  if (!doc.content) return out;
  for (const node of doc.content) {
    if (node.type !== 'heading') continue;
    const level = (node.attrs?.level as number | undefined) ?? 2;
    if (level !== 2 && level !== 3) continue;
    const text = collectText(node).trim();
    if (text.length === 0) continue;
    out.push({ level, text });
  }
  return out.slice(0, 24);
}

function collectText(node: TiptapNode): string {
  if (typeof node.text === 'string') return node.text;
  if (!node.content) return '';
  let out = '';
  for (const child of node.content) {
    out += collectText(child);
  }
  return out;
}
