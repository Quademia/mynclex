'use client';

// mynclex/lib/library/slash-menu.tsx
//
// Slash-command popover for the Tiptap editor (slice 11.5b). Mounted
// by the SlashCommand extension via Tiptap's ReactRenderer. The
// extension feeds the popover the current items list (filtered by
// the user's query after `/`) and a `command(item)` callback that
// inserts the chosen block.
//
// The full 12-block taxonomy from the planning doc is shown, but
// only the 6 text-block types are enabled in 11.5b (paragraph, h2,
// h3, bulleted list, numbered list, quote). The other 6 render as
// disabled rows with a "Coming in slice X" hint so the slash menu
// reads as the *real* shape from day one — tutors see the
// destination, the disabled entries just light up as their slices
// ship (11.6 → image/pdf/video/table, 11.7 → callout, 11.8 → drug
// card, 11.9 → lab values, 11.15 → embedded questions).

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { Editor, Range } from '@tiptap/react';
import { NavIcon } from '@/components/nav/shared/nav-icon';
import type { NavIcon as NavIconName } from '@/lib/nav/types';
import { usePopoverPosition } from './use-popover-position';

export type SlashItem = {
  type: string;
  name: string;
  desc: string;
  /**
   * Fallback emoji/text icon. Used when `iconSvg` is unset — typically
   * the disabled "coming in slice X" items that don't have an SVG yet.
   */
  icon: string;
  /**
   * Preferred SVG icon name (resolved via `<NavIcon>`). Set on enabled
   * items so the slash menu uses crisp scalable SVGs rather than the
   * emoji fallback.
   */
  iconSvg?: NavIconName;
  group: 'Text & structure' | 'Visual & media' | 'Nursing-shaped' | 'Interactive';
  /** Slice that will enable this item. null = enabled now. */
  comingIn: string | null;
  /**
   * Slash-triggered command. The user typed `/...` — `range` covers
   * the slash + the typed query, so the command deletes it then
   * converts/inserts. Skipped for disabled items.
   */
  run?: (editor: Editor, range: Range) => void;
  /**
   * Button-triggered command. The user clicked a `+` — there's no
   * slash range to delete; we insert a fresh block at `position`.
   * Skipped for disabled items.
   */
  runAt?: (editor: Editor, position: number) => void;
};

export const SLASH_ITEMS: SlashItem[] = [
  // Text & structure — all enabled in 11.5b
  {
    type: 'paragraph',
    name: 'Paragraph',
    desc: 'Plain text with marks',
    icon: '¶',
    iconSvg: 'edit',
    group: 'Text & structure',
    comingIn: null,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
    runAt: (editor, position) =>
      editor
        .chain()
        .focus()
        .insertContentAt(position, { type: 'paragraph' })
        .setTextSelection(position + 1)
        .run(),
  },
  {
    type: 'h2',
    name: 'Heading 2',
    desc: 'Big section title',
    icon: 'H₂',
    iconSvg: 'heading-2',
    group: 'Text & structure',
    comingIn: null,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
    runAt: (editor, position) =>
      editor
        .chain()
        .focus()
        .insertContentAt(position, {
          type: 'heading',
          attrs: { level: 2 },
        })
        .setTextSelection(position + 1)
        .run(),
  },
  {
    type: 'h3',
    name: 'Heading 3',
    desc: 'Sub-section title',
    icon: 'H₃',
    iconSvg: 'heading-3',
    group: 'Text & structure',
    comingIn: null,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
    runAt: (editor, position) =>
      editor
        .chain()
        .focus()
        .insertContentAt(position, {
          type: 'heading',
          attrs: { level: 3 },
        })
        .setTextSelection(position + 1)
        .run(),
  },
  {
    type: 'bulletList',
    name: 'Bulleted list',
    desc: 'Simple bullet list',
    icon: '•',
    iconSvg: 'list-bulleted',
    group: 'Text & structure',
    comingIn: null,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    runAt: (editor, position) =>
      editor
        .chain()
        .focus()
        .insertContentAt(position, {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
        })
        .setTextSelection(position + 3)
        .run(),
  },
  {
    type: 'orderedList',
    name: 'Numbered list',
    desc: 'Ordered list',
    icon: '1.',
    iconSvg: 'list-numbered',
    group: 'Text & structure',
    comingIn: null,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    runAt: (editor, position) =>
      editor
        .chain()
        .focus()
        .insertContentAt(position, {
          type: 'orderedList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
        })
        .setTextSelection(position + 3)
        .run(),
  },
  {
    type: 'blockquote',
    name: 'Quote',
    desc: 'Block quote',
    icon: '❝',
    iconSvg: 'quote',
    group: 'Text & structure',
    comingIn: null,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    runAt: (editor, position) =>
      editor
        .chain()
        .focus()
        .insertContentAt(position, {
          type: 'blockquote',
          content: [{ type: 'paragraph' }],
        })
        .setTextSelection(position + 2)
        .run(),
  },
  // Visual & media
  {
    type: 'image',
    name: 'Image',
    desc: 'Drop or upload an image',
    icon: '🖼',
    iconSvg: 'image',
    group: 'Visual & media',
    comingIn: null,
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'libImage' })
        .run(),
    runAt: (editor, position) =>
      editor
        .chain()
        .focus()
        .insertContentAt(position, { type: 'libImage' })
        .run(),
  },
  {
    type: 'pdf',
    name: 'PDF',
    desc: 'Link-card opens in new tab',
    icon: '📄',
    iconSvg: 'file-text',
    group: 'Visual & media',
    comingIn: null,
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'libPdf' })
        .run(),
    runAt: (editor, position) =>
      editor
        .chain()
        .focus()
        .insertContentAt(position, { type: 'libPdf' })
        .run(),
  },
  {
    type: 'video',
    name: 'Video',
    desc: 'YouTube · Vimeo · Loom embed',
    icon: '🎬',
    iconSvg: 'video',
    group: 'Visual & media',
    comingIn: null,
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'libVideo' })
        .run(),
    runAt: (editor, position) =>
      editor
        .chain()
        .focus()
        .insertContentAt(position, { type: 'libVideo' })
        .run(),
  },
  {
    type: 'table',
    name: 'Table',
    desc: 'Rows and columns — colour, header & sub-header',
    icon: '⊞',
    iconSvg: 'table',
    group: 'Visual & media',
    comingIn: null,
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: false })
        .run(),
    runAt: (editor, position) =>
      editor
        .chain()
        .focus(position)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: false })
        .run(),
  },
  // Nursing-shaped — the differentiators
  {
    type: 'callout',
    name: 'Callout',
    desc: 'Note · Tip · Warning · Critical · Memory',
    icon: '💡',
    group: 'Nursing-shaped',
    comingIn: null,
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'callout', attrs: { tone: 'note' } })
        .run(),
    runAt: (editor, position) =>
      editor
        .chain()
        .focus()
        .insertContentAt(position, { type: 'callout', attrs: { tone: 'note' } })
        .run(),
  },
  {
    type: 'drug_card',
    name: 'Drug card',
    desc: 'Indications · dose · side effects · nursing',
    icon: '💊',
    group: 'Nursing-shaped',
    comingIn: '11.8',
  },
  {
    type: 'lab_values',
    name: 'Lab values',
    desc: 'Test · normal · if high · if low',
    icon: '🧪',
    group: 'Nursing-shaped',
    comingIn: '11.9',
  },
  // Interactive
  {
    type: 'embedded_questions',
    name: 'Embedded questions',
    desc: 'Pick 1–10 questions from your tutor bank — inline practice',
    icon: '✨',
    group: 'Interactive',
    comingIn: '11.15',
  },
];

/**
 * Filter the slash items by the query the user has typed after `/`.
 * Matches loosely against the name and description. Enabled items
 * sort to the top so the keyboard nav lands somewhere usable
 * regardless of typing.
 */
export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(
    (it) =>
      it.name.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q),
  );
}

// ─────────────────────────────────────────────────────────
// Popover component
// ─────────────────────────────────────────────────────────

interface SlashMenuProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
  clientRect?: (() => DOMRect | null) | null;
}

export interface SlashMenuHandle {
  onKeyDown: (event: { event: KeyboardEvent }) => boolean;
}

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(
  function SlashMenu({ items, command, clientRect }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Reset selection when the items list changes (e.g. user typed
    // a character and the filter shifted). Keep selection if the
    // current row is still in the new list.
    useEffect(() => {
      setSelectedIndex((prev) =>
        prev >= items.length ? Math.max(0, items.length - 1) : prev,
      );
    }, [items]);

    function selectItem(index: number) {
      const it = items[index];
      if (!it) return;
      if (it.comingIn) return; // disabled
      command(it);
    }

    function moveSelection(dir: 1 | -1) {
      if (items.length === 0) return;
      setSelectedIndex((prev) => {
        let next = prev;
        for (let i = 0; i < items.length; i++) {
          next = (next + dir + items.length) % items.length;
          if (!items[next].comingIn) return next; // skip disabled
        }
        return prev;
      });
    }

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }) {
        if (event.key === 'ArrowDown') {
          moveSelection(1);
          return true;
        }
        if (event.key === 'ArrowUp') {
          moveSelection(-1);
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    // Position via the shared hook — handles flip + horizontal
    // clamp when the anchor sits near the viewport edges.
    const { ref: popoverRef, style } = usePopoverPosition({
      getAnchorRect: () => clientRect?.() ?? null,
    });

    // Group items for the rendered list.
    const groups: Record<string, SlashItem[]> = {};
    for (const it of items) {
      if (!groups[it.group]) groups[it.group] = [];
      groups[it.group].push(it);
    }

    // Flat-index lookup for keyboard navigation across grouped lists.
    let flatIndex = 0;

    if (items.length === 0) {
      return (
        <div
          ref={popoverRef}
          className="lib-slash-popover"
          style={style}
          role="listbox"
        >
          <div className="lib-slash-empty">No matches</div>
        </div>
      );
    }

    return (
      <div
        ref={popoverRef}
        className="lib-slash-popover"
        style={style}
        role="listbox"
      >
        {Object.entries(groups).map(([group, groupItems]) => (
          <div key={group} className="lib-slash-group">
            <div className="lib-slash-group-head">{group}</div>
            {groupItems.map((it) => {
              const i = flatIndex++;
              const isSelected = i === selectedIndex;
              const disabled = !!it.comingIn;
              return (
                <button
                  key={it.type}
                  type="button"
                  className={[
                    'lib-slash-item',
                    isSelected ? 'is-selected' : '',
                    disabled ? 'is-disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (!disabled) selectItem(i);
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={disabled}
                >
                  <span className="lib-slash-ic" aria-hidden="true">
                    {it.iconSvg ? <NavIcon name={it.iconSvg} /> : it.icon}
                  </span>
                  <div className="lib-slash-text">
                    <div className="lib-slash-name">{it.name}</div>
                    <div className="lib-slash-desc">{it.desc}</div>
                  </div>
                  {disabled && (
                    <span
                      className="lib-slash-pill"
                      title={`Lands in slice ${it.comingIn}`}
                    >
                      {it.comingIn}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  },
);
