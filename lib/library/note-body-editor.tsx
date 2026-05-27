'use client';

// mynclex/lib/library/note-body-editor.tsx
//
// Tiptap-backed rich block body editor.
//
// Slice 11.5a shipped this with StarterKit + an inline toolbar
// and replaced the textarea. Slice 11.5b layers on the block-
// editor UX from the CD prototype:
//   • Slash command — `/` opens a filtered block menu with all 12
//     block types from the planning doc. The 6 text-block types
//     are enabled; the 6 visual / nursing / interactive types are
//     listed as disabled "coming in slice X" rows so the menu
//     reads as the real shape from day one.
//   • Per-block drag handle (left edge of the block on hover) for
//     reordering — `@tiptap/extension-drag-handle-react`.
//   • Placeholder — the standard Tiptap placeholder extension
//     replaces the CSS-pseudo hack from 11.5a.
//   • Toolbar simplified to CD's flat shape — separate H2 / H3
//     buttons instead of a heading dropdown.
//
// Still queued for later slices:
//   • Block kebab menu (Delete / Duplicate / Convert / move) — the
//     drag handle covers reorder via DnD; conversion runs through
//     slash today.
//   • BroadcastChannel pre-warning for two-tabs open. The
//     `version_id` guard from 11.5a already catches the bad save.
//   • Edit-propagation warning ("attached to 3 programmes…").

import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Focus from '@tiptap/extension-focus';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SlashCommand } from './slash-command';
import {
  SlashMenu,
  SLASH_ITEMS,
  type SlashItem,
  type SlashMenuHandle,
} from './slash-menu';
import { NavIcon } from '@/components/nav/shared/nav-icon';
import {
  ColorSwatchPicker,
  HIGHLIGHT_SWATCHES,
  TEXT_COLOR_SWATCHES,
} from './color-swatch-picker';
import type { TiptapDoc } from './body-tiptap';
import type { Node as PMNode } from '@tiptap/pm/model';

interface NoteBodyEditorProps {
  initialDoc: TiptapDoc;
  onUpdate: (doc: TiptapDoc) => void;
  editable?: boolean;
}

export function NoteBodyEditor({
  initialDoc,
  onUpdate,
  editable = true,
}: NoteBodyEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: {
            rel: 'noopener noreferrer',
            target: '_blank',
          },
        },
      }),
      Placeholder.configure({
        placeholder: ({ node, editor }) => {
          if (node.type.name === 'heading') {
            const level = (node.attrs.level as number | undefined) ?? 2;
            return `Heading ${level}`;
          }
          if (editor.isEmpty) {
            return 'Type / for blocks, or just start writing…';
          }
          return '';
        },
        // Show placeholder on every empty node, not just the first —
        // helps a tutor see where they are when navigating blocks.
        showOnlyCurrent: true,
        includeChildren: false,
      }),
      Focus.configure({
        // Tag whichever top-level block the cursor is inside with
        // `has-focus`. CSS in styles/library.css tints the focused
        // block. `mode: 'shallowest'` so the class lands on the
        // containing block (paragraph / heading / list / quote)
        // rather than nested list items or text marks.
        className: 'has-focus',
        mode: 'shallowest',
      }),
      // Highlight (background tint) + Sub / Super for chemistry +
      // text alignment (heading + paragraph; lists keep default).
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      // Color requires TextStyle as its parent mark.
      TextStyle,
      Color,
      SlashCommand,
    ],
    content: initialDoc,
    editable,
    immediatelyRender: false,
    onUpdate({ editor }) {
      onUpdate(editor.getJSON() as TiptapDoc);
    },
  });

  if (!editor) {
    return (
      <div className="lib-tiptap-shell">
        <div className="lib-tiptap-toolbar lib-tiptap-toolbar-skeleton" aria-hidden="true" />
        <div className="lib-tiptap-body lib-tiptap-body-skeleton" aria-hidden="true">
          Loading editor…
        </div>
      </div>
    );
  }

  return (
    <div className="lib-tiptap-shell">
      <Toolbar editor={editor} />
      <BlockEditingArea editor={editor} />
    </div>
  );
}

// =====================================================================
// Editing area — body + drag handle + per-block "+" + footer "+ Add"
// =====================================================================
//
// The block-level affordances cluster: the drag handle (⋮⋮) and a
// per-block "+" sit beside each other at the left edge of the
// currently-hovered block; the footer "+ Add block" sits below the
// editor body. Both "+"s open the slash menu by programmatically
// inserting a `/` at the appropriate position — Tiptap's
// Suggestion plugin picks that up and shows the popover. No
// separate menu component, no parallel "button-triggered" command
// path.

function BlockEditingArea({ editor }: { editor: Editor }) {
  // The drag-handle extension fires `onNodeChange` whenever the
  // currently-targeted block changes. We capture pos + node so the
  // per-block "+" can insert relative to *that* block, not wherever
  // the cursor happens to be.
  const currentBlockRef = useRef<{ pos: number; node: PMNode } | null>(null);

  // Button-triggered menu state. When non-null, the controlled
  // SlashMenu mounts below `rect` and picking an item runs
  // `item.runAt(editor, position)`. Slash-key path is unaffected —
  // it still goes through the Suggestion plugin in SlashCommand.
  const [buttonMenu, setButtonMenu] = useState<null | {
    position: number;
    rect: DOMRect;
  }>(null);
  const menuRef = useRef<SlashMenuHandle | null>(null);

  function openMenuAfterCurrent(buttonRect: DOMRect) {
    const cur = currentBlockRef.current;
    if (!cur) return;
    setButtonMenu({
      position: cur.pos + cur.node.nodeSize,
      rect: buttonRect,
    });
  }

  function pickItem(item: SlashItem) {
    if (!buttonMenu) return;
    if (item.runAt) item.runAt(editor, buttonMenu.position);
    setButtonMenu(null);
  }

  // Global key + click handling while the controlled menu is open.
  // Esc closes; Up/Down/Enter forward to the menu's imperative
  // onKeyDown; clicks outside the popover (and outside any trigger
  // button) close it.
  useEffect(() => {
    if (!buttonMenu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setButtonMenu(null);
        return;
      }
      if (
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp' ||
        e.key === 'Enter'
      ) {
        const handled = menuRef.current?.onKeyDown({ event: e }) ?? false;
        if (handled) e.preventDefault();
      }
    }
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target) return;
      if (target.closest('.lib-slash-popover')) return;
      if (target.closest('.lib-tiptap-block-plus')) return;
      if (target.closest('.lib-tiptap-add-block-foot')) return;
      setButtonMenu(null);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [buttonMenu]);

  return (
    <>
      <div className="lib-tiptap-body-wrap">
        <DragHandle
          editor={editor}
          onNodeChange={({ node, pos }) => {
            currentBlockRef.current = node ? { node, pos } : null;
          }}
        >
          <div className="lib-tiptap-block-affordances">
            <button
              type="button"
              className="lib-tiptap-block-plus"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) =>
                openMenuAfterCurrent(e.currentTarget.getBoundingClientRect())
              }
              aria-label="Insert block below"
              title="Insert block below"
            >
              +
            </button>
            <span
              className="lib-tiptap-drag-handle"
              aria-label="Drag to reorder"
              title="Drag to reorder"
            >
              ⋮⋮
            </span>
          </div>
        </DragHandle>
        <EditorContent editor={editor} className="lib-tiptap-body" />
      </div>
      <BlockTray editor={editor} />

      {buttonMenu && (
        <SlashMenu
          ref={menuRef}
          items={SLASH_ITEMS}
          command={pickItem}
          clientRect={() => buttonMenu.rect}
        />
      )}
    </>
  );
}

// =====================================================================
// Block tray — chip row at the foot of the editor
// =====================================================================
//
// Shows every block type from the planning doc as a chip. Enabled
// chips (the 6 text types in 11.5b) insert their block at the end
// of the doc on click. Disabled chips display the slice number
// they'll light up in; clicking them does nothing. Wraps on narrow
// screens via `flex-wrap: wrap`.
//
// On an empty note the tray is the only chrome below the placeholder,
// giving a new tutor an obvious "pick a block to start" affordance.
// On a non-empty note it stays as the "add another block" tray.

function BlockTray({ editor }: { editor: Editor }) {
  return (
    <div className="lib-tiptap-block-tray" aria-label="Insert block">
      {SLASH_ITEMS.map((item) => {
        const disabled = !!item.comingIn;
        return (
          <button
            key={item.type}
            type="button"
            className={
              disabled
                ? 'lib-tiptap-block-chip is-disabled'
                : 'lib-tiptap-block-chip'
            }
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (disabled || !item.runAt) return;
              item.runAt(editor, editor.state.doc.content.size);
            }}
            disabled={disabled}
            title={
              disabled
                ? `${item.name} — coming in slice ${item.comingIn}`
                : `Insert ${item.name}`
            }
            aria-disabled={disabled}
          >
            <span className="lib-tiptap-block-chip-ic" aria-hidden="true">
              {item.iconSvg ? <NavIcon name={item.iconSvg} /> : item.icon}
            </span>
            <span className="lib-tiptap-block-chip-label">{item.name}</span>
            {disabled && (
              <span className="lib-tiptap-block-chip-pill">
                {item.comingIn}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// =====================================================================
// Inline toolbar — CD-style flat buttons (no heading dropdown)
// =====================================================================

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      isBold: editor.isActive('bold'),
      isItalic: editor.isActive('italic'),
      isUnderline: editor.isActive('underline'),
      isStrike: editor.isActive('strike'),
      isCode: editor.isActive('code'),
      isCodeBlock: editor.isActive('codeBlock'),
      isLink: editor.isActive('link'),
      isH2: editor.isActive('heading', { level: 2 }),
      isH3: editor.isActive('heading', { level: 3 }),
      isBulletList: editor.isActive('bulletList'),
      isOrderedList: editor.isActive('orderedList'),
      isBlockquote: editor.isActive('blockquote'),
      isSubscript: editor.isActive('subscript'),
      isSuperscript: editor.isActive('superscript'),
      isAlignLeft: editor.isActive({ textAlign: 'left' }),
      isAlignCenter: editor.isActive({ textAlign: 'center' }),
      isAlignRight: editor.isActive({ textAlign: 'right' }),
      isHighlight: editor.isActive('highlight'),
      activeHighlight:
        (editor.getAttributes('highlight').color as string | undefined) ?? null,
      activeColor:
        (editor.getAttributes('textStyle').color as string | undefined) ?? null,
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  });

  // Swatch picker state — only one open at a time. `kind`
  // distinguishes which mark the picker is bound to.
  const [swatchOpen, setSwatchOpen] = useState<null | {
    kind: 'highlight' | 'color';
    rect: DOMRect;
  }>(null);

  const onToggleLink = useCallback(() => {
    if (state.isLink) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL', previousUrl ?? '');
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor, state.isLink]);

  return (
    <div className="lib-tiptap-toolbar" role="toolbar" aria-label="Formatting">
      <TbButton
        label="Bold (⌘B)"
        pressed={state.isBold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <NavIcon name="bold" />
      </TbButton>
      <TbButton
        label="Italic (⌘I)"
        pressed={state.isItalic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <NavIcon name="italic" />
      </TbButton>
      <TbButton
        label="Underline (⌘U)"
        pressed={state.isUnderline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <NavIcon name="underline" />
      </TbButton>
      <TbButton
        label="Strikethrough"
        pressed={state.isStrike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <NavIcon name="strikethrough" />
      </TbButton>
      <TbButton
        label="Inline code (⌘E)"
        pressed={state.isCode}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <NavIcon name="code" />
      </TbButton>
      <TbButton
        label={state.isLink ? 'Remove link' : 'Add link (⌘K)'}
        pressed={state.isLink}
        onClick={onToggleLink}
      >
        <NavIcon name="link" />
      </TbButton>
      <TbButton
        label="Subscript"
        pressed={state.isSubscript}
        onClick={() => editor.chain().focus().toggleSubscript().run()}
      >
        <NavIcon name="subscript" />
      </TbButton>
      <TbButton
        label="Superscript"
        pressed={state.isSuperscript}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
      >
        <NavIcon name="superscript" />
      </TbButton>

      <span className="lib-tiptap-tb-sep" aria-hidden="true" />

      <TbButton
        label="Heading 2 (⌘⇧2)"
        pressed={state.isH2}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      >
        <NavIcon name="heading-2" />
      </TbButton>
      <TbButton
        label="Heading 3 (⌘⇧3)"
        pressed={state.isH3}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
      >
        <NavIcon name="heading-3" />
      </TbButton>

      <span className="lib-tiptap-tb-sep" aria-hidden="true" />

      <TbButton
        label="Bulleted list"
        pressed={state.isBulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <NavIcon name="list-bulleted" />
      </TbButton>
      <TbButton
        label="Numbered list"
        pressed={state.isOrderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <NavIcon name="list-numbered" />
      </TbButton>
      <TbButton
        label="Blockquote"
        pressed={state.isBlockquote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <NavIcon name="quote" />
      </TbButton>
      <TbButton
        label="Code block"
        pressed={state.isCodeBlock}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <NavIcon name="code-block" />
      </TbButton>
      <TbButton
        label="Horizontal rule"
        pressed={false}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <NavIcon name="horizontal-rule" />
      </TbButton>

      <span className="lib-tiptap-tb-sep" aria-hidden="true" />

      <TbButton
        label="Highlight"
        pressed={state.isHighlight}
        onClick={(e) =>
          setSwatchOpen({
            kind: 'highlight',
            rect: e.currentTarget.getBoundingClientRect(),
          })
        }
      >
        <NavIcon name="highlight" />
      </TbButton>
      <TbButton
        label="Text colour"
        pressed={!!state.activeColor}
        onClick={(e) =>
          setSwatchOpen({
            kind: 'color',
            rect: e.currentTarget.getBoundingClientRect(),
          })
        }
      >
        <NavIcon name="text-color" />
      </TbButton>

      <span className="lib-tiptap-tb-sep" aria-hidden="true" />

      <TbButton
        label="Align left"
        pressed={state.isAlignLeft}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      >
        <NavIcon name="align-left" />
      </TbButton>
      <TbButton
        label="Align centre"
        pressed={state.isAlignCenter}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      >
        <NavIcon name="align-center" />
      </TbButton>
      <TbButton
        label="Align right"
        pressed={state.isAlignRight}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      >
        <NavIcon name="align-right" />
      </TbButton>

      <span className="lib-tiptap-tb-sep" aria-hidden="true" />

      <TbButton
        label="Undo (⌘Z)"
        pressed={false}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!state.canUndo}
      >
        <NavIcon name="undo" />
      </TbButton>
      <TbButton
        label="Redo (⌘⇧Z)"
        pressed={false}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!state.canRedo}
      >
        <NavIcon name="redo" />
      </TbButton>
      <TbButton
        label="Clear formatting"
        pressed={false}
        onClick={() =>
          editor.chain().focus().unsetAllMarks().clearNodes().run()
        }
      >
        <NavIcon name="clear-formatting" />
      </TbButton>

      <span className="lib-tiptap-tb-spacer" aria-hidden="true" />

      <span className="lib-tiptap-tb-hint" aria-hidden="true">
        Type <kbd>/</kbd> for blocks
      </span>

      {swatchOpen && swatchOpen.kind === 'highlight' && (
        <ColorSwatchPicker
          swatches={HIGHLIGHT_SWATCHES}
          activeValue={state.activeHighlight}
          onPick={(value) =>
            editor.chain().focus().setHighlight({ color: value }).run()
          }
          onRemove={() => editor.chain().focus().unsetHighlight().run()}
          onClose={() => setSwatchOpen(null)}
          anchorRect={swatchOpen.rect}
        />
      )}
      {swatchOpen && swatchOpen.kind === 'color' && (
        <ColorSwatchPicker
          swatches={TEXT_COLOR_SWATCHES}
          activeValue={state.activeColor}
          onPick={(value) =>
            editor.chain().focus().setColor(value).run()
          }
          onRemove={() => editor.chain().focus().unsetColor().run()}
          onClose={() => setSwatchOpen(null)}
          anchorRect={swatchOpen.rect}
        />
      )}
    </div>
  );
}

function TbButton({
  label,
  pressed,
  onClick,
  disabled,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={pressed ? 'lib-tiptap-tb-btn is-on' : 'lib-tiptap-tb-btn'}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
    >
      {children}
    </button>
  );
}
