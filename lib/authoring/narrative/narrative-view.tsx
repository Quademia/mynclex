// mynclex/lib/authoring/narrative/narrative-view.tsx
//
// Rich-content relook — Slice 4. Read-only STUDENT render of a v2 narrative
// tab (stacked entry cards: chips + rich body), with per-entry progressive
// reveal. Used by the curator preview pane and the student runner.
//
// No hooks / no @tiptap — safe on server or client. (The optional image
// render delegates to <BankImageView>, a client component, which is fine
// from either.)
//
// Slice 7: an entry body may carry `bankImage` block nodes. The host
// passes `resolveImageUrl` — the context-appropriate signed-URL server
// action (curator preview → getBankImageUrlAction; runner → the
// attempt-anchored action). Without a resolver the node renders nothing
// (the pre-Slice-7 behaviour).

import { studentEntries, type NarrativeTabData } from './narrative-model';
import { RichRender, type CustomBlockRenderer } from '../rich-render';
import { isEmptyRichDoc } from '../rich-doc';
import { BankImageView, type BankImageResolver } from '../bank-image-view';

// Build the RichRender custom-block seam for `bankImage` nodes. Exported
// so other bank-doc hosts (the static editor cards today, stem hosts in
// Slice 8) splice images with the same one-liner.
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

export function NarrativeView({
  tab,
  currentPosition,
  resolveImageUrl,
}: {
  tab: NarrativeTabData;
  currentPosition: number;
  resolveImageUrl?: BankImageResolver;
}) {
  const visible = studentEntries(tab, currentPosition);
  if (visible.length === 0) return null;

  const custom = bankImageRenderer(resolveImageUrl);

  return (
    <div className="nv-list">
      {visible.map(({ entry, justRevealed }) => {
        const chips = entry.chips.filter((c) => c.trim().length > 0);
        return (
          <div key={entry.id} className={`nv-card${justRevealed ? ' just-revealed' : ''}`}>
            {chips.length > 0 && (
              <div className="nv-chips">
                {chips.map((c, i) => (
                  <span key={i} className="nv-chip">{c}</span>
                ))}
              </div>
            )}
            {!isEmptyRichDoc(entry.body) && (
              <div className="nv-body">
                <RichRender doc={entry.body} custom={custom} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
