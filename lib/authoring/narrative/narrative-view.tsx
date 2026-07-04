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
import { RichRender } from '../rich-render';
import { isEmptyRichDoc } from '../rich-doc';
import type { BankImageResolver } from '../bank-image-view';
// Slice 8 hoisted bankImageRenderer to ../bank-image-render so stem hosts
// splice images without importing the narrative module.
import { bankImageRenderer } from '../bank-image-render';

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
