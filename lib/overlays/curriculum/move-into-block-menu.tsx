// mynclex/lib/overlays/curriculum/move-into-block-menu.tsx
//
// Floating dropdown shown when the tutor taps "Move into block →"
// on a loose activity row. Lists every block in the unit; clicking
// a block fires the parent's onPick callback with the chosen
// block_id.
//
// Centred modal-style backdrop (matching <DeleteConfirm> and the
// other curriculum overlays) rather than an anchored popover —
// easier than positioning math for the block-name list, and the
// list is short enough that the modal pattern reads fine.
//
// The "+ New block to wrap this in" affordance from the mockup
// is deferred to a later slice — tutors can already "+ Add block"
// then "Move into block" for the same outcome.

'use client';

import type { ProgrammeBlock } from '@/lib/curriculum/types';

interface MoveIntoBlockMenuProps {
  activityTitle: string;
  blocks: ProgrammeBlock[];
  onPick: (blockId: string) => void;
  onCancel: () => void;
  pending?: boolean;
}

export function MoveIntoBlockMenu({
  activityTitle,
  blocks,
  onPick,
  onCancel,
  pending = false,
}: MoveIntoBlockMenuProps) {
  return (
    <div
      className="prog-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Move activity into a block"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="confirm-dialog move-into-block-dialog">
        <h2 className="confirm-dialog-title">Move into a block</h2>
        <p className="confirm-dialog-body">
          <strong>{activityTitle}</strong> will be added to the end of
          the block you pick.
        </p>

        <ul className="move-into-block-list" role="list">
          {blocks.map((block) => (
            <li key={block.block_id}>
              <button
                type="button"
                className="move-into-block-item"
                onClick={() => onPick(block.block_id)}
                disabled={pending}
              >
                <span className="move-into-block-item-title">{block.title}</span>
                {block.description && (
                  <span className="move-into-block-item-desc">
                    {block.description}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="prog-btn prog-btn-ghost"
            onClick={onCancel}
            disabled={pending}
            autoFocus
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
