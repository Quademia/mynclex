// mynclex/lib/bank/bank-list-client.tsx
//
// Shared client component used by /admin/bank/all and the tutor
// twin. Owns the modal stack:
//
//   - "+ New question" → opens <QuestionTypePicker>.
//   - Pick a type → opens the matching editor in create mode.
//   - "Edit" on a row → opens the matching editor in edit mode with
//                       the row's full data preloaded.
//
// Each new editor adds its own initials map to the props (mcq, tf,
// …) and a small switch case in the modal stack. No dispatcher —
// each editor is imported by name; the switch picks which one.
//
// On save / delete, the corresponding server action calls
// revalidatePath; this component then triggers a soft refresh of
// the page so the list reflects the change without a full reload.
//
// As of slice 10, all nine question types are wired
// (MCQ + TF + SATA + SELECT_N + MATRIX + BOWTIE + CLOZE + HIGHLIGHT
// + DRAG_DROP). Filters / search / pagination still deferred.

'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { McqEditor, type McqEditorInitial } from '@/lib/bank/editors/mcq-editor';
import { TfEditor, type TfEditorInitial } from '@/lib/bank/editors/tf-editor';
import { SataEditor, type SataEditorInitial } from '@/lib/bank/editors/sata-editor';
import { SelectNEditor, type SelectNEditorInitial } from '@/lib/bank/editors/select-n-editor';
import { MatrixEditor, type MatrixEditorInitial } from '@/lib/bank/editors/matrix-editor';
import { BowtieEditor, type BowtieEditorInitial } from '@/lib/bank/editors/bowtie-editor';
import { ClozeEditor, type ClozeEditorInitial } from '@/lib/bank/editors/cloze-editor';
import { HighlightEditor, type HighlightEditorInitial } from '@/lib/bank/editors/highlight-editor';
import { DragDropEditor, type DragDropEditorInitial } from '@/lib/bank/editors/drag-drop-editor';
import { DragClozeEditor, type DragClozeEditorInitial } from '@/lib/bank/editors/drag-cloze-editor';
import { QuestionTypePicker } from '@/lib/bank/atoms/question-type-picker';
import type { QuestionType } from '@/lib/bank/classifications';
import { AuthorshipCell } from '@/lib/audit/authorship-line';
import type { Authorship } from '@/lib/audit/authorship';
import { HoverPeek } from '@/lib/bank/hover-peek';
import { TypePill, DiffChip } from '@/lib/bank/list-ui';
import { BankToolbar } from '@/lib/bank/bank-filters';
import {
  buildBankUrl,
  bankViewLoadsAll,
  BANK_PAGE_SIZE,
  type BankFilterValues,
  type BankView,
} from '@/lib/bank/bank-list-query';

/** Question types whose editors are wired into bank-list today. */
const EDITABLE_TYPES: ReadonlySet<QuestionType> = new Set([
  'MCQ',
  'TF',
  'SATA',
  'SELECT_N',
  'MATRIX',
  'BOWTIE',
  'CLOZE',
  'HIGHLIGHT',
  'DRAG_DROP',
]);

export interface BankListRowSummary {
  item_id:        string;
  question_type:  QuestionType;
  stem:           string;
  instruction:    string | null;
  difficulty:     string | null;
  is_published:   boolean;
  is_free_sample: boolean;
  marks:          number;
  /** Last-edited timestamp — drives the "Updated" column. */
  updated_at:     string;
  // Classification — rendered as compact tags under the stem so you can
  // tell what a question is about without opening it. Any may be null.
  category:       string | null;
  subcategory:    string | null;
  subject:        string | null;
  bodySystem:     string | null;
  // Wrapper attachment metadata. Both null on standalone rows. At
  // most one of {case, trend} is set on attached rows — questions
  // can belong to one wrapper at a time. Wrapper-attached rows show
  // a badge and link straight to the wrapper page on Edit click;
  // they don't open the standalone modal.
  parent_case_id: string | null;
  case_title:     string | null;
  trend_id:       string | null;
  trend_title:    string | null;
  // Library-note origin (born inside a note). Surface-aware: the title is
  // resolved by the page from that surface's own library; null when there
  // is no library to resolve it (e.g. admin today). Badge shows only when
  // resolvable.
  parent_note_id: string | null;
  note_title:     string | null;
}

export interface BankListClientProps {
  surface: 'admin' | 'tutor';
  rows: BankListRowSummary[];
  /**
   * Authorship facts (created / last-edited names) per item_id, resolved
   * server-side from the audit log. Drives the "Authors" column + its
   * history drawer. Each question shows its OWN history — wrapper-attached
   * rows included; the wrapper's history is separate.
   */
  authorshipById: Record<string, Authorship>;
  /**
   * Whether any filter (search/type/category/difficulty/status/membership)
   * is currently applied. Drives the empty-state copy: "No questions yet"
   * when the bank is genuinely empty, "No questions match these filters"
   * + Reset link when filters are clearing the view.
   */
  hasAnyFilter: boolean;
  /**
   * The list page's URL — used by the "Reset" link in the filtered-empty
   * state to drop all params and return to the full view.
   */
  baseUrl: string;
  /** Current filter values — drives the toolbar (search/status/facets). */
  filters: BankFilterValues;
  /** Distinct tags for the Tag facet. */
  tagOptions: string[];
  /** View state (sort / group / pagination limit) — read from the URL. */
  view: BankView;
  /** Total rows matching the current filters (for "Showing X of Y" + Load more). */
  filteredTotal: number;
  /** Map of item_id → full editor initial, MCQ rows. */
  mcqInitialsById: Record<string, McqEditorInitial>;
  /** Empty initial used when the curator picks MCQ in create mode. */
  emptyMcqInitial: McqEditorInitial;
  /** Map of item_id → full editor initial, TF rows. */
  tfInitialsById: Record<string, TfEditorInitial>;
  /** Empty initial used when the curator picks TF in create mode. */
  emptyTfInitial: TfEditorInitial;
  /** Map of item_id → full editor initial, SATA rows. */
  sataInitialsById: Record<string, SataEditorInitial>;
  /** Empty initial used when the curator picks SATA in create mode. */
  emptySataInitial: SataEditorInitial;
  /** Map of item_id → full editor initial, SELECT_N rows. */
  selectNInitialsById: Record<string, SelectNEditorInitial>;
  /** Empty initial used when the curator picks SELECT_N in create mode. */
  emptySelectNInitial: SelectNEditorInitial;
  /** Map of item_id → full editor initial, MATRIX rows. */
  matrixInitialsById: Record<string, MatrixEditorInitial>;
  /** Empty initial used when the curator picks MATRIX in create mode. */
  emptyMatrixInitial: MatrixEditorInitial;
  /** Map of item_id → full editor initial, BOWTIE rows. */
  bowtieInitialsById: Record<string, BowtieEditorInitial>;
  /** Empty initial used when the curator picks BOWTIE in create mode. */
  emptyBowtieInitial: BowtieEditorInitial;
  /** Map of item_id → full editor initial, CLOZE rows. */
  clozeInitialsById: Record<string, ClozeEditorInitial>;
  /** Empty initial used when the curator picks CLOZE in create mode. */
  emptyClozeInitial: ClozeEditorInitial;
  /** Map of item_id → full editor initial, HIGHLIGHT rows. */
  highlightInitialsById: Record<string, HighlightEditorInitial>;
  /** Empty initial used when the curator picks HIGHLIGHT in create mode. */
  emptyHighlightInitial: HighlightEditorInitial;
  /** Map of item_id → full editor initial, DRAG_DROP rows. */
  dragDropInitialsById: Record<string, DragDropEditorInitial>;
  /** Empty initial used when the curator picks DRAG_DROP in create mode. */
  emptyDragDropInitial: DragDropEditorInitial;
  /** Map of item_id → full editor initial, DRAG_CLOZE rows. */
  dragClozeInitialsById: Record<string, DragClozeEditorInitial>;
  /** Empty initial used when the curator picks DRAG_CLOZE in create mode. */
  emptyDragClozeInitial: DragClozeEditorInitial;
}

type ModalState =
  | { kind: 'closed' }
  | { kind: 'picker' }
  | { kind: 'editor-create'; type: QuestionType }
  | { kind: 'editor-edit'; itemId: string; type: QuestionType };

export function BankListClient({
  surface,
  rows,
  authorshipById,
  hasAnyFilter,
  baseUrl,
  filters,
  tagOptions,
  view,
  filteredTotal,
  mcqInitialsById,
  emptyMcqInitial,
  tfInitialsById,
  emptyTfInitial,
  sataInitialsById,
  emptySataInitial,
  selectNInitialsById,
  emptySelectNInitial,
  matrixInitialsById,
  emptyMatrixInitial,
  bowtieInitialsById,
  emptyBowtieInitial,
  clozeInitialsById,
  emptyClozeInitial,
  highlightInitialsById,
  emptyHighlightInitial,
  dragDropInitialsById,
  emptyDragDropInitial,
  dragClozeInitialsById,
  emptyDragClozeInitial,
}: BankListClientProps) {
  const router = useRouter();
  // Audit identity for this surface: admin questions are bank_item rows
  // in the admin log; tutor questions are tutor_question rows in the
  // tutor log. surface already matches the AuditRealm union.
  const auditEntityType = surface === 'admin' ? 'bank_item' : 'tutor_question';
  // Surface-aware library base for the Note-origin badge link.
  const libraryBase = surface === 'admin' ? '/admin/library' : '/tutor/library';
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  // Brief flash after a successful save/delete — useful confirmation
  // for the curator since the modal closed without showing a "Saved"
  // state of its own.
  const [flash, setFlash] = useState<string | null>(null);

  // Sort + group + pagination live in the URL (server-driven). Default is
  // item_id asc, paginated. Sorting or grouping makes the server load the
  // whole matched set (see bankViewLoadsAll); the client then sorts/groups
  // it instantly — so Difficulty's Easy→Medium→Hard rank works client-side.
  const effectiveSort: SortState = { key: (view.sort || 'id') as SortKey, dir: view.dir };
  const sortedRows = useMemo(
    () => sortRows(rows, { key: (view.sort || 'id') as SortKey, dir: view.dir }),
    [rows, view.sort, view.dir],
  );
  const loadsAll = bankViewLoadsAll(view);

  function navigateView(next: BankView) {
    router.replace(buildBankUrl(baseUrl, filters, next), { scroll: false });
  }
  function toggleSort(key: SortKey) {
    const dir = effectiveSort.key === key && effectiveSort.dir === 'asc' ? 'desc' : 'asc';
    navigateView({ ...view, sort: key, dir, limit: BANK_PAGE_SIZE });
  }
  function toggleGroup() {
    navigateView({ ...view, group: !view.group, limit: BANK_PAGE_SIZE });
  }
  function loadMore() {
    navigateView({ ...view, limit: view.limit + BANK_PAGE_SIZE });
  }

  function handleNewQuestion() {
    setFlash(null);
    setModal({ kind: 'picker' });
  }

  function handlePickType(type: QuestionType) {
    if (EDITABLE_TYPES.has(type)) {
      setModal({ kind: 'editor-create', type });
    }
    // Other types are disabled in the picker — fall through to no-op.
  }

  function handleEditRow(row: BankListRowSummary) {
    setFlash(null);
    setModal({ kind: 'editor-edit', itemId: row.item_id, type: row.question_type });
  }

  function handleClose() {
    setModal({ kind: 'closed' });
  }

  function handleSaved(result: { item_id: string; created: boolean }) {
    setModal({ kind: 'closed' });
    setFlash(
      result.created
        ? `Created ${result.item_id}.`
        : `Saved changes to ${result.item_id}.`,
    );
    router.refresh();
  }

  function handleDeleted(itemId: string) {
    setModal({ kind: 'closed' });
    setFlash(`Deleted ${itemId}.`);
    router.refresh();
  }

  // Each slice (3-10) flipped one type from "uneditable" to "editable"
  // by adding it to EDITABLE_TYPES + wiring its editor + initials map.
  // All 9 types are wired now; the gate stays as documentation +
  // safety against future additions.
  function rowEditable(row: BankListRowSummary): boolean {
    return EDITABLE_TYPES.has(row.question_type);
  }

  // Wrapper href for an attached row. Routes to the wrapper page with
  // ?focus=<item_id> so the wrapper opens with the matching pill
  // pre-selected (CS + trend wrapper pages parse the focus param).
  function wrapperHrefFor(row: BankListRowSummary): string | null {
    const baseAdmin = surface === 'admin' ? '/admin/bank' : '/tutor/bank';
    if (row.parent_case_id) {
      return `${baseAdmin}/cases/${row.parent_case_id}?focus=${row.item_id}`;
    }
    if (row.trend_id) {
      return `${baseAdmin}/trends/${row.trend_id}?focus=${row.item_id}`;
    }
    return null;
  }

  // One question row (the two-row card). Shared by the flat + grouped
  // renders so the markup lives in one place.
  function renderRow(row: BankListRowSummary) {
    const wrapperHref = wrapperHrefFor(row);
    const hasStrip = Boolean(
      row.parent_case_id || row.trend_id ||
      (row.parent_note_id && row.note_title) ||
      row.category || row.subcategory || row.subject || row.bodySystem,
    );
    return (
      <Fragment key={row.item_id}>
        <tr className={hasStrip ? 'bl-q-main has-strip' : 'bl-q-main'}>
          <td className="bl-id"><code>{row.item_id}</code></td>
          <td className="bl-col-title">
            <HoverPeek className="bl-title" panel={
              <div className="hover-peek">
                {row.instruction && <div className="hover-peek-kicker">{row.instruction}</div>}
                <p className="hover-peek-body">{row.stem}</p>
              </div>
            }>
              {row.stem}
            </HoverPeek>
          </td>
          <td><TypePill type={row.question_type} /></td>
          <td><DiffChip difficulty={row.difficulty} /></td>
          <td className="bl-num">{row.marks}</td>
          <td>
            {row.is_published
              ? <span className="bl-status pub">Published</span>
              : <span className="bl-status draft">Draft</span>}
          </td>
          <td className="bl-cell-mid">
            {row.updated_at ? new Date(row.updated_at).toLocaleDateString() : '—'}
          </td>
          <td>
            <AuthorshipCell
              authorship={authorshipById[row.item_id]}
              realm={surface}
              entityType={auditEntityType}
              entityId={row.item_id}
              title={stemSnippet(row.stem, 60)}
            />
          </td>
          <td className="bl-actions">
            {wrapperHref ? (
              <Link
                href={wrapperHref}
                className="bl-open"
                title={
                  row.parent_case_id
                    ? 'Open the case wrapper with this question pre-selected'
                    : 'Open the trend wrapper with this question pre-selected'
                }
              >
                {row.parent_case_id ? 'Open in case editor' : 'Open in trend editor'}
              </Link>
            ) : rowEditable(row) ? (
              <button
                type="button"
                className="bl-open"
                onClick={() => handleEditRow(row)}
              >
                Edit
              </button>
            ) : (
              <span
                className="bl-cell-mid"
                title={`The ${row.question_type} editor lands in a later slice`}
              >
                —
              </span>
            )}
          </td>
        </tr>

        {/* Full-width tag strip — the lower half of the card.
            Wrapper/Note origin badge (clickable) + classification
            tags, laid out horizontally with room to breathe. */}
        {hasStrip && (
          <tr className="bl-q-strip">
            {/* Empty cell under the ID column so the strip starts
                aligned with the stem and runs to the actions. */}
            <td aria-hidden="true" />
            <td colSpan={8}>
              <div className="bl-q-tags">
                {row.parent_case_id && (
                  <Link
                    href={wrapperHref ?? '#'}
                    className="bl-badge bl-badge-case"
                    title="Open in case editor"
                  >
                    In case · {row.case_title ?? row.parent_case_id}
                  </Link>
                )}
                {row.trend_id && (
                  <Link
                    href={wrapperHref ?? '#'}
                    className="bl-badge bl-badge-trend"
                    title="Open in trend editor"
                  >
                    Trend · {row.trend_title ?? row.trend_id}
                  </Link>
                )}
                {row.parent_note_id && row.note_title && (
                  <Link
                    href={`${libraryBase}/note/${row.parent_note_id}`}
                    className="bl-badge bl-badge-note"
                    title="Open the library note this question was created in"
                  >
                    Note · {row.note_title}
                  </Link>
                )}
                {row.category    && <span className="bl-class-tag cat">{row.category}</span>}
                {row.subcategory && <span className="bl-class-tag">{row.subcategory}</span>}
                {row.subject     && <span className="bl-class-tag">{row.subject}</span>}
                {row.bodySystem  && <span className="bl-class-tag">{row.bodySystem}</span>}
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  }

  return (
    <>
      {flash && (
        <div className="auth-flash" role="status">
          {flash}
        </div>
      )}

      <BankToolbar
        values={filters}
        baseUrl={baseUrl}
        tagOptions={tagOptions}
        view={view}
        rightSlot={
          <button
            type="button"
            className="bl-btn bl-btn-primary"
            onClick={handleNewQuestion}
          >
            + New question
          </button>
        }
        group={view.group}
        onGroupToggle={toggleGroup}
      />

      <p className="bl-result">
        Showing <b>{rows.length}</b> of {filteredTotal} {filteredTotal === 1 ? 'question' : 'questions'}
        {view.group && <span> · grouped by membership</span>}
      </p>

      {rows.length === 0 ? (
        <div className="auth-list-empty">
          {hasAnyFilter ? (
            <>
              <p>No questions match these filters.</p>
              <p>
                <Link href={baseUrl} className="auth-list-reset-link">
                  Reset
                </Link>
                {' '}to see everything.
              </p>
            </>
          ) : (
            <>
              <p>No questions yet.</p>
              <p>Click <strong>+ New question</strong> above to create your first one.</p>
            </>
          )}
        </div>
      ) : (
        <div className="bl-table-wrap">
          <table className="bl-table">
            <thead>
              <tr>
                <SortableTh label="Item ID" sortKey="id" sort={effectiveSort} onSort={toggleSort} className="bl-id" />
                <th className="bl-col-title">Stem</th>
                <SortableTh label="Type" sortKey="type" sort={effectiveSort} onSort={toggleSort} />
                <SortableTh label="Difficulty" sortKey="difficulty" sort={effectiveSort} onSort={toggleSort} />
                <SortableTh
                  label="Marks" sortKey="marks" sort={effectiveSort} onSort={toggleSort} className="bl-num"
                  title="Marks — max possible score for the question (system-derived from the answer key)"
                />
                <SortableTh label="Status" sortKey="status" sort={effectiveSort} onSort={toggleSort} />
                <SortableTh label="Updated" sortKey="updated" sort={effectiveSort} onSort={toggleSort} />
                <th>Authors</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {view.group
                ? MEMBERSHIP_GROUPS.map((g) => {
                    const groupRows = sortedRows.filter((r) => membershipKind(r) === g.key);
                    if (groupRows.length === 0) return null;
                    return (
                      <Fragment key={`group-${g.key}`}>
                        <tr className="bl-group-head">
                          <td colSpan={9}>
                            <span className="gh">{g.label}<span className="n">{groupRows.length}</span></span>
                          </td>
                        </tr>
                        {groupRows.map(renderRow)}
                      </Fragment>
                    );
                  })
                : sortedRows.map(renderRow)}
            </tbody>
          </table>
          {!loadsAll && rows.length < filteredTotal && (
            <div className="bl-loadmore">
              <button type="button" className="bl-btn" onClick={loadMore}>
                Load more <span className="bl-loadmore-n">{filteredTotal - rows.length} more</span>
              </button>
            </div>
          )}
        </div>
      )}

      {modal.kind === 'picker' && (
        <QuestionTypePicker onClose={handleClose} onPick={handlePickType} />
      )}

      {/* Create-mode dispatch — one branch per type-picker entry. */}
      {modal.kind === 'editor-create' && modal.type === 'MCQ' && (
        <McqEditor
          initial={emptyMcqInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
      {modal.kind === 'editor-create' && modal.type === 'TF' && (
        <TfEditor
          initial={emptyTfInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
      {modal.kind === 'editor-create' && modal.type === 'SATA' && (
        <SataEditor
          initial={emptySataInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
      {modal.kind === 'editor-create' && modal.type === 'SELECT_N' && (
        <SelectNEditor
          initial={emptySelectNInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
      {modal.kind === 'editor-create' && modal.type === 'MATRIX' && (
        <MatrixEditor
          initial={emptyMatrixInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
      {modal.kind === 'editor-create' && modal.type === 'BOWTIE' && (
        <BowtieEditor
          initial={emptyBowtieInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
      {modal.kind === 'editor-create' && modal.type === 'CLOZE' && (
        <ClozeEditor
          initial={emptyClozeInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
      {modal.kind === 'editor-create' && modal.type === 'HIGHLIGHT' && (
        <HighlightEditor
          initial={emptyHighlightInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
      {modal.kind === 'editor-create' && modal.type === 'DRAG_DROP' && (
        <DragDropEditor
          initial={emptyDragDropInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
      {modal.kind === 'editor-create' && modal.type === 'DRAG_CLOZE' && (
        <DragClozeEditor
          initial={emptyDragClozeInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}

      {/* Edit-mode dispatch — one branch per editable type, gated on
          the matching initials map having a row for the current id. */}
      {modal.kind === 'editor-edit' &&
        modal.type === 'MCQ' &&
        mcqInitialsById[modal.itemId] && (
          <McqEditor
            initial={mcqInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      {modal.kind === 'editor-edit' &&
        modal.type === 'TF' &&
        tfInitialsById[modal.itemId] && (
          <TfEditor
            initial={tfInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      {modal.kind === 'editor-edit' &&
        modal.type === 'SATA' &&
        sataInitialsById[modal.itemId] && (
          <SataEditor
            initial={sataInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      {modal.kind === 'editor-edit' &&
        modal.type === 'SELECT_N' &&
        selectNInitialsById[modal.itemId] && (
          <SelectNEditor
            initial={selectNInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      {modal.kind === 'editor-edit' &&
        modal.type === 'MATRIX' &&
        matrixInitialsById[modal.itemId] && (
          <MatrixEditor
            initial={matrixInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      {modal.kind === 'editor-edit' &&
        modal.type === 'BOWTIE' &&
        bowtieInitialsById[modal.itemId] && (
          <BowtieEditor
            initial={bowtieInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      {modal.kind === 'editor-edit' &&
        modal.type === 'CLOZE' &&
        clozeInitialsById[modal.itemId] && (
          <ClozeEditor
            initial={clozeInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      {modal.kind === 'editor-edit' &&
        modal.type === 'HIGHLIGHT' &&
        highlightInitialsById[modal.itemId] && (
          <HighlightEditor
            initial={highlightInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      {modal.kind === 'editor-edit' &&
        modal.type === 'DRAG_DROP' &&
        dragDropInitialsById[modal.itemId] && (
          <DragDropEditor
            initial={dragDropInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      {modal.kind === 'editor-edit' &&
        modal.type === 'DRAG_CLOZE' &&
        dragClozeInitialsById[modal.itemId] && (
          <DragClozeEditor
            initial={dragClozeInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}

    </>
  );
}

function stemSnippet(stem: string, maxLen = 110): string {
  const trimmed = stem.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen).trimEnd() + '…';
}

// ── Group by membership ────────────────────────────────────────────
// The four mutually-exclusive buckets (mirrors the composition bar +
// membership filter): note-born = has a parent note AND no case/trend.
type MembershipKind = 'standalone' | 'case' | 'trend' | 'note';

const MEMBERSHIP_GROUPS: { key: MembershipKind; label: string }[] = [
  { key: 'standalone', label: 'Standalone' },
  { key: 'case',       label: 'Case-linked' },
  { key: 'trend',      label: 'Trend-linked' },
  { key: 'note',       label: 'Note-born' },
];

function membershipKind(r: BankListRowSummary): MembershipKind {
  if (r.parent_case_id) return 'case';
  if (r.trend_id)       return 'trend';
  if (r.parent_note_id) return 'note';
  return 'standalone';
}

// ── Client-side sort ───────────────────────────────────────────────
type SortKey = 'id' | 'type' | 'difficulty' | 'marks' | 'status' | 'updated';
type SortState = { key: SortKey; dir: 'asc' | 'desc' };

const DIFF_RANK: Record<string, number> = { Easy: 0, Medium: 1, Hard: 2 };

function sortRows(rows: BankListRowSummary[], sort: SortState): BankListRowSummary[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  const val = (r: BankListRowSummary): string | number => {
    switch (sort.key) {
      case 'marks':      return r.marks;
      case 'difficulty': return r.difficulty ? (DIFF_RANK[r.difficulty] ?? -1) : -1;
      case 'status':     return r.is_published ? 1 : 0;
      case 'type':       return r.question_type;
      case 'updated':    return r.updated_at ?? '';
      default:           return r.item_id;
    }
  };
  return rows.slice().sort((a, b) => {
    const av = val(a);
    const bv = val(b);
    return av < bv ? -dir : av > bv ? dir : 0;
  });
}

function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  className,
  title,
}: {
  label:    string;
  sortKey:  SortKey;
  sort:     SortState;
  onSort:   (k: SortKey) => void;
  className?: string;
  title?:     string;
}) {
  const on = sort.key === sortKey;
  return (
    <th
      className={`bl-sortable${on ? ' is-sorted' : ''}${className ? ` ${className}` : ''}`}
      onClick={() => onSort(sortKey)}
      title={title}
      aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      <span className="bl-sort-ind" aria-hidden="true">{on ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </th>
  );
}
