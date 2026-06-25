// mynclex/lib/library/analytics/note-view.tsx
//
// The per-note drill-in shell (slice 11.11c). Server component: the note
// header + stat line + tab nav, then it dispatches to the active tab —
// Questions (block-grouped collapsible rows), Roster (reader × block
// heatmap), or Readers (the reader list). The page fetches only the data
// the active tab needs and passes it in.

import Link from 'next/link';
import type {
  EmbedBlockDetail,
  EmbedNoteHeader,
  EmbedNoteReaders,
  EmbedNoteTab,
} from './types';
import { QuestionsTab } from './questions-tab';
import { RosterTab, ReadersTab } from './roster-readers';
import { ScopeSwitcher } from './scope-switcher';

const TAB_LABEL: Record<EmbedNoteTab, string> = {
  questions: 'Questions',
  roster: 'Roster',
  readers: 'Readers',
};

export function EmbedNoteView({
  header,
  tab,
  blocks,
  readers,
  openItemId,
}: {
  header: EmbedNoteHeader;
  tab: EmbedNoteTab;
  /** Questions-tab data (when tab === 'questions'). */
  blocks?: EmbedBlockDetail[];
  /** Roster/Readers data (when tab is 'roster' | 'readers'). */
  readers?: EmbedNoteReaders;
  openItemId?: string | null;
}) {
  const base = `/tutor/library/analytics/note/${header.noteId}`;
  return (
    <div className="eqa-note">
      <Link href="/tutor/library/analytics" className="eqa-crumb-back">
        ← Question analytics
      </Link>
      <div className="eqa-eyebrow">Reading-check analytics</div>
      <h1 className="eqa-title">{header.noteTitle}</h1>
      <div className="eqa-note-stats">
        <span>
          <b>{header.blockCount}</b> block{header.blockCount === 1 ? '' : 's'} ·{' '}
          <b>{header.questionCount}</b> question
          {header.questionCount === 1 ? '' : 's'}
        </span>
        <span className="eqa-dot">·</span>
        <span>
          <b>{header.reach}</b> reader{header.reach === 1 ? '' : 's'} reached
        </span>
        <span className="eqa-dot">·</span>
        <span>
          <b>
            {header.firstAccPct ?? '—'}
            {header.firstAccPct != null ? '%' : ''}
          </b>{' '}
          first-try
        </span>
      </div>

      <ScopeSwitcher
        scope={header.scope}
        basePath={`/tutor/library/analytics/note/${header.noteId}`}
        extraQuery={{ tab }}
      />

      <nav className="eqa-tabs">
        {(['questions', 'roster', 'readers'] as EmbedNoteTab[]).map((t) => (
          <Link
            key={t}
            href={`${base}?tab=${t}`}
            className={`eqa-tab${tab === t ? ' is-active' : ''}`}
            aria-current={tab === t ? 'page' : undefined}
          >
            {TAB_LABEL[t]}
          </Link>
        ))}
      </nav>

      {!header.hasAnyData ? (
        <div className="eqa-empty">
          <div className="eqa-empty-glyph" aria-hidden="true">
            ◔
          </div>
          <div className="eqa-empty-title">No reading-check answers yet</div>
          <p className="eqa-empty-body">
            This note has embedded questions, but no reader has answered one
            yet. Stats fill in as students practise.
          </p>
        </div>
      ) : tab === 'questions' ? (
        blocks ? (
          <QuestionsTab blocks={blocks} initialOpen={openItemId ?? null} />
        ) : null
      ) : tab === 'roster' ? (
        readers ? (
          <RosterTab data={readers} />
        ) : null
      ) : readers ? (
        <ReadersTab data={readers} />
      ) : null}
    </div>
  );
}
