// mynclex/lib/authoring/narrative/narrative-view.tsx
//
// Rich-content relook — Slice 4. Read-only STUDENT render of a v2 narrative
// tab (stacked entry cards: chips + rich body), with per-entry progressive
// reveal. Used by the curator preview pane and the student runner.
//
// No hooks / no @tiptap — safe on server or client.

import { studentEntries, type NarrativeTabData } from './narrative-model';
import { RichRender } from '../rich-render';
import { isEmptyRichDoc } from '../rich-doc';

export function NarrativeView({
  tab,
  currentPosition,
}: {
  tab: NarrativeTabData;
  currentPosition: number;
}) {
  const visible = studentEntries(tab, currentPosition);
  if (visible.length === 0) return null;

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
                <RichRender doc={entry.body} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
