// mynclex/lib/authoring/table/merge-table-view.tsx
//
// Rich-content relook — Slice 3. The read-only STUDENT render of a custom
// table tab (a list of tables). Used by the curator preview pane and the
// student runner. Honours merges (colspan/rowspan), heading cells, rich
// content, and per-row progressive reveal — the span/reveal maths lives in
// studentRows() (model, tested). Mobile = horizontal scroll for now.
//
// No hooks / no @tiptap — safe to render on the server or the client.

import { studentRows, type MergeTabData, type MergeTable } from './merge-table-model';
import { RichRender } from '../rich-render';
import { isEmptyRichDoc } from '../rich-doc';

export function MergeTableView({
  tab,
  currentPosition,
}: {
  tab: MergeTabData;
  currentPosition: number;
}) {
  return (
    <div className="mtv-tab">
      {tab.tables.map((t) => (
        <OneTableView key={t.id} table={t} q={currentPosition} />
      ))}
    </div>
  );
}

function OneTableView({ table, q }: { table: MergeTable; q: number }) {
  const rows = studentRows(table, q);
  if (rows.length === 0) return null; // nothing revealed yet

  return (
    <div className="mtv-scroll">
      <table className="mtv-table">
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {row.cells.map((sc) => (
                <td
                  key={sc.cell.id}
                  colSpan={sc.colSpan}
                  rowSpan={sc.rowSpan}
                  className={
                    'mtv-cell' +
                    (sc.cell.heading ? ' is-head' : '') +
                    (sc.justRevealed ? ' just-revealed' : '')
                  }
                >
                  {isEmptyRichDoc(sc.cell.content) ? (
                    <span className="mtv-empty">—</span>
                  ) : (
                    <RichRender doc={sc.cell.content} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
