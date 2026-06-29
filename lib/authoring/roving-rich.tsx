'use client';

// mynclex/lib/authoring/roving-rich.tsx
//
// Rich-content relook — Slice 6 foundation.
//
// "One toolbar, many fields" for the question editors. A question's Content
// tab stacks many rich fields (stem + every option text + every per-option
// feedback + rationale + instruction). Giving each its own toolbar would be a
// wall of duplicated toolbars + a live editor per field. Instead this is the
// roving pattern already used by the merge-table / narrative editors,
// generalised to a whole form:
//
//   - ONE <RovingToolbar> sits at the top of the Content tab.
//   - Each field is a <RovingRichField fieldKey="…">. Only the focused field
//     is a LIVE editor; every other field renders as static formatted text.
//   - Clicking a static field makes it the live one (caret dropped in) and
//     the single shared toolbar drives it.
//
// The state lives in a small context so the toolbar + the fields (some of
// which sit inside child components like the option list) share it without
// prop-drilling. Wrap the Content tab in <RovingProvider>.
//
// FormData bridge: each field ALWAYS renders a hidden <input name=…> holding
// its serialized JSON, so the existing string-based save path is untouched —
// the field is rich in the UI, a JSON string on the wire (the Slice-1
// scenario approach). serializeRichDoc returns '' for an empty doc, so the
// server's "required" / "non-empty option" checks behave exactly as before.

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import type { Editor } from '@tiptap/react';
import { RichField } from './rich-field';
import { RichRender } from './rich-render';
import { InlineTools, InlineToolsDisabled } from './inline-tools';
import { serializeRichDoc, isEmptyRichDoc, type RichDoc } from './rich-doc';

// ─────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────

interface RovingState {
  activeKey:       string | null;
  setActiveKey:    (k: string | null) => void;
  activeEditor:    Editor | null;
  setActiveEditor: (e: Editor | null) => void;
}

const RovingCtx = createContext<RovingState | null>(null);

function useRoving(): RovingState {
  const ctx = useContext(RovingCtx);
  if (!ctx) {
    throw new Error('RovingRichField / RovingToolbar must be used inside <RovingProvider>.');
  }
  return ctx;
}

export function RovingProvider({ children }: { children: ReactNode }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  return (
    <RovingCtx.Provider value={{ activeKey, setActiveKey, activeEditor, setActiveEditor }}>
      {children}
    </RovingCtx.Provider>
  );
}

// ─────────────────────────────────────────────────────────────
// Toolbar — drives whichever field is focused
// ─────────────────────────────────────────────────────────────

export function RovingToolbar({
  hint = 'Click into a field to format it',
}: {
  hint?: string;
}) {
  const { activeEditor } = useRoving();
  return (
    <div className="auth-roving-toolbar" role="toolbar" aria-label="Formatting">
      <span className="auth-roving-label">Format</span>
      {activeEditor ? (
        <InlineTools editor={activeEditor} buttonClassName="auth-rf-btn" />
      ) : (
        <InlineToolsDisabled buttonClassName="auth-rf-btn" hint={hint} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Field — live editor when focused, static text otherwise
// ─────────────────────────────────────────────────────────────

interface RovingRichFieldProps {
  /** Unique within one editor — identifies which field is focused. */
  fieldKey:    string;
  /** FormData field name (e.g. 'stem', 'option_text'). */
  name:        string;
  /** Current document (the host owns the state). */
  value:       RichDoc;
  onChange:    (doc: RichDoc) => void;
  placeholder?: string;
  ariaLabel?:  string;
  /** Extra class on the static / edit wrapper (sizing per surface). */
  className?:  string;
  /** Render the static view inline (for tight rows — option text/feedback). */
  inline?:     boolean;
  /**
   * Suppress the built-in hidden `<input>`. Use when the host owns form
   * serialization separately and would otherwise double-emit this `name`
   * (e.g. BOWTIE, where one always-rendered serialiser covers all three
   * tab-gated wings while the editor only mounts the active wing's fields).
   * The host must then serialize the doc itself via `serializeRichDoc`.
   */
  noHiddenInput?: boolean;
}

export function RovingRichField({
  fieldKey,
  name,
  value,
  onChange,
  placeholder = 'Start writing…',
  ariaLabel,
  className,
  inline = false,
  noHiddenInput = false,
}: RovingRichFieldProps) {
  const { activeKey, setActiveKey, setActiveEditor } = useRoving();
  const isActive = activeKey === fieldKey;
  const wrapCls = (base: string) => (className ? `${base} ${className}` : base);

  return (
    <>
      {/* FormData bridge — always present so the value submits regardless of
          which field currently holds focus. Suppressed when the host owns
          serialization (see noHiddenInput). */}
      {!noHiddenInput && (
        <input type="hidden" name={name} value={serializeRichDoc(value)} />
      )}

      {isActive ? (
        <div className={wrapCls('auth-rrf-edit')}>
          <RichField
            value={value}
            hideToolbar
            autofocus
            onEditor={setActiveEditor}
            onChange={onChange}
            placeholder={placeholder}
            ariaLabel={ariaLabel}
          />
        </div>
      ) : (
        <div
          className={wrapCls('auth-rrf-static')}
          role="textbox"
          tabIndex={0}
          aria-label={ariaLabel}
          onClick={() => setActiveKey(fieldKey)}
          onFocus={() => setActiveKey(fieldKey)}
        >
          {isEmptyRichDoc(value) ? (
            <span className="auth-rrf-ph">{placeholder}</span>
          ) : (
            <RichRender doc={value} inline={inline} />
          )}
        </div>
      )}
    </>
  );
}
