// mynclex/lib/authoring/bank-image-doc.ts
//
// Bank rich-content Slice 7 — pure doc-walkers for `bankImage` block
// nodes. Tiptap-free and server-safe (the runner's attempt-anchored
// URL gate walks frozen snapshot JSON with these).
//
// Two consumers today, one more planned:
//   • emptiness checks (narrative-model) — an image-only entry counts
//     as content, so "has the curator written anything?" must also ask
//     "…or placed an image?";
//   • the Slice-7c anti-oracle gate — collect every asset id an
//     attempt's frozen tabs reference, so the student URL action can
//     verify the requested asset actually belongs to that attempt;
//   • Slice 8 (stem images) reuses the same walkers over stem docs.
//
// Inputs are `unknown` on purpose: frozen snapshots and stored entries
// arrive as untyped JSON — the walkers tolerate any shape and simply
// find nothing in malformed input.

interface LooseNode {
  type?: unknown;
  attrs?: Record<string, unknown>;
}

// Deep-walk ANY JSON value, visiting every object. Deliberately not
// limited to Tiptap's `content` arrays: the 7c gate hands this whole
// frozen tab-snapshot rows, where doc bodies sit under `entries` →
// `body` — and future hosts may nest docs differently again. A full
// walk finds a bankImage node wherever it lives.
function walk(value: unknown, visit: (n: LooseNode) => void): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  visit(value as LooseNode);
  for (const child of Object.values(value)) walk(child, visit);
}

/** Collect the asset ids of every FILLED `bankImage` node in a doc
 *  (never-filled blocks carry assetId null and are skipped). */
export function collectBankImageAssetIds(
  doc: unknown,
  into?: Set<string>,
): Set<string> {
  const ids = into ?? new Set<string>();
  walk(doc, (n) => {
    if (n.type === 'bankImage') {
      const id = n.attrs?.assetId;
      if (typeof id === 'string' && id) ids.add(id);
    }
  });
  return ids;
}

/** True when the doc carries at least one filled `bankImage` node. */
export function docHasFilledBankImage(doc: unknown): boolean {
  return collectBankImageAssetIds(doc).size > 0;
}
