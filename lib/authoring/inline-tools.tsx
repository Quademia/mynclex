'use client';

// mynclex/lib/authoring/inline-tools.tsx
//
// The shared "in cell / in body" inline rich-text tool group that drives a
// focused editor through an external (host) toolbar. Used by the merge-table
// editor (per cell) and the narrative-tab editor (per entry body) — both
// roving editors with one shared toolbar. The host passes its own button
// class so the buttons match its toolbar styling.
//
// Highlight + Text colour live in <ColorMarkButtons> (rich-field) which
// already reuses the library's swatch picker.

import { useEditorState, type Editor } from '@tiptap/react';
import { NavIcon } from '@/components/nav/shared/nav-icon';
import type { NavIcon as NavIconName } from '@/lib/nav/types';
import { ColorMarkButtons } from './rich-field';

interface InlineTool {
  icon:  NavIconName;
  label: string;
  mark:  string; // editor.isActive(mark) key
  run:   (e: Editor) => void;
}

export const INLINE_TOOLS: InlineTool[] = [
  { icon: 'bold',          label: 'Bold',          mark: 'bold',          run: (e) => e.chain().focus().toggleBold().run() },
  { icon: 'italic',        label: 'Italic',        mark: 'italic',        run: (e) => e.chain().focus().toggleItalic().run() },
  { icon: 'underline',     label: 'Underline',     mark: 'underline',     run: (e) => e.chain().focus().toggleUnderline().run() },
  { icon: 'strikethrough', label: 'Strikethrough', mark: 'strike',        run: (e) => e.chain().focus().toggleStrike().run() },
  { icon: 'superscript',   label: 'Superscript',   mark: 'superscript',   run: (e) => e.chain().focus().toggleSuperscript().run() },
  { icon: 'subscript',     label: 'Subscript',     mark: 'subscript',     run: (e) => e.chain().focus().toggleSubscript().run() },
  { icon: 'list-bulleted', label: 'Bullet list',   mark: 'bulletList',    run: (e) => e.chain().focus().toggleBulletList().run() },
  { icon: 'list-numbered', label: 'Numbered list', mark: 'orderedList',   run: (e) => e.chain().focus().toggleOrderedList().run() },
];

// Block alignment — left / centre / right on the focused paragraph or heading.
// Separate from INLINE_TOOLS because "active" is a node-attr check
// (`isActive({ textAlign })`), not a mark.
interface AlignTool {
  icon:  NavIconName;
  label: string;
  value: 'left' | 'center' | 'right';
}

export const ALIGN_TOOLS: AlignTool[] = [
  { icon: 'align-left',   label: 'Align left',   value: 'left' },
  { icon: 'align-center', label: 'Align centre', value: 'center' },
  { icon: 'align-right',  label: 'Align right',  value: 'right' },
];

// Highlight + Text colour live in <ColorMarkButtons>; these stubs mirror
// them in the disabled state so the toolbar keeps shape.
const COLOR_STUBS: Array<{ icon: NavIconName; label: string }> = [
  { icon: 'highlight',  label: 'Highlight' },
  { icon: 'text-color', label: 'Text colour' },
];

/** Live inline tools, driving `editor`. */
export function InlineTools({ editor, buttonClassName }: { editor: Editor; buttonClassName: string }) {
  const active = useEditorState({
    editor,
    selector: ({ editor }) => {
      const m: Record<string, boolean> = {};
      for (const tool of INLINE_TOOLS) m[tool.mark] = editor.isActive(tool.mark);
      for (const a of ALIGN_TOOLS) m[`align:${a.value}`] = editor.isActive({ textAlign: a.value });
      return m;
    },
  });
  return (
    <>
      {INLINE_TOOLS.map((tool) => (
        <button
          key={tool.label}
          type="button"
          className={`${buttonClassName}${active[tool.mark] ? ' is-active' : ''}`}
          title={tool.label}
          aria-label={tool.label}
          aria-pressed={active[tool.mark]}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => tool.run(editor)}
        >
          <NavIcon name={tool.icon} />
        </button>
      ))}
      {ALIGN_TOOLS.map((a) => (
        <button
          key={a.label}
          type="button"
          className={`${buttonClassName}${active[`align:${a.value}`] ? ' is-active' : ''}`}
          title={a.label}
          aria-label={a.label}
          aria-pressed={active[`align:${a.value}`]}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().setTextAlign(a.value).run()}
        >
          <NavIcon name={a.icon} />
        </button>
      ))}
      <ColorMarkButtons editor={editor} buttonClassName={buttonClassName} />
    </>
  );
}

/** Disabled inline tools (no editor focused) — same shape, greyed. */
export function InlineToolsDisabled({
  buttonClassName,
  hint = 'Click into the text to format it',
}: {
  buttonClassName: string;
  hint?: string;
}) {
  return (
    <>
      {[...INLINE_TOOLS, ...ALIGN_TOOLS, ...COLOR_STUBS].map((tool) => (
        <button
          key={tool.label}
          type="button"
          className={buttonClassName}
          disabled
          title={hint}
          aria-label={tool.label}
        >
          <NavIcon name={tool.icon} />
        </button>
      ))}
    </>
  );
}
