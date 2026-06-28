'use client';

// mynclex/lib/authoring/rich-field.tsx
//
// Rich-content relook — Slice 1.
//
// The reusable BANK rich-text field. A lightweight Tiptap editor — the same
// engine the tutor library uses, but stripped to the inline essentials a
// bank field needs (no slash menu, drag handles, or media blocks). This is
// the primitive every plain `<input>`/`<textarea>` in the bank will move to
// across the later slices; Slice 1 proves the round-trip on the case-study
// scenario.
//
// Toolset = decision 13's "core inline" set: Bold, Italic, Underline,
// Strikethrough, Superscript, Subscript, bullet + numbered lists, Highlight.
// (Text colour, blockquote, align, media come later, per the slice plan.)
//
// Emits a RichDoc (Tiptap's JSON) on every change. The host owns the state
// and the save; this component is purely the editor.

import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import type { ReactNode } from 'react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { NavIcon } from '@/components/nav/shared/nav-icon';
import type { RichDoc } from './rich-doc';

interface RichFieldProps {
  /** Initial document (use parseRichDoc on the stored column value). */
  value: RichDoc;
  /** Fires on every edit with the current document. */
  onChange: (doc: RichDoc) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export function RichField({
  value,
  onChange,
  placeholder = 'Start writing…',
  ariaLabel = 'Rich text editor',
}: RichFieldProps) {
  const editor = useEditor({
    extensions: [
      // StarterKit (v3) supplies Bold / Italic / Underline / Strike,
      // bullet + ordered lists, paragraph, hard break, history.
      StarterKit,
      Placeholder.configure({ placeholder }),
      // Background-tint emphasis (cosmetic — abnormal values etc.). Single
      // default colour for Slice 1; the swatch palette comes with cells.
      Highlight,
      Subscript,
      Superscript,
    ],
    content: value,
    editable: true,
    immediatelyRender: false,
    onUpdate({ editor }) {
      onChange(editor.getJSON() as RichDoc);
    },
  });

  if (!editor) {
    return (
      <div className="auth-rich-field">
        <div className="auth-rf-toolbar auth-rf-toolbar-skeleton" aria-hidden="true" />
        <div className="auth-rf-body auth-rf-body-skeleton" aria-hidden="true">
          Loading editor…
        </div>
      </div>
    );
  }

  return (
    <div className="auth-rich-field">
      <Toolbar editor={editor} />
      <EditorContent
        editor={editor}
        className="auth-rf-body"
        aria-label={ariaLabel}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Toolbar — flat core-inline buttons
// ─────────────────────────────────────────────────────────────

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      isBold: editor.isActive('bold'),
      isItalic: editor.isActive('italic'),
      isUnderline: editor.isActive('underline'),
      isStrike: editor.isActive('strike'),
      isSuperscript: editor.isActive('superscript'),
      isSubscript: editor.isActive('subscript'),
      isBulletList: editor.isActive('bulletList'),
      isOrderedList: editor.isActive('orderedList'),
      isHighlight: editor.isActive('highlight'),
    }),
  });

  return (
    <div className="auth-rf-toolbar" role="toolbar" aria-label="Formatting">
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

      <span className="auth-rf-sep" aria-hidden="true" />

      <TbButton
        label="Superscript"
        pressed={state.isSuperscript}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
      >
        <NavIcon name="superscript" />
      </TbButton>
      <TbButton
        label="Subscript"
        pressed={state.isSubscript}
        onClick={() => editor.chain().focus().toggleSubscript().run()}
      >
        <NavIcon name="subscript" />
      </TbButton>

      <span className="auth-rf-sep" aria-hidden="true" />

      <TbButton
        label="Bullet list"
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

      <span className="auth-rf-sep" aria-hidden="true" />

      <TbButton
        label="Highlight"
        pressed={state.isHighlight}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <NavIcon name="highlight" />
      </TbButton>
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
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`auth-rf-btn${pressed ? ' is-active' : ''}`}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      // Keep focus in the editor selection — a toolbar mousedown would
      // otherwise blur it and the toggle would apply to nothing.
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}
