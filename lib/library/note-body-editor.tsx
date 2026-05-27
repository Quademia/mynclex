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

  function openMenuAtEnd(buttonRect: DOMRect) {
    setButtonMenu({
      position: editor.state.doc.content.size,
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
      <button
        type="button"
        className="lib-tiptap-add-block-foot"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) =>
          openMenuAtEnd(e.currentTarget.getBoundingClientRect())
        }
        title="Add a block at the end"
      >
        <span aria-hidden="true">+</span>
        <span>Add block</span>
      </button>

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
      isLink: editor.isActive('link'),
      isH2: editor.isActive('heading', { level: 2 }),
      isH3: editor.isActive('heading', { level: 3 }),
      isBulletList: editor.isActive('bulletList'),
      isOrderedList: editor.isActive('orderedList'),
      isBlockquote: editor.isActive('blockquote'),
    }),
  });

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

      <span className="lib-tiptap-tb-spacer" aria-hidden="true" />

      <span className="lib-tiptap-tb-hint" aria-hidden="true">
        Type <kbd>/</kbd> for blocks
      </span>
    </div>
  );
}

function TbButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={pressed ? 'lib-tiptap-tb-btn is-on' : 'lib-tiptap-tb-btn'}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
    >
      {children}
    </button>
  );
}
