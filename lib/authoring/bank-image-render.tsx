// mynclex/lib/authoring/bank-image-render.tsx
//
// Bank rich-content Slice 8 — the shared `bankImage` render seam.
//
// bankImageRenderer builds the RichRender custom-block callback that
// splices <BankImageView> in wherever a rich doc carries a filled
// `bankImage` node. Born in Slice 7 inside narrative-view.tsx; hoisted
// here in Slice 8 so stem hosts (question editors, previews, the
// runner) use it without importing the narrative module — per the
// Slice-7 → Slice-8 handoff contract ("keep it host-agnostic").
//
// Deliberately NOT 'use client' (mirrors narrative-view): the builder
// is pure and hosts may render on either side; <BankImageView> itself
// is the client boundary.

import type { CustomBlockRenderer } from './rich-render';
import { BankImageView, type BankImageResolver } from './bank-image-view';
import { getBankImageUrlAction } from './bank-image-actions';

/**
 * Build the RichRender custom-block seam for `bankImage` nodes. Returns
 * undefined when no resolver is supplied so the node renders nothing
 * (the pre-Slice-7 behaviour for hosts without an image context).
 */
export function bankImageRenderer(
  resolve: BankImageResolver | undefined,
): CustomBlockRenderer | undefined {
  if (!resolve) return undefined;
  // Named function (not an arrow) — this is a render CALLBACK invoked by
  // RichRender, not a component, but eslint's display-name rule can't
  // tell the difference for an anonymous JSX-returning function.
  return function renderBankImageNode(node, key) {
    if (node.type !== 'bankImage') return undefined;
    const assetId = node.attrs?.assetId;
    if (typeof assetId !== 'string' || !assetId) return null; // never-filled block
    return (
      <BankImageView
        key={key}
        assetId={assetId}
        alt={typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''}
        caption={typeof node.attrs?.caption === 'string' ? node.attrs.caption : ''}
        resolve={resolve}
      />
    );
  };
}

/**
 * The curator-context renderer, ready-made: resolves through
 * getBankImageUrlAction (owner-or-bank-curator gate). One module-level
 * closure shared by every editor preview / static field, so hosts don't
 * each rebuild it.
 */
export const curatorBankImageRenderer = bankImageRenderer(getBankImageUrlAction);
