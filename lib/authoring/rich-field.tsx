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
import type { AnyExtension } from '@tiptap/core';
import { useEffect, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { NavIcon } from '@/components/nav/shared/nav-icon';
import {
  ColorSwatchPicker,
  HIGHLIGHT_SWATCHES,
  TEXT_COLOR_SWATCHES,
} from '@/lib/library/color-swatch-picker';
import type { RichDoc } from './rich-doc';

interface RichFieldProps {
  /** Initial document (use parseRichDoc on the stored column value). */
  value: RichDoc;
  /** Fires on every edit with the current document. */
  onChange: (doc: RichDoc) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Suppress the built-in toolbar — the host drives the editor through
   *  its own toolbar (e.g. the roving merge-table cell). */
  hideToolbar?: boolean;
  /** Hand the live editor instance up to the host (and `null` on unmount)
   *  so an external toolbar can dispatch commands to it. */
  onEditor?: (editor: Editor | null) => void;
  /** Focus the editor (caret to end) as soon as it mounts. Used by the
   *  roving field so clicking a static field drops the caret straight in. */
  autofocus?: boolean;
  /** Extra Tiptap extensions appended to the base set — opt-in per host,
   *  so a block node (e.g. the Slice-7 bank image) only exists in fields
   *  that deliberately enable it. Must be a stable reference (module
   *  const), not a per-render array. */
  extensions?: AnyExtension[];
  /** Slice 8d — show an Insert-image button on the built-in toolbar.
   *  Only enable together with the BankImageBlock extension; inserting
   *  the node into an editor without it would throw. */
  imageButton?: boolean;
}

export function RichField({
  value,
  onChange,
  placeholder = 'Start writing…',
  ariaLabel = 'Rich text editor',
  hideToolbar = false,
  onEditor,
  autofocus = false,
  extensions,
  imageButton = false,
}: RichFieldProps) {
  const editor = useEditor({
    autofocus: autofocus ? 'end' : false,
    extensions: [
      // StarterKit (v3) supplies Bold / Italic / Underline / Strike,
      // bullet + ordered lists, paragraph, hard break, history.
      StarterKit,
      Placeholder.configure({ placeholder }),
      // Background-tint emphasis (cosmetic — abnormal values etc.), with a
      // colour swatch palette. Text colour needs TextStyle as its parent.
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      // Block alignment (left / centre / right) on paragraphs + headings.
      // Stored as a `textAlign` node attr; RichRender mirrors it.
      TextAlign.configure({ types: ['heading', 'paragraph'], defaultAlignment: 'left' }),
      TextStyle,
      Color,
      ...(extensions ?? []),
    ],
    content: value,
    editable: true,
    immediatelyRender: false,
    onUpdate({ editor }) {
      onChange(editor.getJSON() as RichDoc);
    },
  });

  // Hand the editor up to a host toolbar (external-toolbar mode) when it
  // becomes ready, and `null` on unmount. `onEditor` should be a stable
  // callback (e.g. a useState setter) so this only fires on editor change.
  useEffect(() => {
    onEditor?.(editor ?? null);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

  if (!editor) {
    return (
      <div className="auth-rich-field">
        {!hideToolbar && (
          <div className="auth-rf-toolbar auth-rf-toolbar-skeleton" aria-hidden="true" />
        )}
        <div className="auth-rf-body auth-rf-body-skeleton" aria-hidden="true">
          Loading editor…
        </div>
      </div>
    );
  }

  return (
    <div className="auth-rich-field">
      {!hideToolbar && <Toolbar editor={editor} imageButton={imageButton} />}
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

function Toolbar({
  editor,
  imageButton = false,
}: {
  editor: Editor;
  imageButton?: boolean;
}) {
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
      alignLeft: editor.isActive({ textAlign: 'left' }),
      alignCenter: editor.isActive({ textAlign: 'center' }),
      alignRight: editor.isActive({ textAlign: 'right' }),
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
        label="Align left"
        pressed={state.alignLeft}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      >
        <NavIcon name="align-left" />
      </TbButton>
      <TbButton
        label="Align centre"
        pressed={state.alignCenter}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      >
        <NavIcon name="align-center" />
      </TbButton>
      <TbButton
        label="Align right"
        pressed={state.alignRight}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      >
        <NavIcon name="align-right" />
      </TbButton>

      <span className="auth-rf-sep" aria-hidden="true" />

      <ColorMarkButtons editor={editor} buttonClassName="auth-rf-btn" />

      {imageButton && (
        <>
          <span className="auth-rf-sep" aria-hidden="true" />
          <button
            type="button"
            className="auth-rf-btn"
            title="Insert image"
            aria-label="Insert image"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              editor.chain().focus().insertContent({ type: 'bankImage' }).run()
            }
          >
            <NavIcon name="image" />
          </button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Highlight + text-colour swatch buttons. Shared by this field's own
// toolbar and the merge-table's in-cell toolbar (which passes its own
// button class). Reuses the library's swatch picker + dark-mode-safe
// palettes.
// ─────────────────────────────────────────────────────────────

export function ColorMarkButtons({
  editor,
  buttonClassName,
}: {
  editor: Editor;
  buttonClassName: string;
}) {
  const [pop, setPop] = useState<null | { kind: 'highlight' | 'color'; rect: DOMRect }>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      isHighlight: editor.isActive('highlight'),
      highlightColor: (editor.getAttributes('highlight').color as string | undefined) ?? null,
      textColor: (editor.getAttributes('textStyle').color as string | undefined) ?? null,
    }),
  });

  function toggle(kind: 'highlight' | 'color', e: ReactMouseEvent<HTMLButtonElement>) {
    e.preventDefault(); // keep the editor selection while opening the picker
    const rect = e.currentTarget.getBoundingClientRect();
    setPop((p) => (p?.kind === kind ? null : { kind, rect }));
  }

  return (
    <>
      <button
        type="button"
        className={`${buttonClassName}${state.isHighlight ? ' is-active' : ''}`}
        title="Highlight"
        aria-label="Highlight"
        onMouseDown={(e) => toggle('highlight', e)}
      >
        <NavIcon name="highlight" />
      </button>
      <button
        type="button"
        className={`${buttonClassName}${state.textColor ? ' is-active' : ''}`}
        title="Text colour"
        aria-label="Text colour"
        onMouseDown={(e) => toggle('color', e)}
      >
        <NavIcon name="text-color" />
      </button>

      {pop?.kind === 'highlight' && (
        <ColorSwatchPicker
          swatches={HIGHLIGHT_SWATCHES}
          activeValue={state.highlightColor}
          onPick={(v) => editor.chain().focus().toggleHighlight({ color: v }).run()}
          onRemove={() => editor.chain().focus().unsetHighlight().run()}
          onClose={() => setPop(null)}
          anchorRect={pop.rect}
        />
      )}
      {pop?.kind === 'color' && (
        <ColorSwatchPicker
          swatches={TEXT_COLOR_SWATCHES}
          activeValue={state.textColor}
          onPick={(v) => editor.chain().focus().setColor(v).run()}
          onRemove={() => editor.chain().focus().unsetColor().run()}
          onClose={() => setPop(null)}
          anchorRect={pop.rect}
        />
      )}
    </>
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
